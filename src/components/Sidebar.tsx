// src/components/Sidebar.tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeftRight,
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  Library,
  LogOut,
  ScanLine,
} from "lucide-react";
import { logout } from "../app/actions/auth";

const items = [
  { href: "/", key: "dashboard", icon: LayoutDashboard },
  { href: "/inventory", key: "inventory", icon: Library },
  { href: "/register", key: "register", icon: ScanLine },
  { href: "/loans", key: "loans", icon: ArrowLeftRight },
  { href: "/students", key: "students", icon: GraduationCap },
] as const;

function LocaleSwitch({
  locale,
  onChange,
  className = "",
}: {
  locale: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 ${className}`}
    >
      {(["sq", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          aria-pressed={locale === l}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase ${
            locale === l
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Logo({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
        <BookOpen className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-base font-semibold tracking-tight">{name}</span>
    </div>
  );
}

export default function Sidebar() {
  const t = useTranslations("nav");
  const app = useTranslations("app");
  const lang = useTranslations("language");
  const auth = useTranslations("auth");
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();

  // Back button after logout: a page restored from the browser cache reloads,
  // and the proxy then sends the visitor to the login page.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  if (["/login", "/set-password"].some((p) => pathname.startsWith(p))) {
    return null;
  }

  function changeLocale(next: string) {
    document.cookie = `locale=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <>
      {/* mobile: slim top bar (scrolls away, so it never covers sticky page headers) */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <Logo name={app("name")} />

        <div className="flex items-center gap-2">
          <LocaleSwitch locale={locale} onChange={changeLocale} />

          <form action={logout}>
            <button
              type="submit"
              aria-label={auth("logout")}
              className="rounded-lg border border-slate-300 p-2 text-slate-600 active:bg-slate-100"
              style={{ touchAction: "manipulation" }}
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </form>
        </div>
      </header>

      {/* desktop: sidebar */}
      <aside className="hidden border-r border-slate-200 bg-white md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col">
        <div className="px-5 py-5">
          <Logo name={app("name")} />
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {items.map(({ href, key, icon: Icon }) => {
            const active = isActive(href);

            return (
              <Link
                key={key}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                {t(key)}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-slate-200 p-4">
          <div className="space-y-1.5">
            <div className="text-xs text-slate-500">{lang("label")}</div>
            <LocaleSwitch locale={locale} onChange={changeLocale} />
          </div>

          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              {auth("logout")}
            </button>
          </form>
        </div>
      </aside>

      {/* mobile: bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="grid grid-cols-5">
          {items.map(({ href, key, icon: Icon }) => {
            const active = isActive(href);

            return (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium ${
                    active ? "text-blue-700" : "text-slate-500"
                  }`}
                  style={{ touchAction: "manipulation" }}
                >
                  <span
                    className={`flex h-7 w-12 items-center justify-center rounded-full ${
                      active ? "bg-blue-50" : ""
                    }`}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>

                  <span className="max-w-full truncate">{t(key)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}