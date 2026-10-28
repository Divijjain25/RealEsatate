"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { LEAD_SOURCES, LEAD_TEMPERATURES } from "@/lib/leads/constants";
import {
  IMPORT_CHUNK_SIZE,
  IMPORT_FIELDS,
  MAX_IMPORT_ROWS,
  guessMapping,
  parseCsv,
  prepareImport,
  toCsv,
  type ImportDefaults,
  type ImportFieldKey,
  type ImportMapping,
  type PreparedRow,
} from "@/lib/leads/import";
import { formatBudget } from "@/lib/money";
import { formatPhone } from "@/lib/phone";

import { importLeadsChunk, type ImportRowResult } from "./actions";

type Member = { userId: string; name: string };
type Outcome = { line: number; result: ImportRowResult["result"] | "invalid" | "duplicate_in_file"; message?: string };

const selectClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const buttonClass = "rounded-lg bg-emerald-700 px-4 py-2.5 font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryClass = "rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50";

export function LeadImporter({ members, currentUserId }: { members: Member[]; currentUserId: string }) {
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [defaults, setDefaults] = useState<ImportDefaults>({ source: "other", temperature: "warm", assignedTo: currentUserId });
  const [fileError, setFileError] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [importError, setImportError] = useState("");

  const prepared = useMemo(
    () => (table && mapping ? prepareImport(table, mapping, defaults) : []),
    [table, mapping, defaults],
  );
  const ready = prepared.filter((r): r is Extract<PreparedRow, { kind: "ok" }> => r.kind === "ok");
  const invalid = prepared.filter((r) => r.kind === "invalid").length;
  const inFileDuplicates = prepared.filter((r) => r.kind === "duplicate_in_file").length;
  const missingRequired = mapping ? IMPORT_FIELDS.filter((f) => f.required && mapping[f.key] === null) : [];

  async function onFile(file: File | undefined) {
    setFileError("");
    setOutcomes(null);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setFileError("This file is larger than 5 MB. Split it into smaller files.");
    if (/\.xlsx?$/i.test(file.name)) {
      return setFileError("This is an Excel file. In Excel choose File → Save As → \"CSV UTF-8 (Comma delimited)\" and upload that.");
    }
    const rows = parseCsv(await file.text());
    if (rows.length < 2) return setFileError("The file needs a header row and at least one lead.");
    if (rows.length - 1 > MAX_IMPORT_ROWS) {
      return setFileError(`The file has ${rows.length - 1} rows. Import at most ${MAX_IMPORT_ROWS} at a time.`);
    }
    setFileName(file.name);
    setTable(rows);
    setMapping(guessMapping(rows[0]));
  }

  async function runImport() {
    if (!table) return;
    setImportError("");
    const results: Outcome[] = prepared
      .filter((r) => r.kind !== "ok")
      .map((r) => ({ line: r.line, result: r.kind, message: "error" in r ? r.error : undefined }));
    setProgress({ done: 0, total: ready.length });

    for (let start = 0; start < ready.length; start += IMPORT_CHUNK_SIZE) {
      const chunk = ready.slice(start, start + IMPORT_CHUNK_SIZE);
      const response = await importLeadsChunk({ records: chunk.map((r) => r.record), defaults });
      if (!response.ok) {
        setImportError(`${response.error} Rows ${chunk[0].line}–${chunk[chunk.length - 1].line} were not imported.`);
        chunk.forEach((r) => results.push({ line: r.line, result: "error", message: response.error }));
      } else {
        response.results.forEach((res, i) => results.push({ line: chunk[i].line, ...res }));
      }
      setProgress({ done: Math.min(start + IMPORT_CHUNK_SIZE, ready.length), total: ready.length });
    }

    results.sort((a, b) => a.line - b.line);
    setOutcomes(results);
    setProgress(null);
  }

  function downloadProblems() {
    if (!table || !outcomes) return;
    const failed = outcomes.filter((o) => o.result !== "imported");
    const rows = [[...table[0], "Why not imported"], ...failed.map((o) => [...table[o.line - 1], o.message ?? o.result])];
    const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `leads-not-imported-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setTable(null);
    setMapping(null);
    setOutcomes(null);
    setFileName("");
    setImportError("");
  }

  // ---------------- Step 4: summary ----------------
  if (outcomes) {
    const count = (kind: Outcome["result"]) => outcomes.filter((o) => o.result === kind).length;
    const notImported = outcomes.length - count("imported");
    return (
      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Import finished</h2>
        {importError ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{importError}</p> : null}
        <ul className="grid gap-3 sm:grid-cols-4">
          <Stat label="Imported" value={count("imported")} tone="text-emerald-700" />
          <Stat label="Already in LeadOS" value={count("duplicate")} tone="text-amber-700" />
          <Stat label="Repeated in file" value={count("duplicate_in_file")} tone="text-amber-700" />
          <Stat label="Errors" value={count("invalid") + count("error")} tone="text-red-700" />
        </ul>
        <div className="flex flex-wrap gap-3">
          <Link href="/leads" className={buttonClass}>Go to leads</Link>
          {notImported > 0 ? (
            <button type="button" onClick={downloadProblems} className={secondaryClass}>
              Download {notImported} rows that were not imported (CSV)
            </button>
          ) : null}
          <button type="button" onClick={reset} className={secondaryClass}>Import another file</button>
        </div>
      </div>
    );
  }

  // ---------------- Step 3: importing ----------------
  if (progress) {
    const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 100;
    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6" aria-live="polite">
        <p className="font-medium text-slate-900">Importing… {progress.done} of {progress.total}</p>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-emerald-600 transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-sm text-slate-500">Keep this page open until it finishes.</p>
      </div>
    );
  }

  // ---------------- Step 1: choose file ----------------
  if (!table || !mapping) {
    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <label className="block space-y-2">
          <span className="font-medium text-slate-900">Choose a CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => onFile(event.target.files?.[0])}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-4 file:py-2 file:font-medium file:text-emerald-800"
          />
        </label>
        {fileError ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{fileError}</p> : null}
        <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
          <li>First row must be the column names (Name, Mobile, Budget…).</li>
          <li>From Excel: File → Save As → <strong>CSV UTF-8</strong>. From Google Sheets: File → Download → CSV.</li>
          <li>Up to {MAX_IMPORT_ROWS} leads per file. Numbers already in LeadOS are skipped, not duplicated.</li>
        </ul>
        <a href="/sample-leads.csv" download className="inline-block text-sm font-medium text-emerald-700 hover:underline">
          Download a sample CSV
        </a>
      </div>
    );
  }

  // ---------------- Step 2: map columns + preview ----------------
  const headers = table[0];
  const firstRow = table[1] ?? [];
  const setField = (key: ImportFieldKey, value: string) =>
    setMapping({ ...mapping, [key]: value === "" ? null : Number(value) });

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-slate-900">1. Match your columns</h2>
          <p className="text-sm text-slate-500">{fileName} · {table.length - 1} rows</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {IMPORT_FIELDS.map((field) => {
            const index = mapping[field.key];
            return (
              <label key={field.key} className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">
                  {field.label}
                  {field.required ? " *" : ""}
                </span>
                <select value={index ?? ""} onChange={(e) => setField(field.key, e.target.value)} className={selectClass}>
                  <option value="">— Don&apos;t import —</option>
                  {headers.map((header, i) => (
                    <option key={i} value={i}>
                      {header || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
                {index !== null && firstRow[index] ? (
                  <span className="block truncate text-xs text-slate-500">e.g. {firstRow[index]}</span>
                ) : null}
              </label>
            );
          })}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">2. Defaults for every imported lead</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Source (when the row has none)</span>
            <select value={defaults.source} onChange={(e) => setDefaults({ ...defaults, source: e.target.value })} className={selectClass}>
              {LEAD_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Temperature (when the row has none)</span>
            <select value={defaults.temperature} onChange={(e) => setDefaults({ ...defaults, temperature: e.target.value })} className={selectClass}>
              {LEAD_TEMPERATURES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Assign all to</span>
            <select
              value={defaults.assignedTo ?? ""}
              onChange={(e) => setDefaults({ ...defaults, assignedTo: e.target.value || null })}
              className={selectClass}
            >
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">3. Check and import</h2>
        <p className="text-sm text-slate-700">
          <span className="font-semibold text-emerald-700">{ready.length} ready</span>
          {invalid ? <> · <span className="font-semibold text-red-700">{invalid} with problems</span></> : null}
          {inFileDuplicates ? <> · <span className="font-semibold text-amber-700">{inFileDuplicates} repeated number{inFileDuplicates === 1 ? "" : "s"}</span></> : null}
          {" "}(rows with problems are skipped; you can download them after the import)
        </p>
        {missingRequired.length ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Choose a column for: {missingRequired.map((f) => f.label).join(", ")}
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Row</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Mobile</th>
                <th className="px-3 py-2">Budget</th>
                <th className="px-3 py-2">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prepared.slice(0, 20).map((row) => (
                <tr key={row.line} className={row.kind === "ok" ? "" : "bg-red-50/50"}>
                  <td className="px-3 py-2 text-slate-500">{row.line}</td>
                  <td className="px-3 py-2">{row.record.name || "—"}</td>
                  <td className="px-3 py-2">{row.kind === "ok" ? formatPhone(row.values.phone_e164) : row.record.phone || "—"}</td>
                  <td className="px-3 py-2">{row.kind === "ok" ? formatBudget(row.values.budget_min, row.values.budget_max) : row.record.budget || "—"}</td>
                  <td className={`px-3 py-2 ${row.kind === "ok" ? "text-emerald-700" : row.kind === "invalid" ? "text-red-700" : "text-amber-700"}`}>
                    {row.kind === "ok" ? "✓ Ready" : row.error}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {prepared.length > 20 ? <p className="text-xs text-slate-500">Showing the first 20 of {prepared.length} rows.</p> : null}

        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={ready.length === 0 || missingRequired.length > 0} onClick={runImport} className={buttonClass}>
            Import {ready.length} lead{ready.length === 1 ? "" : "s"}
          </button>
          <button type="button" onClick={reset} className={secondaryClass}>Choose another file</button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <li className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
    </li>
  );
}
