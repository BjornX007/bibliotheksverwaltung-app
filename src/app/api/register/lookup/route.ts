// src/app/api/register/lookup/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";

type CatalogCover = {
  cover_url: string | null;
  source_cover_url: string | null;
};

type Row = {
  id: string;
  catalog_id?: string | null;
  title: string;
  author: string | null;
  publisher: string | null;
  year: string | null;
  isbn: string | null;
  qty_total?: number;
  cover_url?: string | null;
  source_cover_url?: string | null; // catalog_titles only
  catalog?: CatalogCover | CatalogCover[] | null; // books only (join)
};

// books: own cover first, catalog cover as fallback (via catalog_id)
const BOOK_COLS =
  "id, catalog_id, title, author, publisher, year, isbn, qty_total, cover_url, catalog:catalog_titles(cover_url, source_cover_url)";

const CAT_COLS =
  "id, title, author, publisher, year, isbn, cover_url, source_cover_url";

const first = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const fromBook = (b: Row) => {
  const catalog = first(b.catalog);

  return {
    source: "inventory" as const,
    id: b.id,
    title: b.title,
    author: b.author,
    publisher: b.publisher,
    year: b.year,
    isbn: b.isbn,
    stock: b.qty_total ?? 0,
    cover_url:
      b.cover_url ?? catalog?.cover_url ?? catalog?.source_cover_url ?? null,
  };
};

const fromCatalog = (c: Row) => ({
  source: "catalog" as const,
  id: c.id,
  title: c.title,
  author: c.author,
  publisher: c.publisher,
  year: c.year,
  isbn: c.isbn,
  stock: 0,
  cover_url: c.cover_url ?? c.source_cover_url ?? null,
});

export async function GET(request: NextRequest) {
  const auth = await getCurrentUser();

  if (!auth) {
    return NextResponse.json(
      { error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { supabase } = auth;

  const raw = (request.nextUrl.searchParams.get("q") ?? "")
    .trim()
    .slice(0, 100);

  if (!raw) {
    return NextResponse.json({
      mode: "text",
      items: [],
    });
  }

  /*
   * ISBN / barcode search
   *
   * IMPORTANT:
   * Do NOT validate the ISBN check digit here.
   * The catalog is the source of truth.
   */
  if (/^[\dXx\s-]{10,20}$/.test(raw)) {
    const isbn = raw
      .replace(/[\s-]/g, "")
      .trim()
      .toUpperCase();

    // 1. Existing inventory
    const { data: books, error: booksError } = await supabase
      .from("books")
      .select(BOOK_COLS)
      .eq("isbn", isbn)
      .limit(1);

    if (booksError) {
      console.error("books ISBN lookup failed:", booksError.message);
    }

    if (books?.length) {
      return NextResponse.json({
        mode: "isbn",
        isbn,
        items: (books as unknown as Row[]).map(fromBook),
      });
    }

    // 2. Master catalog
    const { data: cat, error: catError } = await supabase
      .from("catalog_titles")
      .select(CAT_COLS)
      .eq("isbn", isbn)
      .limit(5);

    if (catError) {
      console.error(
        "catalog ISBN lookup failed:",
        catError.message
      );
    }

    return NextResponse.json({
      mode: "isbn",
      isbn,
      items: ((cat ?? []) as unknown as Row[]).map(fromCatalog),
    });
  }

  /*
   * Normal title / author search
   */
  const safe = raw
    .replace(/[%,()*\\"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (safe.length < 2) {
    return NextResponse.json({
      mode: "text",
      items: [],
    });
  }

  const pattern = `%${safe}%`;
  const filter = `title.ilike.${pattern},author.ilike.${pattern}`;

  const [inv, cat] = await Promise.all([
    supabase
      .from("books")
      .select(BOOK_COLS)
      .or(filter)
      .limit(5),

    supabase
      .from("catalog_titles")
      .select(CAT_COLS)
      .or(filter)
      .limit(15),
  ]);

  if (inv.error) {
    console.error("inventory search failed:", inv.error.message);
  }

  if (cat.error) {
    console.error("catalog search failed:", cat.error.message);
  }

  const books = (inv.data ?? []) as unknown as Row[];

  const inInventory = new Set(
    books
      .map((b) => b.catalog_id)
      .filter(Boolean)
  );

  const catalog = ((cat.data ?? []) as unknown as Row[])
    .filter((c) => !inInventory.has(c.id));

  return NextResponse.json({
    mode: "text",
    items: [
      ...books.map(fromBook),
      ...catalog.map(fromCatalog),
    ],
  });
}