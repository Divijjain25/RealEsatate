// Validates the add/edit lead form and turns it into database values.
// Used only by Server Actions, so the server never trusts the browser.

import { z } from "zod";

import { parseIstLocal } from "../dates.ts";
import { parseRupees } from "../money.ts";
import { normalizePhone } from "../phone.ts";
import {
  BHK_OPTIONS,
  LEAD_PURPOSES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  LEAD_TEMPERATURES,
  PROPERTY_TYPES,
} from "./constants.ts";

const values = <T extends string>(options: ReadonlyArray<{ value: T }>) =>
  options.map((o) => o.value) as [T, ...T[]];

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long.`)
    .transform((v) => v || null);

const phone = (label: string, required: boolean) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (!v) {
        if (required) ctx.addIssue({ code: "custom", message: `${label} is required.` });
        return null;
      }
      const e164 = normalizePhone(v);
      if (!e164) {
        ctx.addIssue({ code: "custom", message: `${label} doesn't look like a valid mobile number.` });
        return null;
      }
      return e164;
    });

const rupees = (label: string) =>
  z.string().transform((v, ctx) => {
    const parsed = parseRupees(v);
    if (parsed === null) {
      ctx.addIssue({ code: "custom", message: `${label}: write it like 80L, 1.2 Cr or 8000000.` });
      return null;
    }
    return parsed ?? null;
  });

const leadFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(120, "Name is too long."),
    phone: phone("Phone", true),
    altPhone: phone("Alternate phone", false),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .refine((v) => !v || z.email().safeParse(v).success, "Email doesn't look valid.")
      .transform((v) => v || null),
    purpose: z.enum(values(LEAD_PURPOSES)),
    budgetMin: rupees("Budget from"),
    budgetMax: rupees("Budget up to"),
    locations: z
      .string()
      .max(500, "Too many locations.")
      .transform((v) =>
        Array.from(new Set(v.split(",").map((s) => s.trim()).filter(Boolean))).slice(0, 15),
      ),
    bhk: z.array(z.enum(BHK_OPTIONS)).max(BHK_OPTIONS.length),
    propertyType: z
      .union([z.enum(values(PROPERTY_TYPES)), z.literal("")])
      .transform((v) => v || null),
    source: z.enum(values(LEAD_SOURCES)),
    status: z.enum(values(LEAD_STATUSES)),
    temperature: z.enum(values(LEAD_TEMPERATURES)),
    assignedTo: z.string().trim(),
    nextFollowUp: z.string().transform((v, ctx) => {
      if (!v.trim()) return null;
      const date = parseIstLocal(v);
      if (!date) {
        ctx.addIssue({ code: "custom", message: "Next follow-up date is not valid." });
        return null;
      }
      return date.toISOString();
    }),
    notes: optionalText(5000, "Notes"),
    lostReason: optionalText(500, "Lost reason"),
  })
  .refine((v) => v.budgetMin === null || v.budgetMax === null || v.budgetMin <= v.budgetMax, {
    message: "Budget 'from' must be less than or equal to budget 'up to'.",
  });

export type LeadValues = {
  name: string;
  phone_e164: string;
  alt_phone: string | null;
  email: string | null;
  purpose: string;
  budget_min: number | null;
  budget_max: number | null;
  locations: string[];
  bhk: string[];
  property_type: string | null;
  source: string;
  status: string;
  temperature: string;
  assigned_to: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
  lost_reason: string | null;
};

export const LEAD_FORM_FIELDS = [
  "name", "phone", "altPhone", "email", "purpose", "budgetMin", "budgetMax", "locations",
  "propertyType", "source", "status", "temperature", "assignedTo", "nextFollowUp", "notes", "lostReason",
] as const;

// Raw form values (as typed) to refill the form after an error. BHK is
// joined with commas because the form state holds plain strings.
export function rawLeadFields(formData: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const key of LEAD_FORM_FIELDS) {
    fields[key] = String(formData.get(key) ?? "");
  }
  fields.bhk = formData.getAll("bhk").map(String).join(",");
  return fields;
}

export function parseLeadForm(
  formData: FormData,
): { ok: true; values: LeadValues } | { ok: false; error: string } {
  const raw = rawLeadFields(formData);
  const parsed = leadFormSchema.safeParse({ ...raw, bhk: formData.getAll("bhk").map(String) });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const v = parsed.data;
  return {
    ok: true,
    values: {
      name: v.name,
      phone_e164: v.phone as string,
      alt_phone: v.altPhone,
      email: v.email,
      purpose: v.purpose,
      budget_min: v.budgetMin,
      budget_max: v.budgetMax,
      locations: v.locations,
      bhk: v.bhk,
      property_type: v.propertyType,
      source: v.source,
      status: v.status,
      temperature: v.temperature,
      assigned_to: v.assignedTo || null,
      next_follow_up_at: v.nextFollowUp,
      notes: v.notes,
      lost_reason: v.lostReason,
    },
  };
}
