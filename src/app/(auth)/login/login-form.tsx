"use client";

import { useActionState } from "react";

import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/form-state";

import { login } from "../actions";

export function LoginForm() {
  const [state, action] = useActionState(login, initialFormState);

  return (
    <form action={action} className="space-y-4">
      <FormAlert state={state} />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.fields?.email}
      />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <SubmitButton pendingText="Logging in…">Log in</SubmitButton>
    </form>
  );
}
