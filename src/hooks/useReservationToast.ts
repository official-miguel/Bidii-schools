"use client";

/**
 * src/hooks/useReservationToast.ts
 *
 * Client-side SSE listener that shows a toast notification whenever
 * a "libraryReservation.activated" event arrives from the server.
 *
 * The hook opens an EventSource to /api/library/sse/library on mount
 * and tears it down on unmount. Use it in any "use client" library page.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import { useEffect } from "react";

interface ReservationActivatedPayload {
  reservationId: string;
  studentId:     string | null;
  catalogueId:   string;
  copyId:        string;
  title:         string;
  studentName?:  string | null;
}

/**
 * Show a fixed-position toast in the bottom-right corner.
 * The toast is self-dismissing after `durationMs` milliseconds
 * and can also be manually dismissed via a close button.
 */
function showReservationToast(payload: ReservationActivatedPayload, durationMs = 8_000) {
  if (typeof document === "undefined") return;

  const container = document.createElement("div");
  container.setAttribute("role", "status");
  container.setAttribute("aria-live", "polite");
  container.style.cssText = [
    "position:fixed",
    "bottom:1.5rem",
    "right:1.5rem",
    "z-index:9999",
    "max-width:22rem",
    "background:var(--color-surface,#fff)",
    "border:1px solid var(--color-border,#e5e7eb)",
    "border-radius:0.75rem",
    "box-shadow:0 4px 24px rgba(0,0,0,0.10)",
    "padding:0.875rem 1rem",
    "display:flex",
    "flex-direction:column",
    "gap:0.25rem",
    "font-family:inherit",
    "animation:slideIn 0.2s ease",
  ].join(";");

  const title = document.createElement("div");
  title.style.cssText = "font-weight:600;font-size:0.875rem;color:var(--color-text,#111827)";
  title.textContent = "Book Ready for Pickup";

  const desc = document.createElement("div");
  desc.style.cssText = "font-size:0.8125rem;color:var(--color-text-muted,#6b7280)";
  desc.textContent = `"${payload.title}" is now reserved for ${payload.studentName ?? "a waiting patron"}.`;

  const link = document.createElement("a");
  link.href = "/staff/library/reservations";
  link.style.cssText = "font-size:0.8125rem;font-weight:500;color:var(--color-primary,#2563eb);text-decoration:none;margin-top:0.25rem";
  link.textContent = "View reservations →";

  const closeBtn = document.createElement("button");
  closeBtn.setAttribute("aria-label", "Dismiss notification");
  closeBtn.style.cssText = [
    "position:absolute",
    "top:0.5rem",
    "right:0.5rem",
    "background:none",
    "border:none",
    "cursor:pointer",
    "opacity:0.5",
    "font-size:1rem",
    "line-height:1",
    "padding:0.25rem",
    "color:inherit",
  ].join(";");
  closeBtn.textContent = "×";

  container.style.position = "fixed";
  container.appendChild(title);
  container.appendChild(desc);
  container.appendChild(link);
  container.appendChild(closeBtn);
  document.body.appendChild(container);

  const remove = () => {
    if (container.parentNode) container.parentNode.removeChild(container);
  };

  const timer = setTimeout(remove, durationMs);
  closeBtn.addEventListener("click", () => { clearTimeout(timer); remove(); });
}

export function useReservationToast(): void {
  useEffect(() => {
    const es = new EventSource("/api/library/sse/library");

    es.onmessage = (evt) => {
      try {
        const event = JSON.parse(evt.data) as { type: string; payload: unknown };
        if (event.type !== "libraryReservation.activated") return;
        showReservationToast(event.payload as ReservationActivatedPayload, 8_000);
      } catch {
        // Non-fatal parse error — ignore
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects — no explicit retry needed
    };

    return () => {
      es.close();
    };
  }, []);
}
