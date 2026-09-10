"use client";

import { useEffect, useState, useCallback } from "react";
import { MessageSquare } from "lucide-react";
import DeliveryStatusBadge from "./DeliveryStatusBadge";
import ChannelBadge from "./ChannelBadge";

interface MessageSummary {
  id: string;
  schoolId: string;
  channel: string;
  status: string;
  recipientSummary: string;
  body: string;
  createdAt: string;
  scheduledAt: string | null;
  senderEmail: string;
}

interface Props {
  onSelect: (id: string) => void;
  selectedId?: string;
  refreshKey?: number;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function MessageList({ onSelect, selectedId, refreshKey }: Props) {
  const [items, setItems]     = useState<MessageSummary[]>([]);
  const [query, setQuery]     = useState("");
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchFromApi = useCallback(async (q: string, p: number) => {
    const params = new URLSearchParams({ page: String(p) });
    if (q) params.set("q", q);
    const res = await fetch(`/api/messaging/messages?${params}`);
    if (!res.ok) return;
    const data = await res.json() as { messages: MessageSummary[]; total: number };
    setItems((prev) => p === 1 ? data.messages : [...prev, ...data.messages]);
    setTotal(data.total);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPage(1);
    fetchFromApi(query, 1).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [query, refreshKey, fetchFromApi]);

  const loadMore = async () => {
    const next = page + 1;
    setPage(next);
    await fetchFromApi(query, next);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Search bar */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate pointer-events-none"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
            clipRule="evenodd"
          />
        </svg>
        <input
          type="search"
          placeholder="Search messages…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2.5 text-sm text-foreground focus:border-royal focus:outline-none"
        />
      </div>

      {/* Skeleton */}
      {loading && items.length === 0 && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-[90px] rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-royal-50 flex items-center justify-center mx-auto mb-3">
            <MessageSquare className="h-7 w-7 text-royal/60" aria-hidden />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">No messages yet</p>
          <p className="text-xs text-slate">Messages you send will appear here.</p>
        </div>
      )}

      {/* Message cards */}
      {items.length > 0 && (
        <>
          <ul className="space-y-2">
            {items.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => onSelect(m.id)}
                  className={`w-full text-left rounded-xl border px-4 py-3.5 transition-all ${
                    selectedId === m.id
                      ? "border-teal bg-teal-50 shadow-sm ring-1 ring-teal/20"
                      : "border-border bg-card hover:border-teal/40 hover:bg-teal-50/30"
                  }`}
                >
                  {/* Top row: badges + time */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <ChannelBadge channel={m.channel} />
                      <DeliveryStatusBadge status={m.status} />
                      {m.scheduledAt && new Date(m.scheduledAt) > new Date() && (
                        <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 text-xs font-medium">
                          ⏰ Scheduled
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate/70 shrink-0 tabular-nums">
                      {relativeTime(m.createdAt)}
                    </span>
                  </div>
                  {/* Recipient summary */}
                  <p className="text-xs text-slate/80 truncate mb-1.5">{m.recipientSummary}</p>
                  {/* Message preview */}
                  <p className="text-sm text-foreground truncate leading-snug font-medium">{m.body}</p>
                </button>
              </li>
            ))}
          </ul>

          {items.length < total && (
            <button
              onClick={loadMore}
              className="w-full rounded-xl border border-border bg-card py-2.5 text-sm text-slate hover:text-foreground hover:bg-slate-50 hover:border-teal/40 transition-colors"
            >
              Load more ({total - items.length} remaining)
            </button>
          )}
        </>
      )}
    </div>
  );
}
