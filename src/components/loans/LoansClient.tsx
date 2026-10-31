"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock3,
  Loader2,
  Plus,
  Search,
  Undo2,
  X,
} from "lucide-react";

export type Loan = {
  id: string;
  loaned_at: string | null;
  due_at: string | null;
  returned_at: string | null;
  student_name: string | null;
  class_name: string | null;
  book_title: string | null;
  book_author: string | null;
};

type Filter = "all" | "active" | "overdue" | "returned";

const input =
  "w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-10 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200";

const secondary =
  "rounded-lg border border-slate-300 bg-white px-4 py-3 font-medium disabled:opacity-50";

const primary =
  "rounded-lg bg-blue-600 px-4 py-3 font-medium text-white disabled:opacity-50";

// lowercase + strip accents so "nxenes" finds "Nxënës"
function norm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isOverdue(dueAt: string | null, returnedAt: string | null) {
  if (!dueAt || returnedAt) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(`${dueAt}T00:00:00`);
  due.setHours(0, 0, 0, 0);

  return due < today;
}

export default function LoansClient({ loans }: { loans: Loan[] }) {
  const t = useTranslations("loans");
  const locale = useLocale();

  const [rows, setRows] = useState<Loan[]>(loans);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmLoan, setConfirmLoan] = useState<Loan | null>(null);
  const [error, setError] = useState(false);

  function formatDate(value: string | null) {
    if (!value) return "—";

    return new Intl.DateTimeFormat(locale === "sq" ? "sq-AL" : "en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(value));
  }

  const stats = useMemo(() => {
    const active = rows.filter((l) => !l.returned_at);

    return {
      total: rows.length,
      active: active.length,
      overdue: active.filter((l) => isOverdue(l.due_at, l.returned_at)).length,
      returned: rows.length - active.length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const terms = norm(query).split(/\s+/).filter(Boolean);

    return rows.filter((l) => {
      if (filter === "active" && l.returned_at) return false;
      if (filter === "returned" && !l.returned_at) return false;
      if (filter === "overdue" && !isOverdue(l.due_at, l.returned_at)) {
        return false;
      }

      if (terms.length === 0) return true;

      const haystack = norm(
        [l.student_name, l.class_name, l.book_title, l.book_author]
          .filter(Boolean)
          .join(" "),
      );

      return terms.every((term) => haystack.includes(term));
    });
  }, [rows, query, filter]);

  // tapping a card selects it; tapping it again shows everything
  function toggleFilter(next: Filter) {
    setFilter((current) => (current === next ? "all" : next));
  }

  async function markReturned() {
    const loan = confirmLoan;

    if (!loan || busyId) return;

    setBusyId(loan.id);
    setError(false);

    try {
      const res = await fetch("/api/loans/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanId: loan.id }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!res.ok) {
        console.error("LOAN RETURN FAILED:", await res.json().catch(() => ({})));
        setError(true);
        return;
      }

      const now = new Date().toISOString();

      setRows((current) =>
        current.map((l) =>
          l.id === loan.id ? { ...l, returned_at: now } : l,
        ),
      );
    } catch (err) {
      console.error("LOAN RETURN NETWORK ERROR:", err);
      setError(true);
    } finally {
      setBusyId(null);
      setConfirmLoan(null);
    }
  }

  // close the dialog with Escape
  useEffect(() => {
    if (!confirmLoan) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyId) setConfirmLoan(null);
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [confirmLoan, busyId]);

  function cardClass(base: string, key: Filter) {
    return `${base} w-full text-left transition ${
      filter === key ? "ring-2 ring-blue-500 ring-offset-2" : ""
    }`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
        </div>

        <Link
          href="/loans"
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("newLoan")}
        </Link>
      </div>

      {/* stats = filters */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <button
          type="button"
          onClick={() => setFilter("all")}
          aria-pressed={filter === "all"}
          className={cardClass(
            "rounded-2xl border border-slate-200 bg-white p-4",
            "all",
          )}
          style={{ touchAction: "manipulation" }}
        >
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <BookOpen className="h-4 w-4" aria-hidden />
            {t("stats.total")}
          </div>
          <div className="mt-2 text-2xl font-bold">{stats.total}</div>
        </button>

        <button
          type="button"
          onClick={() => toggleFilter("active")}
          aria-pressed={filter === "active"}
          className={cardClass(
            "rounded-2xl border border-slate-200 bg-white p-4",
            "active",
          )}
          style={{ touchAction: "manipulation" }}
        >
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Clock3 className="h-4 w-4" aria-hidden />
            {t("stats.active")}
          </div>
          <div className="mt-2 text-2xl font-bold">{stats.active}</div>
        </button>

        <button
          type="button"
          onClick={() => toggleFilter("overdue")}
          aria-pressed={filter === "overdue"}
          className={cardClass(
            "rounded-2xl border border-red-200 bg-red-50 p-4",
            "overdue",
          )}
          style={{ touchAction: "manipulation" }}
        >
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {t("stats.overdue")}
          </div>
          <div className="mt-2 text-2xl font-bold text-red-700">
            {stats.overdue}
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleFilter("returned")}
          aria-pressed={filter === "returned"}
          className={cardClass(
            "rounded-2xl border border-green-200 bg-green-50 p-4",
            "returned",
          )}
          style={{ touchAction: "manipulation" }}
        >
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {t("stats.returned")}
          </div>
          <div className="mt-2 text-2xl font-bold text-green-700">
            {stats.returned}
          </div>
        </button>
      </div>

      {/* search */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
          aria-hidden
        />

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder={t("searchPlaceholder")}
          className={`${input} [&::-webkit-search-cancel-button]:hidden`}
        />

        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("clear")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 active:bg-slate-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {t("actionError")}
          </span>

          <button
            type="button"
            onClick={() => setError(false)}
            aria-label={t("clear")}
            className="rounded p-1 active:bg-red-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">{t("columns.student")}</th>
                <th className="px-4 py-3">{t("columns.class")}</th>
                <th className="px-4 py-3">{t("columns.book")}</th>
                <th className="px-4 py-3">{t("columns.loaned")}</th>
                <th className="px-4 py-3">{t("columns.due")}</th>
                <th className="px-4 py-3">{t("columns.status")}</th>
                <th className="px-4 py-3 text-right">
                  {t("columns.actions")}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filtered.map((loan) => {
                const overdue = isOverdue(loan.due_at, loan.returned_at);

                return (
                  <tr key={loan.id} className="hover:bg-slate-50">
                    <td className="px-4 py-4 font-medium text-slate-900">
                      {loan.student_name ?? "—"}
                    </td>

                    <td className="px-4 py-4 text-slate-500">
                      {loan.class_name ?? "—"}
                    </td>

                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-900">
                        {loan.book_title ?? "—"}
                      </div>

                      {loan.book_author && (
                        <div className="text-xs text-slate-500">
                          {loan.book_author}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-4 text-slate-500">
                      {formatDate(loan.loaned_at)}
                    </td>

                    <td className="px-4 py-4 text-slate-500">
                      {formatDate(loan.due_at)}
                    </td>

                    <td className="px-4 py-4">
                      {loan.returned_at ? (
                        <span className="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                          {t("status.returned")}
                        </span>
                      ) : overdue ? (
                        <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                          {t("status.overdue")}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                          {t("status.active")}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-4 text-right">
                      {!loan.returned_at && (
                        <button
                          type="button"
                          onClick={() => {
                            setError(false);
                            setConfirmLoan(loan);
                          }}
                          disabled={!!busyId}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 active:bg-slate-100 disabled:opacity-50"
                          style={{ touchAction: "manipulation" }}
                        >
                          <Undo2 className="h-3.5 w-3.5" aria-hidden />
                          {t("markReturned")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-slate-500"
                  >
                    {rows.length === 0 ? t("empty") : t("noResults")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* return confirmation */}
      {confirmLoan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busyId && setConfirmLoan(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="return-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm space-y-4 rounded-xl bg-white p-5 shadow-xl"
          >
            <h2 id="return-title" className="text-lg font-semibold">
              {t("confirmReturnTitle")}
            </h2>

            <p className="text-sm text-slate-600">
              {t("confirmReturnBody", {
                book: confirmLoan.book_title ?? "—",
                student: confirmLoan.student_name ?? "—",
              })}
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmLoan(null)}
                disabled={!!busyId}
                className={secondary}
              >
                {t("cancel")}
              </button>

              <button
                type="button"
                onClick={() => void markReturned()}
                disabled={!!busyId}
                className={primary}
              >
                {busyId ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                ) : (
                  t("confirm")
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}