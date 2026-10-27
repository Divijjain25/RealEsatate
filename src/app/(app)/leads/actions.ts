"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAgencyContext, isManagerRole } from "@/lib/auth";
import { parseIstLocal } from "@/lib/dates";
import type { FormState } from "@/lib/form-state";
import { CALL_OUTCOMES, LEAD_STATUSES, LEAD_TEMPERATURES } from "@/lib/leads/constants";
import { parseLeadForm, rawLeadFields, type LeadValues } from "@/lib/leads/schema";
import { createClient } from "@/lib/supabase/server";

// Any Postgres uuid (z.uuid() would also demand RFC version bits).
const UUID = z.guid();

// Is this phone already used by another live lead in the agency?
async function duplicateCheck(
  agencyId: string,
  phone: string,
  ignoreLeadId?: string,
): Promise<FormState | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_lead_by_phone", { p_agency_id: agencyId, p_phone: phone });
  if (error) {
    console.error("find_lead_by_phone failed", error.code, error.message);
    return null; // the unique index still protects us
  }
  const existing = (data as Array<{ lead_id: string; assigned_to_name: string | null; can_view: boolean }>).find(
    (row) => row.lead_id !== ignoreLeadId,
  );
  if (!existing) return null;

  const owner = existing.assigned_to_name ? ` (assigned to ${existing.assigned_to_name})` : " (unassigned)";
  return {
    error: `A lead with this phone number already exists${owner}.`,
    link: existing.can_view ? { href: `/leads/${existing.lead_id}`, label: "Open existing lead" } : undefined,
  };
}

function writeErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "A lead with this phone number already exists.";
  if (error.message.includes("assignee_not_member")) return "That team member is not part of your agency.";
  if (error.code === "42501") return "You don't have permission to do that.";
  console.error("Lead write failed", error.code, error.message);
  return "Could not save the lead. Please try again.";
}

export async function createLead(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, membership } = await getAgencyContext();
  const fields = rawLeadFields(formData);
  const parsed = parseLeadForm(formData);
  if (!parsed.ok) return { error: parsed.error, fields };

  const values: LeadValues = { ...parsed.values };
  // Agents always own the leads they create.
  if (!isManagerRole(membership.role)) values.assigned_to = user.id;

  const duplicate = await duplicateCheck(membership.agency.id, values.phone_e164);
  if (duplicate) return { ...duplicate, fields };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .insert({ ...values, agency_id: membership.agency.id })
    .select("id")
    .single();
  if (error) return { error: writeErrorMessage(error), fields };

  redirect(`/leads/${data.id}`);
}

export async function updateLead(leadId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await getAgencyContext();
  if (!UUID.safeParse(leadId).success) return { error: "Lead not found." };
  const fields = rawLeadFields(formData);
  const parsed = parseLeadForm(formData);
  if (!parsed.ok) return { error: parsed.error, fields };

  const { assigned_to, ...rest } = parsed.values;
  // Only owners/managers may (re)assign; agents' edits leave the assignee alone.
  const values = isManagerRole(membership.role) ? { ...rest, assigned_to } : rest;

  const duplicate = await duplicateCheck(membership.agency.id, values.phone_e164, leadId);
  if (duplicate) return { ...duplicate, fields };

  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").update(values).eq("id", leadId).select("id");
  if (error) return { error: writeErrorMessage(error), fields };
  if (!data?.length) return { error: "Lead not found, or you don't have permission to edit it.", fields };

  redirect(`/leads/${leadId}`);
}

const quickUpdateSchema = z.object({
  status: z.enum(LEAD_STATUSES.map((s) => s.value) as [string, ...string[]]),
  temperature: z.enum(LEAD_TEMPERATURES.map((t) => t.value) as [string, ...string[]]),
  nextFollowUp: z.string(),
});

