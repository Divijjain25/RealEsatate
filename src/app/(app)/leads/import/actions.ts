"use server";

import { z } from "zod";

import { getAgencyContext, isManagerRole } from "@/lib/auth";
import { LEAD_SOURCES, LEAD_TEMPERATURES } from "@/lib/leads/constants";
import { IMPORT_CHUNK_SIZE, IMPORT_FIELDS, validateImportRecord } from "@/lib/leads/import";
import { createClient } from "@/lib/supabase/server";

export type ImportRowResult = { result: "imported" | "duplicate" | "error"; message?: string };
export type ImportChunkResponse = { ok: true; results: ImportRowResult[] } | { ok: false; error: string };

const recordSchema = z.object(
  Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, z.string().max(2000).optional()])) as Record<
    (typeof IMPORT_FIELDS)[number]["key"],
    z.ZodOptional<z.ZodString>
  >,
);

const inputSchema = z.object({
  records: z.array(recordSchema).min(1).max(IMPORT_CHUNK_SIZE),
  defaults: z.object({
    source: z.enum(LEAD_SOURCES.map((s) => s.value) as [string, ...string[]]),
    temperature: z.enum(LEAD_TEMPERATURES.map((t) => t.value) as [string, ...string[]]),
    assignedTo: z.guid().nullable(),
  }),
});

// Imports one chunk of rows. The browser already validated them for the
// preview, but everything is checked again here before it reaches the database.
export async function importLeadsChunk(input: unknown): Promise<ImportChunkResponse> {
  const { membership } = await getAgencyContext();
  if (!isManagerRole(membership.role)) {
    return { ok: false, error: "Only owners and managers can import leads." };
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The import data was not in the expected format." };
  const { records, defaults } = parsed.data;

  const results: ImportRowResult[] = new Array(records.length);
  const toInsert: Array<{ position: number; values: object }> = [];
  records.forEach((record, position) => {
    const checked = validateImportRecord(record, defaults);
    if (checked.ok) toInsert.push({ position, values: checked.values });
    else results[position] = { result: "error", message: checked.error };
  });

  if (toInsert.length > 0) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("import_leads", {
      p_agency_id: membership.agency.id,
      p_leads: toInsert.map((row) => row.values),
    });
    if (error) {
      console.error("import_leads failed", error.code, error.message);
      return { ok: false, error: "The database refused this batch. Nothing in it was saved." };
    }
    for (const row of data as Array<{ idx: number; result: ImportRowResult["result"]; message: string | null }>) {
      const position = toInsert[row.idx - 1].position;
      results[position] = { result: row.result, message: row.message ?? undefined };
    }
  }

  return { ok: true, results };
}
