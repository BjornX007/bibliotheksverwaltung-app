//C:\library inventory\school-library\src\app\[locale]\page.tsx
import { getTranslations } from "next-intl/server";
import type { ComponentType } from "react";
import { getCurrentUser } from "@/lib/auth";
import LoansClient, { type Loan } from "@/components/loans/LoansClient";

type Rel<T> = T | T[] | null;

function one<T>(value: Rel<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type Raw = {
  id: string;
  loaned_at: string | null;
  due_at: string | null;
  returned_at: string | null;
  students: Rel<{ full_name: string | null; class_name: string | null }>;
  books: Rel<{ title: string | null; author: string | null }>;
};

export default async function LoansPage() {
  const t = await getTranslations("loans");
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
        {t("signInRequired")}
      </div>
    );
  }

  const { supabase } = currentUser;

  const { data, error } = await supabase
    .from("loans")
    .select(
      `id, loaned_at, due_at, returned_at,
       students ( full_name, class_name ),
       books ( title, author )`,
    )
    .order("loaned_at", { ascending: false });

  if (error) {
    console.error("LOANS PAGE:", error);

    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
        {t("loadError")}
      </div>
    );
  }

  const loans: Loan[] = ((data ?? []) as unknown as Raw[]).map((row) => {
    const student = one(row.students);
    const book = one(row.books);

    return {
      id: row.id,
      loaned_at: row.loaned_at,
      due_at: row.due_at,
      returned_at: row.returned_at,
      student_name: student?.full_name ?? null,
      class_name: student?.class_name ?? null,
      book_title: book?.title ?? null,
      book_author: book?.author ?? null,
    };
  });

  const LoansClientWithLoans = LoansClient as ComponentType<{ loans: Loan[] }>;
  return <LoansClientWithLoans loans={loans} />;
}