// src/components/inventory/BookCover.tsx
"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";

export default function BookCover({
  src,
  className = "",
}: {
  src?: string | null;
  className?: string;
}) {
  // remember which URL failed, so a new src gets a fresh attempt
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded bg-slate-100 text-slate-400 ${className}`}
      >
        <BookOpen className="h-1/3 w-1/3" aria-hidden />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
      className={`shrink-0 rounded bg-slate-100 ${className}`}
    />
  );
}