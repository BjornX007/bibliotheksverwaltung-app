import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "../../lib/supabase/server";

async function login(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  redirect(error ? "/login?error=invalid" : "/");
}

const KNOWN_ERRORS = ["invalid", "invalid_link"];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getTranslations("auth");
  const { error } = await searchParams;

  return (
    <div className="mx-auto mt-16 w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6">
      <h1 className="mb-4 text-xl font-semibold">{t("login.title")}</h1>
      {error && KNOWN_ERRORS.includes(error) && (
        <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{t(`errors.${error}`)}</p>
      )}
      <form action={login} className="space-y-3">
        <input name="email" type="email" required autoComplete="email"
          placeholder={t("login.email")}
          className="w-full rounded border border-slate-300 px-3 py-2" />
        <input name="password" type="password" required autoComplete="current-password"
          placeholder={t("login.password")}
          className="w-full rounded border border-slate-300 px-3 py-2" />
        <button className="w-full rounded bg-slate-200 py-2 font-medium hover:bg-slate-300">
          {t("login.submit")}
        </button>
      </form>
    </div>
  );
}