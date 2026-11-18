import { durationLabel, formatTime } from "./time";
import type { Correction, Punch, Shift } from "./types";

export const REASON_MAX = 500;

export function workedMinutes(punch: Punch, now: number): number {
  return Math.max(0, (punch.end ?? now) - punch.start);
}

export function validateCorrection(punch: Punch, field: "start" | "end", to: number | null, reason: string): string | null {
  if (to === null) return "Bitte eine gültige Uhrzeit eingeben.";
  if (field === "start" && punch.end !== null && to >= punch.end) return "Der Beginn muss vor dem Ende liegen.";
  if (field === "end" && to <= punch.start) return "Das Ende muss nach dem Beginn liegen.";
  if (field === "end" && punch.end === null) return "Eine laufende Schicht hat noch kein Ende.";
  if ((field === "start" ? punch.start : punch.end) === to) return "Die Uhrzeit ist unverändert.";
  if (!reason.trim()) return "Bitte einen Grund angeben.";
  if (reason.trim().length > REASON_MAX) return `Der Grund darf höchstens ${REASON_MAX} Zeichen haben.`;
  return null;
}

export function plannedShiftFor(shifts: readonly Shift[], punch: Punch): Shift | undefined {
  return shifts
    .filter((shift) => shift.employeeId === punch.employeeId && shift.date === punch.date && shift.kind === "service")
    .sort((a, b) => Math.abs(a.start - punch.start) - Math.abs(b.start - punch.start))[0];
}

export function startDeviation(shift: Shift | undefined, punch: Punch): string | null {
  if (!shift) return null;
  const diff = punch.start - shift.start;
  if (Math.abs(diff) < 5) return null;
  return diff < 0 ? `${durationLabel(-diff)} früher als geplant` : `${durationLabel(diff)} später als geplant`;
}

export function correctionSummary(correction: Correction): string {
  const field = correction.field === "start" ? "Beginn" : "Ende";
  const from = correction.from === null ? "—" : formatTime(correction.from);
  return `${field}: ${from} → ${formatTime(correction.to)}`;
}

export function openCorrections(corrections: readonly Correction[]): Correction[] {
  return corrections.filter((item) => item.status === "offen");
}
