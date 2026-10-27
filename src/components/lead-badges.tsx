import {
  LEAD_STATUSES,
  LEAD_TEMPERATURES,
  TEMPERATURE_STYLE,
  labelOf,
  type LeadStatus,
  type LeadTemperature,
} from "@/lib/leads/constants";

export function TemperatureBadge({ value }: { value: LeadTemperature }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TEMPERATURE_STYLE[value]}`}>
      {labelOf(LEAD_TEMPERATURES, value)}
    </span>
  );
}

export function StatusBadge({ value }: { value: LeadStatus }) {
  const style =
    value === "won"
      ? "bg-emerald-100 text-emerald-800"
      : value === "lost"
        ? "bg-slate-200 text-slate-600"
        : "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {labelOf(LEAD_STATUSES, value)}
    </span>
  );
}
