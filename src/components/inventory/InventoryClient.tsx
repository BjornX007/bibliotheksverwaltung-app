"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertCircle,
  BookOpen,
  Camera,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import BarcodeScanner from "@/components/register/BarcodeScanner";
import IsbnInput from "@/components/IsbnInput";
import ImageUpload, {
  removeUploadedImage,
  resolveImageDraft,
  type ImageDraft,
} from "@/components/ImageUpload";
import BookCover from "./BookCover";

type Category = {
  id: string;
  name_sq: string;
  name_en: string;
};

type Book = {
  id: string;
  isbn: string | null;
  title: string;
  author: string | null;
  publisher: string | null;
  year: string | null;
  language: string | null;
  shelf: string | null;
  qty_total: number;
  qty_available: number;
  cover: string | null;
  category: Category | null;
};

type Draft = {
  title: string;
  author: string;
  isbn: string;
  publisher: string;
  year: string;
  language: string;
  shelf: string;
  categoryId: string;
  cover: ImageDraft;
};

type EditErrorKey =
  | "actionError"
  | "invalidIsbn"
  | "titleRequired"
  | "duplicateIsbn"
  | "cover.failed";

type Tab = "all" | "isbn" | "cover" | "dupes";

const PAGE_SIZE = 24;

// must match the bucket created in sql/book-covers-storage.sql
const COVER_BUCKET = "book-covers";

const searchField =
  "w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-10 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 [&::-webkit-search-cancel-button]:hidden";

const fieldInput =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200";

const primary =
  "rounded-xl bg-blue-600 px-4 py-3 font-medium text-white disabled:opacity-50";

const secondary =
  "rounded-xl border border-slate-300 bg-white px-4 py-3 font-medium disabled:opacity-50";

const danger =
  "rounded-xl bg-red-600 px-4 py-3 font-medium text-white disabled:opacity-50";

const stepBtn =
  "rounded-md border border-slate-300 bg-white p-1.5 text-slate-700 active:bg-slate-100 disabled:opacity-40";

// larger touch targets for the mobile cards
const stepBtnLg =
  "rounded-lg border border-slate-300 bg-white p-2 text-slate-700 active:bg-slate-100 disabled:opacity-40";

const trashBtn =
  "rounded-md p-1.5 text-red-600 hover:bg-red-50 active:bg-red-50 disabled:opacity-40";

const editBtn =
  "rounded-md p-1.5 text-slate-600 hover:bg-slate-100 active:bg-slate-100 disabled:opacity-40";

// round buttons that sit on top of the cover in the mobile cards
const trashOverlay =
  "rounded-full bg-white/95 p-2 text-red-600 shadow ring-1 ring-black/5 active:bg-red-50 disabled:opacity-40";

const editOverlay =
  "rounded-full bg-white/95 p-2 text-slate-700 shadow ring-1 ring-black/5 active:bg-slate-100 disabled:opacity-40";

// lowercase, strip accents and everything that is not a letter or digit
function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// true if the edit distance between a and b is <= limit
function within(a: string, b: string, limit: number) {
  if (Math.abs(a.length - b.length) > limit) return false;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const cur = [i];

    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }

    prev = cur;
  }

  return prev[b.length] <= limit;
}

// groups books whose titles are the same or differ by a typo or two
function findDuplicates(books: Book[]) {
  const items = books
    .map((b) => ({ b, n: norm(b.title) }))
    .filter((i) => i.n)
    .sort((x, y) => x.n.length - y.n.length);

  const parent = items.map((_, i) => i);

  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }

    return i;
  };

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[j].n.length - items[i].n.length > 2) break;

      const a = items[i].n;
      const b = items[j].n;
      const max = Math.max(a.length, b.length);

      // short titles: exact match only; long titles: allow 1-2 typos
      const limit = a === b ? 0 : max < 5 ? -1 : max >= 12 ? 2 : 1;

      if (limit >= 0 && within(a, b, limit)) parent[find(j)] = find(i);
    }
  }

  const groups = new Map<number, Book[]>();

  items.forEach((it, i) => {
    const r = find(i);

    groups.set(r, [...(groups.get(r) ?? []), it.b]);
  });

  const list: Book[] = [];
  const groupOf: Record<string, number> = {};
  let n = 0;

  [...groups.values()]
    .filter((g) => g.length > 1)
    .sort((x, y) => norm(x[0].title).localeCompare(norm(y[0].title)))
    .forEach((g) => {
      n++;

      g.forEach((b) => {
        groupOf[b.id] = n;
        list.push(b);
      });
    });

  return { list, groupOf };
}

