// src/components/Sidebar.tsx
"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeftRight,
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  Library,
  Loader2,
  LogOut,
  ScanLine,
  type LucideIcon,
} from "lucide-react";
import { logout } from "../app/actions/auth";

const items = [
  { href: "/", key: "dashboard", icon: LayoutDashboard },
  { href: "/inventory", key: "inventory", icon: Library },
  { href: "/register", key: "register", icon: ScanLine },
  { href: "/loans", key: "loans", icon: ArrowLeftRight },
  { href: "/students", key: "students", icon: GraduationCap },
] as const;

/* Must be rendered inside a <Link>: shows a spinner while that link is loading. */
function NavIcon({
  icon: Icon,
  className,
}: {
  icon: LucideIcon;
  className: string;
}) {
  const { pending } = useLinkStatus();

  return pending ? (
    <Loader2 className={`${className} animate-spin`} aria-hidden />
  ) : (
    <Icon className={className} aria-hidden />
  );
}

/* Must be rendered inside the logout <form>. */
function LogoutButton({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  const { pending } = useFormStatus();
  const Icon = pending ? Loader2 : LogOut;
  const icon = (
    <Icon
      className={`h-4 w-4 ${pending ? "animate-spin" : ""}`}
      aria-hidden
    />
  );

  if (compact) {
    return (
      <button
        type="submit"
        disabled={pending}
        aria-label={label}
        className="rounded-lg border border-slate-300 p-2 text-slate-600 active:bg-slate-100 disabled:opacity-60"
        style={{ touchAction: "manipulation" }}
      >
        {icon}
      </button>
    );
  }

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-60"
    >
      {icon}
      {label}
    </button>
  );
}

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
          style={{ touchAction: "manipulation" }}
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

  // highlight the tapped tab immediately, not after the new page has loaded
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // language buttons switch instantly while the page refreshes in the background
  const [, startTransition] = useTransition();
  const [shownLocale, setShownLocale] = useOptimistic(locale);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

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

    startTransition(() => {
      setShownLocale(next);
      router.refresh();
    });
  }

  const current = pendingHref ?? pathname;

  function isActive(href: string) {
    return href === "/" ? current === "/" : current.startsWith(href);
  }

  return (
    <>
      {/* mobile: slim top bar (scrolls away, so it never covers sticky page headers) */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <Logo name={app("name")} />

        <div className="flex items-center gap-2">
          <LocaleSwitch locale={shownLocale} onChange={changeLocale} />

          <form action={logout}>
            <LogoutButton label={auth("logout")} compact />
          </form>
        </div>
      </header>

      {/* desktop: sidebar */}
      <aside className="hidden border-r border-slate-200 bg-white md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col">
        <div className="px-5 py-5">
          <Logo name={app("name")} />
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {items.map(({ href, key, icon }) => {
            const active = isActive(href);

            return (
              <Link
                key={key}
                href={href}
                onClick={() => setPendingHref(href)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200"
                }`}
                style={{ touchAction: "manipulation" }}
              >
                <NavIcon icon={icon} className="h-5 w-5 shrink-0" />
                {t(key)}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-slate-200 p-4">
          <div className="space-y-1.5">
            <div className="text-xs text-slate-500">{lang("label")}</div>
            <LocaleSwitch locale={shownLocale} onChange={changeLocale} />
          </div>

          <form action={logout}>
            <LogoutButton label={auth("logout")} />
          </form>
        </div>
      </aside>

      {/* mobile: bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="grid grid-cols-5">
          {items.map(({ href, key, icon }) => {
            const active = isActive(href);

            return (
              <li key={key}>
                <Link
                  href={href}
                  onClick={() => setPendingHref(href)}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium active:bg-slate-50 ${
                    active ? "text-blue-700" : "text-slate-500"
                  }`}
                  style={{ touchAction: "manipulation" }}
                >
                  <span
                    className={`flex h-7 w-12 items-center justify-center rounded-full ${
                      active ? "bg-blue-50" : ""
                    }`}
                  >
                    <NavIcon icon={icon} className="h-5 w-5" />
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