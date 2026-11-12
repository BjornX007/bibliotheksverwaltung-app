"use client";

import { useId, useState } from "react";
import { Camera } from "lucide-react";
import BarcodeScanner from "@/components/register/BarcodeScanner";

/*
  ISBN field with a camera button. Tapping the button opens the barcode
  scanner right below the field; a scanned book barcode fills the field and
  the scanner closes again.

  Usage:
    <IsbnInput
      label={t("columns.isbn")}
      scanLabel={t("scan")}
      value={isbn}
      onChange={setIsbn}
    />
*/

const inputClass =
  "min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:opacity-50";

export default function IsbnInput({
  label,
  scanLabel,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  scanLabel: string;
  value: string;
  onChange: (isbn: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [scanning, setScanning] = useState(false);

  // BarcodeScanner only reports valid ISBN-13 codes (toIsbn13), so no extra check is needed
  function onScan(isbn: string) {
    onChange(isbn);
    setScanning(false);
  }

  return (
    <div className="text-sm text-slate-600">
      <label htmlFor={id}>{label}</label>

      <div className="mt-1 flex gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className={inputClass}
        />

        <button
          type="button"
          onClick={() => setScanning((current) => !current)}
          disabled={disabled}
          aria-label={scanLabel}
          aria-pressed={scanning}
          className={`shrink-0 rounded-xl px-4 py-3 font-medium disabled:opacity-50 ${
            scanning
              ? "bg-blue-600 text-white"
              : "border border-slate-300 bg-white text-slate-700"
          }`}
          style={{ touchAction: "manipulation" }}
        >
          <Camera className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {scanning && (
        <div className="mt-2 overflow-hidden rounded-xl">
          <BarcodeScanner
            compact
            onScan={onScan}
            onClose={() => setScanning(false)}
          />
        </div>
      )}
    </div>
  );
}