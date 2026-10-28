// CSV import: parse the file, guess which column is which, and turn each row
// into lead values. Pure functions — the browser uses them for the preview
// and the server runs validateImportRecord() again before saving anything.

import { parseIstLocal } from "../dates.ts";
import { parseRupees } from "../money.ts";
import { normalizePhone } from "../phone.ts";
import { BHK_OPTIONS, LEAD_SOURCES, LEAD_STATUSES, LEAD_TEMPERATURES, PROPERTY_TYPES } from "./constants.ts";
import type { LeadValues } from "./schema.ts";

export const MAX_IMPORT_ROWS = 2000;
export const IMPORT_CHUNK_SIZE = 200;

export const IMPORT_FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "phone", label: "Mobile number", required: true },
  { key: "altPhone", label: "Alternate number", required: false },
  { key: "email", label: "Email", required: false },
  { key: "budget", label: "Budget (e.g. 60-80L)", required: false },
  { key: "locations", label: "Locations", required: false },
  { key: "bhk", label: "BHK", required: false },
  { key: "propertyType", label: "Property type", required: false },
  { key: "source", label: "Source", required: false },
  { key: "status", label: "Status", required: false },
  { key: "temperature", label: "Hot / warm / cold", required: false },
  { key: "nextFollowUp", label: "Next follow-up date", required: false },
  { key: "notes", label: "Notes / remarks", required: false },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];
// For each LeadOS field, the index of the CSV column (or null = not imported).
export type ImportMapping = Record<ImportFieldKey, number | null>;
export type ImportRecord = Partial<Record<ImportFieldKey, string>>;
export type ImportDefaults = {
  source: string;
  temperature: string;
  assignedTo: string | null;
};

// ---------------------------------------------------------------------------
// CSV parsing (RFC 4180: quoted fields, "" escapes, commas/newlines in quotes)
// ---------------------------------------------------------------------------

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => ({ d, n: firstLine.split(d).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ",";
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, ""); // Excel's UTF-8 BOM
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop rows that are completely empty (blank lines, trailing ",,,").
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// ---------------------------------------------------------------------------
// Guessing the mapping from header names
// ---------------------------------------------------------------------------

const HEADER_HINTS: Record<ImportFieldKey, RegExp> = {
  name: /^(full\s*)?name$|customer|client|lead\s*name|contact\s*name/i,
  phone: /mobile|phone|contact\s*(no|number)?$|^number$|whatsapp|cell/i,
  altPhone: /alt|alternate|second|other\s*(phone|number|mobile)/i,
  email: /e-?mail/i,
  budget: /budget|price|amount/i,
  locations: /location|area|locality|city|place|sector/i,
  bhk: /bhk|config|bedroom/i,
  propertyType: /property\s*type|type\s*of\s*property|^type$/i,
  source: /source|portal|channel|medium/i,
  status: /status|stage/i,
  temperature: /temp|hot|priority|rating/i,
  nextFollowUp: /follow|next\s*(call|date)|callback|reminder/i,
  notes: /note|remark|comment|requirement|description/i,
};

export function guessMapping(headers: string[]): ImportMapping {
  const mapping = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, null])) as ImportMapping;
  const used = new Set<number>();
  // altPhone before phone so "Alternate Mobile" isn't taken as the main number.
  const order: ImportFieldKey[] = ["altPhone", ...IMPORT_FIELDS.map((f) => f.key).filter((k) => k !== "altPhone")];
  for (const key of order) {
    const index = headers.findIndex((h, i) => !used.has(i) && HEADER_HINTS[key].test(h.trim()));
    if (index !== -1) {
      mapping[key] = index;
      used.add(index);
    }
  }
  return mapping;
}

export function mapRow(row: string[], mapping: ImportMapping): ImportRecord {
  const record: ImportRecord = {};
  for (const field of IMPORT_FIELDS) {
    const index = mapping[field.key];
    if (index !== null && index !== undefined) record[field.key] = (row[index] ?? "").trim();
  }
  return record;
}

// ---------------------------------------------------------------------------
// Value normalisers for the messy text agents keep in spreadsheets
// ---------------------------------------------------------------------------

