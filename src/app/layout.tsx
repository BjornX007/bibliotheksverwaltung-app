import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import Sidebar from "../components/Sidebar";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return { title: t("name") };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="bg-slate-50 text-slate-900 antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="min-h-screen md:flex">
            <Sidebar />
            <main className="flex-1 p-4 md:p-8">{children}</main>
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}