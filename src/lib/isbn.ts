// src/lib/isbn.ts

function checkDigit13(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

function isValidIsbn13(s: string): boolean {
  return /^(978|979)\d{10}$/.test(s) && checkDigit13(s.slice(0, 12)) === s[12];
}

function isValidIsbn10(s: string): boolean {
  if (!/^\d{9}[\dXx]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const v = i === 9 && (s[i] === "X" || s[i] === "x") ? 10 : Number(s[i]);
    sum += v * (10 - i);
  }
  return sum % 11 === 0;
}

/** Returns a clean ISBN-13 (ISBN-10 is converted), or null if the text is not a valid ISBN. */
export function toIsbn13(input: string): string | null {
  const s = input.replace(/[\s-]/g, "");
  if (isValidIsbn13(s)) return s;
  if (isValidIsbn10(s)) {
    const first12 = "978" + s.slice(0, 9);
    return first12 + checkDigit13(first12);
  }
  return null;
}