// Status / temperature / next follow-up from the lead page, without opening the full form.
export async function quickUpdateLead(leadId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await getAgencyContext();
  const parsed = quickUpdateSchema.safeParse({
    status: formData.get("status"),
    temperature: formData.get("temperature"),
    nextFollowUp: String(formData.get("nextFollowUp") ?? ""),
  });
  if (!parsed.success || !UUID.safeParse(leadId).success) return { error: "Please check the values." };

  let nextFollowUpAt: string | null = null;
  if (parsed.data.nextFollowUp.trim()) {
    const date = parseIstLocal(parsed.data.nextFollowUp);
    if (!date) return { error: "Next follow-up date is not valid." };
    nextFollowUpAt = date.toISOString();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update({
      status: parsed.data.status,
      temperature: parsed.data.temperature,
      next_follow_up_at: nextFollowUpAt,
    })
    .eq("id", leadId)
    .select("id");
  if (error) return { error: writeErrorMessage(error) };
  if (!data?.length) return { error: "You don't have permission to update this lead." };

  refresh();
  return { success: "Saved." };
}

const activitySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("note"),
    text: z.string().trim().min(1, "Write something first.").max(2000, "Note is too long."),
  }),
  z.object({
    type: z.literal("call"),
    outcome: z.enum(CALL_OUTCOMES.map((o) => o.value) as [string, ...string[]]),
    text: z.string().trim().max(2000, "Note is too long."),
  }),
]);

export async function addActivity(leadId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await getAgencyContext();
  const parsed = activitySchema.safeParse({
    type: formData.get("type"),
    outcome: formData.get("outcome") ?? undefined,
    text: String(formData.get("text") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form.", fields: { text: String(formData.get("text") ?? "") } };
  }
  if (!UUID.safeParse(leadId).success) return { error: "Lead not found." };

  const data = parsed.data.type === "call"
    ? { outcome: parsed.data.outcome, text: parsed.data.text || undefined }
    : { text: parsed.data.text };

  const supabase = await createClient();
  const { error } = await supabase.from("lead_activities").insert({
    agency_id: membership.agency.id,
    lead_id: leadId,
    type: parsed.data.type,
    data,
  });
  if (error) {
    console.error("addActivity failed", error.code, error.message);
    return { error: error.code === "42501" ? "You can't add notes to this lead." : "Could not save. Please try again." };
  }

  refresh();
  return { success: parsed.data.type === "call" ? "Call logged." : "Note added." };
}

export async function deleteLead(leadId: string): Promise<void> {
  const { membership } = await getAgencyContext();
  if (!isManagerRole(membership.role) || !UUID.safeParse(leadId).success) redirect("/leads");

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_leads", { p_ids: [leadId] });
  if (error) console.error("delete_leads failed", error.code, error.message);
  redirect("/leads");
}

const bulkSchema = z.object({
  ids: z.array(z.guid()).min(1, "Select at least one lead first.").max(100, "Select at most 100 leads at a time."),
  op: z.enum(["assign", "status", "temperature", "delete"]),
  value: z.string(),
});

// Owner/Manager actions on several leads at once from the leads list.
export async function bulkUpdateLeads(_prev: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await getAgencyContext();
  if (!isManagerRole(membership.role)) return { error: "Only owners and managers can change several leads at once." };

  const op = String(formData.get("op") ?? "");
  const [kind, ...rest] = op.split(":");
  const parsed = bulkSchema.safeParse({ ids: formData.getAll("ids").map(String), op: kind, value: rest.join(":") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Choose an action." };

  const { ids, value } = parsed.data;
  const supabase = await createClient();

  if (parsed.data.op === "delete") {
    const { data, error } = await supabase.rpc("delete_leads", { p_ids: ids });
    if (error) return { error: writeErrorMessage(error) };
    refresh();
    return { success: `Deleted ${data} lead${data === 1 ? "" : "s"}.` };
  }

  let update: Record<string, string | null>;
  if (parsed.data.op === "assign") {
    if (value && !UUID.safeParse(value).success) return { error: "Choose a team member." };
    update = { assigned_to: value || null };
  } else if (parsed.data.op === "status") {
    if (!LEAD_STATUSES.some((s) => s.value === value)) return { error: "Choose a status." };
    update = { status: value };
  } else {
    if (!LEAD_TEMPERATURES.some((t) => t.value === value)) return { error: "Choose hot, warm or cold." };
    update = { temperature: value };
  }

  const { data, error } = await supabase.from("leads").update(update).in("id", ids).select("id");
  if (error) return { error: writeErrorMessage(error) };
  refresh();
  const count = data?.length ?? 0;
  return { success: `Updated ${count} lead${count === 1 ? "" : "s"}.` };
}
