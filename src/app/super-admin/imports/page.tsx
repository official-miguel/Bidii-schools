"use client";

/**
 * /super-admin/imports — Import Dashboard
 *
 * Two tabs:
 *
 * NEW IMPORT tab:
 *   1. School selector
 *   2. Import type (Students / Staff / Both / Custom)
 *   3. File upload (CSV / XLSX) with downloadable template link
 *   4. Validation preview: parsed rows table with inline error flags
 *   5. Confirm & submit → creates ImportJob record + shows status indicator
 *
 * HISTORY tab:
 *   - Filterable table: School | Type | File | Date | Rows | OK | Failed | Status
 *   - Row actions: download error report, rollback (within 24h window)
 *   - Status badges: Queued / Processing / Completed / Failed / Rolled Back
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Upload, History, CheckCircle2, XCircle, Clock, RefreshCw,
  Download, RotateCcw, AlertTriangle, ChevronDown, Search,
  FileText,
} from "lucide-react";
import {
  PageHeader, Spinner, ErrorBanner, Badge, Card,
  primaryButtonClass, secondaryButtonClass, dangerButtonClass,
  inputClass, labelClass,
} from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImportJob {
  id:          string;
  schoolId:    string;
  type:        string;
  fileName:    string;
  totalRows:   number;
  succeeded:   number;
  failed:      number;
  status:      string;
  errorReport: any;
  rollbackAt:  string | null;
  rolledBackAt:string | null;
  createdAt:   string;
  school:      { name: string };
}

interface SchoolOption {
  id:   string;
  name: string;
}

interface ParsedRow {
  rowNum:  number;
  data:    Record<string, string>;
  errors:  string[];
}

type TabId = "new" | "history";

const IMPORT_TYPES = ["STUDENTS","STAFF","BOTH","CUSTOM"] as const;
const TYPE_LABELS: Record<string, string> = {
  STUDENTS:"Students", STAFF:"Staff", BOTH:"Students + Staff", CUSTOM:"Custom",
};

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "success"|"warn"|"danger"|"default"|"teal"> = {
    COMPLETED:    "success",
    PROCESSING:   "teal",
    QUEUED:       "warn",
    FAILED:       "danger",
    ROLLED_BACK:  "default",
  };
  return <Badge variant={map[status] ?? "default"}>{status.replace("_"," ")}</Badge>;
}

// ── CSV parser (client-side, simple) ─────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));

  // Required field sets per type — we validate common student fields as demo
  const REQUIRED = ["name", "admission_number", "class"];

  const rows: ParsedRow[] = lines.slice(1, 51).map((line, i) => { // preview first 50
    const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const data: Record<string, string> = {};
    headers.forEach((h, idx) => { data[h] = vals[idx] ?? ""; });

    const errors: string[] = [];
    REQUIRED.forEach(req => {
      const key = headers.find(h => h.toLowerCase() === req);
      if (key && !data[key]?.trim()) {
        errors.push(`${key} is required`);
      }
    });
    if (headers.length !== vals.length) {
      errors.push(`Column count mismatch (expected ${headers.length}, got ${vals.length})`);
    }

    return { rowNum: i + 2, data, errors };
  });

  return { headers, rows };
}

// ── Validation preview table ──────────────────────────────────────────────────

function ValidationPreview({
  headers, rows,
}: {
  headers: string[];
  rows:    ParsedRow[];
}) {
  const errorCount = rows.filter(r => r.errors.length > 0).length;
  const validCount = rows.length - errorCount;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm flex-wrap">
        <span className="flex items-center gap-1.5 text-success font-medium">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> {validCount} valid
        </span>
        {errorCount > 0 && (
          <span className="flex items-center gap-1.5 text-danger font-medium">
            <XCircle className="h-4 w-4" aria-hidden /> {errorCount} with errors
          </span>
        )}
        <span className="text-slate dark:text-dark-muted">
          (showing first {rows.length} rows)
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-line dark:border-dark-border overflow-hidden shadow-xs max-h-72 overflow-y-auto">
        <table className="min-w-full divide-y divide-line dark:divide-dark-border text-xs">
          <thead className="sticky top-0 bg-slate-50/95 dark:bg-dark-surface z-10">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold text-slate dark:text-dark-muted uppercase tracking-wide w-10">
                #
              </th>
              <th className="px-3 py-2.5 text-left font-semibold text-slate dark:text-dark-muted uppercase tracking-wide w-10">
                ✓
              </th>
              {headers.slice(0, 6).map(h => (
                <th key={h}
                  className="px-3 py-2.5 text-left font-semibold text-slate dark:text-dark-muted uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line dark:divide-dark-border bg-white dark:bg-dark-surface">
            {rows.map(row => (
              <tr key={row.rowNum}
                className={row.errors.length > 0
                  ? "bg-danger-bg/40 dark:bg-danger/5"
                  : "hover:bg-slate-50/40 dark:hover:bg-dark-border/20"
                }>
                <td className="px-3 py-2 text-slate dark:text-dark-muted tabular-nums">{row.rowNum}</td>
                <td className="px-3 py-2">
                  {row.errors.length > 0 ? (
                    <span title={row.errors.join("; ")}>
                      <XCircle className="h-3.5 w-3.5 text-danger" aria-label={row.errors.join("; ")} />
                    </span>
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-label="Valid" />
                  )}
                </td>
                {headers.slice(0, 6).map(h => (
                  <td key={h} className={`px-3 py-2 max-w-[120px] truncate
                    ${row.errors.some(e => e.startsWith(h)) ? "text-danger font-medium" : "text-ink dark:text-dark-text"}`}>
                    {row.data[h] || <span className="text-slate/40 dark:text-dark-muted/40 italic">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {errorCount > 0 && (
        <div className="rounded-lg bg-warn-bg border border-warn/20 px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-warn shrink-0 mt-0.5" aria-hidden />
          <p className="text-xs text-warn leading-relaxed">
            {errorCount} row{errorCount !== 1 ? "s have" : " has"} validation errors.
            You can still submit — errored rows will be skipped and logged in the error report.
          </p>
        </div>
      )}
    </div>
  );
}

// ── New Import tab ────────────────────────────────────────────────────────────

function NewImportTab() {
  const [schools,      setSchools]      = useState<SchoolOption[]>([]);
  const [schoolId,     setSchoolId]     = useState("");
  const [importType,   setImportType]   = useState<string>("STUDENTS");
  const [file,         setFile]         = useState<File | null>(null);
  const [preview,      setPreview]      = useState<{ headers: string[]; rows: ParsedRow[] } | null>(null);
  const [parsing,      setParsing]      = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitted,    setSubmitted]    = useState<ImportJob | null>(null);
  const [apiError,     setApiError]     = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/super-admin/schools?limit=200")
      .then(r => r.json())
      .then(j => setSchools((j.schools ?? []).map((s: any) => ({ id: s.id, name: s.name }))));
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setParsing(true);
    setPreview(null);
    try {
      const text = await f.text();
      setPreview(parseCSV(text));
    } catch {
      setPreview({ headers: [], rows: [] });
    } finally {
      setParsing(false);
    }
  }

  async function handleSubmit() {
    if (!schoolId || !file) return;
    setSubmitting(true); setApiError(null);
    try {
      const totalRows = preview?.rows.length ?? 0;
      const res = await fetch("/api/super-admin/imports", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId, type: importType, fileName: file.name, totalRows }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to start import");
      setSubmitted(j.job);
    } catch (e) {
      setApiError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-5 py-12 animate-fade-in">
        <div className="flex items-center justify-center h-16 w-16 rounded-full bg-success-bg">
          <CheckCircle2 className="h-8 w-8 text-success" strokeWidth={2} />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-ink dark:text-dark-text">Import job created</p>
          <p className="text-sm text-slate dark:text-dark-muted mt-1">
            Job ID: <span className="font-mono text-xs">{submitted.id}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-line dark:border-dark-border
                        bg-paper dark:bg-dark-bg px-5 py-3.5 text-sm text-slate dark:text-dark-muted gap-6">
          <div>
            <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-0.5">Status</p>
            <StatusBadge status={submitted.status} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-0.5">File</p>
            <p className="text-ink dark:text-dark-text font-medium">{submitted.fileName}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-0.5">Rollback window</p>
            <p className="text-ink dark:text-dark-text">
              {submitted.rollbackAt
                ? `Until ${new Date(submitted.rollbackAt).toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" })} today`
                : "24h"}
            </p>
          </div>
        </div>
        <button type="button"
          onClick={() => { setSubmitted(null); setFile(null); setPreview(null); setSchoolId(""); }}
          className={secondaryButtonClass}>
          Start another import
        </button>
      </div>
    );
  }

  const canSubmit = !!schoolId && !!file && !submitting;

  return (
    <div className="space-y-6 max-w-2xl">
      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Step 1: School */}
      <Card className="dark:bg-dark-surface dark:border-dark-border">
        <div className="flex items-center gap-2.5 mb-4 pb-3.5 border-b border-line dark:border-dark-border">
          <span className="flex items-center justify-center h-6 w-6 rounded-full bg-teal text-white text-xs font-bold shrink-0">1</span>
          <h3 className="text-sm font-semibold text-ink dark:text-dark-text">Select School</h3>
        </div>
        <div>
          <label className={labelClass}>School <span className="text-danger">*</span></label>
          <select value={schoolId} onChange={e => setSchoolId(e.target.value)}
            className="w-full rounded-lg border border-line bg-white dark:bg-dark-surface dark:border-dark-border
                       px-3.5 py-2.5 text-sm text-ink dark:text-dark-text
                       focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15">
            <option value="">Choose a school…</option>
            {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </Card>

      {/* Step 2: Import type */}
      <Card className="dark:bg-dark-surface dark:border-dark-border">
        <div className="flex items-center gap-2.5 mb-4 pb-3.5 border-b border-line dark:border-dark-border">
          <span className="flex items-center justify-center h-6 w-6 rounded-full bg-teal text-white text-xs font-bold shrink-0">2</span>
          <h3 className="text-sm font-semibold text-ink dark:text-dark-text">Import Type</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {IMPORT_TYPES.map(type => (
            <button key={type} type="button" onClick={() => setImportType(type)}
              className={`rounded-xl border-2 px-3 py-3 text-xs font-semibold transition-all
                ${importType === type
                  ? "border-teal bg-teal-50 text-teal shadow-sm"
                  : "border-line text-slate hover:border-teal/40"
                }`}>
              {TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </Card>

      {/* Step 3: File upload */}
      <Card className="dark:bg-dark-surface dark:border-dark-border">
        <div className="flex items-center gap-2.5 mb-4 pb-3.5 border-b border-line dark:border-dark-border">
          <span className="flex items-center justify-center h-6 w-6 rounded-full bg-teal text-white text-xs font-bold shrink-0">3</span>
          <h3 className="text-sm font-semibold text-ink dark:text-dark-text">Upload File</h3>
        </div>

        <div className="space-y-3">
          {/* Template download */}
          <div className="flex items-center gap-2 text-xs text-slate dark:text-dark-muted">
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Download template:
            {["students","staff"].map(t => (
              <a key={t} href={`/templates/${t}-import.csv`} download
                className="text-teal font-medium hover:underline flex items-center gap-0.5">
                <Download className="h-3 w-3" aria-hidden /> {t}.csv
              </a>
            ))}
          </div>

          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) {
                const synth = { target: { files: [f] } } as any;
                handleFileChange(synth);
              }
            }}
            className="relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
                       border-line dark:border-dark-border bg-paper dark:bg-dark-bg py-10 px-6
                       cursor-pointer hover:border-teal/40 hover:bg-teal-50/30 transition-colors"
          >
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls"
              className="sr-only" onChange={handleFileChange} />
            <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-teal-50">
              <Upload className="h-6 w-6 text-teal" strokeWidth={1.8} aria-hidden />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-ink dark:text-dark-text">
                {file ? file.name : "Drop your file here or click to browse"}
              </p>
              <p className="text-xs text-slate dark:text-dark-muted mt-1">
                CSV or Excel (.xlsx) · max 10 MB
              </p>
            </div>
            {file && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg border border-success/20
                               text-success text-xs font-medium px-2.5 py-1">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {file.name}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Step 4: Validation preview */}
      {(parsing || preview) && (
        <Card className="dark:bg-dark-surface dark:border-dark-border">
          <div className="flex items-center gap-2.5 mb-4 pb-3.5 border-b border-line dark:border-dark-border">
            <span className="flex items-center justify-center h-6 w-6 rounded-full bg-teal text-white text-xs font-bold shrink-0">4</span>
            <h3 className="text-sm font-semibold text-ink dark:text-dark-text">Validation Preview</h3>
          </div>
          {parsing ? (
            <div className="flex items-center gap-2 text-sm text-slate dark:text-dark-muted">
              <Spinner size="sm" /> Parsing file…
            </div>
          ) : preview && (
            <ValidationPreview headers={preview.headers} rows={preview.rows} />
          )}
        </Card>
      )}

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button type="button"
          onClick={() => { setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
          className={secondaryButtonClass} disabled={!file}>
          Clear
        </button>
        <button type="button" onClick={handleSubmit}
          disabled={!canSubmit}
          className={primaryButtonClass}>
          {submitting ? "Starting import…" : "Start Import"}
        </button>
      </div>
    </div>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────

function HistoryTab() {
  const [jobs,      setJobs]      = useState<ImportJob[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [apiError,  setApiError]  = useState<string | null>(null);
  const [fStatus,   setFStatus]   = useState("");
  const [fSchool,   setFSchool]   = useState("");
  const [rollbackBusy, setRollbackBusy] = useState<string | null>(null);
  const [rollbackMsg,  setRollbackMsg]  = useState<string | null>(null);

  const load = useCallback(async (pg = 1) => {
    setLoading(true); setApiError(null);
    try {
      const p = new URLSearchParams({ page: String(pg) });
      if (fStatus) p.set("status", fStatus);
      const res = await fetch(`/api/super-admin/imports?${p}`);
      if (!res.ok) throw new Error("Failed to load imports");
      const j = await res.json();
      setJobs(j.jobs ?? []);
      setTotal(j.total ?? 0);
      setPage(pg);
    } catch (e) {
      setApiError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fStatus]);

  useEffect(() => { load(1); }, [load]);

  async function handleRollback(jobId: string) {
    setRollbackBusy(jobId); setApiError(null);
    try {
      const res = await fetch(`/api/super-admin/imports/${jobId}/rollback`, { method: "POST" });
      const j   = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Rollback failed");
      setRollbackMsg(`Import ${jobId.slice(0, 8)}… rolled back`);
      setTimeout(() => setRollbackMsg(null), 3000);
      await load(page);
    } catch (e) {
      setApiError(e.message);
    } finally {
      setRollbackBusy(null);
    }
  }

  function canRollback(job: ImportJob) {
    if (job.status !== "COMPLETED") return false;
    if (!job.rollbackAt) return false;
    return new Date() < new Date(job.rollbackAt);
  }

  function downloadErrorReport(job: ImportJob) {
    if (!job.errorReport) return;
    const blob = new Blob([JSON.stringify(job.errorReport, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${job.fileName}-errors.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="space-y-5">
      {apiError   && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}
      {rollbackMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-success-bg border border-success/20
                        text-success text-sm px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {rollbackMsg}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}
          className="rounded-xl border border-line bg-white dark:bg-dark-surface dark:border-dark-border
                     px-3.5 py-2.5 text-sm text-ink dark:text-dark-text
                     focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 shadow-xs">
          <option value="">All statuses</option>
          {["QUEUED","PROCESSING","COMPLETED","FAILED","ROLLED_BACK"].map(s => (
            <option key={s} value={s}>{s.replace("_"," ")}</option>
          ))}
        </select>
        <button type="button" onClick={() => load(1)} className={`${secondaryButtonClass} shrink-0`}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-2 text-slate dark:text-dark-muted
                        rounded-xl border border-dashed border-line dark:border-dark-border">
          <History className="h-8 w-8 opacity-40" aria-hidden />
          <p className="text-sm">No imports yet</p>
        </div>
      ) : (
        <div className="rounded-xl border border-line dark:border-dark-border overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-line dark:divide-dark-border">
              <thead className="bg-slate-50/80 dark:bg-dark-surface text-xs font-semibold
                                text-slate dark:text-dark-muted uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3.5 text-left">School</th>
                  <th className="px-5 py-3.5 text-left hidden sm:table-cell">Type</th>
                  <th className="px-5 py-3.5 text-left">File</th>
                  <th className="px-5 py-3.5 text-left hidden md:table-cell">Rows</th>
                  <th className="px-5 py-3.5 text-left">Status</th>
                  <th className="px-5 py-3.5 text-right hidden lg:table-cell">Date</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-dark-border bg-white dark:bg-dark-surface">
                {jobs.map(job => {
                  const busy    = rollbackBusy === job.id;
                  const rollback = canRollback(job);
                  const hasErrors = job.errorReport && job.failed > 0;
                  return (
                    <tr key={job.id}
                      className={`transition-colors hover:bg-slate-50/50 dark:hover:bg-dark-border/30
                                  ${busy ? "opacity-50 pointer-events-none" : ""}`}>
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium text-ink dark:text-dark-text truncate max-w-[160px]">
                          {job.school?.name ?? "—"}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 hidden sm:table-cell">
                        <Badge variant="teal">{TYPE_LABELS[job.type] ?? job.type}</Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm text-ink dark:text-dark-text font-mono truncate max-w-[180px]">
                          {job.fileName}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <div className="text-xs text-slate dark:text-dark-muted space-y-0.5">
                          <p>{job.totalRows} total</p>
                          <p className="text-success">{job.succeeded} ok</p>
                          {job.failed > 0 && <p className="text-danger">{job.failed} failed</p>}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell text-xs text-slate dark:text-dark-muted text-right whitespace-nowrap">
                        {new Date(job.createdAt).toLocaleString("en-GB", {
                          day:"2-digit", month:"short", year:"numeric",
                          hour:"2-digit", minute:"2-digit",
                        })}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2 justify-end">
                          {hasErrors && (
                            <button type="button"
                              onClick={() => downloadErrorReport(job)}
                              title="Download error report"
                              className="flex items-center justify-center h-8 w-8 rounded-lg text-slate
                                         hover:bg-slate-100 dark:hover:bg-dark-border transition-colors">
                              <Download className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          )}
                          {rollback && (
                            <button type="button"
                              onClick={() => handleRollback(job.id)}
                              disabled={busy}
                              title="Rollback this import"
                              className="flex items-center justify-center h-8 w-8 rounded-lg text-danger
                                         hover:bg-danger-bg transition-colors">
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          )}
                          {job.rollbackAt && job.status === "COMPLETED" && !rollback && (
                            <span className="text-[10px] text-slate dark:text-dark-muted italic whitespace-nowrap">
                              Window expired
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-slate dark:text-dark-muted">
            Page {page} of {totalPages} · {total} imports
          </p>
          <div className="flex gap-2">
            <button onClick={() => load(page - 1)} disabled={page <= 1 || loading}
              className={secondaryButtonClass}>Previous</button>
            <button onClick={() => load(page + 1)} disabled={page >= totalPages || loading}
              className={secondaryButtonClass}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ImportsPage() {
  const [tab, setTab] = useState<TabId>("new");

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Import Dashboard"
        description="Bulk-import students and staff, preview validation errors, and manage import history."
      />

      {/* Tab bar */}
      <div className="border-b border-line dark:border-dark-border flex gap-0">
        {([
          { id: "new"     as TabId, label: "New Import",      Icon: Upload  },
          { id: "history" as TabId, label: "Import History",  Icon: History },
        ]).map(({ id, label, Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px
              ${tab === id
                ? "border-teal text-teal"
                : "border-transparent text-slate hover:text-ink dark:text-dark-muted dark:hover:text-dark-text"
              }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {tab === "new"     && <NewImportTab />}
      {tab === "history" && <HistoryTab  />}
    </div>
  );
}
