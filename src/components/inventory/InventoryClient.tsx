"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertCircle,
  Camera,
  Loader2,
  Minus,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import BarcodeScanner from "@/components/register/BarcodeScanner";
import BookCover from "./BookCover";

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
  category: { id: string; name_sq: string; name_en: string } | null;
};

const PAGE_SIZE = 24;

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200";

const primary =
  "rounded-lg bg-blue-600 px-4 py-3 font-medium text-white disabled:opacity-50";

const secondary =
  "rounded-lg border border-slate-300 bg-white px-4 py-3 font-medium disabled:opacity-50";

const danger =
  "rounded-lg bg-red-600 px-4 py-3 font-medium text-white disabled:opacity-50";

const stepBtn =
  "rounded-md border border-slate-300 bg-white p-1.5 text-slate-700 active:bg-slate-100 disabled:opacity-40";

const trashBtn =
  "rounded-md p-1.5 text-red-600 active:bg-red-50 disabled:opacity-40";

function Stock({
  book,
  busy,
  onAdjust,
  decreaseLabel,
  increaseLabel,
}: {
  book: Book;
  busy: boolean;
  onAdjust: (book: Book, delta: 1 | -1) => void;
  decreaseLabel: string;
  increaseLabel: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onAdjust(book, -1)}
        disabled={busy || book.qty_available <= 0}
        aria-label={decreaseLabel}
        className={stepBtn}
        style={{ touchAction: "manipulation" }}
      >
        <Minus className="h-4 w-4" aria-hidden />
      </button>

      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
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
        className={stepBtn}
        style={{ touchAction: "manipulation" }}
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </span>
  );
}

export default function InventoryClient() {
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

  // edit / delete
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmBook, setConfirmBook] = useState<Book | null>(null);
  const [actionError, setActionError] = useState<
    "actionError" | "hasLoans" | "conflict" | null
  >(null);

  function categoryName(book: Book) {
    if (!book.category) return null;

    return locale === "sq" ? book.category.name_sq : book.category.name_en;
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

  function errorKey(code: unknown): "actionError" | "hasLoans" | "conflict" {
    if (code === "HAS_LOANS" || code === "NO_AVAILABLE_COPY") return "hasLoans";
    if (code === "CONFLICT") return "conflict";
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

      setBooks((current) =>
        current.map((b) =>
          b.id === book.id
            ? {
                ...b,
                qty_total: json.qty_total,
                qty_available: json.qty_available,
              }
            : b,
        ),
      );
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
    } catch (err) {
      console.error("INVENTORY DELETE NETWORK ERROR:", err);
      setActionError("actionError");
    } finally {
      setBusyId(null);
      setConfirmBook(null);
    }
  }

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

    if (!el || !hasMore || loading || error) return;

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
  }, [hasMore, loading, error, books.length, activeQuery]);

  // close the dialog with Escape
  useEffect(() => {
    if (!confirmBook) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyId) setConfirmBook(null);
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [confirmBook, busyId]);

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

  function stock(book: Book) {
    return (
      <Stock
        book={book}
        busy={busyId === book.id}
        onAdjust={adjust}
        decreaseLabel={t("decrease")}
        increaseLabel={t("increase")}
      />
    );
  }

  function deleteButton(book: Book) {
    return (
      <button
        type="button"
        onClick={() => {
          setActionError(null);
          setConfirmBook(book);
        }}
        disabled={busyId === book.id}
        aria-label={t("delete")}
        className={trashBtn}
        style={{ touchAction: "manipulation" }}
      >
        <Trash2 className="h-5 w-5" aria-hidden />
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 pt-4">
        <h1 className="text-xl font-semibold">{t("title")}</h1>

        {total !== null && (
          <span className="text-sm tabular-nums text-slate-500">
            {t("count", { count: total })}
          </span>
        )}
      </div>

      {/* search + camera: stay fixed at the top while the list scrolls */}
<div className="sticky top-0 z-30 -mx-4 space-y-2 bg-white/95 px-4 py-2 backdrop-blur">
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
        className={`${input} pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden`}
      />

      {query && (
        <button
          type="button"
          onClick={() => apply("")}
          aria-label={t("clear")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 active:bg-slate-100"
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
      {/* action error */}
      {actionError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {t(actionError)}
          </span>

          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label={t("clear")}
            className="rounded p-1 text-red-700 active:bg-red-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {/* desktop: table */}
      {books.length > 0 && (
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
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
                <th className="w-12 p-3" aria-hidden />
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {books.map((book) => (
                <tr key={book.id} className="align-top">
                  <td className="p-3">
                    <BookCover
                      src={book.cover}
                      className="h-24 w-16 object-cover"
                    />
                  </td>

                  <td className="max-w-xs p-3">
                    <div className="font-medium leading-snug">
                      {book.title}
                    </div>

                    {book.author && (
                      <div className="text-slate-500">{book.author}</div>
                    )}
                  </td>

                  <td className="p-3">{book.publisher ?? "—"}</td>
                  <td className="p-3 tabular-nums">{book.year ?? "—"}</td>
                  <td className="p-3">{book.language ?? "—"}</td>

                  <td className="p-3 tabular-nums text-slate-600">
                    {book.isbn ?? "—"}
                  </td>

                  <td className="p-3">{categoryName(book) ?? "—"}</td>
                  <td className="p-3">{book.shelf ?? "—"}</td>

                  <td className="p-3 text-right">{stock(book)}</td>
                  <td className="p-3 text-right">{deleteButton(book)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* mobile: grid */}
      {books.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:hidden">
          {books.map((book) => (
            <li
              key={book.id}
              className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
            >
              <BookCover
                src={book.cover}
                className="h-44 w-full rounded-none object-contain"
              />

              <div className="flex flex-1 flex-col gap-1 p-3">
                <div className="line-clamp-2 font-medium leading-snug">
                  {book.title}
                </div>

                {book.author && (
                  <div className="line-clamp-1 text-sm text-slate-500">
                    {book.author}
                  </div>
                )}

                {(book.publisher || book.year) && (
                  <div className="line-clamp-1 text-xs text-slate-500">
                    {[book.publisher, book.year].filter(Boolean).join(" · ")}
                  </div>
                )}

                {book.isbn && (
                  <div className="truncate text-xs tabular-nums text-slate-400">
                    ISBN {book.isbn}
                  </div>
                )}

                <div className="text-xs text-slate-500">
                  {[
                    categoryName(book),
                    book.language,
                    book.shelf
                      ? `${t("columns.shelf")} ${book.shelf}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  {stock(book)}
                  {deleteButton(book)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* states */}
      {loading && (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t("loading")}
        </p>
      )}

      {!loading && !error && books.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-500">
          {t("empty")}
        </p>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
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

      {/* delete confirmation */}
      {confirmBook && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busyId && setConfirmBook(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm space-y-4 rounded-xl bg-white p-5 shadow-xl"
          >
            <h2 id="delete-title" className="text-lg font-semibold">
              {t("deleteTitle")}
            </h2>

            <p className="text-sm text-slate-600">
              {t("deleteBody", { title: confirmBook.title })}
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmBook(null)}
                disabled={!!busyId}
                className={secondary}
              >
                {t("cancel")}
              </button>

              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={!!busyId}
                className={danger}
              >
                {busyId ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
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