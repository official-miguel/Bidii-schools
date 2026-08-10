"use client";

/**
 * CalendarView — offline-first school calendar component.
 *
 * Read path:
 *   1. School events come from calendarStore (IDB-backed) — renders
 *      instantly with zero network requests.
 *   2. Kenya public holidays are computed client-side via kenyaHolidays.ts
 *      (pure function, no network needed).
 *   3. Cold-load fallback: if the store has no events at all (first visit,
 *      IDB empty), fetches the current month from the API once while the
 *      background sync catches up.
 *
 * Write path:
 *   POST/PATCH/DELETE /api/calendar/events → success →
 *   calendarStore.upsert() / remove() updates IDB + in-memory state →
 *   SSE event propagates to other open tabs.
 */

import { useEffect, useMemo, useState, FormEvent } from "react";
import Modal from "@/components/Modal";
import {
  ErrorBanner,
  EmptyState,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  dangerLinkClass,
} from "@/components/ui";
import { useCalendarStore }              from "@/lib/stores/calendarStore";
import type { LocalCalendarEvent }       from "@/lib/stores/calendarStore";
import { getKenyaPublicHolidaysForMonth } from "@/lib/kenyaHolidays";
import { useProductivityStore }          from "@/lib/stores/productivityStore";
import { useFormDraft }                  from "@/lib/hooks/useFormDraft";
import DeadlineInlineCountdown           from "@/components/calendar/DeadlineInlineCountdown";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EventType = "HOLIDAY" | "EXAM" | "MEETING" | "EVENT" | "OTHER";
type EventSource = "SCHOOL" | "KENYA_HOLIDAY";
type CalendarAudience = "EVERYONE" | "STAFF_ONLY" | "PARENTS_ONLY";

