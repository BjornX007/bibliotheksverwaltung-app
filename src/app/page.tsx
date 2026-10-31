import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";

type Rel<T> = T | T[] | null;

function one<T>(value: Rel<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type DashboardStats = {
  titles: number;
  copies: number;
  available: number;
  onLoan: number;
  overdue: number;
  categories: { id: string; name_sq: string; name_en: string; count: number }[];
};

type RawLoan = {
  id: string;
  due_at: string | null;
  returned_at: string | null;
  students: Rel<{ full_name: string | null; class_name: string | null }>;
  books: Rel<{ title: string | null }>;
};

// today as YYYY-MM-DD in the school's timezone
function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Tirane",
  }).format(new Date());
}

export default async function Dashboard() {
  const t = await getTranslations("dashboard");
  const locale = (await getLocale()) as "sq" | "en";
  const format = await getFormatter();

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-700">
        {t("signInRequired")}
      </div>
    );
  }

  const { supabase } = currentUser;
  const todayStr = today();

  const [statsRes, loansRes] = await Promise.all([
    supabase.rpc("dashboard_stats", { p_today: todayStr }),
    supabase
      .from("loans")
      .select(
        `id, due_at, returned_at,
         students ( full_name, class_name ),
         books ( title )`,
      )
      .order("loaned_at", { ascending: false })
      .limit(5),
  ]);

  if (statsRes.error || loansRes.error) {
    console.error("DASHBOARD:", statsRes.error ?? loansRes.error);

    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-700">
        {t("loadError")}
      </div>
    );
  }

  const stats = statsRes.data as DashboardStats;
  const categories = stats.categories ?? [];
  const max = Math.max(1, ...categories.map((c) => c.count));

  const loans = ((loansRes.data ?? []) as unknown as RawLoan[]).map((row) => {
    const student = one(row.students);
    const book = one(row.books);

    const status = row.returned_at
      ? "returned"
      : row.due_at && row.due_at < todayStr
        ? "overdue"
        : "onLoan";

    return {
      id: row.id,
      student: student?.full_name ?? "—",
      klass: student?.class_name ?? null,
      book: book?.title ?? "—",
      due: row.due_at,
      status,
    } as const;
  });

  const statusStyle = {
    returned: "bg-green-100 text-green-700",
    overdue: "bg-red-100 text-red-700",
    onLoan: "bg-blue-100 text-blue-700",
  } as const;

  const cards = [
    { key: "titles", value: stats.titles, tone: "" },
    { key: "copies", value: stats.copies, tone: "" },
    { key: "available", value: stats.available, tone: "text-green-700" },
    { key: "onLoan", value: stats.onLoan, tone: "text-blue-700" },
    { key: "overdue", value: stats.overdue, tone: "text-red-700" },
  ] as const;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-slate-500">{t("subtitle")}</p>
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {cards.map((c) => (
          <div
            key={c.key}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="text-sm text-slate-500">{t(`stats.${c.key}`)}</div>
            <div className={`mt-1 text-3xl font-semibold ${c.tone}`}>
              {format.number(c.value)}
            </div>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
          <h2 className="mb-3 font-semibold">{t("recentLoans")}</h2>

          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2">{t("columns.student")}</th>
                <th>{t("columns.book")}</th>
                <th>{t("columns.due")}</th>
                <th>{t("columns.status")}</th>
              </tr>
            </thead>

            <tbody>
              {loans.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="py-2">
                    {l.student}
                    {l.klass && (
                      <span className="text-slate-400"> ({l.klass})</span>
                    )}
                  </td>

                  <td>{l.book}</td>

                  <td>
                    {l.due
                      ? format.dateTime(new Date(`${l.due}T00:00:00Z`), {
                          dateStyle: "medium",
                          timeZone: "UTC",
                        })
                      : "—"}
                  </td>

                  <td>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${statusStyle[l.status]}`}
                    >
                      {t(`status.${l.status}`)}
                    </span>
                  </td>
                </tr>
              ))}

              {loans.length === 0 && (
                <tr className="border-t border-slate-100">
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">{t("byCategory")}</h2>

          <ul className="space-y-3">
            {categories.map((c) => (
              <li key={c.id}>
                <div className="flex justify-between text-sm">
                  <span>{locale === "sq" ? c.name_sq : c.name_en}</span>
                  <span className="text-slate-500">
                    {format.number(c.count)}
                  </span>
                </div>

                <div className="mt-1 h-2 rounded bg-slate-100">
                  <div
                    className="h-2 rounded bg-slate-900"
                    style={{ width: `${(c.count / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}