// Indian real-estate budgets are spoken in lakh (L, 1,00,000) and crore
// (Cr, 1,00,00,000). Agents can type "80L", "1.2 cr", "75 lakh" or
// "80,00,000"; we store plain rupees.

const LAKH = 100_000;
const CRORE = 10_000_000;

// Returns rupees, undefined for an empty input, or null if unparseable.
export function parseRupees(input: string): number | undefined | null {
  const text = input.trim().toLowerCase().replace(/[₹,\s]/g, "").replace(/^rs\.?/, "");
  if (!text) return undefined;

  const match = /^(\d+(?:\.\d+)?)(l|lac|lakh|lakhs|cr|crore|crores|k)?$/.exec(text);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2];
  let rupees = value;
  if (unit === "k") rupees = value * 1000;
  else if (unit && unit.startsWith("l")) rupees = value * LAKH;
  else if (unit && unit.startsWith("c")) rupees = value * CRORE;

  return Number.isFinite(rupees) ? Math.round(rupees) : null;
}

// 8500000 → "₹85 L", 12000000 → "₹1.2 Cr", 45000 → "₹45,000"
export function formatRupees(rupees: number | null | undefined): string {
  if (rupees === null || rupees === undefined) return "—";
  if (rupees >= CRORE) return `₹${trimNumber(rupees / CRORE)} Cr`;
  if (rupees >= LAKH) return `₹${trimNumber(rupees / LAKH)} L`;
  return `₹${rupees.toLocaleString("en-IN")}`;
}

export function formatBudget(min: number | null, max: number | null): string {
  if (min === null && max === null) return "—";
  if (min !== null && max !== null) {
    return min === max ? formatRupees(min) : `${formatRupees(min)} – ${formatRupees(max)}`;
  }
  return min !== null ? `from ${formatRupees(min)}` : `up to ${formatRupees(max)}`;
}

function trimNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}
