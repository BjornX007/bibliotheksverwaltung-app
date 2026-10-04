import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const locales = ["sq", "en"] as const;
export const defaultLocale = "sq"; // Albanian by default

export default getRequestConfig(async () => {
  const stored = (await cookies()).get("locale")?.value ?? "";
  const locale = (locales as readonly string[]).includes(stored) ? stored : defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});