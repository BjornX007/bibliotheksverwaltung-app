import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock3,
  Plus,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { Key } from "react";

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function isOverdue(dueAt: string | null, returnedAt: string | null) {
  if (!dueAt || returnedAt) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(`${dueAt}T00:00:00`);
  due.setHours(0, 0, 0, 0);

  return due < today;
}

export default async function LoansPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
        You must be signed in to view loans.
      </div>
    );
  }

  const { supabase } = currentUser;

  const { data: loans, error } = await supabase
    .from("loans")
    .select(`
      id,
      loaned_at,
      due_at,
      returned_at,
      students (
        full_name,
        class_name
      ),
      books (
        title,
        author
      )
    `)
    .order("loaned_at", { ascending: false });

  if (error) {
    console.error("LOANS PAGE:", error);

    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
        Failed to load loans.
      </div>
    );
  }

  const rows = loans ?? [];

  const active = rows.filter((loan: { returned_at: any; }) => !loan.returned_at);
  const overdue = active.filter((loan: { due_at: string; returned_at: string | null; }) =>
    isOverdue(loan.due_at, loan.returned_at),
  );
  const returned = rows.filter((loan: { returned_at: any; }) => !!loan.returned_at);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Loans</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage currently borrowed books.
          </p>
        </div>

        <Link
href="/loans"
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm"
        >
          <Plus className="h-4 w-4" />
          New loan
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <BookOpen className="h-4 w-4" />
            Total
          </div>
          <div className="mt-2 text-2xl font-bold">{rows.length}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Clock3 className="h-4 w-4" />
            Active
          </div>
          <div className="mt-2 text-2xl font-bold">{active.length}</div>
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4" />
            Overdue
          </div>
          <div className="mt-2 text-2xl font-bold text-red-700">
            {overdue.length}
          </div>
        </div>

        <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            Returned
          </div>
          <div className="mt-2 text-2xl font-bold text-green-700">
            {returned.length}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Book</th>
                <th className="px-4 py-3">Loaned</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {rows.map((loan: { students: any[]; books: any[]; due_at: string | null; returned_at: string | null; id: Key | null | undefined; loaned_at: string | null; }) => {
                const student = Array.isArray(loan.students)
                  ? loan.students[0]
                  : loan.students;

                const book = Array.isArray(loan.books)
                  ? loan.books[0]
                  : loan.books;

                const overdue = isOverdue(
                  loan.due_at,
                  loan.returned_at,
                );

                return (
                  <tr key={loan.id} className="hover:bg-slate-50">
                    <td className="px-4 py-4 font-medium text-slate-900">
                      {student?.full_name ?? "—"}
                    </td>

                    <td className="px-4 py-4 text-slate-500">
                      {student?.class_name ?? "—"}
                    </td>

                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-900">
                        {book?.title ?? "—"}
                      </div>

                      {book?.author && (
                        <div className="text-xs text-slate-500">
                          {book.author}
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
                          Returned
                        </span>
                      ) : overdue ? (
                        <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                          Overdue
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                          Active
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-slate-500"
                  >
                    No loans yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}