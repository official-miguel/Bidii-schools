"use client";

import { useEffect, useRef, useState } from "react";
import RecipientPicker from "./RecipientPicker";
import TemplateSelector from "./TemplateSelector";
import { applyPlaceholders, groupToken } from "@/lib/messaging/placeholders";
import type { RecipientDescriptor } from "@/lib/messaging/resolve";
import { X, ChevronRight, ChevronLeft, Send, Clock, AlertTriangle, Loader2, Paperclip } from "lucide-react";
import { ErrorBanner, inputClass, labelClass } from "@/components/ui";
import { useFormDraft } from "@/lib/hooks/useFormDraft";

interface Group       { id: string; name: string }
interface SchoolClass { id: string; name: string; form: number; stream: string | null }
interface Integration { provider: string; isActive: boolean }

interface Props {
  schoolId:  string;
  onClose:   () => void;
  onSent:    () => void;
  groups?:   Group[];
  classes?:  SchoolClass[];
}

const SMS_LIMIT = 160;

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: 1 | 2 }) {
  const steps = [
    { n: 1 as const, label: "Recipients" },
    { n: 2 as const, label: "Message" },
  ];
  return (
    <div className="flex items-center gap-1.5">
      {steps.map(({ n, label }, i) => {
        const done    = n < current;
        const active  = n === current;
        return (
          <div key={n} className="flex items-center gap-1.5">
            <div className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-all duration-200 ${
                  done    ? "bg-teal/20 text-teal"
                  : active ? "bg-teal text-white shadow-sm"
                  :          "bg-line text-slate"
                }`}
              >
                {done ? (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M10.28 1.28L3.989 7.575 1.695 5.28A1 1 0 00.28 6.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 1.28z" />
                  </svg>
                ) : n}
              </div>
              <span className={`text-xs font-medium transition-colors ${active ? "text-ink" : "text-slate"}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 text-line shrink-0" aria-hidden="true" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Channel card ──────────────────────────────────────────────────────────────

function ChannelCard({
  channel,
  active,
  configured,
  onSelect,
}: {
  channel: "SMS" | "WHATSAPP";
  active: boolean;
  configured: boolean;
  onSelect: () => void;
}) {
  const isSms = channel === "SMS";
  const title = isSms ? "SMS" : "WhatsApp";

  return (
    <button
      type="button"
      onClick={configured ? onSelect : undefined}
      title={!configured ? `${title} is not configured — go to Settings → Integrations` : undefined}
      className={`relative flex flex-1 flex-col items-center gap-2 rounded-xl border-2 py-4 px-5 text-sm font-semibold transition-all duration-150 ${
        active
          ? "border-teal bg-teal text-white shadow-md"
          : configured
          ? "border-line bg-white text-ink hover:border-teal/50 hover:bg-teal-50/40"
          : "border-line bg-paper text-line cursor-not-allowed opacity-60"
      }`}
    >
      {isSms ? (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      )}
      <span>{title}</span>
      {!configured && (
        <span className="absolute -top-1.5 -right-1.5 bg-line text-slate text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-white">
          not set up
        </span>
      )}
      {active && (
        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-white/60" />
      )}
    </button>
  );
}

// ── Main Composer ─────────────────────────────────────────────────────────────

export default function Composer({
  schoolId,
  onClose,
  onSent,
  groups = [],
  classes = [],
}: Props) {
  // ── Draft persistence ────────────────────────────────────────────────────
  const [draft, setDraft, clearDraft] = useFormDraft("bidii_draft_composer", {
    channel:       "SMS" as "SMS" | "WHATSAPP",
    body:          "",
    scheduledAt:   "",
    useSchedule:   false,
    attachmentUrl:  "",
    attachmentName: "",
    // Descriptors are serialisable objects — safe to persist
    descriptors:   [] as RecipientDescriptor[],
  });

  const [step, setStep]           = useState<1 | 2>(1);
  const [descriptors, setDescriptors] = useState<RecipientDescriptor[]>(draft.descriptors);
  const [channel, setChannel]     = useState<"SMS" | "WHATSAPP">(draft.channel);
  const [body, setBody]           = useState(draft.body);
  const [scheduledAt, setScheduledAt] = useState(draft.scheduledAt);
  const [useSchedule, setUseSchedule] = useState(draft.useSchedule);
  const [showExtras, setShowExtras]   = useState(false);
  const [attachmentUrl, setAttachmentUrl]   = useState(draft.attachmentUrl);
  const [attachmentName, setAttachmentName] = useState(draft.attachmentName);
  const [preview, setPreview]     = useState("");
  const [resolvedCount, setResolvedCount] = useState(0);
  const [skippedCount, setSkippedCount]   = useState(0);
  const [integrations, setIntegrations]   = useState<Integration[]>([]);
  const [sending, setSending]     = useState(false);
  const [error, setError]         = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist draft whenever meaningful fields change
  useEffect(() => {
    setDraft({ channel, body, scheduledAt, useSchedule, attachmentUrl, attachmentName, descriptors });
  }, [channel, body, scheduledAt, useSchedule, attachmentUrl, attachmentName, descriptors, setDraft]);

  function insertToken(token: string) {
    const ta = bodyRef.current;
    if (!ta) { setBody((b) => b + token); return; }
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const next  = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  }

  useEffect(() => {
    fetch("/api/integrations")
      .then((r) => r.ok ? r.json() : [])
      .then((d: Integration[]) => setIntegrations(d))
      .catch(() => {});
  }, []);

  // Resolve recipient count + preview
  useEffect(() => {
    if (descriptors.length === 0) { setResolvedCount(0); setSkippedCount(0); return; }
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/messaging/recipients/resolve?descriptors=${encodeURIComponent(JSON.stringify(descriptors))}`
        );
        if (!r.ok) return;
        const d = await r.json() as { resolved: { label: string; phone: string }[]; skipped: unknown[] };
        setResolvedCount(d.resolved.length);
        setSkippedCount(d.skipped.length);
        setPreview(d.resolved.length > 0 && body
          ? applyPlaceholders(body, { name: d.resolved[0].label })
          : "");
      } catch { /* non-fatal */ }
    }, 600);
  }, [descriptors, body]);

  const configured  = (ch: "SMS" | "WHATSAPP") => integrations.some((i) => i.provider === ch && i.isActive);
  const channelOk   = configured(channel) || integrations.length === 0;
  const canProceed  = descriptors.length > 0;
  const canSend     = canProceed && body.trim().length > 0 && channelOk;
  const charCount   = body.length % SMS_LIMIT || (body.length > 0 ? SMS_LIMIT : 0);
  const parts       = Math.ceil(body.length / SMS_LIMIT) || 1;

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    setError("");
    const payload = {
      descriptors,
      channel,
      body,
      ...(useSchedule && scheduledAt ? { scheduledAt } : {}),
      ...(attachmentUrl ? { attachmentUrl, attachmentName: attachmentName || attachmentUrl.split("/").pop() } : {}),
    };
    try {
      const res = await fetch("/api/messaging/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok || res.status === 202) { clearDraft(); onSent(); onClose(); }
      else {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Failed to send message.");
      }
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (step === 2) setTimeout(() => bodyRef.current?.focus(), 80);
  }, [step]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-sm p-0 sm:p-6 modal-backdrop"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-[600px] bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl border border-line flex flex-col max-h-[96vh] sm:max-h-[90vh] overflow-hidden modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-line shrink-0 bg-paper rounded-t-2xl">
          <div className="flex items-center gap-3">
            {step === 2 && (
              <button
                type="button"
                onClick={() => { setStep(1); setError(""); }}
                className="flex items-center justify-center h-8 w-8 rounded-lg text-slate hover:text-ink hover:bg-line transition-colors -ml-1"
                aria-label="Back to recipients"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <StepIndicator current={step} />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center h-8 w-8 rounded-lg text-slate hover:text-ink hover:bg-line transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ══════════════════════════════════════════
            STEP 1 — Recipients
        ══════════════════════════════════════════ */}
        {step === 1 && (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-h-0">

              {/* Channel selector */}
              <div>
                <p className={labelClass}>Send via</p>
                <div className="flex gap-3">
                  <ChannelCard
                    channel="SMS"
                    active={channel === "SMS"}
                    configured={configured("SMS") || integrations.length === 0}
                    onSelect={() => setChannel("SMS")}
                  />
                  <ChannelCard
                    channel="WHATSAPP"
                    active={channel === "WHATSAPP"}
                    configured={configured("WHATSAPP") || integrations.length === 0}
                    onSelect={() => setChannel("WHATSAPP")}
                  />
                </div>
                {!configured("SMS") && !configured("WHATSAPP") && integrations.length > 0 && (
                  <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-warn-bg border border-warn/20 text-warn text-xs px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    No channels configured — go to Settings → Integrations to add SMS or WhatsApp.
                  </div>
                )}
              </div>

              {/* Recipient picker */}
              <div>
                <p className={labelClass}>Send to</p>
                <RecipientPicker
                  schoolId={schoolId}
                  value={descriptors}
                  onChange={setDescriptors}
                  groups={groups}
                  classes={classes}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 px-6 py-4 border-t border-line bg-paper">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm">
                  {resolvedCount > 0 ? (
                    <span className="text-ink">
                      <strong>{resolvedCount}</strong> recipient{resolvedCount !== 1 ? "s" : ""}
                      {skippedCount > 0 && (
                        <span className="text-warn ml-2">· {skippedCount} without contact</span>
                      )}
                    </span>
                  ) : descriptors.length > 0 ? (
                    <span className="text-slate">Resolving…</span>
                  ) : (
                    <span className="text-slate/60">Select at least one recipient</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => canProceed && setStep(2)}
                  disabled={!canProceed}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal text-white text-sm font-semibold px-5 py-2.5 hover:bg-teal-dark active:scale-[0.98] transition-all duration-100 disabled:opacity-40 shadow-xs"
                >
                  Write message
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════
            STEP 2 — Message
        ══════════════════════════════════════════ */}
        {step === 2 && (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-h-0">

              {/* Recipient summary pill */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate">To:</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 border border-teal/20 text-teal text-xs font-semibold px-3 py-1">
                  {resolvedCount > 0
                    ? `${resolvedCount} recipient${resolvedCount !== 1 ? "s" : ""} via ${channel === "WHATSAPP" ? "WhatsApp" : "SMS"}`
                    : `Selected · ${channel === "WHATSAPP" ? "WhatsApp" : "SMS"}`}
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="ml-0.5 text-teal/70 hover:text-teal underline text-[10px] font-normal transition-colors"
                  >
                    change
                  </button>
                </span>
                {skippedCount > 0 && (
                  <span className="text-xs text-warn">
                    {skippedCount} without contact will be skipped
                  </span>
                )}
              </div>

              {/* Message body */}
              <div className="form-section">
                <div className="flex items-center justify-between form-section-title">
                  <span>Message</span>
                  <TemplateSelector onSelect={(t) => setBody(t.body)} />
                </div>

                {/* Group token chips — one row per group */}
                {groups.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {groups.map((g) => {
                      const token = groupToken(g.name);
                      return (
                        <div key={g.id} className="flex flex-wrap items-center gap-1">
                          <span className="text-[10px] font-semibold text-slate uppercase tracking-wide mr-1 shrink-0 max-w-[80px] truncate" title={g.name}>
                            {g.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => insertToken(token)}
                            className="rounded-full px-2 py-0.5 text-xs font-medium bg-violet-100 text-violet-700 hover:opacity-80 transition-opacity"
                          >
                            {token}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <textarea
                  ref={bodyRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  placeholder={"Type your message here…\n\nTip: use /name to personalise for each recipient."}
                  className="w-full rounded-lg border border-line bg-white px-3.5 py-3 text-sm text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/15 resize-none leading-relaxed transition-colors"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-slate/60">
                    Placeholders: /name /class /Admission /staffname
                    {channel === "SMS" && parts > 1 && (
                      <span className="ml-2 text-warn font-medium">{parts} SMS parts</span>
                    )}
                  </span>
                  <span className={`text-xs font-mono tabular-nums ${
                    charCount >= SMS_LIMIT
                      ? "text-danger font-semibold"
                      : charCount >= SMS_LIMIT * 0.8
                      ? "text-warn"
                      : "text-slate/50"
                  }`}>
                    {charCount}/{SMS_LIMIT}
                  </span>
                </div>
              </div>

              {/* Live preview panel — only when body has text */}
              {preview && (
                <div className="rounded-xl border border-teal/20 bg-teal-50/30 px-4 py-4 animate-fade-in">
                  <p className="text-xs font-semibold text-teal mb-2.5">Preview — first recipient</p>
                  <pre className="whitespace-pre-wrap text-sm text-ink font-sans leading-relaxed">{preview}</pre>
                </div>
              )}

              {/* Optional extras */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowExtras((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate hover:text-ink transition-colors"
                >
                  <ChevronRight
                    className={`h-3.5 w-3.5 transition-transform duration-150 ${showExtras ? "rotate-90" : ""}`}
                    aria-hidden="true"
                  />
                  {showExtras ? "Hide" : "More options"} — schedule &amp; attachment
                </button>

                {showExtras && (
                  <div className="mt-4 form-section space-y-4 animate-slide-down">
                    {/* Schedule toggle */}
                    <div>
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={useSchedule}
                            onChange={(e) => setUseSchedule(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="h-5 w-9 rounded-full bg-line peer-checked:bg-teal transition-colors" />
                          <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                        </div>
                        <span className="text-sm font-medium text-ink">Schedule for later</span>
                      </label>
                      {useSchedule && (
                        <input
                          type="datetime-local"
                          value={scheduledAt}
                          onChange={(e) => setScheduledAt(e.target.value)}
                          min={new Date().toISOString().slice(0, 16)}
                          className={`mt-3 ${inputClass}`}
                        />
                      )}
                    </div>

                    {/* Attachment URL */}
                    <div>
                      <label className={labelClass}>
                        <Paperclip className="inline h-3.5 w-3.5 mr-1 -mt-0.5" aria-hidden="true" />
                        Attachment URL (optional)
                      </label>
                      <input
                        type="url"
                        value={attachmentUrl}
                        onChange={(e) => setAttachmentUrl(e.target.value)}
                        placeholder="https://…"
                        className={inputClass}
                      />
                      {attachmentUrl && (
                        <input
                          type="text"
                          value={attachmentName}
                          onChange={(e) => setAttachmentName(e.target.value)}
                          placeholder="Display name for the link"
                          className={`mt-2 ${inputClass}`}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}
            </div>

            {/* Footer */}
            <div className="shrink-0 px-6 py-4 border-t border-line bg-paper">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-slate">
                  {!channelOk && integrations.length > 0 ? (
                    <span className="text-warn flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      {channel} not configured
                    </span>
                  ) : useSchedule && scheduledAt ? (
                    <span className="flex items-center gap-1 text-ink">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {new Date(scheduledAt).toLocaleString()}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex items-center justify-center rounded-lg border border-line text-sm font-medium px-4 py-2.5 text-ink hover:bg-paper active:scale-[0.98] transition-all duration-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!canSend || sending}
                    className="inline-flex items-center gap-2 rounded-lg bg-teal text-white text-sm font-semibold px-6 py-2.5 hover:bg-teal-dark active:scale-[0.98] transition-all duration-100 disabled:opacity-40 shadow-xs"
                  >
                    {sending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Sending…
                      </>
                    ) : useSchedule ? (
                      <>
                        <Clock className="h-4 w-4" aria-hidden="true" />
                        Schedule
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" aria-hidden="true" />
                        Send now
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
