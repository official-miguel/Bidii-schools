"use client";
/**
 * SlotEditModal — edit or add a single timetable slot.
 *
 * Clash-prevention rules:
 *  • Live conflict detection runs on every subject/teacher change.
 *  • If ANY error-severity conflict is detected the Save button is disabled
 *    and a prominent red banner explains exactly what the clash is.
 *  • "Busy" teachers (already teaching this period in another class) are shown
 *    in red and cannot be saved — the conflict guard catches them even if
 *    selected.
 *  • Teachers are re-filtered for eligibility whenever the selected subject
 *    changes, so the eligible list always reflects the current subject choice.
 *  • Warnings (non-blocking) show an amber banner but allow saving.
 *
 * Teacher-pinning rule (edit mode only):
 *  • The teacher for a class–subject pair is set once (ClassSubjectTeacher)
 *    and must not be changed here — every lesson for that subject stays with
 *    that teacher. The field is therefore shown read-only when editing an
 *    existing slot.  To reassign the teacher, use the Staff / Subjects page.
 */
import { useState, useMemo, useEffect } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, Ban, Lock } from "lucide-react";
import Modal from "@/components/Modal";
import {
  inputClass, labelClass, primaryButtonClass, secondaryButtonClass, ErrorBanner,
} from "@/components/ui";
import {
  detectLiveConflicts, classKey, type LiveSlot, type ConflictEngineConfig,
} from "@/lib/timetable/liveConflictDetector";

export type TeacherOption = {
  id:            string;
  fullName:      string;
  isEligible:    boolean;           // assigned to this subject
  isBusy:        boolean;           // already booked in this slot
  isUnavailable: boolean;           // marked unavailable this slot
  /** Subject IDs this teacher is assigned to — used for live eligibility re-check */
  subjectIds?:   string[];
};

type Props = {
  /** null = add mode, non-null = edit mode */
  slot: LiveSlot | null;
  targetDay:    number;
  targetPeriod: number;
  classId:      string;
  className:    string;
  subjects:     Array<{ id: string; name: string; code: string; isGroup?: boolean; groupId?: string }>;
  teachers:     TeacherOption[];
  allSlots:     LiveSlot[];       // current full timetable for live preview
  conflictCfg:  ConflictEngineConfig;
  saving:       boolean;
  error:        string | null;
  onSave:       (subjectId: string, teacherId: string, room: string | null) => void;
  onClose:      () => void;
};

