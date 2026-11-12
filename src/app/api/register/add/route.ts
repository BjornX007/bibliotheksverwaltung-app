// src/app/api/register/add/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const fail = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });

type RegistrationMethod = "manual" | "scan" | "catalog" | "inventory";

export async function POST(request: Request) {
  const auth = await getCurrentUser();
  if (!auth) return fail("UNAUTHORIZED", 401);

  const { supabase } = auth;
  const body = await request.json().catch(() => null);

  const qty = Number(body?.qty);
  if (!body || !Number.isInteger(qty) || qty < 1 || qty > 500) {
    return fail("INVALID_INPUT");
  }

  const isbnRaw = clean(body.isbn, 20);
  const isbn = isbnRaw
    ? isbnRaw.replace(/[\\s-]/g, "").trim().toUpperCase()
    : null;

  const categoryId =
    typeof body.categoryId === "string" && UUID.test(body.categoryId)
      ? body.categoryId
      : null;
  const shelf = clean(body.shelf, 50);

  const allowedMethods: RegistrationMethod[] = [
    "manual",
    "scan",
    "catalog",
    "inventory",
  ];
  const method: RegistrationMethod = allowedMethods.includes(body.method)
    ? body.method
    : body.kind === "manual"
      ? "manual"
      : body.kind === "inventory"
        ? "inventory"
        : "catalog";

  const parsedStartedAt =
    typeof body.startedAt === "string" ? new Date(body.startedAt) : null;
  const startedAt =
    parsedStartedAt && !Number.isNaN(parsedStartedAt.getTime())
      ? parsedStartedAt
      : null;

  let result;
  const serverStartedAt = Date.now();

  if (body.kind === "catalog" && UUID.test(String(body.catalogId))) {
    result = await supabase.rpc("register_from_catalog", {
      p_catalog_id: body.catalogId,
      p_isbn: isbn,
      p_qty: qty,
      p_category_id: categoryId,
      p_shelf: shelf,
    });
  } else if (body.kind === "inventory" && UUID.test(String(body.bookId))) {
    result = await supabase.rpc("add_copies", {
      p_book_id: body.bookId,
      p_qty: qty,
    });
  } else if (body.kind === "manual") {
    const title = clean(body.title, 300);
    if (!title) return fail("TITLE_REQUIRED");

    result = await supabase.rpc("register_manual", {
      p_title: title,
      p_author: clean(body.author, 200),
      p_isbn: isbn,
      p_publisher: clean(body.publisher, 200),
      p_year: clean(body.year, 10),
      p_category_id: categoryId,
      p_shelf: shelf,
      p_qty: qty,
    });
  } else {
    return fail("INVALID_INPUT");
  }

  const serverDurationMs = Date.now() - serverStartedAt;
  const completedAt = new Date();
  const durationMs = startedAt
    ? Math.max(0, completedAt.getTime() - startedAt.getTime())
    : null;

  // Analytics are deliberately best-effort: they must never change the
  // outcome of the actual book registration.
  const { error: analyticsError } = await supabase
    .from("book_registration_events")
    .insert({
      method,
      status: result.error ? "failed" : "success",
      started_at: startedAt?.toISOString() ?? null,
      completed_at: completedAt.toISOString(),
      duration_ms: durationMs,
      server_duration_ms: serverDurationMs,
      book_id: result.error ? null : result.data,
      quantity: qty,
      isbn,
      failure_code: result.error ? "REGISTER_FAILED" : null,
      details: {
        kind: body.kind,
        error: result.error?.message ?? null,
      },
    });

  if (analyticsError) {
    console.error("Registration analytics failed:", analyticsError.message);
  }

  if (result.error) {
    console.error("register failed:", result.error.message);
    return fail("REGISTER_FAILED", 500);
  }

  return NextResponse.json({ ok: true, bookId: result.data });
}