type CalendarEventItem = {
  id:          string;
  title:       string;
  description: string | null;
  date:        string; // ISO date prefix "YYYY-MM-DD"
  type:        EventType;
  audience:    CalendarAudience;
  openingDate: string | null;
  closingDate: string | null;
  source:      EventSource;
  createdBy:   string | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<EventType, string> = {
  HOLIDAY: "Holiday",
  EXAM:    "Exam",
  MEETING: "Meeting",
  EVENT:   "Event",
  OTHER:   "Other",
};

const TYPE_DOT: Record<EventType, string> = {
  HOLIDAY: "bg-danger",
  EXAM:    "bg-gold",
  MEETING: "bg-royal",
  EVENT:   "bg-slate",
  OTHER:   "bg-slate/60",
};

const AUDIENCE_LABELS: Record<CalendarAudience, string> = {
  EVERYONE:     "Everyone",
  STAFF_ONLY:   "Staff only",
  PARENTS_ONLY: "Parents only",
};

const AUDIENCE_BADGE: Record<CalendarAudience, string> = {
  EVERYONE:     "bg-teal/10 text-teal",
  STAFF_ONLY:   "bg-royal/10 text-royal",
  PARENTS_ONLY: "bg-gold/20 text-amber-700 dark:text-amber-400",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Convert a LocalCalendarEvent (flat store shape) to the UI CalendarEventItem. */
function toItem(e: LocalCalendarEvent): CalendarEventItem {
  return {
    id:          e.id,
    title:       e.title,
    description: e.description,
    date:        e.date.slice(0, 10),
    type:        e.type as EventType,
    audience:    (e.audience ?? "EVERYONE") as CalendarAudience,
    openingDate: e.openingDate ? e.openingDate.slice(0, 10) : null,
    closingDate: e.closingDate ? e.closingDate.slice(0, 10) : null,
    source:      "SCHOOL",
    createdBy:   null,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CalendarView({ canManage }: { canManage: boolean }) {
  const todayDate  = new Date();
  const [year,  setYear]  = useState(todayDate.getUTCFullYear());
  const [month, setMonth] = useState(todayDate.getUTCMonth() + 1); // 1-12

  // ── Store reads ────────────────────────────────────────────────────────────
  // Only subscribe reactively to DATA (events, loading flag).
  // Actions (upsert, remove) are accessed via getState() so their unstable
  // function references never cause infinite re-render loops.
  const storeEvents  = useCalendarStore((s) => s.events);
  const storeLoading = useCalendarStore((s) => s.loading);

  // ── Cold-load fallback for empty store (first visit) ──────────────────────
  const [apiFallback, setApiFallback] = useState<CalendarEventItem[] | null>(null);
  const [loadError,   setLoadError]   = useState<string | null>(null);

  useEffect(() => {
    // Once the store finishes hydrating and has events, clear the fallback.
    if (!storeLoading && storeEvents.length > 0) {
      setApiFallback(null);
      return;
    }
    // Only hit the API if the store is still empty after hydration.
    if (!storeLoading && storeEvents.length === 0) {
      setLoadError(null);
      const controller = new AbortController();
      fetch(`/api/calendar/events?year=${year}&month=${month}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) { setLoadError(data.error || "Couldn't load the calendar."); setApiFallback([]); return; }
          setApiFallback(data.events ?? []);
        })
        .catch((err) => {
          if (err.name !== "AbortError") { setLoadError("Couldn't load the calendar."); setApiFallback([]); }
        });
      return () => controller.abort();
    }
  // Re-run when month/year changes while the store is still cold.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeLoading, storeEvents.length, year, month]);

  // ── Build event list for the current month ─────────────────────────────────
  // yearMonth prefix e.g. "2026-07"
  const yearMonth = `${year}-${String(month).padStart(2, "0")}`;

  const schoolEvents: CalendarEventItem[] = useMemo(() => {
    if (storeEvents.length > 0) {
      return storeEvents
        .filter((e) => e.date.startsWith(yearMonth))
        .map(toItem);
    }
    // Fall back to API data while the store warms up.
    return (apiFallback ?? []).filter((e) => e.source === "SCHOOL");
  }, [storeEvents, apiFallback, yearMonth]);

  const kenyaHolidays: CalendarEventItem[] = useMemo(
    () =>
      getKenyaPublicHolidaysForMonth(year, month).map((h) => ({
        id:          h.id,
        title:       h.title,
        description: null,
        date:        ymd(h.date),
        type:        "HOLIDAY" as EventType,
        audience:    "EVERYONE" as CalendarAudience,
        openingDate: null,
        closingDate: null,
        source:      "KENYA_HOLIDAY" as EventSource,
        createdBy:   null,
      })),
    [year, month]
  );

  const allEvents: CalendarEventItem[] = useMemo(
    () => [...schoolEvents, ...kenyaHolidays].sort((a, b) => a.date.localeCompare(b.date)),
    [schoolEvents, kenyaHolidays]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEventItem[]>();
    for (const e of allEvents) {
      const key = e.date.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [allEvents]);

  // ── Calendar grid cells ────────────────────────────────────────────────────
  const cells = useMemo(() => {
    const firstOfMonth  = new Date(Date.UTC(year, month - 1, 1));
    const leadingBlanks = (firstOfMonth.getUTCDay() + 6) % 7; // Mon=0..Sun=6
    const daysInMonth   = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const list: (string | null)[] = Array(leadingBlanks).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      list.push(ymd(new Date(Date.UTC(year, month - 1, d))));
    }
    return list;
  }, [year, month]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  function goToMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1)  { m = 12; y -= 1; }
    if (m > 12) { m = 1;  y += 1; }
    setMonth(m);
    setYear(y);
  }

  // ── Modal state ────────────────────────────────────────────────────────────
  const [selectedDate,     setSelectedDate]     = useState<string | null>(null);
  const [formOpen,         setFormOpen]         = useState(false);
  const [editing,          setEditing]          = useState<CalendarEventItem | null>(null);
  const [formError,        setFormError]        = useState<string | null>(null);
  const [monthPickerOpen,  setMonthPickerOpen]  = useState(false);

  // Draft for the event create/edit form (scoped by editing id)
  const calDraftKey = `bidii_draft_cal_event_${editing?.id ?? "new"}`;
  const [calDraft, setCalDraft, clearCalDraft] = useFormDraft(calDraftKey, {
    formType:        "EVENT" as EventType,
    formAudience:    "EVERYONE" as CalendarAudience,
    formOpeningDate: "",
    formClosingDate: "",
    formIsDeadline:  false,
    formDeadlineDate: "",
  });

  const [formType,         setFormType]         = useState<EventType>(calDraft.formType);
  const [formAudience,     setFormAudience]     = useState<CalendarAudience>(calDraft.formAudience);
  const [formOpeningDate,  setFormOpeningDate]  = useState(calDraft.formOpeningDate);
  const [formClosingDate,  setFormClosingDate]  = useState(calDraft.formClosingDate);
  // isDeadline: true when the principal wants this event to show a countdown to all teachers
  const [formIsDeadline,   setFormIsDeadline]   = useState(calDraft.formIsDeadline);
  // The explicit deadline date the principal sets (stored as closingDate on the event)
  const [formDeadlineDate, setFormDeadlineDate] = useState(calDraft.formDeadlineDate);

  // Persist when form is open
  useEffect(() => {
    if (!formOpen) return;
    setCalDraft({ formType, formAudience, formOpeningDate, formClosingDate, formIsDeadline, formDeadlineDate });
  }, [formType, formAudience, formOpeningDate, formClosingDate, formIsDeadline, formDeadlineDate, formOpen, setCalDraft]);

  // ── Today's-events notification (fires once per session on mount) ──────────
  const addNotification = useProductivityStore((s) => s.addNotification);
  useEffect(() => {
    const todayStr = ymd(new Date());
    const todayEvents = useCalendarStore
      .getState()
      .events.filter((e) => e.date.slice(0, 10) === todayStr);
    if (todayEvents.length === 0) return;
    // Build a single summary notification listing all today's events.
    const titles = todayEvents.map((e) => e.title).join(", ");
    addNotification({
      category: "administrative",
      title:    `📅 Today on the calendar`,
      body:     todayEvents.length === 1
        ? `"${titles}" is scheduled for today.`
        : `${todayEvents.length} events today: ${titles}.`,
      href:     "/principal/calendar",
    });
  // Intentionally runs once on mount — eslint disabled for that reason.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openDay(date: string) { setSelectedDate(date); }

  function openCreate(date: string) {
    setEditing(null);
    setFormError(null);
    clearCalDraft();
    setFormType("EVENT");
    setFormAudience("EVERYONE");
    setFormOpeningDate("");
    setFormClosingDate("");
    setFormIsDeadline(false);
    setFormDeadlineDate("");
    setSelectedDate(date);
    setFormOpen(true);
  }

  function openEdit(e: CalendarEventItem) {
    setEditing(e);
    setFormError(null);
    setFormType(e.type);
    setFormAudience(e.audience);
    setFormOpeningDate(e.openingDate ?? "");
    // For HOLIDAY/EXAM the closingDate is used as a range field, not a deadline.
    // For all other types, a closingDate means this was set as a principal deadline.
    const isDeadlineType = e.type !== "HOLIDAY" && e.type !== "EXAM";
    const hasDeadline    = isDeadlineType && !!e.closingDate;
    setFormIsDeadline(hasDeadline);
    setFormDeadlineDate(hasDeadline ? (e.closingDate ?? "") : "");
    setFormClosingDate(isDeadlineType ? "" : (e.closingDate ?? ""));
    setFormOpen(true);
  }

  // ── Write handlers ─────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const form = new FormData(e.currentTarget);

    const eventDate =
      formType === "HOLIDAY" || formType === "EXAM"
        ? formClosingDate || formOpeningDate || selectedDate
        : (form.get("date") as string) || selectedDate;

    // When "Set as deadline" is active, force the audience so all staff see it,
    // and map the deadline date → closingDate on the event record.
    const effectiveAudience: CalendarAudience =
      formIsDeadline ? "STAFF_ONLY" : formAudience;

    const payload: Record<string, unknown> = {
      title:       form.get("title") as string,
      description: (form.get("description") as string) || "",
      date:        eventDate,
      type:        formType,
      audience:    effectiveAudience,
    };
    if (formOpeningDate) payload.openingDate = formOpeningDate;
    if (formType !== "HOLIDAY" && formType !== "EXAM") {
      // Deadline date goes into closingDate; clear it if the toggle is off.
      payload.closingDate = formIsDeadline ? formDeadlineDate : "";
    } else {
      if (formClosingDate) payload.closingDate = formClosingDate;
    }

    const res = await fetch(
      editing ? `/api/calendar/events/${editing.id}` : "/api/calendar/events",
      {
        method:  editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      }
    );
    const data = await res.json();
    if (!res.ok) { setFormError(data.error || "Something went wrong."); return; }

    // Optimistically update the store so the calendar re-renders immediately.
    const serverEvent: LocalCalendarEvent = {
      id:          data.id,
      schoolId:    data.schoolId ?? "",
      title:       data.title,
      description: data.description ?? null,
      date:        (data.date as string).slice(0, 10),
      type:        data.type,
      audience:    data.audience ?? "EVERYONE",
      openingDate: data.openingDate ? (data.openingDate as string).slice(0, 10) : null,
      closingDate: data.closingDate ? (data.closingDate as string).slice(0, 10) : null,
      createdById: data.createdById ?? null,
      updatedAt:   data.updatedAt ?? new Date().toISOString(),
    };
    useCalendarStore.getState().upsert(serverEvent);

    // ── In-app notification ──────────────────────────────────────────────────
    const audienceLabel = AUDIENCE_LABELS[effectiveAudience];
    const eventDateLabel = new Date(`${serverEvent.date}T00:00:00Z`).toLocaleDateString(
      "en-KE",
      { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }
    );
    const deadlineNote = formIsDeadline && formDeadlineDate
      ? ` Deadline: ${new Date(`${formDeadlineDate}T00:00:00Z`).toLocaleDateString("en-KE", { day: "numeric", month: "short", timeZone: "UTC" })}.`
      : "";
    useProductivityStore.getState().addNotification({
      category: "administrative",
      title:    editing ? `📅 Event updated: ${data.title}` : `📅 New event: ${data.title}`,
      body:     editing
        ? `"${data.title}" on ${eventDateLabel} was updated. Visible to: ${audienceLabel}.${deadlineNote}`
        : `"${data.title}" added on ${eventDateLabel}. Visible to: ${audienceLabel}.${deadlineNote}`,
      href: "/principal/calendar",
    });

    setFormOpen(false);
    setEditing(null);
    clearCalDraft();
    setFormType("EVENT");
    setFormAudience("EVERYONE");
    setFormOpeningDate("");
    setFormClosingDate("");
    setFormIsDeadline(false);
    setFormDeadlineDate("");
  }

  async function handleDelete(e: CalendarEventItem) {
    if (!confirm(`Delete "${e.title}"? This can't be undone.`)) return;
    const res  = await fetch(`/api/calendar/events/${e.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Couldn't delete event."); return; }

    // Remove from store immediately.
    useCalendarStore.getState().remove(e.id);
    if (selectedDate && (eventsByDate.get(selectedDate) ?? []).length <= 1) {
      setSelectedDate(null);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedDayEvents = selectedDate ? (eventsByDate.get(selectedDate) ?? []) : [];
  const isCurrentMonth    = year === todayDate.getUTCFullYear() && month === todayDate.getUTCMonth() + 1;

  // Show spinner only while IDB hydration is running and store is empty.
  const showLoading = storeLoading && storeEvents.length === 0 && !apiFallback;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            className="text-ink hover:text-royal transition-colors text-xl leading-none"
            onClick={() => goToMonth(-1)}
            title="Previous month"
          >
            &lt;
          </button>
          <button
            className="flex items-center gap-2 text-ink hover:text-royal transition-colors cursor-pointer"
            onClick={() => setMonthPickerOpen(!monthPickerOpen)}
            title="Navigate to month/year"
          >
            <span className="text-lg">📅</span>
            <h2 className="font-display text-lg font-semibold min-w-[10rem] text-center">
              {MONTH_NAMES[month - 1]} {year}
            </h2>
          </button>
          <button
            className="text-ink hover:text-royal transition-colors text-xl leading-none"
            onClick={() => goToMonth(1)}
            title="Next month"
          >
            &gt;
          </button>
        </div>
        {!isCurrentMonth && (
          <button
            className="text-sm text-royal hover:underline"
            onClick={() => { setYear(todayDate.getUTCFullYear()); setMonth(todayDate.getUTCMonth() + 1); }}
          >
            Back to today
          </button>
        )}
      </div>

      {/* Month/year picker */}
      {monthPickerOpen && (
        <div className="mb-4 p-4 bg-card border border-line rounded-lg">
          <div className="grid grid-cols-4 gap-2 mb-4">
            {MONTH_NAMES.map((m, i) => (
              <button
                key={m}
                onClick={() => { setMonth(i + 1); setMonthPickerOpen(false); }}
                className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
                  month === i + 1 ? "bg-teal text-white" : "bg-paper text-ink hover:bg-line"
                }`}
              >
                {m.slice(0, 3)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className={labelClass + " mb-0"}>Year:</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className={inputClass + " flex-1"}
            >
              {Array.from({ length: 10 }, (_, i) => todayDate.getUTCFullYear() - 5 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {loadError && <ErrorBanner message={loadError} />}

      {/* Calendar grid */}
      {showLoading ? (
        <p className="text-slate text-sm">Loading…</p>
      ) : (
        <div className="bg-card border border-line rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line text-xs font-medium text-slate">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="px-2 py-2 text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((date, i) => {
              if (!date) return (
                <div key={`blank-${i}`} className="border-b border-r border-line min-h-[92px]" />
              );
              const dayEvents = eventsByDate.get(date) ?? [];
              const isToday   = date === ymd(todayDate);
              const dayNum    = Number(date.slice(8, 10));
              return (
                <button
                  key={date}
                  onClick={() => openDay(date)}
                  className={`text-left border-b border-r border-line min-h-[92px] p-1.5 hover:bg-paper transition-colors ${
                    isToday ? "bg-royal-50/50" : ""
                  }`}
                >
                  <span className={`text-xs inline-flex items-center justify-center h-5 w-5 rounded-full ${
                    isToday ? "bg-royal text-white font-medium" : "text-slate"
                  }`}>
                    {dayNum}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 2).map((e) => (
                      <div key={e.id} className="flex items-center gap-1 truncate">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${TYPE_DOT[e.type]}`} />
                        <span className="text-[11px] text-ink truncate">{e.title}</span>
                        {/* Small clock icon for deadline events */}
                        {e.source === "SCHOOL" && e.closingDate &&
                          e.type !== "HOLIDAY" && e.type !== "EXAM" &&
                          new Date(`${e.closingDate}T23:59:59Z`) >= new Date() && (
                            <span className="text-[9px] shrink-0" title="Has deadline">⏰</span>
                          )}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <p className="text-[11px] text-slate">+{dayEvents.length - 2} more</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Day detail modal */}
      {selectedDate && (
        <Modal
          title={new Date(`${selectedDate}T00:00:00Z`).toLocaleDateString("en-KE", {
            weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
          })}
          onClose={() => setSelectedDate(null)}
        >
          {selectedDayEvents.length === 0 ? (
            <EmptyState message="No events on this day." />
          ) : (
            <ul className="space-y-3 mb-4">
              {selectedDayEvents.map((e) => (
                <li key={e.id} className="border border-line rounded-md p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-ink flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${TYPE_DOT[e.type]}`} />
                        {e.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-xs text-slate">
                          {e.source === "KENYA_HOLIDAY" ? "Kenya public holiday" : TYPE_LABELS[e.type]}
                        </p>
                        {e.source === "SCHOOL" && (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${AUDIENCE_BADGE[e.audience]}`}>
                            {AUDIENCE_LABELS[e.audience]}
                          </span>
                        )}
                        {/* Deadline countdown badge — shown when closingDate is in the future
                            and the event is not a multi-day HOLIDAY/EXAM range */}
                        {e.source === "SCHOOL" &&
                          e.closingDate &&
                          e.type !== "HOLIDAY" && e.type !== "EXAM" &&
                          new Date(`${e.closingDate}T23:59:59Z`) >= new Date() && (
                            <DeadlineInlineCountdown deadlineDate={e.closingDate} />
                          )}
                      </div>
                      {e.description && (
                        <p className="text-sm text-slate mt-1">{e.description}</p>
                      )}
                    </div>
                    {canManage && e.source === "SCHOOL" && (
                      <div className="flex gap-2 shrink-0 whitespace-nowrap">
                        <button className="text-sm text-ink hover:underline" onClick={() => openEdit(e)}>
                          Edit
                        </button>
                        <button className={dangerLinkClass} onClick={() => handleDelete(e)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {canManage && (
            <button className={primaryButtonClass} onClick={() => openCreate(selectedDate)}>
              Add event
            </button>
          )}
        </Modal>
      )}

      {/* Create / edit form modal */}
      {formOpen && (
        <Modal
          title={editing ? "Edit event" : "Add event"}
          onClose={() => setFormOpen(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && <ErrorBanner message={formError} />}
            <div>
              <label className={labelClass}>Type</label>
              <select
                name="type"
                value={formType}
                onChange={(e) => setFormType(e.target.value as EventType)}
                className={inputClass}
              >
                {(Object.keys(TYPE_LABELS) as EventType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Visible to</label>
              <select
                name="audience"
                value={formIsDeadline ? "STAFF_ONLY" : formAudience}
                onChange={(e) => setFormAudience(e.target.value as CalendarAudience)}
                disabled={formIsDeadline}
                className={inputClass + (formIsDeadline ? " opacity-50 cursor-not-allowed" : "")}
              >
                {(Object.keys(AUDIENCE_LABELS) as CalendarAudience[]).map((a) => (
                  <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>
                ))}
              </select>
              {formIsDeadline && (
                <p className="text-xs text-slate mt-1">
                  Locked to <strong>Staff only</strong> — deadlines are always visible to all teachers.
                </p>
              )}
            </div>

            {/* ── Deadline toggle (only for non-range event types) ── */}
            {formType !== "HOLIDAY" && formType !== "EXAM" && (
              <div className="rounded-lg border border-line bg-paper px-4 py-3 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formIsDeadline}
                    onChange={(ev) => {
                      setFormIsDeadline(ev.target.checked);
                      if (!ev.target.checked) setFormDeadlineDate("");
                      // Force staff-only when enabling
                      if (ev.target.checked) setFormAudience("STAFF_ONLY");
                    }}
                    className="h-4 w-4 rounded border-line text-teal focus:ring-teal"
                  />
                  <span className="text-sm font-medium text-ink">
                    ⏰ Set as deadline for all teachers
                  </span>
                </label>
                {formIsDeadline && (
                  <div>
                    <label className={labelClass}>Deadline date</label>
                    <input
                      type="date"
                      value={formDeadlineDate}
                      onChange={(ev) => setFormDeadlineDate(ev.target.value)}
                      required={formIsDeadline}
                      min={ymd(new Date())}
                      className={inputClass}
                    />
                    <p className="text-xs text-slate mt-1">
                      Teachers will see a live countdown on their dashboard until this date.
                    </p>
                  </div>
                )}
              </div>
            )}
            <div>
              <label className={labelClass}>Title</label>
              <input
                name="title"
                required
                defaultValue={editing?.title}
                className={inputClass}
                placeholder="e.g. Mid-term break begins"
              />
            </div>
            {formType === "HOLIDAY" || formType === "EXAM" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>
                    {formType === "EXAM" ? "Start date" : "Closing date"}
                  </label>
                  <input
                    type="date"
                    name="closingDate"
                    value={formClosingDate}
                    onChange={(e) => setFormClosingDate(e.target.value)}
                    required={!formOpeningDate}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    {formType === "EXAM" ? "End date" : "Opening date"}
                  </label>
                  <input
                    type="date"
                    name="openingDate"
                    value={formOpeningDate}
                    onChange={(e) => setFormOpeningDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className={labelClass}>Date</label>
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={editing?.date.slice(0, 10) || selectedDate || undefined}
                  className={inputClass}
                />
              </div>
            )}
            <div>
              <label className={labelClass}>Description (optional)</label>
              <textarea
                name="description"
                defaultValue={editing?.description || ""}
                className={inputClass}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => {
                  setFormOpen(false);
                  setFormType("EVENT");
                  setFormAudience("EVERYONE");
                  setFormOpeningDate("");
                  setFormClosingDate("");
                  setFormIsDeadline(false);
                  setFormDeadlineDate("");
                }}
              >
                Cancel
              </button>
              <button type="submit" className={primaryButtonClass}>
                {editing ? "Save changes" : "Add event"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