export default function SlotEditModal({
  slot, targetDay, targetPeriod, classId, className,
  subjects, teachers, allSlots, conflictCfg,
  saving, error, onSave, onClose,
}: Props) {
  const [subjectId, setSubjectId] = useState(slot?.subjectId ?? "");
  const [teacherId, setTeacherId] = useState(slot?.teacherId ?? "");
  const [room,      setRoom]      = useState(slot?.room ?? "");

  // Check if the selected subject is a group
  const selectedSubject = subjects.find((s) => s.id === subjectId);
  const isGroupSubject = selectedSubject?.isGroup ?? false;

  useEffect(() => {
    setSubjectId(slot?.subjectId ?? "");
    setTeacherId(slot?.teacherId ?? "");
    setRoom(slot?.room ?? "");
  }, [slot]);

  // Re-compute eligibility against the *currently selected* subject, not the
  // original slot subject. This ensures the teacher list is always accurate
  // when the user switches subjects inside the modal.
  const eligible = useMemo(
    () => teachers.filter((t) =>
      t.subjectIds
        ? t.subjectIds.includes(subjectId)
        : t.isEligible                        // fall back to pre-computed flag
    ),
    [teachers, subjectId]
  );

  // Build a preview slot and run conflict detection client-side
  const previewConflicts = useMemo(() => {
    // For groups, teacher is not required
    if (!subjectId || (!isGroupSubject && !teacherId)) return null;
    const sub = subjects.find((s) => s.id === subjectId);
    if (!sub) return null;

    // Replace or add the preview slot
    const preview: LiveSlot = {
      id: slot?.id ?? "__preview__",
      classId, className, dayOfWeek: targetDay, period: targetPeriod,
      subjectId, subjectCode: sub.code, 
      teacherId: isGroupSubject ? "GROUP_PLACEHOLDER" : teacherId,
      teacherName: isGroupSubject ? "Group" : (teachers.find((t) => t.id === teacherId)?.fullName ?? ""),
      room: room || null, isDouble: false,
      isManual: true, isLocked: false,
    };

    const withPreview = slot
      ? allSlots.map((s) => (s.id === slot.id ? preview : s))
      : [...allSlots, preview];

    const result = detectLiveConflicts(withPreview, conflictCfg);
    const ck     = classKey(classId, targetDay, targetPeriod);
    return result.conflictMap.get(ck) ?? [];
  }, [subjectId, teacherId, room, slot, allSlots, conflictCfg, classId, className, targetDay, targetPeriod, subjects, teachers, isGroupSubject]);

  const hasBlocker = previewConflicts?.some((c) => c.severity === "error") ?? false;

  const dayLabel = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][targetDay] ?? `Day ${targetDay}`;
  const title    = slot ? `Edit lesson — ${dayLabel} · P${targetPeriod}` : `Add lesson — ${dayLabel} · P${targetPeriod}`;

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        {error && <ErrorBanner message={error} />}

        {/* Subject */}
        <div>
          <label className={labelClass}>Subject <span className="text-danger">*</span></label>
          <select value={subjectId}
            onChange={(e) => { setSubjectId(e.target.value); setTeacherId(""); }}
            className={inputClass}>
            <option value="">Select a subject…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </select>
        </div>

        {/* Teacher
             Edit mode: teacher is pinned per class-subject pair (ClassSubjectTeacher)
             and cannot be changed here. Show it read-only with an explanation.
             Add mode: show the full interactive picker as before.
             Group subjects: teachers are not required, show info message.
        */}
        {!isGroupSubject && (
          <div>
            <label className={labelClass}>Teacher {!slot && <span className="text-danger">*</span>}</label>

            {slot ? (
              /* ── Edit mode: read-only teacher display ─────────────────── */
              <div className="mt-1">
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-background text-sm">
                  <Lock className="h-4 w-4 text-slate shrink-0" aria-hidden />
                  <span className="flex-1 font-medium text-foreground truncate">
                    {teachers.find((t) => t.id === teacherId)?.fullName ?? teacherId}
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                    Pinned
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-slate leading-relaxed">
                  The teacher for this subject is fixed for this class. To reassign, update the
                  class–subject assignment in <strong>Staff → Subjects</strong>.
                </p>
              </div>
            ) : (
              /* ── Add mode: interactive teacher picker ─────────────────── */
              !subjectId ? (
                <p className="text-xs text-slate mt-1">Choose a subject first.</p>
              ) : eligible.length === 0 ? (
                <p className="text-xs text-warn mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  No teacher is assigned to this subject. Assign one from Staff first.
                </p>
              ) : (
                <div className="space-y-1.5 mt-1 max-h-48 overflow-y-auto">
                  {eligible.map((t) => {
                    const active = teacherId === t.id;
                    const status =
                      t.isBusy        ? "busy" :
                      t.isUnavailable ? "unavail" : "free";
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTeacherId(t.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left
                          transition-colors text-sm
                          ${active
                            ? "bg-teal/10 border-teal text-foreground"
                            : status === "busy"
                              ? "bg-danger/5 border-danger/30 text-foreground"
                              : status === "unavail"
                                ? "bg-warn-bg border-warn/30 text-foreground"
                                : "bg-card border-border text-foreground hover:border-teal/40"
                          }`}
                        aria-pressed={active}
                      >
                        {active
                          ? <CheckCircle2 className="h-4 w-4 text-teal shrink-0" aria-hidden />
                          : status === "busy"
                            ? <AlertCircle  className="h-4 w-4 text-danger shrink-0" aria-label="Already booked" />
                            : status === "unavail"
                              ? <Clock        className="h-4 w-4 text-warn   shrink-0" aria-label="Marked unavailable" />
                              : <span className="h-4 w-4 rounded-full bg-success/30 shrink-0" aria-label="Available" />
                        }
                        <span className="flex-1 truncate font-medium">{t.fullName}</span>
                        {status !== "free" && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0
                            ${status === "busy" ? "bg-danger/10 text-danger" : "bg-warn/10 text-warn"}`}>
                            {status === "busy" ? "Busy this period" : "Unavailable"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )
            )}
          </div>
        )}

        {/* Group subject info */}
        {isGroupSubject && (
          <div className="rounded-lg border border-teal/30 bg-teal/5 px-3 py-2.5">
            <p className="text-xs text-teal font-medium flex items-center gap-1.5">
              <span className="text-base">🔀</span>
              Elective group
            </p>
            <p className="text-xs text-slate mt-1 leading-relaxed">
              Teachers for group subjects are assigned per subject within the group in the class profile.
              No teacher selection needed here.
            </p>
          </div>
        )}

        {/* Room */}
        <div>
          <label className={labelClass}>Room (optional)</label>
          <input value={room} onChange={(e) => setRoom(e.target.value)}
            className={inputClass} placeholder="e.g. Lab 1, Room 4A" />
        </div>

        {/* Live conflict preview */}
        {previewConflicts && previewConflicts.length > 0 && (
          <div className={`rounded-xl border p-3 space-y-2
            ${hasBlocker ? "bg-danger/5 border-danger/25" : "bg-warn-bg border-warn/25"}`}>
            <p className={`text-xs font-semibold flex items-center gap-1.5
              ${hasBlocker ? "text-danger" : "text-warn"}`}>
              {hasBlocker
                ? <><Ban className="h-3.5 w-3.5" aria-hidden /> Save blocked — teacher clash</>
                : <><AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Warning</>
              }
            </p>
            <ul className="space-y-1">
              {previewConflicts.map((c, i) => (
                <li key={i} className={`text-xs leading-relaxed flex items-start gap-1.5
                  ${c.severity === "error" ? "text-danger" : "text-foreground/80"}`}>
                  {c.severity === "error"
                    ? <AlertCircle className="h-3 w-3 shrink-0 mt-0.5 text-danger" aria-hidden />
                    : <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-warn" aria-hidden />
                  }
                  {c.message}
                </li>
              ))}
            </ul>
            {hasBlocker && (
              <p className="text-xs text-danger/80 border-t border-danger/15 pt-2">
                Choose a different teacher or time slot to resolve the clash before saving.
              </p>
            )}
            {!hasBlocker && (
              <p className="text-xs text-slate">You can still save — resolve the warning afterwards.</p>
            )}
          </div>
        )}
        {previewConflicts?.length === 0 && subjectId && (isGroupSubject || teacherId) && (
          <div className="flex items-center gap-2 text-xs text-success bg-success-bg border border-success/20 rounded-lg px-3 py-2">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> No conflicts — good to save.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>Cancel</button>
          <button type="button"
            className={primaryButtonClass}
            disabled={saving || !subjectId || (!isGroupSubject && !teacherId) || hasBlocker}
            title={hasBlocker ? "Resolve the teacher clash above before saving" : undefined}
            onClick={() => onSave(subjectId, isGroupSubject ? "GROUP_PLACEHOLDER" : teacherId, room || null)}
          >
            {saving ? "Saving…" : slot ? "Save changes" : "Add lesson"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
