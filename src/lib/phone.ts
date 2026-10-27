// Phone numbers are stored in E.164 format (+919876543210) so the same
// person can't be added twice just because one agent typed "098765 43210"
// and another typed "+91-98765-43210".

const E164 = /^\+[1-9][0-9]{7,14}$/;

// Returns the E.164 form of an Indian (or already-international) number,
// or null if it doesn't look like a valid phone number.
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");

  if (hasPlus) {
    const candidate = `+${digits}`;
    if (candidate.startsWith("+91")) {
      return /^\+91[6-9][0-9]{9}$/.test(candidate) ? candidate : null;
    }
    return E164.test(candidate) ? candidate : null;
  }

  if (digits.startsWith("00")) {
    const candidate = `+${digits.slice(2)}`;
    return E164.test(candidate) ? candidate : null;
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }
  if (/^[6-9][0-9]{9}$/.test(digits)) {
    return `+91${digits}`;
  }
  return null;
}

// "+919876543210" → "+91 98765 43210" for display.
export function formatPhone(e164: string): string {
  const match = /^\+91([0-9]{5})([0-9]{5})$/.exec(e164);
  return match ? `+91 ${match[1]} ${match[2]}` : e164;
}

// Digits for wa.me / tel: links ("919876543210").
export function phoneDigits(e164: string): string {
  return e164.replace(/\D/g, "");
}
