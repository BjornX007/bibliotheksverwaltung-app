// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import Sidebar from "../components/Sidebar";
import ServiceWorkerRegister from "../components/ServiceWorkerRegister";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#ffffff", // status bar matches the white top bar
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // needed for the safe-area spacing on iPhones
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");

  return {
    title: t("name"),
    applicationName: t("name"),
    appleWebApp: {
      capable: true,
      title: "Biblioteka", // short name under the home screen icon
      statusBarStyle: "default",
    },
    formatDetection: { telephone: false },
    icons: { apple: "/icons/apple-touch-icon.png" },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="min-h-dvh md:flex">
            <Sidebar />
            {/* extra bottom space on phones so the tab bar never covers content */}
            <main className="flex-1 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:p-8">
              {children}
            </main>
          </div>
        </NextIntlClientProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}