"use client";

import Link from "next/link";
import { useActionState, type InputHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import type { FormState } from "@/lib/form-state";

// useActionState plus a counter that changes on every response. Put
// `key={state.version}` on the <form>: React re-creates it, so <select>s and
// checkboxes show the values from state.fields after an error (a plain form
// reset puts selects back to their first defaults).
export function useVersionedFormAction(action: (state: FormState, formData: FormData) => Promise<FormState>) {
  return useActionState(
    async (prev: FormState & { version: number }, formData: FormData) => ({
      ...(await action(prev, formData)),
      version: prev.version + 1,
    }),
    { version: 0 },
  );
}

export function Field({
  label,
  hint,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        {...input}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
      />
      {hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function SubmitButton({
  children,
  pendingText,
  fullWidth = true,
}: {
  children: ReactNode;
  pendingText: string;
  fullWidth?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${fullWidth ? "w-full" : ""} rounded-lg bg-emerald-700 px-4 py-2.5 font-medium text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60`}
    >
      {pending ? pendingText : children}
    </button>
  );
}

export function FormAlert({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {state.error}
        {state.link ? (
          <>
            {" "}
            <Link href={state.link.href} className="font-medium underline">
              {state.link.label}
            </Link>
          </>
        ) : null}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        {state.success}
      </p>
    );
  }
  return null;
}
