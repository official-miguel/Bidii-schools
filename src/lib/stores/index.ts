/**
 * src/lib/stores/index.ts
 *
 * Barrel re-export for all Zustand stores.
 */

export { useAttendanceStore }  from "./attendanceStore";
export { useAssessmentStore }  from "./assessmentStore";
export { useLibraryStore }     from "./libraryStore";
export { useCirculationStore } from "./circulationStore";
export { useTimetableStore }   from "./timetableStore";
export { useCalendarStore }    from "./calendarStore";
export { useDisciplineStore }  from "./disciplineStore";
export { useStaffRolesStore }  from "./staffRolesStore";
export { useExamPeriodsStore } from "./examPeriodsStore";
export { useSyncStatusStore }  from "./syncStatusStore";
export { useParentStore }      from "./parentStore";
export type { ChildSummary }   from "./parentStore";
