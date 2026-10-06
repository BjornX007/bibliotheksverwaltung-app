// src/components/loans/LoanForm.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Camera, Check, Loader2, Search, X } from "lucide-react";
import BarcodeScanner from "@/components/register/BarcodeScanner";
import BookCover from "@/components/inventory/BookCover";

// your inventory list route (returns title, author, isbn, cover, qty_available …)
const BOOKS_API = "/api/inventory/list";

const DUE_PRESETS = [7, 14, 30];

const KNOWN_ERRORS = [
  "INVALID_INPUT",
  "NO_COPIES",
  "ALREADY_LOANED",
  "UNAUTHORIZED",
  "LOAN_FAILED",
];

type Book = {
  id: string;
  title: string;
  author: string | null;
  publisher: string | null;
  year: string | null;
  isbn: string | null;
  cover: string | null;
  qty_total: number;
  qty_available: number;
};

type Student = {
  id: string;
  full_name: string;
  class_name: string | null;
};

const input =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200";

const card = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";

function isoDate(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${d.getFullYear()}-${m}-${day}`;
}

function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);

  return isoDate(d);
}

function looksLikeIsbn(q: string) {
  const clean = q.replace(/[\s-]/g, "");

  return /^\d{13}$/.test(clean) || /^\d{9}[\dXx]$/.test(clean);
}

function Step({
  n,
  title,
  done,
}: {
  n: number;
  title: string;
  done: boolean;
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
          done ? "bg-green-600 text-white" : "bg-blue-600 text-white"
        }`}
      >
        {done ? <Check className="h-4 w-4" aria-hidden /> : n}
      </span>

      <h2 className="font-semibold">{title}</h2>
    </div>
  );
}

