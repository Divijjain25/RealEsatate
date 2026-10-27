"use client";

import { useActionState } from "react";

import { FormAlert, SubmitButton } from "@/components/form";
import type { FormState } from "@/lib/form-state";
import { LEAD_STATUSES, LEAD_TEMPERATURES } from "@/lib/leads/constants";

import { bulkUpdateLeads } from "./actions";

export const BULK_FORM_ID = "bulk-leads";

// Owner/Manager toolbar. The row checkboxes live in the table but belong to
// this form through their form="bulk-leads" attribute.
export function BulkBar({ members }: { members: Array<{ userId: string; name: string }> }) {
  const [state, action] = useActionState(bulkUpdateLeads, {} as FormState);

  return (
    <form id={BULK_FORM_ID} action={action} className="flex flex-wrap items-center gap-2">
      <select
        name="op"
        defaultValue=""
        aria-label="Action for selected leads"
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        <option value="" disabled>
          With selected…
        </option>
        <optgroup label="Assign to">
          {members.map((m) => (
            <option key={m.userId} value={`assign:${m.userId}`}>
              {m.name}
            </option>
          ))}
          <option value="assign:">Unassigned</option>
        </optgroup>
        <optgroup label="Set status">
          {LEAD_STATUSES.map((s) => (
            <option key={s.value} value={`status:${s.value}`}>
              {s.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Set temperature">
          {LEAD_TEMPERATURES.map((t) => (
            <option key={t.value} value={`temperature:${t.value}`}>
              {t.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Other">
          <option value="delete:">Delete</option>
        </optgroup>
      </select>
      <SubmitButton pendingText="Applying…" fullWidth={false}>
        Apply
      </SubmitButton>
      <FormAlert state={state} />
    </form>
  );
}

export function SelectAllCheckbox() {
  return (
    <input
      type="checkbox"
      aria-label="Select all leads on this page"
      onChange={(event) => {
        document
          .querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${BULK_FORM_ID}"]`)
          .forEach((box) => {
            box.checked = event.currentTarget.checked;
          });
      }}
    />
  );
}
