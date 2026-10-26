"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import type { FormState } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";

const optionalText = (max: number, message: string) =>
  z.string().trim().max(max, message).optional().or(z.literal(""));

const agencySchema = z.object({
  name: z.string().trim().min(2, "Agency name must be at least 2 characters.").max(120, "Agency name is too long."),
  city: optionalText(80, "City name is too long."),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{7,20}$/, "Enter a valid phone number (digits, spaces, + or -).")
    .optional()
    .or(z.literal("")),
});

export async function createAgency(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = {
    name: String(formData.get("name") ?? ""),
    city: String(formData.get("city") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  };
  const parsed = agencySchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form.", fields: raw };
  }

  const supabase = await createClient();
  // create_agency (database function) makes the agency and the owner
  // membership together, and refuses if the user is not logged in.
  const { error } = await supabase.rpc("create_agency", {
    p_name: parsed.data.name,
    p_city: parsed.data.city || null,
    p_phone: parsed.data.phone || null,
  });

  if (error && error.message !== "already_member") {
    console.error("create_agency failed", error.code, error.message);
    return { error: "Could not create the agency. Please try again.", fields: raw };
  }

  redirect("/dashboard");
}
