// What a Server Action returns to its form: an error or success message,
// plus non-secret field values to refill the form after an error.
export type FormState = {
  error?: string;
  success?: string;
  fields?: Record<string, string>;
};

export const initialFormState: FormState = {};
