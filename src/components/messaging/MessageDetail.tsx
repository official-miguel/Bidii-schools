"use client";

import { useEffect, useState } from "react";
import DeliveryStatusBadge from "./DeliveryStatusBadge";
import ChannelBadge from "./ChannelBadge";

interface Log {
  id: string; channel: string; phone: string; recipientLabel: string;
  status: string; errorDetail: string | null; createdAt: string;
}
interface MessageFull {
  id: string; channel: string; status: string; body: string;
  recipientSummary: string; createdAt: string; scheduledAt: string | null;
  attachmentUrl: string | null; attachmentName: string | null;
  sender: { email: string }; logs: Log[];
}

interface Props {
  messageId: string | null;
  canManage: boolean;
  onClose:   () => void;
  onRetry?:  () => void;
}

export default function MessageDetail({ messageId, canManage, onClose, onRetry }: Props) {
  const [msg, setMsg]         = useState<MessageFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!messageId) { setMsg(null); return; }
    setLoading(true); setError("");
    fetch(`/api/messaging/messages/${messageId}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then(setMsg)
      .catch(() => setError("Could not load message details."))
      .finally(() => setLoading(false));
  }, [messageId]);

  const handleRetry = async () => {
    if (!msg) return;
    setRetrying(true);
    const r = await fetch(`/api/messaging/messages/${msg.id}/retry`, { method: "POST" });
    setRetrying(false);
    if (r.ok) { onRetry?.(); onClose(); }
    else setError("Retry failed — please try again.");
  };

  const handleCancel = async () => {
    if (!msg) return;
    setCancelling(true);
    const r = await fetch(`/api/messaging/messages/${msg.id}/cancel`, { method: "POST" });
    setCancelling(false);
    if (r.ok) onClose();
    else setError("Could not cancel message.");
  };

  if (!messageId) return null;

  return (
    <div className="fixed inset-0 z-50 flex md:justify-end" onClick={onClose}>
      <div
        className="relative w-full md:w-[480px] bg-card h-full shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="font-display text-base font-semibold text-foreground">Message detail</h2>
          <button onClick={onClose} className="text-slate hover:text-foreground p-1">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
          </button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="h-8 w-8 rounded-full border-2 border-royal border-t-transparent animate-spin" />
          </div>
        )}

        {error && <p className="p-5 text-sm text-danger">{error}</p>}

        {msg && !loading && (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Meta */}
            <div className="flex flex-wrap gap-2">
              <ChannelBadge channel={msg.channel} />
              <DeliveryStatusBadge status={msg.status} />
            </div>

            <div className="space-y-1 text-sm">
              <p className="text-slate">To: <span className="text-foreground">{msg.recipientSummary}</span></p>
              <p className="text-slate">Sent by: <span className="text-foreground">{msg.sender.email}</span></p>
              <p className="text-slate">
                {msg.scheduledAt ? "Scheduled: " : "Sent: "}
                <span className="text-foreground">{new Date(msg.scheduledAt ?? msg.createdAt).toLocaleString()}</span>
              </p>
            </div>

            {/* Body */}
            <div>
              <p className="text-xs font-medium text-slate uppercase tracking-wide mb-1">Message</p>
              <pre className="whitespace-pre-wrap text-sm text-foreground bg-background rounded-lg p-3 border border-border font-sans">
                {msg.body}
              </pre>
            </div>

            {msg.attachmentName && (
              <p className="text-sm text-slate">
                Attachment:{" "}
                {msg.attachmentUrl
                  ? <a href={msg.attachmentUrl} className="text-royal underline" target="_blank" rel="noreferrer">{msg.attachmentName}</a>
                  : <span className="text-foreground">{msg.attachmentName}</span>
                }
              </p>
            )}

            {/* Recipient log */}
            {msg.logs.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate uppercase tracking-wide mb-2">Recipients ({msg.logs.length})</p>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-background border-b border-border">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-slate">Name</th>
                        <th className="text-left px-3 py-2 font-medium text-slate">Phone</th>
                        <th className="text-left px-3 py-2 font-medium text-slate">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {msg.logs.map((l) => (
                        <tr key={l.id} className="hover:bg-royal-50/30">
                          <td className="px-3 py-2 text-foreground">{l.recipientLabel}</td>
                          <td className="px-3 py-2 text-slate font-mono">{l.phone}</td>
                          <td className="px-3 py-2">
                            <DeliveryStatusBadge status={l.status} />
                            {l.errorDetail && <p className="text-danger text-xs mt-0.5">{l.errorDetail}</p>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Actions */}
            {canManage && (
              <div className="flex gap-2">
                {msg.logs.some((l) => l.status === "FAILED") && (
                  <button
                    onClick={handleRetry}
                    disabled={retrying}
                    className="rounded-md bg-royal text-white text-sm font-medium px-4 py-2 hover:bg-royal-light transition-colors disabled:opacity-60"
                  >
                    {retrying ? "Retrying…" : "Retry failed"}
                  </button>
                )}
                {msg.status === "PENDING" && msg.scheduledAt && new Date(msg.scheduledAt) > new Date() && (
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="rounded-md border border-danger/40 text-danger text-sm font-medium px-4 py-2 hover:bg-danger-bg transition-colors disabled:opacity-60"
                  >
                    {cancelling ? "Cancelling…" : "Cancel scheduled"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