// "60-80L", "60L - 80L", "60 to 80 lakh", "1-1.5 Cr", "80L" → rupees.
export function parseBudgetRange(input: string): { min: number | null; max: number | null } | null {
  const text = input.trim();
  if (!text) return { min: null, max: null };
  const parts = text.split(/\s*(?:-|–|to)\s*/i).filter(Boolean);
  if (parts.length === 1) {
    const value = parseRupees(parts[0]);
    return value === null ? null : { min: null, max: value ?? null };
  }
  if (parts.length !== 2) return null;

  const unitOf = (s: string) => /(lakhs?|lac|l|crores?|cr|k)\s*$/i.exec(s.trim())?.[1] ?? "";
  const lowRaw = unitOf(parts[0]) ? parts[0] : `${parts[0]}${unitOf(parts[1])}`;
  const low = parseRupees(lowRaw);
  const high = parseRupees(parts[1]);
  if (low === null || high === null || low === undefined || high === undefined || low > high) return null;
  return { min: low, max: high };
}

export function normalizeBhk(input: string): string[] {
  const text = input.toLowerCase();
  if (!text.trim()) return [];
  const result = new Set<string>();
  if (/1\s*rk/.test(text)) result.add("1RK");
  for (const match of text.replace(/1\s*rk/g, "").matchAll(/(\d+(?:\.\d+)?)/g)) {
    const n = Math.floor(Number(match[1])); // "2.5 BHK" counts as 2BHK
    if (n >= 1 && n <= 4) result.add(`${n}BHK`);
    else if (n >= 5 && n <= 20) result.add("5+BHK");
  }
  return BHK_OPTIONS.filter((option) => result.has(option));
}

const SOURCE_SYNONYMS: Array<[RegExp, string]> = [
  [/99\s*acres/i, "99acres"],
  [/magic\s*bricks?/i, "magicbricks"],
  [/housing/i, "housing"],
  [/facebook|^fb$|meta/i, "facebook"],
  [/insta/i, "instagram"],
  [/google|adwords|ppc/i, "google"],
  [/website|web|site/i, "website"],
  [/walk[\s-]*in|office|direct/i, "walk_in"],
  [/refer|reference/i, "referral"],
  [/whats\s*app|wa$/i, "whatsapp"],
];

export function normalizeSource(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const exact = LEAD_SOURCES.find((s) => s.value === text.toLowerCase() || s.label.toLowerCase() === text.toLowerCase());
  if (exact) return exact.value;
  return SOURCE_SYNONYMS.find(([pattern]) => pattern.test(text))?.[1] ?? "other";
}

export function normalizeTemperature(input: string): string | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  if (/hot|high|urgent/.test(text)) return "hot";
  if (/cold|low|dead/.test(text)) return "cold";
  if (/warm|medium|mid/.test(text)) return "warm";
  return LEAD_TEMPERATURES.find((t) => t.value === text)?.value ?? null;
}

export function normalizeStatus(input: string): string | null {
  const text = input.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!text) return null;
  const exact = LEAD_STATUSES.find((s) => s.value === text || s.label.toLowerCase().replace(/[\s-]+/g, "_") === text);
  if (exact) return exact.value;
  if (/visit.*(done|completed)/.test(text)) return "site_visit_done";
  if (/visit/.test(text)) return "site_visit_scheduled";
  if (/book|closed_won|^won|deal_done/.test(text)) return "won";
  if (/lost|not_interested|dead|closed/.test(text)) return "lost";
  if (/negotiat/.test(text)) return "negotiation";
  if (/interested|qualified/.test(text)) return "qualified";
  if (/call|contacted|follow/.test(text)) return "contacted";
  return "new";
}

export function normalizePropertyType(input: string): string | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  if (/flat|apartment|apt/.test(text)) return "apartment";
  if (/villa|bungalow/.test(text)) return "villa";
  if (/plot|land/.test(text)) return "plot";
  if (/independent|house|row\s*house|kothi/.test(text)) return "independent_house";
  if (/shop|office|commercial|showroom/.test(text)) return "commercial";
  return PROPERTY_TYPES.find((p) => p.value === text)?.value ?? "other";
}

