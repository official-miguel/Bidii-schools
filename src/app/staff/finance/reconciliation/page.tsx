"use client";

import { useEffect, useState, useCallback } from "react";
import {
  GitMerge, CheckCircle2, X, AlertCircle,
  RefreshCw, Loader2, User,
} from "lucide-react";
import {
  PageHeader, Badge, EmptyState, Spinner, primaryButtonClass,
  secondaryButtonClass, ErrorBanner, SuccessBanner,
} from "@/components/ui";

interface QueueItem {
  id: string;
  mpesaTransactionId: string;
  rawAccountNumber: string;
  amount: string;
  paidAt: string;
  status: string;
  suggestedStudent: {
    id: string;
    fullName: string;
    admissionNumber: string;
  } | null;
  suggestedConfidence: number | null;
}

function formatKES(s: string) {
  const n = parseFloat(s);
  return isNaN(n) ? s : `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function ConfidencePill({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const variant = pct >= 80 ? "success" : pct >= 50 ? "warn" : "danger";
  return <Badge variant={variant}>{pct}% match</Badge>;
}

export default function ReconciliationPage() {
  const [items,     setItems]     = useState<QueueItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [success,   setSuccess]   = useState<string | null>(null);
  const [actionId,  setActionId]  = useState<string | null>(null);
  const [rejectId,  setRejectId]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/reconciliation");
      if (!res.ok) throw new Error("Failed to load reconciliation queue");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setError("Could not load reconciliation queue. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function resolve(item: QueueItem, studentId: string) {
    setActionId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/finance/reconciliation/${item.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to resolve payment.");
      } else {
        setItems(prev => prev.filter(i => i.id !== item.id));
        setSuccess(`Payment ${item.mpesaTransactionId} reconciled successfully.`);
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setActionId(null);
    }
  }

  async function reject(item: QueueItem) {
    setRejectId(item.id);
    setError(null);
    try {
      await fetch(`/api/finance/reconciliation/${item.id}/reject`, { method: "POST" });
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch {
      setError("Failed to reject item.");
    } finally {
      setRejectId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="M-Pesa Reconciliation"
        description="Match unrecognised M-Pesa C2B payments to students before crediting their accounts."
        action={
          <button onClick={load} className={secondaryButtonClass} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </button>
        }
      />

      {error   && <div className="mb-4"><ErrorBanner   message={error}   onDismiss={() => setError(null)}   /></div>}
      {success && <div className="mb-4"><SuccessBanner message={success} onDismiss={() => setSuccess(null)} /></div>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <EmptyState
          message="No pending reconciliation items — all M-Pesa payments have been matched."
          icon={<GitMerge className="h-6 w-6" />}
        />
      ) : (
        <div className="space-y-4">
          {/* Count banner */}
          <div className="flex items-center gap-2 rounded-lg bg-warn-bg border border-warn/20 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-warn shrink-0" aria-hidden="true" />
            <p className="text-sm text-warn font-medium">
              {items.length} unmatched payment{items.length !== 1 ? "s" : ""} require manual reconciliation
            </p>
          </div>

          {items.map(item => (
            <div
              key={item.id}
              className="bg-white border border-line rounded-xl p-5 dark:bg-dark-surface dark:border-dark-border"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">

                {/* Transaction details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-sm font-semibold text-ink dark:text-dark-text">
                      {item.mpesaTransactionId}
                    </span>
                    <Badge variant="warn">Unmatched</Badge>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                    <div>
                      <p className="text-xs text-slate dark:text-dark-muted">Amount</p>
                      <p className="font-semibold text-success">{formatKES(item.amount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate dark:text-dark-muted">Account reference</p>
                      <p className="font-mono text-ink dark:text-dark-text">{item.rawAccountNumber}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate dark:text-dark-muted">Paid at</p>
                      <p className="text-ink dark:text-dark-text">{formatDate(item.paidAt)}</p>
                    </div>
                  </div>
                </div>

                {/* Suggested match */}
                {item.suggestedStudent && (
                  <div className="rounded-xl border border-line bg-paper p-4 min-w-[220px] dark:bg-dark-border/20 dark:border-dark-border">
                    <div className="flex items-center gap-1.5 mb-2">
                      <AlertCircle className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
                      <span className="text-xs font-medium text-slate dark:text-dark-muted">Suggested match</span>
                      {item.suggestedConfidence !== null && (
                        <ConfidencePill score={item.suggestedConfidence} />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-8 w-8 rounded-full bg-teal/10 flex items-center justify-center shrink-0">
                        <User className="h-4 w-4 text-teal" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-ink dark:text-dark-text">{item.suggestedStudent.fullName}</p>
                        <p className="text-xs text-slate font-mono dark:text-dark-muted">{item.suggestedStudent.admissionNumber}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => resolve(item, item.suggestedStudent!.id)}
                      disabled={actionId === item.id}
                      className={primaryButtonClass + " w-full justify-center text-xs py-2"}
                    >
                      {actionId === item.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Confirm this match
                    </button>
                  </div>
                )}

                {/* Reject action */}
                <div className="flex items-start">
                  <button
                    onClick={() => reject(item)}
                    disabled={rejectId === item.id}
                    aria-label={`Reject payment ${item.mpesaTransactionId}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line text-sm font-medium px-3 py-2 text-slate hover:border-danger/40 hover:text-danger transition-all disabled:opacity-50 dark:border-dark-border"
                  >
                    {rejectId === item.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <X className="h-4 w-4" />}
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
