// src/app/offline/page.tsx
import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <WifiOff className="h-8 w-8" aria-hidden />
      </span>

      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Nuk ka lidhje me internetin</h1>
        <p className="text-sm text-slate-500">No internet connection</p>
      </div>

      <a
        href="/"
        className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white"
      >
        Provo përsëri / Try again
      </a>
    </main>
  );
}