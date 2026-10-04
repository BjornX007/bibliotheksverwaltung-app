import { getFormatter, getLocale, getTranslations } from "next-intl/server";

// MOCK DATA - replaced by database queries later.
// Category names carry both languages, like the future name_sq / name_en columns.
const stats = { titles: 1240, copies: 3180, available: 2975, onLoan: 205, overdue: 12 };
const categories = [
  { name: { sq: "Roman", en: "Novels" }, count: 420 },
  { name: { sq: "Histori", en: "History" }, count: 180 },
  { name: { sq: "Për fëmijë", en: "Children" }, count: 310 },
  { name: { sq: "Tekste shkollore", en: "Textbooks" }, count: 230 },
];
const loans = [
  { id: 1, student: "Ana Kola", klass: "7A", book: "Pacientja e heshtur", due: "2026-10-10", overdue: false },
  { id: 2, student: "Besnik Hoxha", klass: "9B", book: "1984", due: "2026-09-28", overdue: true },
  { id: 3, student: "Elira Dervishi", klass: "6C", book: "Perrallat e Andersenit", due: "2026-10-15", overdue: false },
];

export default async function Dashboard() {
  const t = await getTranslations("dashboard");
  const locale = (await getLocale()) as "sq" | "en";
  const format = await getFormatter();
  const max = Math.max(...categories.map((c) => c.count));

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
          <div key={c.key} className="rounded-lg border border-slate-200 bg-white p-4">
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
                  <td className="py-2">{l.student} <span className="text-slate-400">({l.klass})</span></td>
                  <td>{l.book}</td>
                  <td>{format.dateTime(new Date(l.due), { dateStyle: "medium" })}</td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      l.overdue ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {t(l.overdue ? "status.overdue" : "status.onLoan")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">{t("byCategory")}</h2>
          <ul className="space-y-3">
            {categories.map((c) => (
              <li key={c.name.en}>
                <div className="flex justify-between text-sm">
                  <span>{c.name[locale]}</span>
                  <span className="text-slate-500">{format.number(c.count)}</span>
                </div>
                <div className="mt-1 h-2 rounded bg-slate-100">
                  <div className="h-2 rounded bg-slate-900" style={{ width: `${(c.count / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}