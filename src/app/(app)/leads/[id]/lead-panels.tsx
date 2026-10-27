"use client";

import { useState } from "react";

import { FormAlert, SubmitButton, useVersionedFormAction } from "@/components/form";
import type { FormState } from "@/lib/form-state";
import { CALL_OUTCOMES, LEAD_STATUSES, LEAD_TEMPERATURES } from "@/lib/leads/constants";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

// Status, temperature and next follow-up: the three things agents change most.
export function QuickUpdateForm({
  action,
  status,
  temperature,
  nextFollowUp,
}: {
  action: Action;
  status: string;
  temperature: string;
  nextFollowUp: string;
}) {
  const [state, formAction] = useVersionedFormAction(action);
  return (
    <form key={state.version} action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Status</span>
          <select name="status" defaultValue={status} className={inputClass}>
            {LEAD_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Temperature</span>
          <select name="temperature" defaultValue={temperature} className={inputClass}>
            {LEAD_TEMPERATURES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Next follow-up</span>
          <input type="datetime-local" name="nextFollowUp" defaultValue={nextFollowUp} className={inputClass} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Saving…" fullWidth={false}>
          Save changes
        </SubmitButton>
        <FormAlert state={state} />
      </div>
    </form>
  );
}

// Add a note or log a call to the lead's timeline.
export function ActivityForm({ action }: { action: Action }) {
  const [state, formAction] = useVersionedFormAction(action);
  const [type, setType] = useState<"note" | "call">("call");

  return (
    <form key={state.version} action={formAction} className="space-y-3">
      <div className="flex gap-2" role="radiogroup" aria-label="Entry type">
        {(["call", "note"] as const).map((t) => (
          <label
            key={t}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50"
          >
            <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} />
            {t === "call" ? "Log a call" : "Add a note"}
          </label>
        ))}
      </div>
      {type === "call" ? (
        <select name="outcome" defaultValue="connected" className={inputClass} aria-label="Call outcome">
          {CALL_OUTCOMES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : null}
      <textarea
        name="text"
        rows={3}
        maxLength={2000}
        placeholder={type === "call" ? "What did they say? (optional)" : "Write a note…"}
        defaultValue={state.error ? state.fields?.text : ""}
        className={inputClass}
      />
      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Saving…" fullWidth={false}>
          {type === "call" ? "Save call" : "Save note"}
        </SubmitButton>
        <FormAlert state={state} />
      </div>
    </form>
  );
}

export function DeleteLeadButton({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("Delete this lead? It will disappear from all lists.")) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" className="rounded-lg px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
        Delete lead
      </button>
    </form>
  );
}