function Stock({
  book,
  busy,
  onAdjust,
  decreaseLabel,
  increaseLabel,
  large = false,
  className = "",
}: {
  book: Book;
  busy: boolean;
  onAdjust: (book: Book, delta: 1 | -1) => void;
  decreaseLabel: string;
  increaseLabel: string;
  large?: boolean;
  className?: string;
}) {
  const btn = large ? stepBtnLg : stepBtn;
  const icon = large ? "h-5 w-5" : "h-4 w-4";

  return (
    <span
      className={`inline-flex items-center ${
        large ? "gap-1" : "gap-1.5"
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => onAdjust(book, -1)}
        disabled={busy || book.qty_available <= 0}
        aria-label={decreaseLabel}
        className={btn}
        style={{ touchAction: "manipulation" }}
      >
        <Minus className={icon} aria-hidden />
      </button>

      <span
        className={`inline-flex rounded-full px-2 py-0.5 font-semibold tabular-nums ${
          large ? "text-sm" : "text-xs"
        } ${
          book.qty_available === 0
            ? "bg-red-100 text-red-700"
            : "bg-green-100 text-green-700"
        }`}
      >
        {book.qty_available} / {book.qty_total}
      </span>

      <button
        type="button"
        onClick={() => onAdjust(book, 1)}
        disabled={busy}
        aria-label={increaseLabel}
        className={btn}
        style={{ touchAction: "manipulation" }}
      >
        <Plus className={icon} aria-hidden />
      </button>
    </span>
  );
}

export default function InventoryClient({
  categories = [],
}: {
  categories?: Category[];
}) {
  const t = useTranslations("inventory");
  const locale = useLocale();

  const seq = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [camera, setCamera] = useState(false);

  const [books, setBooks] = useState<Book[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // to-do tabs: all books are loaded once in the background
  const [tab, setTab] = useState<Tab>("all");
  const [audit, setAudit] = useState<Book[] | null>(null);

  // adjust / delete
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmBook, setConfirmBook] = useState<Book | null>(null);
  const [actionError, setActionError] = useState<
    "actionError" | "hasLoans" | "conflict" | null
  >(null);

  // edit
  const [editBook, setEditBook] = useState<Book | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<EditErrorKey | null>(null);

  function categoryLabel(category: Category | null) {
    if (!category) return null;

    return locale === "sq" ? category.name_sq : category.name_en;
  }

  async function fetchPage(q: string, offset: number) {
    const mine = ++seq.current;

    setLoading(true);
    setError(false);

    try {
      const res = await fetch(
        `/api/inventory/list?q=${encodeURIComponent(q)}&offset=${offset}&limit=${PAGE_SIZE}`,
        { cache: "no-store" },
      );

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      // a newer search started while this one was running
      if (mine !== seq.current) return;

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("INVENTORY LOAD FAILED:", json);
        setError(true);
        return;
      }

      const next: Book[] = Array.isArray(json.books) ? json.books : [];

      setBooks((current) => (offset === 0 ? next : [...current, ...next]));
      setHasMore(!!json.hasMore);

      if (typeof json.total === "number") {
        setTotal(json.total);
      }
    } catch (err) {
      console.error("INVENTORY NETWORK ERROR:", err);

      if (mine === seq.current) setError(true);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }

  // load every book (used for the to-do tabs)
  async function loadAudit() {
    const all: Book[] = [];
    let offset = 0;

    try {
      while (true) {
        const res = await fetch(
          `/api/inventory/list?q=&offset=${offset}&limit=200`,
          { cache: "no-store" },
        );

        if (!res.ok) return;

        const json = await res.json().catch(() => ({}));
        const page: Book[] = Array.isArray(json.books) ? json.books : [];

        all.push(...page);
        offset += page.length;

        if (!json.hasMore || page.length === 0) break;
      }

      setAudit(all);
    } catch (err) {
      console.error("INVENTORY AUDIT FAILED:", err);
    }
  }

  function errorKey(code: unknown): "actionError" | "hasLoans" | "conflict" {
    if (code === "HAS_LOANS" || code === "NO_AVAILABLE_COPY") return "hasLoans";
    if (code === "CONFLICT") return "conflict";
    return "actionError";
  }

  function editErrorKey(code: unknown): EditErrorKey {
    if (code === "TITLE_REQUIRED") return "titleRequired";
    if (code === "INVALID_ISBN") return "invalidIsbn";
    if (code === "DUPLICATE_ISBN") return "duplicateIsbn";
    return "actionError";
  }

  // +1 / -1 copy
  async function adjust(book: Book, delta: 1 | -1) {
    if (busyId) return;

    setBusyId(book.id);
    setActionError(null);

    try {
      const res = await fetch(`/api/inventory/${book.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("INVENTORY ADJUST FAILED:", json);
        setActionError(errorKey(json.error));
        return;
      }

      const patch = (b: Book) =>
        b.id === book.id
          ? {
              ...b,
              qty_total: json.qty_total,
              qty_available: json.qty_available,
            }
          : b;

      setBooks((current) => current.map(patch));
      setAudit((current) => (current ? current.map(patch) : current));
    } catch (err) {
      console.error("INVENTORY ADJUST NETWORK ERROR:", err);
      setActionError("actionError");
    } finally {
      setBusyId(null);
    }
  }

  // delete after confirmation
  async function confirmDelete() {
    const book = confirmBook;

    if (!book || busyId) return;

    setBusyId(book.id);
    setActionError(null);

    try {
      const res = await fetch(`/api/inventory/${book.id}`, {
        method: "DELETE",
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));

        console.error("INVENTORY DELETE FAILED:", json);
        setActionError(errorKey(json.error));
        return;
      }

      setBooks((current) => current.filter((b) => b.id !== book.id));
      setTotal((current) =>
        current === null ? current : Math.max(0, current - 1),
      );

      void loadAudit();
    } catch (err) {
      console.error("INVENTORY DELETE NETWORK ERROR:", err);
      setActionError("actionError");
    } finally {
      setBusyId(null);
      setConfirmBook(null);
    }
  }

  function openEdit(book: Book) {
    setActionError(null);
    setEditError(null);

    setDraft({
      title: book.title,
      author: book.author ?? "",
      isbn: book.isbn ?? "",
      publisher: book.publisher ?? "",
      year: book.year ?? "",
      language: book.language ?? "",
      shelf: book.shelf ?? "",
      categoryId: book.category?.id ?? "",
      cover: { url: book.cover, blob: null, preview: null },
    });

    setEditBook(book);
  }

  function closeEdit() {
    if (saving) return;

    setEditBook(null);
    setDraft(null);
    setEditError(null);
  }

  const setField =
    (key: keyof Omit<Draft, "cover">) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value;

      setDraft((current) => (current ? { ...current, [key]: value } : current));
    };

  // save edited book (data + cover_url)
  async function saveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const book = editBook;

    if (!book || !draft || saving) return;

    if (!draft.title.trim()) {
      setEditError("titleRequired");
      return;
    }

    setSaving(true);
    setEditError(null);

    // set when this save uploaded a new image, so it can be removed again if the save fails
    let uploadedUrl: string | null = null;
    let saved = false;

    try {
      let coverUrl: string | null;

      try {
        const resolved = await resolveImageDraft(draft.cover, {
          bucket: COVER_BUCKET,
          folder: "books",
        });

        coverUrl = resolved.url;

        if (resolved.uploaded) uploadedUrl = resolved.url;
      } catch (err) {
        console.error("COVER UPLOAD FAILED:", err);
        setEditError("cover.failed");
        return;
      }

      const res = await fetch(`/api/inventory/${book.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          author: draft.author,
          isbn: draft.isbn,
          publisher: draft.publisher,
          year: draft.year,
          language: draft.language,
          shelf: draft.shelf,
          categoryId: draft.categoryId || null,
          coverUrl,
        }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("INVENTORY EDIT FAILED:", json);
        setEditError(editErrorKey(json.error));
        return;
      }

      setBooks((current) =>
        current.map((b) =>
          b.id === book.id
            ? {
                ...b,
                title: json.title,
                author: json.author,
                isbn: json.isbn,
                publisher: json.publisher,
                year: json.year,
                language: json.language,
                shelf: json.shelf,
                cover: json.cover_url ?? null,
                category:
                  categories.find((c) => c.id === json.category_id) ?? null,
              }
            : b,
        ),
      );

      saved = true;

      // refresh the to-do lists so fixed books drop off
      void loadAudit();

      setEditBook(null);
      setDraft(null);
    } catch (err) {
      console.error("INVENTORY EDIT NETWORK ERROR:", err);
      setEditError("actionError");
    } finally {
      // the book was not saved: remove the image that was just uploaded
      if (!saved && uploadedUrl) {
        void removeUploadedImage(COVER_BUCKET, uploadedUrl);
      }

      setSaving(false);
    }
  }

  // load all books once for the to-do tabs
  useEffect(() => {
    void loadAudit();
  }, []);

  // typing: apply the search after a short pause
  useEffect(() => {
    const id = window.setTimeout(() => {
      setActiveQuery(query.trim());
    }, 300);

    return () => window.clearTimeout(id);
  }, [query]);

  // new search: start again from page 1
  useEffect(() => {
    setBooks([]);
    setHasMore(false);
    setTotal(null);
    void fetchPage(activeQuery, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuery]);

  // infinite scroll: load the next page when the bottom is near
  useEffect(() => {
    const el = sentinelRef.current;

    if (!el || !hasMore || loading || error || tab !== "all") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void fetchPage(activeQuery, books.length);
        }
      },
      { rootMargin: "600px" },
    );

    observer.observe(el);

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, error, books.length, activeQuery, tab]);

  // close dialogs with Escape
  useEffect(() => {
    if (!confirmBook && !editBook) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      if (confirmBook && !busyId) setConfirmBook(null);
      else if (editBook && !saving) closeEdit();
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmBook, editBook, busyId, saving]);

  // apply a search immediately (submit, scan, clear)
  function apply(value: string) {
    setQuery(value);
    setActiveQuery(value.trim());
  }

  function onScan(code: string) {
    const clean = code.replace(/[\s-]/g, "").trim().toUpperCase();

    // the camera stays open (and fixed) so the next book can be scanned right away
    apply(clean);
  }

  function stock(book: Book, large = false) {
    return (
      <Stock
        book={book}
        busy={busyId === book.id}
        onAdjust={adjust}
        decreaseLabel={t("decrease")}
        increaseLabel={t("increase")}
        large={large}
        className={large ? "w-full justify-between" : ""}
      />
    );
  }

  function editButton(book: Book, overlay = false) {
    return (
      <button
        type="button"
        onClick={() => openEdit(book)}
        disabled={busyId === book.id}
        aria-label={t("edit")}
        className={overlay ? editOverlay : editBtn}
        style={{ touchAction: "manipulation" }}
      >
        <Pencil className="h-5 w-5" aria-hidden />
      </button>
    );
  }

  function deleteButton(book: Book, overlay = false) {
    return (
      <button
        type="button"
        onClick={() => {
          setActionError(null);
          setConfirmBook(book);
        }}
        disabled={busyId === book.id}
        aria-label={t("delete")}
        className={overlay ? trashOverlay : trashBtn}
        style={{ touchAction: "manipulation" }}
      >
        <Trash2 className="h-5 w-5" aria-hidden />
      </button>
    );
  }

  // to-do lists
  const missingIsbn = useMemo(
    () => (audit ?? []).filter((b) => !b.isbn?.trim()),
    [audit],
  );

  const missingCover = useMemo(
    () => (audit ?? []).filter((b) => !b.cover),
    [audit],
  );

  const dupes = useMemo(() => findDuplicates(audit ?? []), [audit]);

  const todo =
    tab === "isbn"
      ? missingIsbn
      : tab === "cover"
        ? missingCover
        : tab === "dupes"
          ? dupes.list
          : null;

  const needle = activeQuery.toLowerCase();

  const shown = todo
    ? needle
      ? todo.filter((b) =>
          [b.title, b.author, b.isbn].some((v) =>
            v?.toLowerCase().includes(needle),
          ),
        )
      : todo
    : books;

  const tabs: { id: Tab; count: number | null }[] = [
    { id: "all", count: total },
    { id: "isbn", count: audit ? missingIsbn.length : null },
    { id: "cover", count: audit ? missingCover.length : null },
    { id: "dupes", count: audit ? dupes.list.length : null },
  ];

  const initialLoading = loading && books.length === 0;

  // small badge showing which duplicate group a book belongs to
  function dupeBadge(book: Book) {
    if (tab !== "dupes" || !dupes.groupOf[book.id]) return null;

    return (
      <span className="mt-1 inline-block rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
        #{dupes.groupOf[book.id]}
      </span>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between gap-3 pt-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

        {total !== null && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium tabular-nums text-slate-600">
            {t("count", { count: total })}
          </span>
        )}
      </div>

      {/* tabs + search + camera: stay fixed at the top while the list scrolls */}
      <div className="sticky top-0 z-30 -mx-4 space-y-2 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {tabs.map(({ id, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium ${
                tab === id
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
              style={{ touchAction: "manipulation" }}
            >
              {t(`filters.${id}`)}

              {count !== null && (
                <span className="ml-1.5 tabular-nums opacity-80">{count}</span>
              )}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply(query);
          }}
          className="flex gap-2"
        >
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              aria-hidden
            />

            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              inputMode="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t("placeholder")}
              className={searchField}
            />

            {query && (
              <button
                type="button"
                onClick={() => apply("")}
                aria-label={t("clear")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 active:bg-slate-100"
                style={{ touchAction: "manipulation" }}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setCamera((current) => !current)}
            aria-label={t("scan")}
            aria-pressed={camera}
            className={`${camera ? primary : secondary} shrink-0`}
            style={{ touchAction: "manipulation" }}
          >
            <Camera className="h-5 w-5" aria-hidden />
          </button>
        </form>

        {camera && (
          <div className="overflow-hidden rounded-xl">
            <BarcodeScanner
              compact
              paused={loading}
              onScan={onScan}
              onClose={() => setCamera(false)}
            />
          </div>
        )}
      </div>

      {/* action error: fixed at the top so it is always visible */}
      {actionError && (
        <div
          role="alert"
          className="fixed inset-x-3 top-3 z-100 flex items-center justify-between gap-3 rounded-xl bg-red-600 p-3 text-sm text-white shadow-lg"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {t(actionError)}
          </span>

          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label={t("clear")}
            className="rounded-full p-1 active:bg-red-700"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {/* to-do tabs: what to do, loading and done states */}
      {tab !== "all" && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {t(`hint.${tab}`)}
        </div>
      )}

      {tab !== "all" && audit && shown.length === 0 && (
        <p className="py-14 text-center text-sm text-slate-500">
          {t("filters.done")}
        </p>
      )}

      {tab !== "all" && audit === null && (
        <p className="flex items-center justify-center gap-2 py-14 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t("loading")}
        </p>
      )}

      {/* desktop: table */}
      {shown.length > 0 && (
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="w-24 p-3" aria-label={t("columns.cover")} />
                <th className="p-3 font-medium">{t("columns.title")}</th>
                <th className="p-3 font-medium">{t("columns.publisher")}</th>
                <th className="p-3 font-medium">{t("columns.year")}</th>
                <th className="p-3 font-medium">{t("columns.language")}</th>
                <th className="p-3 font-medium">{t("columns.isbn")}</th>
                <th className="p-3 font-medium">{t("columns.category")}</th>
                <th className="p-3 font-medium">{t("columns.shelf")}</th>
                <th className="p-3 text-right font-medium">
                  {t("columns.stock")}
                </th>
                <th className="w-24 p-3" aria-hidden />
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {shown.map((book) => (
                <tr key={book.id} className="align-top hover:bg-slate-50/70">
                  <td className="p-3">
                    <BookCover
                      src={book.cover}
                      className="h-24 w-16 rounded object-cover"
                    />
                  </td>

                  <td className="min-w-56 max-w-sm p-3">
                    <div className="break-words font-semibold leading-snug text-slate-900">
                      {book.title}
                    </div>

                    {book.author && (
                      <div className="break-words text-slate-500">
                        {book.author}
                      </div>
                    )}

                    {dupeBadge(book)}
                  </td>

                  <td className="p-3">{book.publisher ?? "—"}</td>
                  <td className="p-3 tabular-nums">{book.year ?? "—"}</td>
                  <td className="p-3">{book.language ?? "—"}</td>

                  <td className="whitespace-nowrap p-3 tabular-nums text-slate-600">
                    {book.isbn ?? "—"}
                  </td>

                  <td className="p-3">
                    {categoryLabel(book.category) ?? "—"}
                  </td>
                  <td className="p-3">{book.shelf ?? "—"}</td>

                  <td className="whitespace-nowrap p-3 text-right">
                    {stock(book)}
                  </td>

                  <td className="whitespace-nowrap p-3 text-right">
                    <span className="inline-flex items-center gap-1">
                      {editButton(book)}
                      {deleteButton(book)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* mobile: edge-to-edge grid, cards touch the screen sides */}
      {shown.length > 0 && (
        <div className="-mx-4 overflow-hidden border-y border-slate-200 md:hidden">
          <ul className="-mb-px -mr-px grid grid-cols-2 sm:grid-cols-3">
            {shown.map((book) => {
              const category = categoryLabel(book.category);

              return (
                <li
                  key={book.id}
                  className="flex flex-col border-b border-r border-slate-200 bg-white"
                >
                  <div className="relative">
                    <BookCover
                      src={book.cover}
                      className="aspect-[2/3] w-full rounded-none bg-slate-100 object-cover"
                    />

                    <div className="absolute right-2 top-2 flex gap-1.5">
                      {editButton(book, true)}
                      {deleteButton(book, true)}
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col gap-1.5 p-3">
                    <h3 className="break-words text-[15px] font-semibold leading-snug text-slate-900">
                      {book.title}
                    </h3>

                    {dupeBadge(book)}

                    {book.author && (
                      <p className="break-words text-sm leading-snug text-slate-600">
                        {book.author}
                      </p>
                    )}

                    {book.publisher && (
                      <p className="break-words text-xs leading-snug text-slate-500">
                        {book.publisher}
                      </p>
                    )}

                    {(category ||
                      book.year ||
                      book.language ||
                      book.shelf) && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {category && (
                          <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                            {category}
                          </span>
                        )}

                        {book.year && (
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs tabular-nums text-slate-600">
                            {book.year}
                          </span>
                        )}

                        {book.language && (
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                            {book.language}
                          </span>
                        )}

                        {book.shelf && (
                          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                            {t("columns.shelf")} {book.shelf}
                          </span>
                        )}
                      </div>
                    )}

                    {book.isbn && (
                      <p className="break-all text-xs tabular-nums text-slate-400">
                        ISBN {book.isbn}
                      </p>
                    )}
                  </div>

                  <div className="border-t border-slate-100 p-2">
                    {stock(book, true)}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* states */}
      {tab === "all" && initialLoading && (
        <div className="-mx-4 overflow-hidden border-y border-slate-200 md:hidden">
          <ul className="-mb-px -mr-px grid grid-cols-2 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <li
                key={i}
                className="animate-pulse border-b border-r border-slate-200 bg-white"
                aria-hidden
              >
                <div className="aspect-[2/3] w-full bg-slate-100" />

                <div className="space-y-2 p-3">
                  <div className="h-4 w-11/12 rounded bg-slate-100" />
                  <div className="h-4 w-2/3 rounded bg-slate-100" />
                  <div className="h-3 w-1/2 rounded bg-slate-100" />
                </div>

                <div className="p-2">
                  <div className="h-10 w-full rounded-lg bg-slate-100" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "all" && loading && (
        <p
          className={`items-center justify-center gap-2 py-6 text-sm text-slate-500 ${
            initialLoading ? "hidden md:flex" : "flex"
          }`}
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t("loading")}
        </p>
      )}

      {tab === "all" && !loading && !error && books.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <BookOpen className="h-7 w-7" aria-hidden />
          </span>

          <p className="text-sm text-slate-500">{t("empty")}</p>
        </div>
      )}

      {tab === "all" && error && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {t("loadError")}
          </span>

          <button
            type="button"
            onClick={() => void fetchPage(activeQuery, books.length)}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 font-medium"
          >
            {t("retry")}
          </button>
        </div>
      )}

      <div ref={sentinelRef} className="h-px" />

      {/* edit book: bottom sheet on mobile, centered dialog on larger screens */}
      {editBook && draft && (
        <div
          className="fixed inset-0 z-90 flex items-end bg-black/40 sm:items-center sm:justify-center sm:p-4"
          onClick={closeEdit}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={saveEdit}
            className="max-h-[92vh] w-full space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(5.25rem,env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-2xl sm:pb-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="edit-title" className="text-lg font-semibold">
                {t("editTitle")}
              </h2>

              <button
                type="button"
                onClick={closeEdit}
                disabled={saving}
                aria-label={t("cancel")}
                className="rounded-full p-2 text-slate-600 active:bg-slate-100 disabled:opacity-50"
                style={{ touchAction: "manipulation" }}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <ImageUpload
              value={draft.cover}
              onChange={(cover) =>
                setDraft((current) =>
                  current ? { ...current, cover } : current,
                )
              }
              disabled={saving}
              labels={{
                choose: t("cover.choose"),
                replace: t("cover.replace"),
                remove: t("cover.remove"),
                wrongType: t("cover.wrongType"),
                tooBig: t("cover.tooBig"),
              }}
            />

            <label className="block text-sm text-slate-600">
              {t("columns.title")}
              <input
                required
                value={draft.title}
                onChange={setField("title")}
                className={fieldInput}
              />
            </label>

            <label className="block text-sm text-slate-600">
              {t("author")}
              <input
                value={draft.author}
                onChange={setField("author")}
                className={fieldInput}
              />
            </label>

            <IsbnInput
              label={t("columns.isbn")}
              scanLabel={t("scan")}
              value={draft.isbn}
              onChange={(isbn) =>
                setDraft((current) =>
                  current ? { ...current, isbn } : current,
                )
              }
              disabled={saving}
            />

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-slate-600">
                {t("columns.publisher")}
                <input
                  value={draft.publisher}
                  onChange={setField("publisher")}
                  className={fieldInput}
                />
              </label>

              <label className="block text-sm text-slate-600">
                {t("columns.year")}
                <input
                  value={draft.year}
                  onChange={setField("year")}
                  inputMode="numeric"
                  className={fieldInput}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-slate-600">
                {t("columns.language")}
                <input
                  value={draft.language}
                  onChange={setField("language")}
                  className={fieldInput}
                />
              </label>

              <label className="block text-sm text-slate-600">
                {t("columns.shelf")}
                <input
                  value={draft.shelf}
                  onChange={setField("shelf")}
                  className={fieldInput}
                />
              </label>
            </div>

            <label className="block text-sm text-slate-600">
              {t("columns.category")}
              <select
                value={draft.categoryId}
                onChange={setField("categoryId")}
                className={fieldInput}
              >
                <option value="">{t("noCategory")}</option>

                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {categoryLabel(category)}
                  </option>
                ))}
              </select>
            </label>

            {editError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                {t(editError)}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeEdit}
                disabled={saving}
                className={`${secondary} flex-1`}
              >
                {t("cancel")}
              </button>

              <button
                type="submit"
                disabled={saving}
                className={`${primary} flex-1`}
              >
                {saving ? (
                  <Loader2
                    className="mx-auto h-5 w-5 animate-spin"
                    aria-hidden
                  />
                ) : (
                  t("save")
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* delete confirmation: bottom sheet on mobile, centered dialog on larger screens */}
      {confirmBook && (
        <div
          className="fixed inset-0 z-90 flex items-end bg-black/40 sm:items-center sm:justify-center sm:p-4"
          onClick={() => !busyId && setConfirmBook(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full space-y-4 rounded-t-2xl bg-white p-5 pb-[max(5.25rem,env(safe-area-inset-bottom))] shadow-xl sm:max-w-sm sm:rounded-2xl sm:pb-5"
          >
            <div className="flex gap-3">
              <BookCover
                src={confirmBook.cover}
                className="h-28 w-20 shrink-0 rounded object-cover"
              />

              <div className="min-w-0 space-y-1">
                <h2 id="delete-title" className="text-lg font-semibold">
                  {t("deleteTitle")}
                </h2>

                <p className="break-words text-sm text-slate-600">
                  {t("deleteBody", { title: confirmBook.title })}
                </p>
              </div>
            </div>

            <div className="flex gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmBook(null)}
                disabled={!!busyId}
                className={`${secondary} flex-1 sm:flex-none`}
              >
                {t("cancel")}
              </button>

              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={!!busyId}
                className={`${danger} flex-1 sm:flex-none`}
              >
                {busyId ? (
                  <Loader2
                    className="mx-auto h-5 w-5 animate-spin"
                    aria-hidden
                  />
                ) : (
                  t("confirmDelete")
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}