// src/components/register/RegisterClient.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertCircle,
  BookOpen,
  Camera,
  Check,
  ListChecks,
  Loader2,
  Search,
  X,
} from "lucide-react";
import BarcodeScanner from "./BarcodeScanner";

type Category = {
  id: string;
  name_sq: string;
  name_en: string;
};

type Source = "inventory" | "catalog" | "manual";

type Item = {
  source: "inventory" | "catalog";
  id: string;
  title: string;
  author: string | null;
  publisher: string | null;
  year: string | null;
  isbn: string | null;
  stock: number;
  // books.cover_url / catalog_titles.cover_url, returned by /api/register/lookup
  cover_url?: string | null;
};

type Mode = "cash" | "qty";

type Meta = {
  title: string;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  year: string | null;
  source: Source;
  cover: string | null;
};

type LogEntry = Meta & {
  key: string;
  count: number;
  at: number;
};

type LastScan = Meta & {
  key: string;
  added: number;
};

type Draft = {
  title: string;
  author: string;
  isbn: string;
  publisher: string;
  year: string;
  categoryId: string;
  shelf: string;
  qty: string;
};

const KNOWN_ERRORS = [
  "INVALID_INPUT",
  "INVALID_ISBN",
  "TITLE_REQUIRED",
  "UNAUTHORIZED",
  "REGISTER_FAILED",
];

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200";

const primary =
  "rounded-lg bg-blue-600 px-4 py-3 font-medium text-white disabled:opacity-50";

const secondary =
  "rounded-lg border border-slate-300 bg-white px-4 py-3 font-medium disabled:opacity-50";

const sourceStyle: Record<Source, string> = {
  inventory: "bg-green-100 text-green-700",
  catalog: "bg-slate-100 text-slate-600",
  manual: "bg-amber-100 text-amber-700",
};

/* Cover image from the catalog (catalog_titles.cover_url). Defined at module
   level on purpose (components must not be declared inside another component). */
