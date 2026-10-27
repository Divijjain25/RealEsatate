// Lead vocabulary shared by forms, lists and server code. Values must match
// the database enums / check constraints in the Step 2 migration.

export const LEAD_STATUSES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "site_visit_scheduled", label: "Site visit scheduled" },
  { value: "site_visit_done", label: "Site visit done" },
  { value: "negotiation", label: "Negotiation" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
] as const;

export const LEAD_TEMPERATURES = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
] as const;

export const LEAD_SOURCES = [
  { value: "99acres", label: "99acres" },
  { value: "magicbricks", label: "MagicBricks" },
  { value: "housing", label: "Housing.com" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "google", label: "Google" },
  { value: "website", label: "Website" },
  { value: "walk_in", label: "Walk-in" },
  { value: "referral", label: "Referral" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "other", label: "Other" },
] as const;

export const PROPERTY_TYPES = [
  { value: "apartment", label: "Apartment / Flat" },
  { value: "villa", label: "Villa" },
  { value: "independent_house", label: "Independent house" },
  { value: "plot", label: "Plot" },
  { value: "commercial", label: "Commercial" },
  { value: "other", label: "Other" },
] as const;

export const LEAD_PURPOSES = [
  { value: "buy", label: "Buy" },
  { value: "rent", label: "Rent" },
] as const;

export const BHK_OPTIONS = ["1RK", "1BHK", "2BHK", "3BHK", "4BHK", "5+BHK"] as const;

export const CALL_OUTCOMES = [
  { value: "connected", label: "Connected" },
  { value: "not_reachable", label: "Not reachable" },
  { value: "call_back", label: "Asked to call back" },
  { value: "not_interested", label: "Not interested" },
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number]["value"];
export type LeadTemperature = (typeof LEAD_TEMPERATURES)[number]["value"];
export type LeadSource = (typeof LEAD_SOURCES)[number]["value"];
export type PropertyType = (typeof PROPERTY_TYPES)[number]["value"];
export type LeadPurpose = (typeof LEAD_PURPOSES)[number]["value"];
export type CallOutcome = (typeof CALL_OUTCOMES)[number]["value"];

export const CLOSED_STATUSES: LeadStatus[] = ["won", "lost"];

export function labelOf(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
): string {
  return options.find((o) => o.value === value)?.label ?? (value || "—");
}

export const TEMPERATURE_STYLE: Record<LeadTemperature, string> = {
  hot: "bg-red-100 text-red-800",
  warm: "bg-amber-100 text-amber-800",
  cold: "bg-sky-100 text-sky-800",
};