export default function LoanForm() {
  const t = useTranslations("loans");
  const router = useRouter();

  // book
  const [book, setBook] = useState<Book | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Book[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [camera, setCamera] = useState(false);
  const bookSeq = useRef(0);
  const lastQuery = useRef("");

  // student
  const [studentId, setStudentId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [className, setClassName] = useState("");

  const [suggestions, setSuggestions] = useState<Student[]>([]);

  // due date (set after mount so server and phone never disagree about "today")
  const [dueDate, setDueDate] = useState("");
  const [today, setToday] = useState("");

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  useEffect(() => {
    setToday(isoDate(new Date()));
    setDueDate(inDays(14));
  }, []);

  useEffect(() => {
    if (!toast) return;

    const id = window.setTimeout(() => setToast(null), 2800);

    return () => window.clearTimeout(id);
  }, [toast]);

  function errorText(code?: string) {
    const key = code && KNOWN_ERRORS.includes(code) ? code : "LOAN_FAILED";

    return t(`errors.${key}`);
  }

  function pickBook(b: Book) {
    setBook(b);
    setResults([]);
    setQuery("");
    setSearched(false);
    setCamera(false);
    lastQuery.current = "";
  }

  async function searchBooks(q: string, autoPick: boolean) {
    const clean = q.trim();

    if (!clean) return;

    const mine = ++bookSeq.current;

    lastQuery.current = clean;
    setSearching(true);
    setSearched(false);

    try {
      const res = await fetch(
        `${BOOKS_API}?q=${encodeURIComponent(clean)}&offset=0&limit=8`,
        { cache: "no-store" },
      );

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (mine !== bookSeq.current) return;

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setToast({ ok: false, text: errorText(json.error) });
        return;
      }

      const found: Book[] = Array.isArray(json.books) ? json.books : [];

      // an ISBN matches one book exactly: fill the form straight away
      if (autoPick && found.length === 1) {
        pickBook(found[0]);
        return;
      }

      setResults(found);
      setSearched(true);
    } catch (error) {
      console.error("BOOK SEARCH FAILED:", error);

      if (mine === bookSeq.current) {
        setToast({ ok: false, text: t("errors.NETWORK") });
      }
    } finally {
      if (mine === bookSeq.current) setSearching(false);
    }
  }

  // typing in the search bar
  useEffect(() => {
    if (book) return;

    const q = query.trim();

    if (q.length < 2) {
      lastQuery.current = "";
      setResults([]);
      setSearched(false);
      return;
    }

    if (q === lastQuery.current) return;

    const id = window.setTimeout(() => {
      void searchBooks(q, looksLikeIsbn(q));
    }, 300);

    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, book]);

  function onScan(code: string) {
    const clean = code.replace(/[\s-]/g, "").trim().toUpperCase();

    setQuery(clean);
    setCamera(false);
    void searchBooks(clean, true);
  }

  // student autocomplete
  useEffect(() => {
    const q = fullName.trim();

    if (studentId || q.length < 2) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;

    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/loans/students?q=${encodeURIComponent(q)}`,
          { cache: "no-store" },
        );

        if (!res.ok || cancelled) return;

        const json = await res.json().catch(() => ({}));

        if (!cancelled) {
          setSuggestions(Array.isArray(json.students) ? json.students : []);
        }
      } catch {
        // suggestions are optional
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [fullName, studentId]);

  function pickStudent(s: Student) {
    setStudentId(s.id);
    setFullName(s.full_name);
    setClassName(s.class_name ?? "");

    setSuggestions([]);
  }

const nameReady = fullName.trim().length >= 2;
const bookReady = !!book && book.qty_available > 0;
const dueReady = !!dueDate;

const canSubmit =
  bookReady &&
  nameReady &&
  dueReady &&
  !saving;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!canSubmit || !book) return;

    setSaving(true);

    try {
      const res = await fetch("/api/loans/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
  bookId: book.id,
  studentId: studentId || null,
  fullName: fullName.trim(),
  className: className.trim(),
  dueAt: dueDate,
}),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setToast({ ok: false, text: errorText(json.error) });
        return;
      }

      setToast({
        ok: true,
        text: t("success", { title: book.title, student: fullName.trim() }),
      });

      // ready for the next loan
      setBook(null);
      setQuery("");
      setStudentId(null);
      setFullName("");
      setClassName("");
      setDueDate(inDays(14));
      window.scrollTo({ top: 0, behavior: "smooth" });

      router.refresh();
    } catch (error) {
      console.error("LOAN NETWORK ERROR:", error);
      setToast({ ok: false, text: t("errors.NETWORK") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {toast && (
        <div className="fixed inset-x-3 top-3 z-100 rounded-xl bg-white p-3 text-sm shadow-lg">
          <div
            className={`flex items-center justify-center gap-2 rounded-lg p-2.5 text-white ${
              toast.ok ? "bg-green-600" : "bg-red-600"
            }`}
          >
            {toast.ok ? (
              <Check className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            )}
            <span>{toast.text}</span>
          </div>
        </div>
      )}

      {/* 1. book */}
      <section className={card}>
        <Step n={1} title={t("stepBook")} done={!!book} />

        {book ? (
          <div className="space-y-3">
            <div className="flex gap-4">
              <BookCover
                src={book.cover}
                className="h-40 w-28 object-cover"
              />

              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-lg font-semibold leading-snug">
                  {book.title}
                </div>

                {book.author && (
                  <div className="text-slate-600">{book.author}</div>
                )}

                {(book.publisher || book.year) && (
                  <div className="text-sm text-slate-500">
                    {[book.publisher, book.year].filter(Boolean).join(" · ")}
                  </div>
                )}

                {book.isbn && (
                  <div className="text-sm tabular-nums text-slate-400">
                    ISBN {book.isbn}
                  </div>
                )}

                <div className="pt-1">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      book.qty_available > 0
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {t("available", {
                      available: book.qty_available,
                      total: book.qty_total,
                    })}
                  </span>
                </div>
              </div>
            </div>

            {book.qty_available === 0 && (
              <p className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                {t("noCopies")}
              </p>
            )}

            <button
              type="button"
              onClick={() => setBook(null)}
              className="w-full rounded-xl border border-slate-300 py-3 text-sm font-medium"
            >
              {t("change")}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
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
                  placeholder={t("searchPlaceholder")}
                  className={`${input} pl-11 pr-10 [&::-webkit-search-cancel-button]:hidden`}
                />

                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label={t("clear")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setCamera((c) => !c)}
                aria-label={t("scan")}
                aria-pressed={camera}
                className={`shrink-0 rounded-xl px-4 ${
                  camera
                    ? "bg-blue-600 text-white"
                    : "border border-slate-300 bg-white"
                }`}
              >
                <Camera className="h-5 w-5" aria-hidden />
              </button>
            </div>

            {camera && (
              <div className="overflow-hidden rounded-xl">
                <BarcodeScanner
                  paused={searching}
                  onScan={onScan}
                  onClose={() => setCamera(false)}
                />
              </div>
            )}

            {searching && (
              <p className="flex items-center justify-center gap-2 py-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {t("searching")}
              </p>
            )}

            {results.length > 0 && (
              <ul className="space-y-2">
                {results.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => pickBook(b)}
                      disabled={b.qty_available === 0}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 text-left active:bg-slate-100 disabled:opacity-50"
                    >
                      <BookCover
                        src={b.cover}
                        className="h-20 w-14 object-cover"
                      />

                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {b.title}
                        </span>

                        <span className="block truncate text-sm text-slate-500">
                          {[b.author, b.year].filter(Boolean).join(" · ")}
                        </span>
                      </span>

                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          b.qty_available > 0
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {b.qty_available > 0
                          ? `${b.qty_available}/${b.qty_total}`
                          : t("unavailable")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {searched && !searching && results.length === 0 && (
              <p className="py-2 text-center text-sm text-slate-500">
                {t("noBooks")}
              </p>
            )}
          </div>
        )}
      </section>

      {/* 2. student */}
      <section className={card}>
      <Step
  n={2}
  title={t("stepStudent")}
  done={nameReady}
/>

        <div className="space-y-3">
          <div>
            <input
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (studentId) setStudentId(null);
              }}
              autoComplete="off"
              autoCapitalize="words"
              placeholder={t("studentName")}
              aria-label={t("studentName")}
              className={input}
            />

            {suggestions.length > 0 && (
              <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => pickStudent(s)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-slate-100"
                    >
                      <span className="truncate font-medium">
                        {s.full_name}
                      </span>

                      {s.class_name && (
                        <span className="shrink-0 text-sm text-slate-500">
                          {s.class_name}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {nameReady && (
              <p
                className={`mt-2 flex items-center gap-1.5 text-xs ${
                  studentId ? "text-green-700" : "text-slate-500"
                }`}
              >
                {studentId && <Check className="h-3.5 w-3.5" aria-hidden />}
                {studentId ? t("savedStudent") : t("newStudent")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              autoComplete="off"
              placeholder={t("studentClass")}
              aria-label={t("studentClass")}
              className={input}
            />

           
          </div>
        </div>
      </section>

      {/* 3. due date */}
      <section className={card}>
        <Step n={3} title={t("stepDue")} done={!!dueDate} />

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {DUE_PRESETS.map((n) => {
              const value = inDays(n);
              const active = dueDate === value;

              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDueDate(value)}
                  aria-pressed={active}
                  className={`rounded-xl py-3 text-sm font-medium ${
                    active
                      ? "bg-blue-600 text-white"
                      : "border border-slate-300 bg-white"
                  }`}
                >
                  {t("days", { count: n })}
                </button>
              );
            })}
          </div>

          <input
            type="date"
            value={dueDate}
            min={today || undefined}
            onChange={(e) => setDueDate(e.target.value)}
            aria-label={t("dueDate")}
            className={input}
          />
        </div>
      </section>

      {/* submit: stays visible above the tab bar */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 bg-slate-100/90 px-4 py-2 backdrop-blur md:bottom-4 md:mx-0 md:bg-transparent md:px-0 md:backdrop-blur-none">
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-base font-semibold text-white shadow-lg disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : (
            <Check className="h-5 w-5" aria-hidden />
          )}
          {saving ? t("saving") : t("submit")}
        </button>
      </div>
    </form>
  );
}