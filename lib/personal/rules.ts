import { publicSpan } from "../booking/slots";
import { weekdayIndex } from "./time";
import type { DayKey, DayRule, LeadRole, LoadCondition, PlanDay, Rules, WeekdayKey } from "./types";

export function openingOf(date: string): { start: number; end: number } | null {
  return publicSpan(date);
}

const weekdayByIndex: WeekdayKey[] = ["so", "mo", "di", "mi", "do", "fr", "sa"];

export function weekdayKeyOf(date: string): WeekdayKey {
  return weekdayByIndex[weekdayIndex(date)]!;
}

export function dayKeyFor(day: PlanDay, rules: Pick<Rules, "holidayRuleFirst">): DayKey {
  if (day.holiday && rules.holidayRuleFirst) return "feiertag";
  return weekdayKeyOf(day.date);
}

export function defaultRules(): Rules {
  const rule = (min: number, max: number, leadRole: LeadRole): DayRule => ({
    min,
    max,
    leadRole,
    requireKasse: true,
    requireReinigung: true,
  });
  return {
    days: {
      mo: rule(1, 3, "none"),
      di: rule(1, 3, "none"),
      mi: rule(2, 4, "none"),
      do: rule(2, 4, "none"),
      fr: rule(2, 4, "schichtleiter"),
      sa: rule(3, 5, "schichtleiter"),
      so: rule(3, 5, "schichtleiter"),
      feiertag: rule(3, 5, "schichtleiter"),
    },
    conditions: [
      { id: "cond-sa", day: "sa", fromGuests: 100, extra: 1, from: 11 * 60, to: 15 * 60 },
      { id: "cond-so", day: "so", fromGuests: 90, extra: 1 },
    ],
    autoSpecialOpenings: true,
    holidayRuleFirst: true,
    specialOpeningLead: 15,
    cleaning: [
      { id: "clean-sanitaer", label: "Sanitärreinigung vor Öffnung", days: ["mo", "di", "mi", "do", "fr"], start: 8 * 60 + 30, end: 10 * 60, enabled: true },
    ],
  };
}

export function clampRule(rule: DayRule): DayRule {
  const min = Math.max(0, Math.min(9, Math.round(rule.min)));
  const max = Math.max(min, Math.min(9, Math.round(rule.max)));
  return { ...rule, min, max };
}

export function ruleSummary(rule: DayRule): string {
  return rule.min === rule.max ? `${rule.min} Pers.` : `${rule.min}–${rule.max} Pers.`;
}

export type Headcount = {
  base: number;
  extra: number;
  uncapped: number;
  capped: number;
  capReached: boolean;
  condition: LoadCondition | null;
};

export function conditionMatches(condition: LoadCondition, key: DayKey, guests: number, minute: number): boolean {
  if (condition.day !== key) return false;
  if (guests < condition.fromGuests) return false;
  if (condition.from !== undefined && minute < condition.from) return false;
  if (condition.to !== undefined && minute >= condition.to) return false;
  return true;
}

export function requiredHeadcount(rules: Rules, key: DayKey, guests: number, minute: number): Headcount {
  const rule = rules.days[key];
  let strongest: LoadCondition | null = null;
  for (const condition of rules.conditions) {
    if (!conditionMatches(condition, key, guests, minute)) continue;
    if (!strongest || condition.extra > strongest.extra) strongest = condition;
  }
  const base = rule.min;
  const extra = strongest?.extra ?? 0;
  const uncapped = base + extra;
  const capped = Math.min(uncapped, rule.max);
  return { base, extra, uncapped, capped, capReached: uncapped > rule.max, condition: strongest };
}

export function walkInEstimate(day: PlanDay, key: DayKey): number {
  const base = key === "sa" || key === "so" || key === "feiertag" ? 30 : 15;
  const factor = day.weather.rainPercent >= 70 ? 1.5 : day.weather.rainPercent >= 40 ? 1.2 : 1;
  return Math.round(base * factor);
}

export function bookedGuestsAt(day: PlanDay, minute: number): number {
  let guests = 0;
  for (const booking of day.bookings) {
    if (minute >= booking.start && minute < booking.end) guests += booking.children + booking.adults;
  }
  return guests;
}

export function expectedGuestsAt(day: PlanDay, key: DayKey, minute: number): number {
  const opening = openingOf(day.date);
  const regular = opening !== null && minute >= opening.start && minute < opening.end;
  return bookedGuestsAt(day, minute) + (regular ? walkInEstimate(day, key) : 0);
}

export function leadRoleRank(role: LeadRole): number {
  return role === "leitung" ? 2 : role === "schichtleiter" ? 1 : 0;
}

export function roleRank(role: string): number {
  return role === "leitung" ? 2 : role === "schichtleiter" ? 1 : 0;
}

export function nextId(prefix: string, taken: readonly { id: string }[]): string {
  let index = taken.length + 1;
  while (taken.some((item) => item.id === `${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}
