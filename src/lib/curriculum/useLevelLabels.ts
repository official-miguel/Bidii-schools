"use client";

/**
 * src/lib/curriculum/useLevelLabels.ts
 *
 * Client hook for screens that hold a bare level number (a library book's
 * target level, a fee structure's form) and no class row to read the name off.
 * It loads the school's classes once and hands back a resolver, so the number
 * renders as the level the school actually saved — "Grade 9", not "Form 9".
 */

import { useEffect, useMemo, useState } from "react";
import {
  buildLevelLabelMap, levelLabelFor, levelNounFor, allLevelsLabelFor,
  type ClassOption,
} from "./classLabels";

export function useLevelLabels() {
  const [classes, setClasses] = useState<ClassOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/classes")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (!cancelled) setClasses(Array.isArray(d) ? d : []); })
      .catch(() => { /* labels fall back to the plain rank */ });
    return () => { cancelled = true; };
  }, []);

  const labels = useMemo(() => buildLevelLabelMap(classes), [classes]);

  return useMemo(() => ({
    classes,
    /** "Form 3" / "Grade 11" / "PP1" for a level number. */
    levelLabel: (form: number) => levelLabelFor(labels, form),
    /** "form" / "grade" / "level", matching what the school runs. */
    levelNoun: levelNounFor(classes),
    /** "All forms" / "All grades" / "All levels". */
    allLevelsLabel: allLevelsLabelFor(classes),
  }), [classes, labels]);
}
