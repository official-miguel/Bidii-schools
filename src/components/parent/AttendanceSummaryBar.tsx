/**
 * AttendanceSummaryBar
 *
 * Renders three stat boxes showing Present days (green), Absent days (red),
 * and Attendance % (teal when ≥ 80%, warn-orange when < 80%).
 *
 * Requirements: 6.2, 6.3
 */

interface AttendanceSummaryBarProps {
  totalPresent: number;
  totalAbsent:  number;
  percentage:   number | null;
}

export default function AttendanceSummaryBar({
  totalPresent,
  totalAbsent,
  percentage,
}: AttendanceSummaryBarProps) {
  // Three-tier colour coding: ≥80% = teal, 60–79% = warn/orange, <60% = danger
  const isDanger = percentage !== null && percentage < 60;
  const isWarn   = percentage !== null && percentage >= 60 && percentage < 80;

  const rateColorClass = isDanger
    ? "border-danger/20 bg-danger-bg"
    : isWarn
    ? "border-warn/20 bg-warn-bg"
    : "border-teal/20 bg-teal/5";

  const rateTextClass = isDanger
    ? "text-danger"
    : isWarn
    ? "text-warn"
    : "text-teal";

  const rateLabelClass = isDanger
    ? "text-danger/80"
    : isWarn
    ? "text-warn/80"
    : "text-teal/80";

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Present */}
      <div className="rounded-xl border border-success/20 bg-success-bg p-4 text-center">
        <p className="text-2xl font-bold text-success">{totalPresent}</p>
        <p className="text-xs font-medium text-success/80 mt-0.5">Present</p>
      </div>

      {/* Absent */}
      <div className="rounded-xl border border-danger/20 bg-danger-bg p-4 text-center">
        <p className="text-2xl font-bold text-danger">{totalAbsent}</p>
        <p className="text-xs font-medium text-danger/80 mt-0.5">Absent</p>
      </div>

      {/* Percentage */}
      <div className={`rounded-xl border p-4 text-center ${rateColorClass}`}>
        <p className={`text-2xl font-bold ${rateTextClass}`}>
          {percentage !== null ? `${percentage}%` : "—"}
        </p>
        <p className={`text-xs font-medium mt-0.5 ${rateLabelClass}`}>
          Attendance
        </p>
      </div>
    </div>
  );
}