function Cover({
  src,
  className = "",
}: {
  src?: string | null;
  className?: string;
}) {
  // remember which URL failed, so a new src gets a fresh attempt
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded bg-slate-100 text-slate-400 ${className}`}
      >
        <BookOpen className="h-1/2 w-1/2" aria-hidden />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
      className={`shrink-0 rounded bg-slate-100 object-cover ${className}`}
    />
  );
}

function metaFor(item: Item, isbn: string | null): Meta {
  return {
    title: item.title,
    author: item.author,
    isbn: isbn ?? item.isbn,
    publisher: item.publisher,
    year: item.year,
    source: item.source,
    cover: item.cover_url ?? null,
  };
}

export default function RegisterClient({
  categories,
}: {
  categories: Category[];
}) {
  const t = useTranslations("register");
  const locale = useLocale();

  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const [mode, setMode] = useState<Mode>("cash");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const [camera, setCamera] = useState(false);

  const [heldIsbn, setHeldIsbn] = useState<string | null>(null);
  const [invalidIsbn, setInvalidIsbn] = useState(false);

  const [pending, setPending] = useState<{
    item: Item;
    isbn: string | null;
  } | null>(null);

  const [qty, setQty] = useState("1");

  const [manual, setManual] = useState<Draft | null>(null);

  const [log, setLog] = useState<LogEntry[]>([]);
  const [last, setLast] = useState<LastScan | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const [toast, setToast] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const [saving, setSaving] = useState(false);

  const focusInput = useCallback(() => {
    if (window.matchMedia("(pointer: fine)").matches) {
      inputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!toast) return;

    const id = window.setTimeout(() => {
      setToast(null);
    }, 2500);

    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!panelOpen) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPanelOpen(false);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen]);

  function clearSearch() {
    setQuery("");
    setItems([]);
    setSearched(false);
    setInvalidIsbn(false);
    setHeldIsbn(null);
  }

  function errorText(code?: string) {
    const key =
      code && KNOWN_ERRORS.includes(code) ? code : "REGISTER_FAILED";

    return t(`errors.${key}`);
  }

  async function submit(
    body: Record<string, unknown>,
    meta: Meta,
    key: string,
    count: number,
  ) {
    if (saving) return;

    setSaving(true);

    try {
      const res = await fetch("/api/register/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...body,
          qty: count,
        }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("REGISTER FAILED:", json);
        setToast({
          ok: false,
          text: errorText(json.error),
        });
        return;
      }

      // newest / most recently touched entry goes to the top
      setLog((current) => {
        const previous = current.find((entry) => entry.key === key);
        const rest = current.filter((entry) => entry.key !== key);

        return [
          {
            ...(previous ?? meta),
            key,
            count: (previous?.count ?? 0) + count,
            at: Date.now(),
          },
          ...rest,
        ];
      });

      setLast({ ...meta, key, added: count });

      setToast({
        ok: true,
        text: t("added", {
          title: meta.title,
          count,
        }),
      });

      setHeldIsbn(null);
      setPending(null);
      setManual(null);

      clearSearch();

      window.setTimeout(() => {
        focusInput();
      }, 50);
    } catch (error) {
      console.error("REGISTER NETWORK ERROR:", error);

      setToast({
        ok: false,
        text: t("errors.NETWORK"),
      });
    } finally {
      setSaving(false);
    }
  }

  function bodyFor(item: Item, isbn: string | null) {
    if (item.source === "inventory") {
      return {
        kind: "inventory",
        bookId: item.id,
      };
    }

    return {
      kind: "catalog",
      catalogId: item.id,
      isbn,
    };
  }

  function choose(item: Item, isbn: string | null) {
    const useIsbn = isbn ?? heldIsbn;

    if (mode === "cash") {
      void submit(
        bodyFor(item, useIsbn),
        metaFor(item, useIsbn),
        `${item.source}:${item.id}`,
        1,
      );
      return;
    }

    setQty("1");

    setPending({
      item,
      isbn: useIsbn,
    });
  }

  async function lookup(q: string) {
    const cleanQuery = q.trim();

    if (!cleanQuery) return;

    const mine = ++seq.current;

    setLoading(true);
    setSearched(false);
    setInvalidIsbn(false);

    try {
      const res = await fetch(
        `/api/register/lookup?q=${encodeURIComponent(cleanQuery)}`,
        {
          cache: "no-store",
        },
      );

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (mine !== seq.current) return;

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("LOOKUP FAILED:", json);

        setToast({
          ok: false,
          text: errorText(json.error),
        });

        setLoading(false);
        return;
      }

      const nextItems: Item[] = Array.isArray(json.items) ? json.items : [];

      setItems(nextItems);
      setInvalidIsbn(!!json.invalid);
      setSearched(true);

      if (json.mode === "isbn" && json.isbn) {
        setHeldIsbn(String(json.isbn));
      } else {
        setHeldIsbn(null);
      }

      if (json.mode === "isbn" && nextItems.length === 1) {
        choose(nextItems[0], String(json.isbn ?? cleanQuery));
      }
    } catch (error) {
      console.error("LOOKUP NETWORK ERROR:", error);

      if (mine === seq.current) {
        setToast({
          ok: false,
          text: t("errors.NETWORK"),
        });
      }
    } finally {
      if (mine === seq.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const q = query.trim();

    if (q.length < 3) {
      return;
    }

    const id = window.setTimeout(() => {
      void lookup(q);
    }, 400);

    return () => {
      window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function onScan(isbn: string) {
    const cleanIsbn = isbn.replace(/[\s-]/g, "").trim().toUpperCase();

    setQuery(cleanIsbn);
    void lookup(cleanIsbn);
  }

  function openManual() {
    const currentIsbn = heldIsbn ?? query.trim();

    setManual({
      title: "",
      author: "",
      isbn: currentIsbn,
      publisher: "",
      year: "",
      categoryId: "",
      shelf: "",
      qty: "1",
    });
  }

  function acceptQty(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const n = Number(qty);

    if (!pending) return;

    if (!Number.isInteger(n) || n < 1 || n > 500) {
      return;
    }

    void submit(
      bodyFor(pending.item, pending.isbn),
      metaFor(pending.item, pending.isbn),
      `${pending.item.source}:${pending.item.id}`,
      n,
    );
  }

  function saveManual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!manual) return;

    const count = Number(manual.qty);

    if (!Number.isInteger(count) || count < 1 || count > 500) {
      return;
    }

    const cleanIsbn = manual.isbn.trim();

    void submit(
      {
        kind: "manual",
        title: manual.title,
        author: manual.author,
        isbn: cleanIsbn || null,
        publisher: manual.publisher,
        year: manual.year,
        shelf: manual.shelf,
        categoryId: manual.categoryId || null,
      },
      {
        title: manual.title,
        author: manual.author || null,
        isbn: cleanIsbn || null,
        publisher: manual.publisher || null,
        year: manual.year || null,
        source: "manual",
        cover: null,
      },
      "manual:" + (cleanIsbn || manual.title),
      count,
    );
  }

  const setField =
    (key: keyof Draft) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value;

      setManual((current) =>
        current
          ? {
              ...current,
              [key]: value,
            }
          : current,
      );
    };

  const total = log.reduce((sum, entry) => sum + entry.count, 0);

  const lastTotal = last
    ? (log.find((entry) => entry.key === last.key)?.count ?? last.added)
    : 0;

  const notFound = searched && !loading && items.length === 0 && !invalidIsbn;

  return (
    <div
      className="relative z-10 isolate space-y-4 pb-24"
      style={{ pointerEvents: "auto" }}
    >
      {toast && (
        <div className="fixed inset-x-3 top-3 z-100 rounded-lg bg-white p-3 text-sm shadow-lg">
          <div
            className={`flex items-center justify-center gap-2 rounded p-2 text-white ${
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

      {/* mode switch */}
      <div className="relative z-20">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200 p-1">
          <button
            type="button"
            onClick={() => setMode("cash")}
            className={`rounded-lg py-3 text-sm font-medium ${
              mode === "cash" ? "bg-white shadow" : "text-slate-600"
            }`}
            style={{ touchAction: "manipulation" }}
          >
            {t("modeCash")}
          </button>

          <button
            type="button"
            onClick={() => setMode("qty")}
            className={`rounded-lg py-3 text-sm font-medium ${
              mode === "qty" ? "bg-white shadow" : "text-slate-600"
            }`}
            style={{ touchAction: "manipulation" }}
          >
            {t("modeQty")}
          </button>
        </div>

        <p className="mt-1 text-center text-xs text-slate-500">
          {t(mode === "cash" ? "hintCash" : "hintQty")}
        </p>
      </div>

      {/* search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();

          const q = query.trim();

          if (q) {
            void lookup(q);
          }
        }}
        className="relative z-20 flex gap-2"
        style={{
          pointerEvents: "auto",
          touchAction: "manipulation",
        }}
      >
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            const value = e.target.value;

            setQuery(value);

            if (!value.trim()) {
              setItems([]);
              setSearched(false);
              setInvalidIsbn(false);
              setHeldIsbn(null);
            }
          }}
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t("placeholder")}
          className={`${input} min-w-0 flex-1`}
          style={{
            pointerEvents: "auto",
            touchAction: "manipulation",
          }}
        />

        <button
          type="submit"
          className={`${secondary} shrink-0`}
          aria-label={t("search")}
          style={{
            pointerEvents: "auto",
            touchAction: "manipulation",
          }}
        >
          <Search className="h-5 w-5" aria-hidden />
        </button>

        <button
          type="button"
          onClick={() => setCamera((current) => !current)}
          aria-label={t("scan")}
          aria-pressed={camera}
          className={`${camera ? primary : secondary} shrink-0`}
          style={{
            pointerEvents: "auto",
            touchAction: "manipulation",
          }}
        >
          <Camera className="h-5 w-5" aria-hidden />
        </button>
      </form>

      {/* camera */}
      {camera && (
        <div className="relative z-30 overflow-hidden rounded-xl">
          <BarcodeScanner
            paused={!!pending || !!manual || saving || loading}
            onScan={onScan}
            onClose={() => setCamera(false)}
          />
        </div>
      )}

      {/* last scanned: compact register-style preview, sits under the camera */}
      {last && (
        <div
          className="relative z-20 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 pr-3"
          aria-live="polite"
        >
          <Cover
            src={last.cover}
            className="h-36 w-24"
          />

          <div className="min-w-0 flex-1">
            <div className="truncate font-medium leading-tight">
              {last.title}
            </div>

            {last.author && (
              <div className="truncate text-sm text-slate-500">
                {last.author}
              </div>
            )}

            {last.isbn && (
              <div className="truncate text-xs tabular-nums text-slate-400">
                ISBN {last.isbn}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-center gap-0.5">
            <span className="flex items-center gap-1 rounded-full bg-green-600 px-2 py-1 text-sm font-semibold tabular-nums text-white">
              <Check className="h-3.5 w-3.5" aria-hidden />+{last.added}
            </span>

            {lastTotal > last.added && (
              <span className="text-xs tabular-nums text-slate-500">
                × {lastTotal}
              </span>
            )}
          </div>
        </div>
      )}

      {/* selected ISBN */}
      {heldIsbn && searched && (
        <div className="relative z-20 flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <span>
            {t("heldIsbn", {
              isbn: heldIsbn,
            })}
          </span>

          <button
            type="button"
            onClick={() => setHeldIsbn(null)}
            className="p-1"
            aria-label={t("cancel")}
            style={{ touchAction: "manipulation" }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {/* loading */}
      {loading && (
        <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t("searching")}
        </p>
      )}

      {/* invalid */}
      {invalidIsbn && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {t("invalidIsbn")}
        </div>
      )}

      {/* results */}
      {items.length > 0 && (
        <ul className="relative z-20 space-y-2">
          {items.map((item) => (
            <li key={`${item.source}-${item.id}`}>
              <button
                type="button"
                onClick={() => choose(item, null)}
                disabled={saving}
                className="flex min-h-18 w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-2 text-left active:bg-slate-100"
                style={{
                  pointerEvents: "auto",
                  touchAction: "manipulation",
                }}
              >
                <Cover
                  src={item.cover_url}
                  className="h-24 w-16"
                />

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {item.title}
                  </span>

                  <span className="block truncate text-sm text-slate-500">
                    {[item.author, item.publisher, item.year]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>

                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                    item.source === "inventory"
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {item.source === "inventory"
                    ? t("inStock", {
                        count: item.stock,
                      })
                    : t("fromCatalog")}
                </span>
              </button>
            </li>
          ))}

          <li>
            <button
              type="button"
              onClick={openManual}
              className="w-full py-3 text-sm text-blue-700"
              style={{
                pointerEvents: "auto",
                touchAction: "manipulation",
              }}
            >
              {t("notInList")}
            </button>
          </li>
        </ul>
      )}

      {/* not found */}
      {notFound && (
        <div className="relative z-20 space-y-2 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm">
            {heldIsbn
              ? t("notFoundIsbn", {
                  isbn: heldIsbn,
                })
              : t("notFoundText")}
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            {heldIsbn && (
              <button
                type="button"
                onClick={() => {
                  clearSearch();
                  window.setTimeout(() => {
                    inputRef.current?.focus();
                  }, 50);
                }}
                className={`${secondary} flex-1`}
                style={{ touchAction: "manipulation" }}
              >
                {t("searchByTitle")}
              </button>
            )}

            <button
              type="button"
              onClick={openManual}
              className={`${primary} flex-1`}
              style={{ touchAction: "manipulation" }}
            >
              {t("addManually")}
            </button>
          </div>
        </div>
      )}

      {/* session button (always visible, bottom right) */}
      {!panelOpen && (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          aria-label={t("openSession")}
          className="fixed right-3 z-40 flex items-center gap-2 rounded-full bg-blue-600 py-3 pl-4 pr-5 text-white shadow-lg active:scale-95"
          style={{
            bottom: "max(5rem, env(safe-area-inset-bottom))",
            touchAction: "manipulation",
          }}
        >
          <ListChecks className="h-5 w-5" aria-hidden />
          <span className="text-base font-semibold tabular-nums">{total}</span>
        </button>
      )}

      {/* session drawer (slides in from the right) */}
      <div
        className={`fixed inset-0 z-80 ${
          panelOpen ? "" : "pointer-events-none"
        }`}
        inert={!panelOpen}
      >
        <div
          onClick={() => setPanelOpen(false)}
          className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${
            panelOpen ? "opacity-100" : "opacity-0"
          }`}
        />

        <aside
          role="dialog"
          aria-label={t("sessionTitle")}
          className={`absolute inset-y-0 right-0 flex w-[88%] max-w-sm flex-col bg-white shadow-xl transition-transform duration-200 ease-out ${
            panelOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold">
              {t("sessionTitle")} ({total})
            </h2>

            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              aria-label={t("close")}
              className="rounded-lg p-2 text-slate-600 active:bg-slate-100"
              style={{ touchAction: "manipulation" }}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </header>

          {log.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">
              {t("sessionEmpty")}
            </p>
          ) : (
            <ul
              className="flex-1 divide-y divide-slate-100 overflow-y-auto"
              style={{
                paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
              }}
            >
              {log.map((entry) => (
                <li key={entry.key} className="flex gap-3 p-3">
                  <Cover
                    src={entry.cover}
                    className="h-32 w-20"
                  />

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="line-clamp-2 font-medium leading-tight">
                      {entry.title}
                    </div>

                    {entry.author && (
                      <div className="truncate text-sm text-slate-600">
                        {entry.author}
                      </div>
                    )}

                    {(entry.publisher || entry.year) && (
                      <div className="truncate text-xs text-slate-500">
                        {[entry.publisher, entry.year]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}

                    {entry.isbn && (
                      <div className="truncate text-xs tabular-nums text-slate-400">
                        ISBN {entry.isbn}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          sourceStyle[entry.source]
                        }`}
                      >
                        {t(`source.${entry.source}`)}
                      </span>

                      <span className="text-xs tabular-nums text-slate-400">
                        {new Date(entry.at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 self-center text-lg font-semibold tabular-nums">
                    × {entry.count}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {/* quantity popup */}
      {pending && (
        <div
          className="fixed inset-0 z-90 flex items-end bg-black/40 sm:items-center sm:justify-center"
          onClick={() => setPending(null)}
          style={{ touchAction: "manipulation" }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={acceptQty}
            className="w-full space-y-4 rounded-t-2xl bg-white p-5 pb-[max(5.25rem,env(safe-area-inset-bottom))] sm:max-w-sm sm:rounded-2xl"
          >
            <div className="flex gap-3">
              <Cover
                src={pending.item.cover_url}
                className="h-40 w-28"
              />

              <div className="min-w-0">
                <div className="font-semibold leading-tight">
                  {pending.item.title}
                </div>

                <div className="text-sm text-slate-500">
                  {pending.item.author}
                </div>
              </div>
            </div>

            <label className="block text-sm text-slate-600">
              {t("quantity")}

              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                autoFocus
                value={qty}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setQty(e.target.value)}
                className={`${input} mt-1 text-center text-2xl`}
              />
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className={`${secondary} flex-1`}
                style={{ touchAction: "manipulation" }}
              >
                {t("cancel")}
              </button>

              <button
                type="submit"
                disabled={saving}
                className={`${primary} flex-1`}
                style={{ touchAction: "manipulation" }}
              >
                {t("accept")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* manual add */}
      {manual && (
        <div
          className="fixed inset-0 z-90 flex items-end bg-black/40 sm:items-center sm:justify-center"
          onClick={() => setManual(null)}
          style={{ touchAction: "manipulation" }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={saveManual}
            className="max-h-[92vh] w-full space-y-3 overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(5.25rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-2xl"
          >
            <h2 className="font-semibold">{t("manual.title")}</h2>

            <input
              required
              placeholder={t("manual.bookTitle")}
              value={manual.title}
              onChange={setField("title")}
              className={input}
            />

            <input
              placeholder={t("manual.author")}
              value={manual.author}
              onChange={setField("author")}
              className={input}
            />

            <input
              placeholder={t("manual.isbn")}
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              value={manual.isbn}
              onChange={setField("isbn")}
              className={input}
            />

            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder={t("manual.publisher")}
                value={manual.publisher}
                onChange={setField("publisher")}
                className={input}
              />

              <input
                placeholder={t("manual.year")}
                inputMode="numeric"
                value={manual.year}
                onChange={setField("year")}
                className={input}
              />
            </div>

            <select
              value={manual.categoryId}
              onChange={setField("categoryId")}
              className={input}
            >
              <option value="">{t("manual.noCategory")}</option>

              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {locale === "sq" ? category.name_sq : category.name_en}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder={t("manual.shelf")}
                value={manual.shelf}
                onChange={setField("shelf")}
                className={input}
              />

              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                aria-label={t("quantity")}
                value={manual.qty}
                onChange={setField("qty")}
                className={`${input} text-center`}
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setManual(null)}
                className={`${secondary} flex-1`}
                style={{ touchAction: "manipulation" }}
              >
                {t("cancel")}
              </button>

              <button
                type="submit"
                disabled={saving}
                className={`${primary} flex-1`}
                style={{ touchAction: "manipulation" }}
              >
                {t("manual.save")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}