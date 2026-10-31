import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

const noStore = { "Cache-Control": "no-store" };

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: noStore });
}

// +1 / -1 copy
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("UNAUTHORIZED", 401);

  const body = await req.json().catch(() => null);
  const delta = body?.delta;

  if (delta !== 1 && delta !== -1) return fail("INVALID_DELTA", 400);

  const { data: book, error: readError } = await supabase
    .from("books")
    .select("qty_total, qty_available")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    console.error("INVENTORY ADJUST READ FAILED:", readError);
    return fail("ADJUST_FAILED", 500);
  }

  if (!book) return fail("NOT_FOUND", 404);

  // a copy that is on loan cannot be removed
  if (delta === -1 && book.qty_available <= 0) {
    return fail("NO_AVAILABLE_COPY", 409);
  }

  // optimistic lock: only update if nobody changed the row in the meantime
  const { data: updated, error } = await supabase
    .from("books")
    .update({
      qty_total: book.qty_total + delta,
      qty_available: book.qty_available + delta,
    })
    .eq("id", id)
    .eq("qty_total", book.qty_total)
    .eq("qty_available", book.qty_available)
    .select("qty_total, qty_available")
    .maybeSingle();

  if (error) {
    console.error("INVENTORY ADJUST FAILED:", error);
    return fail("ADJUST_FAILED", 500);
  }

  if (!updated) return fail("CONFLICT", 409);

  return NextResponse.json(updated, { headers: noStore });
}

// delete a book (only if no copy is on loan)
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("UNAUTHORIZED", 401);

  const { data: book, error: readError } = await supabase
    .from("books")
    .select("qty_total, qty_available")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    console.error("INVENTORY DELETE READ FAILED:", readError);
    return fail("DELETE_FAILED", 500);
  }

  if (!book) return fail("NOT_FOUND", 404);

  if (book.qty_available < book.qty_total) return fail("HAS_LOANS", 409);

  const { data: deleted, error } = await supabase
    .from("books")
    .delete()
    .eq("id", id)
    .eq("qty_available", book.qty_available)
    .select("id");

  if (error) {
    // 23503 = foreign key violation (loan history still references the book)
    if (error.code === "23503") return fail("HAS_LOANS", 409);

    console.error("INVENTORY DELETE FAILED:", error);
    return fail("DELETE_FAILED", 500);
  }

  // 0 rows: changed in the meantime, or blocked by RLS
  if (!deleted || deleted.length === 0) return fail("CONFLICT", 409);

  return NextResponse.json({ ok: true }, { headers: noStore });
}