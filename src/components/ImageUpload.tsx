"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { createClient } from "../lib/supabase/client";

/*
  Reusable image picker for Supabase Storage with DEFERRED upload.

  Picking a photo only resizes it in the browser (long side <= maxDimension,
  JPEG) and shows a local preview. Nothing is uploaded until the parent calls
  resolveImageDraft() - normally inside its "Save" handler. Cancelling the
  form therefore never leaves files in the bucket.

  Usage:
    const [cover, setCover] = useState<ImageDraft>({
      url: book.cover_url,   // image that is already saved (or null)
      blob: null,
      preview: null,
    });

    <ImageUpload value={cover} onChange={setCover} labels={{ ... }} />

    // on save:
    const { url, uploaded } = await resolveImageDraft(cover, {
      bucket: "book-covers",
      folder: "books",
    });
    // ... write `url` to the database; if that fails and `uploaded` is true,
    // call removeUploadedImage("book-covers", url)
*/

export type ImageDraft = {
  // image that is already saved (e.g. books.cover_url), null = none
  url: string | null;
  // newly picked image, resized but NOT uploaded yet
  blob: Blob | null;
  // local preview of `blob` (data URL)
  preview: string | null;
};

export const emptyImageDraft: ImageDraft = {
  url: null,
  blob: null,
  preview: null,
};

export type ImageUploadLabels = {
  choose: string;
  replace: string;
  remove: string;
  wrongType: string;
  tooBig: string;
};

const DEFAULT_LABELS: ImageUploadLabels = {
  choose: "Choose photo",
  replace: "Replace photo",
  remove: "Remove photo",
  wrongType: "Please choose an image file.",
  tooBig: "The image is too large.",
};

// not crypto.randomUUID(): it is missing on http:// pages (e.g. a phone on the local network)
function uniqueName() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function resizeToJpeg(file: File, maxDimension: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });

  const scale = Math.min(
    1,
    maxDimension / Math.max(bitmap.width, bitmap.height),
  );

  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    bitmap.close();
    throw new Error("NO_CANVAS");
  }

  // white background so transparent PNGs do not turn black as JPEG
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("ENCODE_FAILED"))),
      "image/jpeg",
      0.85,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("READ_FAILED"));
    reader.readAsDataURL(blob);
  });
}

/*
  Uploads the picked image (if any) and returns the URL to store.
  - nothing picked: returns the existing url unchanged, uploaded = false
  - something picked: uploads it, returns the new public URL, uploaded = true
  Throws if the upload fails.
*/
export async function resolveImageDraft(
  draft: ImageDraft,
  options: { bucket: string; folder?: string },
): Promise<{ url: string | null; uploaded: boolean }> {
  if (!draft.blob) return { url: draft.url, uploaded: false };

  const supabase = createClient();

  const path = `${options.folder ? `${options.folder}/` : ""}${uniqueName()}.jpg`;

  const { error } = await supabase.storage
    .from(options.bucket)
    .upload(path, draft.blob, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(options.bucket).getPublicUrl(path);

  return { url: data.publicUrl, uploaded: true };
}

// best-effort cleanup, e.g. when the database write failed after the upload
export async function removeUploadedImage(bucket: string, url: string) {
  try {
    const marker = `/object/public/${bucket}/`;
    const { pathname } = new URL(url);
    const at = pathname.indexOf(marker);

    if (at === -1) return;

    const path = decodeURIComponent(pathname.slice(at + marker.length));

    const { error } = await createClient().storage.from(bucket).remove([path]);

    if (error) console.error("IMAGE CLEANUP FAILED:", error);
  } catch (err) {
    console.error("IMAGE CLEANUP ERROR:", err);
  }
}

type Props = {
  value: ImageDraft;
  onChange: (next: ImageDraft) => void;
  disabled?: boolean;
  // longest side of the saved image in pixels
  maxDimension?: number;
  // largest file the user may pick, in MB (before resizing)
  maxFileMB?: number;
  // size and shape of the preview box
  previewClassName?: string;
  labels?: Partial<ImageUploadLabels>;
};

export default function ImageUpload({
  value,
  onChange,
  disabled = false,
  maxDimension = 1000,
  maxFileMB = 15,
  previewClassName = "h-36 w-24",
  labels,
}: Props) {
  const text = { ...DEFAULT_LABELS, ...labels };

  const fileRef = useRef<HTMLInputElement>(null);

  // true only while the picked photo is being resized (well under a second)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // remember which source failed to load, so a new source gets a fresh attempt
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const shown = value.preview ?? value.url;
  const showImage = !!shown && failedSrc !== shown;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    // allow picking the same file again later
    e.target.value = "";

    if (!file || busy) return;

    setError(null);

    if (!file.type.startsWith("image/")) {
      setError(text.wrongType);
      return;
    }

    if (file.size > maxFileMB * 1024 * 1024) {
      setError(text.tooBig);
      return;
    }

    setBusy(true);

    try {
      const blob = await resizeToJpeg(file, maxDimension);
      const preview = await blobToDataUrl(blob);

      onChange({ url: value.url, blob, preview });
    } catch (err) {
      console.error("IMAGE PROCESSING ERROR:", err);
      setError(text.wrongType);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start gap-3">
      <div
        className={`relative shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 ${previewClassName}`}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setFailedSrc(shown)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400">
            <ImagePlus className="h-8 w-8" aria-hidden />
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 className="h-6 w-6 animate-spin text-slate-600" aria-hidden />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || busy}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium active:bg-slate-100 disabled:opacity-50"
          style={{ touchAction: "manipulation" }}
        >
          {shown ? text.replace : text.choose}
        </button>

        {shown && !busy && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              onChange({ url: null, blob: null, preview: null });
            }}
            disabled={disabled}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-red-600 active:bg-red-50 disabled:opacity-50"
            style={{ touchAction: "manipulation" }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {text.remove}
          </button>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={onFile}
        disabled={disabled || busy}
        className="hidden"
      />
    </div>
  );
}