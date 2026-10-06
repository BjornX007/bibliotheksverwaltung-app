// src/components/ServiceWorkerRegister.tsx
"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    // only in production, so `yarn dev` never serves stale files
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((err) => console.error("SERVICE WORKER FAILED:", err));
  }, []);

  return null;
}