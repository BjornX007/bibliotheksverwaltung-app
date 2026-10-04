// src/app/register/page.tsx
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth";
import RegisterClient from "../../components/register/RegisterClient";

export default async function RegisterPage() {
  const t = await getTranslations("register");
  const auth = await getCurrentUser();

  let categories: { id: any; name_sq: any; name_en: any; }[] = [];

  if (auth) {
    const { data, error } = await auth.supabase
      .from("categories")
      .select("id, name_sq, name_en")
      .order("name_en");

    if (error) {
      console.error("categories lookup failed:", error.message);
    }

    categories = data ?? [];
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold">
        {t("title")}
      </h1>

      <RegisterClient categories={categories} />
    </div>
  );
}