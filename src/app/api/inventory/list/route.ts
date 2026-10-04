// src/app/api/inventory/list/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;
const ISBN_RE = /^(\d{9}[\dX]|\d{13})$/;

type Rel<T> = T | T[] | null;

function one<T>(value: Rel<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type Row = {
  id: string;
  isbn: string | null;
  title: string;
  author: string | null;
  publisher: string | null;
  year: string | null;
  language: string | null;
  cover_url: string | null;
  shelf: string | null;
  qty_total: number;
  qty_available: number;
  category: Rel<{ id: string; name_sq: string; name_en: string }>;
  catalog: Rel<{ cover_url: string | null; source_cover_url: string | null }>;
};

export async function GET(req: Request) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;

  const raw = (params.get("q") ?? "").trim().slice(0, 100);
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(params.get("limit")) || DEFAULT_LIMIT),
  );

  let query = supabase.from("books").select(
    `id, isbn, title, author, publisher, year, language, cover_url, shelf,
     qty_total, qty_available,
     category:categories(id, name_sq, name_en),
     catalog:catalog_titles(cover_url, source_cover_url)`,
    // the exact count is only needed once per search, not on every page
    { count: offset === 0 ? "exact" : undefined },
  );

  if (raw) {
    const compact = raw.replace(/[\s-]/g, "").toUpperCase();

    if (ISBN_RE.test(compact)) {
      // scanned or typed ISBN: exact match (also tries the raw form in case
      // a manually added book was saved with hyphens)
      query =
        raw === compact
          ? query.eq("isbn", compact)
          : query.or(`isbn.eq.${compact},isbn.eq.${raw}`);
    } else {
      // strip characters that would break the PostgREST or() syntax
      const safe = raw
        .replace(/[%*,()\\]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (safe) {
        query = query.or(
          `title.ilike.%${safe}%,author.ilike.%${safe}%,isbn.ilike.%${safe}%`,
        );
      }
    }
  }

  // fetch one extra row to know if there is a next page (no second query)
  const { data, error, count } = await query
    .order("title", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + limit);

  if (error) {
    console.error("INVENTORY LIST FAILED:", error);
    return NextResponse.json({ error: "LIST_FAILED" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Row[];

  const books = rows.slice(0, limit).map((row) => {
    const catalog = one(row.catalog);

    return {
      id: row.id,
      isbn: row.isbn,
      title: row.title,
      author: row.author,
      publisher: row.publisher,
      year: row.year,
      language: row.language,
      shelf: row.shelf,
      qty_total: row.qty_total,
      qty_available: row.qty_available,
      category: one(row.category),
      // own cover first, then the catalog's
      cover:
        row.cover_url ??
        catalog?.cover_url ??
        catalog?.source_cover_url ??
        null,
    };
  });

  return NextResponse.json(
    {
      books,
      hasMore: rows.length > limit,
      total: count ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}