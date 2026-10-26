"use client";

import { useActionState } from "react";

import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/form-state";

import { createAgency } from "./actions";

export function CreateAgencyForm() {
  const [state, action] = useActionState(createAgency, initialFormState);

  return (
    <form action={action} className="space-y-4">
      <FormAlert state={state} />
      <Field
        label="Agency name"
        name="name"
        required
        minLength={2}
        placeholder="e.g. Sharma Properties"
        defaultValue={state.fields?.name}
      />
      <Field label="City" name="city" placeholder="e.g. Pune" defaultValue={state.fields?.city} />
      <Field
        label="Office phone"
        name="phone"
        type="tel"
        placeholder="e.g. 98765 43210"
        defaultValue={state.fields?.phone}
      />
      <SubmitButton pendingText="Creating agency…">Create agency</SubmitButton>
    </form>
  );
}
