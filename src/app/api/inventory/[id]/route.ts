import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

type Supabase = Awaited<ReturnType<typeof createClient>>;

const noStore = { "Cache-Control": "no-store" };

// must match the bucket created in sql/book-covers-storage.sql
const COVER_BUCKET = "book-covers";

const EDIT_COLUMNS =
  "id, isbn, title, author, publisher, year, language, shelf, category_id, cover_url";

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: noStore });
}

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const v = value.trim();

  return v ? v : null;
}

// ISBN-13 (978/979) or ISBN-10; spaces and hyphens are ignored
function normalizeIsbn(value: string | null): string | null | "INVALID" {
  if (!value) return null;

  const v = value.replace(/[\s-]/g, "").toUpperCase();

  return /^97[89]\d{10}$/.test(v) || /^\d{9}[\dX]$/.test(v) ? v : "INVALID";
}

// deletes a replaced cover from the bucket, but only our own uploads and
// only if no other book still uses the same image
async function removeOldCover(supabase: Supabase, url: string, bookId: string) {
  try {
    const marker = `/object/public/${COVER_BUCKET}/`;
    const { pathname } = new URL(url);
    const at = pathname.indexOf(marker);

    if (at === -1) return; // external cover (catalog etc.): leave it alone

    const path = decodeURIComponent(pathname.slice(at + marker.length));

    const { count } = await supabase
      .from("books")
      .select("id", { count: "exact", head: true })
      .eq("cover_url", url)
      .neq("id", bookId);

    if (count && count > 0) return;

    const { error } = await supabase.storage.from(COVER_BUCKET).remove([path]);

    if (error) console.error("COVER CLEANUP FAILED:", error);
  } catch (err) {
    console.error("COVER CLEANUP ERROR:", err);
  }
}

// edit book data and cover
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("UNAUTHORIZED", 401);

  const body = await req.json().catch(() => null);

  if (!body || typeof body !== "object") return fail("INVALID_INPUT", 400);

  const title = clean(body.title);
  const author = clean(body.author);
  const publisher = clean(body.publisher);
  const year = clean(body.year);
  const language = clean(body.language);
  const shelf = clean(body.shelf);
  const categoryId = clean(body.categoryId);
  const coverUrl = clean(body.coverUrl);

  if (!title) return fail("TITLE_REQUIRED", 400);

  const isbn = normalizeIsbn(clean(body.isbn));

  if (isbn === "INVALID") return fail("INVALID_ISBN", 400);

  const tooLong = [title, author, publisher, language, shelf].some(
    (v) => v !== null && v.length > 300,
  );

  if (tooLong || (year && year.length > 20)) return fail("INVALID_INPUT", 400);

  if (coverUrl && (coverUrl.length > 2000 || !/^https?:\/\//i.test(coverUrl))) {
    return fail("INVALID_INPUT", 400);
  }

  // current cover, needed to clean up the old file afterwards
  const { data: before, error: readError } = await supabase
    .from("books")
    .select("cover_url")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    console.error("INVENTORY EDIT READ FAILED:", readError);
    return fail("EDIT_FAILED", 500);
  }

  if (!before) return fail("NOT_FOUND", 404);

  const { data: updated, error } = await supabase
    .from("books")
    .update({
      title,
      author,
      isbn,
      publisher,
      year,
      language,
      shelf,
      category_id: categoryId,
      cover_url: coverUrl,
    })
    .eq("id", id)
    .select(EDIT_COLUMNS)
    .maybeSingle();

  if (error) {
    // 23505 = unique violation (another book already has this ISBN)
    if (error.code === "23505") return fail("DUPLICATE_ISBN", 409);

    // 23503 = foreign key violation (unknown category)
    if (error.code === "23503") return fail("INVALID_INPUT", 400);

    console.error("INVENTORY EDIT FAILED:", error);
    return fail("EDIT_FAILED", 500);
  }

  // 0 rows: blocked by RLS (no update policy on books)
  if (!updated) return fail("CONFLICT", 409);

  const oldCover = before.cover_url as string | null;

  if (oldCover && oldCover !== coverUrl) {
    await removeOldCover(supabase, oldCover, id);
  }

  return NextResponse.json(updated, { headers: noStore });
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