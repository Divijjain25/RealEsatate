// Turns the leads page URL (?q=…&status=…) into a validated filter object.
// Anything unknown is ignored, so a hand-edited URL can't break the page.

import {
  CLOSED_STATUSES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  LEAD_TEMPERATURES,
  type LeadSource,
  type LeadStatus,
  type LeadTemperature,
} from "./constants.ts";

export const PAGE_SIZE = 25;

export const SORT_OPTIONS = [
  { value: "follow_up", label: "Next follow-up" },
  { value: "newest", label: "Newest first" },
  { value: "budget", label: "Highest budget" },
  { value: "name", label: "Name (A–Z)" },
] as const;

export const FOLLOW_UP_OPTIONS = [
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "week", label: "Next 7 days" },
  { value: "none", label: "No follow-up set" },
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number]["value"];
export type FollowUpFilter = (typeof FOLLOW_UP_OPTIONS)[number]["value"];

export type LeadFilters = {
  q: string;
  status: LeadStatus | "active" | null;
  temperature: LeadTemperature | null;
  source: LeadSource | null;
  // "me", "unassigned", or a member's user id
  assigned: string | null;
  followUp: FollowUpFilter | null;
  sort: SortOption;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function oneOf<T extends string>(value: string, options: ReadonlyArray<{ value: T }>): T | null {
  return options.find((o) => o.value === value)?.value ?? null;
}

export function parseLeadFilters(params: SearchParams): LeadFilters {
  const status = first(params.status);
  const assigned = first(params.assigned);
  const page = Number.parseInt(first(params.page), 10);

  return {
    // Strip characters that have special meaning in search patterns.
    q: first(params.q).replace(/[%_*,()\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80),
    status: status === "active" ? "active" : oneOf(status, LEAD_STATUSES),
    temperature: oneOf(first(params.temperature), LEAD_TEMPERATURES),
    source: oneOf(first(params.source), LEAD_SOURCES),
    assigned: assigned === "me" || assigned === "unassigned" || UUID.test(assigned) ? assigned : null,
    followUp: oneOf(first(params.followUp), FOLLOW_UP_OPTIONS),
    sort: oneOf(first(params.sort), SORT_OPTIONS) ?? "follow_up",
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 1000) : 1,
  };
}

// Builds a /leads URL from filters (dropping defaults), for links and pagination.
export function leadsHref(filters: Partial<LeadFilters>): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.temperature) params.set("temperature", filters.temperature);
  if (filters.source) params.set("source", filters.source);
  if (filters.assigned) params.set("assigned", filters.assigned);
  if (filters.followUp) params.set("followUp", filters.followUp);
  if (filters.sort && filters.sort !== "follow_up") params.set("sort", filters.sort);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `/leads?${query}` : "/leads";
}

// A search that looks like a phone number searches phones; otherwise names.
export function searchKind(q: string): { field: "phone"; digits: string } | { field: "name"; text: string } | null {
  if (!q) return null;
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3 && digits.length >= q.replace(/\s/g, "").length - 1) {
    return { field: "phone", digits };
  }
  return { field: "name", text: q };
}

export { CLOSED_STATUSES };
