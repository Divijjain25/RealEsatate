"use client";

import { useActionState } from "react";

import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/form-state";

import { signup } from "../actions";

export function SignupForm() {
  const [state, action] = useActionState(signup, initialFormState);

  if (state.success) {
    return <FormAlert state={state} />;
  }

  return (
    <form action={action} className="space-y-4">
      <FormAlert state={state} />
      <Field
        label="Full name"
        name="fullName"
        autoComplete="name"
        required
        defaultValue={state.fields?.fullName}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.fields?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        hint="At least 8 characters."
      />
      <SubmitButton pendingText="Creating account…">Create account</SubmitButton>
    </form>
  );
}
