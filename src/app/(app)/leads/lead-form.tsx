"use client";

import Link from "next/link";

import { Field, FormAlert, SubmitButton, useVersionedFormAction } from "@/components/form";
import type { FormState } from "@/lib/form-state";
import {
  BHK_OPTIONS,
  LEAD_PURPOSES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  LEAD_TEMPERATURES,
  PROPERTY_TYPES,
} from "@/lib/leads/constants";

type Option = { value: string; label: string };

export type LeadFormMember = { userId: string; name: string };

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

function Select({
  label,
  name,
  options,
  defaultValue,
  emptyLabel,
}: {
  label: string;
  name: string;
  options: ReadonlyArray<Option>;
  defaultValue?: string;
  emptyLabel?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select name={name} defaultValue={defaultValue} className={inputClass}>
        {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <legend className="px-1 text-sm font-semibold text-slate-900">{title}</legend>
      {children}
    </fieldset>
  );
}

export function LeadForm({
  action,
  initial,
  members,
  canAssign,
  submitLabel,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial: Record<string, string>;
  members: LeadFormMember[];
  canAssign: boolean;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useVersionedFormAction(action);
  // After a failed save, show what the user typed; otherwise the saved lead.
  const v = state.fields ?? initial;
  const bhk = new Set((v.bhk ?? "").split(",").filter(Boolean));
  const assigneeOptions = [...members.map((m) => ({ value: m.userId, label: m.name }))];

  return (
    <form key={state.version} action={formAction} className="space-y-5">
      <FormAlert state={state} />

      <Section title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name *" name="name" required maxLength={120} defaultValue={v.name} />
          <Field
            label="Mobile number *"
            name="phone"
            type="tel"
            required
            placeholder="98765 43210"
            defaultValue={v.phone}
          />
          <Field label="Alternate number" name="altPhone" type="tel" defaultValue={v.altPhone} />
          <Field label="Email" name="email" type="email" defaultValue={v.email} />
        </div>
      </Section>

      <Section title="Requirement">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Looking to" name="purpose" options={LEAD_PURPOSES} defaultValue={v.purpose || "buy"} />
          <Select
            label="Property type"
            name="propertyType"
            options={PROPERTY_TYPES}
            defaultValue={v.propertyType}
            emptyLabel="Not decided"
          />
          <Field label="Budget from" name="budgetMin" placeholder="e.g. 60L" defaultValue={v.budgetMin} hint="Write 60L, 1.2 Cr or 6000000" />
          <Field label="Budget up to" name="budgetMax" placeholder="e.g. 80L" defaultValue={v.budgetMax} />
        </div>
        <Field
          label="Preferred locations"
          name="locations"
          placeholder="Wakad, Baner, Hinjewadi"
          defaultValue={v.locations}
          hint="Separate areas with commas."
        />
        <div className="space-y-1">
          <span className="text-sm font-medium text-slate-700">BHK</span>
          <div className="flex flex-wrap gap-2">
            {BHK_OPTIONS.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50"
              >
                <input type="checkbox" name="bhk" value={option} defaultChecked={bhk.has(option)} />
                {option}
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Pipeline">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Source" name="source" options={LEAD_SOURCES} defaultValue={v.source || "other"} />
          <Select label="Status" name="status" options={LEAD_STATUSES} defaultValue={v.status || "new"} />
          <Select label="Temperature" name="temperature" options={LEAD_TEMPERATURES} defaultValue={v.temperature || "warm"} />
          {canAssign ? (
            <Select
              label="Assigned to"
              name="assignedTo"
              options={assigneeOptions}
              defaultValue={v.assignedTo}
              emptyLabel="Unassigned"
            />
          ) : (
            <input type="hidden" name="assignedTo" value={v.assignedTo ?? ""} />
          )}
          <Field label="Next follow-up" name="nextFollowUp" type="datetime-local" defaultValue={v.nextFollowUp} />
          <Field label="Lost reason" name="lostReason" placeholder="Only if status is Lost" defaultValue={v.lostReason} />
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Notes</span>
          <textarea name="notes" rows={4} maxLength={5000} defaultValue={v.notes} className={inputClass} />
        </label>
      </Section>

      <div className="flex items-center gap-4">
        <SubmitButton pendingText="Saving…" fullWidth={false}>
          {submitLabel}
        </SubmitButton>
        <Link href={cancelHref} className="text-sm font-medium text-slate-600 hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
