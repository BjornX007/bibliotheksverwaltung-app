// src/components/register/BarcodeScanner.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { BarcodeDetector } from "barcode-detector/ponyfill";
import { useTranslations } from "next-intl";
import { toIsbn13 } from "../../lib/isbn";

type Props = { paused: boolean; onScan: (isbn: string) => void; onClose: () => void };

// what the camera reports it can do (not in the TypeScript DOM types)
type Caps = {
  focusMode?: string[];
  zoom?: { min: number; max: number; step?: number };
};

const ZOOM_PRESETS = [1, 2, 3];
const ZOOM_KEY = "scanner-zoom";

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
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const capsRef = useRef<Caps>({});
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ringTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [error, setError] = useState(false);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);

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
        const track = s.getVideoTracks()[0];
        trackRef.current = track ?? null;
        video.srcObject = s;
        await video.play();

        // read what this camera supports (only available once it is running)
        const caps = ((track as unknown as { getCapabilities?: () => Caps })?.getCapabilities?.() ?? {}) as Caps;
        capsRef.current = caps;

        // best effort: keep the camera focusing continuously
        if (!caps.focusMode || caps.focusMode.includes("continuous")) {
          track
            ?.applyConstraints({ advanced: [{ focusMode: "continuous" }] } as unknown as MediaTrackConstraints)
            .catch(() => {});
        }

        // zoom buttons only when the camera supports zoom; restore the last choice
        if (caps.zoom && caps.zoom.max > caps.zoom.min) {
          const { min, max } = caps.zoom;
          setZoomRange({ min, max });
          try {
            const saved = Number(localStorage.getItem(ZOOM_KEY));
            if (saved >= min && saved <= max && saved !== 1) applyZoom(saved);
          } catch {
            // storage is optional
          }
        }

        tick();
      })
      .catch(() => setError(true));

    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(focusTimer.current);
      clearTimeout(ringTimer.current);
      stream?.getTracks().forEach((tr) => tr.stop());
      trackRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyAdvanced(constraint: Record<string, unknown>) {
    const track = trackRef.current;
    if (!track) return Promise.reject(new Error("no track"));
    return track.applyConstraints({ advanced: [constraint] } as unknown as MediaTrackConstraints);
  }

  function applyZoom(value: number) {
    const range = capsRef.current.zoom;
    if (!range) return;
    const z = Math.min(range.max, Math.max(range.min, value));
    setZoom(z);
    applyAdvanced({ zoom: z }).catch(() => {});
    try {
      localStorage.setItem(ZOOM_KEY, String(z));
    } catch {
      // storage is optional
    }
  }

  // tap on the picture: show a ring and ask the camera to focus there
  async function onTap(e: React.MouseEvent<HTMLVideoElement>) {
    const video = videoRef.current;
    if (!video) return;

    const rect = video.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    setRing({ x: px, y: py });
    clearTimeout(ringTimer.current);
    ringTimer.current = setTimeout(() => setRing(null), 700);

    // map the tap to the camera frame (the picture is cropped by object-cover)
    const vw = video.videoWidth || rect.width;
    const vh = video.videoHeight || rect.height;
    const scale = Math.max(rect.width / vw, rect.height / vh);
    const shownW = vw * scale;
    const shownH = vh * scale;
    const x = Math.min(1, Math.max(0, (px + (shownW - rect.width) / 2) / shownW));
    const y = Math.min(1, Math.max(0, (py + (shownH - rect.height) / 2) / shownH));

    const modes = capsRef.current.focusMode ?? [];

    try {
      if (modes.includes("single-shot")) {
        try {
          await applyAdvanced({ focusMode: "single-shot", pointsOfInterest: [{ x, y }] });
        } catch {
          await applyAdvanced({ focusMode: "single-shot" });
        }
        // after the focus has settled, go back to continuous focus
        if (modes.includes("continuous")) {
          clearTimeout(focusTimer.current);
          focusTimer.current = setTimeout(() => {
            applyAdvanced({ focusMode: "continuous" }).catch(() => {});
          }, 1500);
        }
      } else if (modes.includes("continuous")) {
        // no single-shot: switching away and back restarts the autofocus
        if (modes.includes("manual")) await applyAdvanced({ focusMode: "manual" });
        await applyAdvanced({ focusMode: "continuous" });
      }
    } catch {
      // this camera does not allow focus control: ignore
    }
  }

  const presets = zoomRange
    ? ZOOM_PRESETS.filter((z) => z >= zoomRange.min && z <= zoomRange.max)
    : [];

  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      <video
        ref={videoRef}
        onClick={onTap}
        className="aspect-[4/3] w-full object-cover"
        style={{ touchAction: "manipulation" }}
        muted
        playsInline
      />
      <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />

      {ring && (
        <div
          className="pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90"
          style={{ left: ring.x, top: ring.y }}
        />
      )}

      <button onClick={onClose} className="absolute right-2 top-2 rounded-full bg-white/90 px-3 py-1.5 text-sm">
        {t("closeCamera")}
      </button>

      {presets.length > 1 && (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-black/50 p-1">
          {presets.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => applyZoom(z)}
              aria-label={`Zoom ${z}×`}
              aria-pressed={Math.abs(zoom - z) < 0.05}
              className={`h-8 min-w-10 rounded-full px-2 text-sm font-medium ${
                Math.abs(zoom - z) < 0.05 ? "bg-white text-black" : "text-white"
              }`}
              style={{ touchAction: "manipulation" }}
            >
              {z}×
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="absolute inset-x-0 bottom-0 bg-red-600 p-2 text-center text-sm text-white">{t("cameraError")}</p>
      )}
    </div>
  );
}