// Indian spreadsheets write dates day-first: 28/10/2026, 28-10-2026 14:30,
// or ISO 2026-10-28. Dates without a time get 10:00 AM IST.
export function parseFollowUpDate(input: string): string | null | undefined {
  const text = input.trim();
  if (!text) return undefined;
  let y: number, mo: number, d: number;
  let h = 10;
  let mi = 0;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(text);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm)?)?$/i.exec(text);
  if (iso) {
    [y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    if (iso[4]) [h, mi] = [Number(iso[4]), Number(iso[5])];
  } else if (dmy) {
    [d, mo, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
    if (y < 100) y += 2000;
    if (dmy[4]) {
      [h, mi] = [Number(dmy[4]), Number(dmy[5])];
      const meridiem = dmy[6]?.toLowerCase();
      if (meridiem === "pm" && h < 12) h += 12;
      if (meridiem === "am" && h === 12) h = 0;
    }
  } else {
    return null;
  }

  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  // Reject impossible dates like 31/02 (Date would roll them into March).
  const calendar = new Date(Date.UTC(y, mo - 1, d));
  if (calendar.getUTCMonth() !== mo - 1 || calendar.getUTCDate() !== d) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = parseIstLocal(`${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`);
  return date ? date.toISOString() : null;
}

// ---------------------------------------------------------------------------
// One row → lead values (or a reason it can't be imported)
// ---------------------------------------------------------------------------

export function validateImportRecord(
  record: ImportRecord,
  defaults: ImportDefaults,
): { ok: true; values: LeadValues } | { ok: false; error: string } {
  const name = (record.name ?? "").trim();
  if (!name) return { ok: false, error: "Name is empty" };
  if (name.length > 120) return { ok: false, error: "Name is too long" };

  const phone = normalizePhone(record.phone ?? "");
  if (!phone) return { ok: false, error: record.phone ? `"${record.phone}" is not a valid mobile number` : "Mobile number is empty" };

  const altPhone = record.altPhone ? normalizePhone(record.altPhone) : null;
  const email = (record.email ?? "").trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: `"${record.email}" is not a valid email` };

  const budget = parseBudgetRange(record.budget ?? "");
  if (!budget) return { ok: false, error: `Budget "${record.budget}" not understood (write like 60-80L or 1.2 Cr)` };

  const nextFollowUp = parseFollowUpDate(record.nextFollowUp ?? "");
  if (nextFollowUp === null) return { ok: false, error: `Follow-up date "${record.nextFollowUp}" not understood (use DD/MM/YYYY)` };

  const notes = (record.notes ?? "").trim();

  return {
    ok: true,
    values: {
      name,
      phone_e164: phone,
      alt_phone: altPhone && altPhone !== phone ? altPhone : null,
      email: email && email.length <= 254 ? email : null,
      purpose: "buy",
      budget_min: budget.min,
      budget_max: budget.max,
      locations: Array.from(new Set((record.locations ?? "").split(/[,;/|]/).map((s) => s.trim()).filter(Boolean))).slice(0, 15),
      bhk: normalizeBhk(record.bhk ?? ""),
      property_type: normalizePropertyType(record.propertyType ?? ""),
      source: normalizeSource(record.source ?? "") ?? defaults.source,
      status: normalizeStatus(record.status ?? "") ?? "new",
      temperature: normalizeTemperature(record.temperature ?? "") ?? defaults.temperature,
      assigned_to: defaults.assignedTo,
      next_follow_up_at: nextFollowUp ?? null,
      notes: notes ? notes.slice(0, 5000) : null,
      lost_reason: null,
    },
  };
}

export type PreparedRow =
  | { line: number; record: ImportRecord; kind: "ok"; values: LeadValues }
  | { line: number; record: ImportRecord; kind: "invalid"; error: string }
  | { line: number; record: ImportRecord; kind: "duplicate_in_file"; error: string };

// All data rows (header excluded) → what will happen to each one.
export function prepareImport(table: string[][], mapping: ImportMapping, defaults: ImportDefaults): PreparedRow[] {
  const seen = new Map<string, number>();
  return table.slice(1).map((row, i) => {
    const line = i + 2; // spreadsheet row number (header is row 1)
    const record = mapRow(row, mapping);
    const result = validateImportRecord(record, defaults);
    if (!result.ok) return { line, record, kind: "invalid", error: result.error };
    const firstLine = seen.get(result.values.phone_e164);
    if (firstLine !== undefined) {
      return { line, record, kind: "duplicate_in_file", error: `Same number as row ${firstLine}` };
    }
    seen.set(result.values.phone_e164, line);
    return { line, record, kind: "ok", values: result.values };
  });
}

// Rows that failed, as a CSV the agent can fix in Excel and re-import.
export function toCsv(rows: string[][]): string {
  const escape = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return rows.map((row) => row.map(escape).join(",")).join("\r\n");
}
