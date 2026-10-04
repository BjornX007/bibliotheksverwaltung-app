// src/components/register/BarcodeScanner.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { BarcodeDetector } from "barcode-detector/ponyfill";
import { useTranslations } from "next-intl";
import { toIsbn13 } from "../../lib/isbn";

type Props = { paused: boolean; onScan: (isbn: string) => void; onClose: () => void };

function beep() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
    setTimeout(() => ctx.close(), 300);
  } catch {
    // sound is optional
  }
  navigator.vibrate?.(60);
}

export default function BarcodeScanner({ paused, onScan, onClose }: Props) {
  const t = useTranslations("register");
  const videoRef = useRef<HTMLVideoElement>(null);
  const pausedRef = useRef(paused);
  const onScanRef = useRef(onScan);
  const last = useRef({ code: "", at: 0 });
  const [error, setError] = useState(false);

  useEffect(() => {
    pausedRef.current = paused;
    onScanRef.current = onScan;
  });

  useEffect(() => {
    const video = videoRef.current!;
    const detector = new BarcodeDetector({ formats: ["ean_13"] });
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      if (stopped) return;
      if (!pausedRef.current && video.readyState >= 2) {
        try {
          const codes = await detector.detect(video);
          const isbn = codes.length ? toIsbn13(codes[0].rawValue) : null; // ignores misreads
          const now = Date.now();
          if (isbn && !(isbn === last.current.code && now - last.current.at < 2500)) {
            last.current = { code: isbn, at: now };
            beep();
            onScanRef.current(isbn);
          }
        } catch {
          // a frame that cannot be read is simply skipped
        }
      }
      timer = setTimeout(tick, 150);
    }

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      .then(async (s) => {
        if (stopped) { s.getTracks().forEach((tr) => tr.stop()); return; }
        stream = s;
        // best effort: keep the camera focusing continuously (not supported everywhere)
        s.getVideoTracks()[0]
          ?.applyConstraints({ advanced: [{ focusMode: "continuous" }] } as unknown as MediaTrackConstraints)
          .catch(() => {});
        video.srcObject = s;
        await video.play();
        tick();
      })
      .catch(() => setError(true));

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
      <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
      <button onClick={onClose} className="absolute right-2 top-2 rounded-full bg-white/90 px-3 py-1.5 text-sm">
        {t("closeCamera")}
      </button>
      {error && (
        <p className="absolute inset-x-0 bottom-0 bg-red-600 p-2 text-center text-sm text-white">{t("cameraError")}</p>
      )}
    </div>
  );
}