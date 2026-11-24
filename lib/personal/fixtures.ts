import { birthdayPackages } from "../../packages/contracts/src/reservations";
import { toMinute, windowsFor } from "../booking/slots";
import { makeAvailability } from "./availability";
import { proposeWeek } from "./plan";
import { defaultRules } from "./rules";
import { addDays, mondayOf } from "./time";
import type {
  Employee,
  PersonalState,
  PlanBooking,
  PlanDay,
  PlanWeek,
  Punch,
  Shift,
  SkillKey,
  WeatherSymbol,
} from "./types";

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

function skills(...on: SkillKey[]): Employee["skills"] {
  return {
    kasse: on.includes("kasse"),
    reinigung: on.includes("reinigung"),
    oeffnung: on.includes("oeffnung"),
    stosszeit: on.includes("stosszeit"),
  };
}

export const demoEmployees: Employee[] = [
  { id: "ma", name: "Mitarbeiter A", role: "mitarbeiter", targetHours: 12, maxHours: 18, priority: "bevorzugt", skills: skills("kasse", "stosszeit") },
  { id: "mb", name: "Mitarbeiter B", role: "schichtleiter", targetHours: 20, maxHours: 28, priority: "standard", skills: skills("kasse", "oeffnung", "stosszeit") },
  { id: "mc", name: "Mitarbeiter C", role: "mitarbeiter", targetHours: 15, maxHours: 20, priority: "standard", skills: skills("kasse", "reinigung") },
  { id: "md", name: "Mitarbeiter D", role: "reinigungskraft", targetHours: 8, maxHours: 12, priority: "standard", skills: skills("reinigung") },
  { id: "me", name: "Mehdi", role: "leitung", targetHours: 40, maxHours: 45, priority: "bevorzugt", skills: skills("kasse", "reinigung", "oeffnung", "stosszeit") },
  { id: "mf", name: "Omar", role: "mitarbeiter", targetHours: 30, maxHours: 36, priority: "standard", skills: skills("kasse", "reinigung", "stosszeit") },
  { id: "mg", name: "Tugba", role: "mitarbeiter", targetHours: 25, maxHours: 32, priority: "standard", skills: skills("kasse", "stosszeit") },
];

function demoAvailability(): PersonalState["availability"] {
  return {
    ma: makeAvailability({ mo: [h(17), h(19)], di: [h(14), h(19)], do: [h(16), h(19)], fr: [h(14), h(19)], sa: [h(10), h(19)] }),
    mb: makeAvailability({ mi: [h(10), h(19)], do: [h(10), h(19)], fr: [h(10), h(19)], sa: [h(10), h(19)], so: [h(10), h(19)] }),
    mc: makeAvailability({ mo: [h(10), h(19)], di: [h(10), h(19)], mi: [h(10), h(19)], sa: [h(10), h(19)], so: [h(10), h(19)] }),
    md: makeAvailability({ mo: [h(8), h(12)], di: [h(8), h(12)], mi: [h(8), h(12)], do: [h(8), h(12)], fr: [h(8), h(12)] }),
    me: makeAvailability({ mo: [h(10), h(19)], di: [h(10), h(19)], mi: [h(10), h(19)], do: [h(10), h(19)], fr: [h(10), h(19)], sa: [h(10), h(19)] }),
    mf: makeAvailability({ mi: [h(10), h(19)], do: [h(10), h(19)], fr: [h(10), h(19)], sa: [h(10), h(19)], so: [h(10), h(19)] }),
    mg: makeAvailability({ mo: [h(14), h(19)], do: [h(12), h(19)], fr: [h(12), h(19)], sa: [h(12), h(19)], so: [h(12), h(19)] }),
  };
}

let bookingCounter = 0;
function booking(kind: PlanBooking["kind"], name: string, start: number, end: number, children: number, adults: number): PlanBooking {
  bookingCounter += 1;
  return { id: `b-${bookingCounter}`, kind, name, start, end, children, adults };
}

const birthday = (name: string, start: number, end: number, children: number, adults: number) =>
  booking("geburtstag", `Geburtstag · ${name}`, start, end, children, adults);

const partyMinutes = birthdayPackages[0].durationMinutes;
if (birthdayPackages.some((item) => item.durationMinutes !== partyMinutes)) {
  throw new Error("Comfort und Deluxe haben unterschiedliche Dauern.");
}

function party(date: string, slot: number, name: string, children: number, adults: number): PlanBooking {
  const window = windowsFor(date, "birthday")[slot];
  const start = window ? toMinute(window.start) : null;
  const windowEnd = window ? toMinute(window.end) : null;
  if (start === null || windowEnd === null || start + partyMinutes > windowEnd) {
    throw new Error(`Geburtstag ${name} passt am ${date} in kein Reservierungsfenster.`);
  }
  return birthday(name, start, start + partyMinutes, children, adults);
}

function kitaVisit(date: string, name: string, children: number, adults: number): PlanBooking {
  const window = windowsFor(date, "group")[0];
  const start = window ? toMinute(window.start) : null;
  const end = window ? toMinute(window.end) : null;
  if (start === null || end === null) throw new Error(`Kita-Besuch ${name} hat am ${date} kein Fenster.`);
  return booking("kita", name, start, end, children, adults);
}

function day(
  date: string,
  temperature: number,
  rainPercent: number,
  symbol: WeatherSymbol,
  bookings: PlanBooking[],
  extra: Partial<Pick<PlanDay, "holiday" | "ferien">> = {},
): PlanDay {
  return { date, weather: { temperature, rainPercent, symbol }, bookings, ...extra };
}

export function buildWeeks(): PlanWeek[] {
  bookingCounter = 0;
  const november: PlanWeek = {
    id: "2026-11-02",
    start: "2026-11-02",
    end: "2026-11-08",
    days: [
      day("2026-11-02", 13, 20, "wolken", [party("2026-11-02", 0, "Familie Keller", 9, 4)]),
      day("2026-11-03", 12, 10, "sonne", []),
      day("2026-11-04", 11, 75, "regen", [
        party("2026-11-04", 0, "Familie Braun", 11, 5),
        party("2026-11-04", 0, "Familie Richter", 10, 4),
      ]),
      day("2026-11-05", 11, 45, "wolken", [party("2026-11-05", 0, "Familie Sommer", 11, 5)]),
      day("2026-11-06", 10, 85, "schauer", [kitaVisit("2026-11-06", "Kita Sonnenschein", 52, 14)]),
      day("2026-11-07", 12, 80, "schauer", [
        party("2026-11-07", 0, "Familie Weber", 9, 5),
        party("2026-11-07", 0, "Familie Yilmaz", 9, 5),
        party("2026-11-07", 1, "Familie Fischer", 11, 6),
        party("2026-11-07", 2, "Familie Schmitt", 10, 5),
        party("2026-11-07", 2, "Familie Hoffmann", 10, 5),
        party("2026-11-07", 2, "Familie Wagner", 9, 6),
      ]),
      day("2026-11-08", 13, 35, "teilweise", [
        party("2026-11-08", 0, "Familie Becker", 10, 5),
        party("2026-11-08", 0, "Familie Koch", 10, 5),
        party("2026-11-08", 1, "Familie Bauer", 9, 5),
        party("2026-11-08", 2, "Familie Klein", 11, 6),
        party("2026-11-08", 2, "Familie Wolf", 11, 6),
      ]),
    ],
  };
  const december: PlanWeek = {
    id: "2026-12-21",
    start: "2026-12-21",
    end: "2026-12-27",
    days: [
      day("2026-12-21", 4, 30, "wolken", [party("2026-12-21", 0, "Familie Lang", 8, 4)]),
      day("2026-12-22", 3, 60, "schauer", [
        party("2026-12-22", 0, "Familie Vogel", 10, 4),
        party("2026-12-22", 0, "Familie Roth", 9, 5),
      ]),
      day("2026-12-23", 2, 70, "regen", [
        party("2026-12-23", 0, "Familie Krüger", 9, 5),
        party("2026-12-23", 0, "Familie Berger", 10, 5),
        party("2026-12-23", 0, "Familie Frank", 9, 4),
      ], { ferien: true }),
      day("2026-12-24", 1, 20, "sonne", [party("2026-12-24", 0, "Familie Simon", 8, 4)], { ferien: true }),
      day("2026-12-25", 0, 10, "sonne", [
        party("2026-12-25", 0, "Familie Arnold", 10, 5),
        party("2026-12-25", 1, "Familie Möller", 9, 5),
        party("2026-12-25", 2, "Familie Busch", 10, 5),
        party("2026-12-25", 2, "Familie Graf", 9, 4),
      ], { holiday: "1. Weihnachtstag", ferien: true }),
      day("2026-12-26", 2, 50, "wolken", [
        party("2026-12-26", 0, "Familie Heinz", 10, 5),
        party("2026-12-26", 0, "Familie Albrecht", 9, 5),
        party("2026-12-26", 1, "Familie Lorenz", 11, 5),
        party("2026-12-26", 2, "Familie Franke", 9, 5),
        party("2026-12-26", 2, "Familie Seidel", 10, 5),
        party("2026-12-26", 2, "Familie Ziegler", 10, 5),
      ], { holiday: "2. Weihnachtstag", ferien: true }),
      day("2026-12-27", 3, 65, "regen", [
        party("2026-12-27", 0, "Familie Pohl", 10, 5),
        party("2026-12-27", 1, "Familie Engel", 9, 5),
        party("2026-12-27", 2, "Familie Barth", 10, 5),
        party("2026-12-27", 2, "Familie Voigt", 10, 5),
        party("2026-12-27", 2, "Familie Kraft", 9, 5),
      ], { ferien: true }),
    ],
  };
  return [november, december];
}

export const planWeeks: PlanWeek[] = buildWeeks();

export const PLANNING_WEEK_COUNT = 6;

const quietWeather: PlanDay["weather"] = { temperature: 6, rainPercent: 30, symbol: "wolken" };

function blankWeek(start: string): PlanWeek {
  return {
    id: start,
    start,
    end: addDays(start, 6),
    days: Array.from({ length: 7 }, (_, index) => ({
      date: addDays(start, index),
      weather: quietWeather,
      bookings: [],
    })),
  };
}

export function planningWeekTag(offset: number): string | undefined {
  if (offset === 0) return "Diese Woche";
  if (offset === 1) return "Nächste Woche";
  return undefined;
}

export function planningWeeks(anchor: string, count = PLANNING_WEEK_COUNT): PlanWeek[] {
  const monday = mondayOf(anchor);
  const scripted = new Map(planWeeks.map((week) => [week.id, week]));
  return Array.from({ length: count }, (_, index) => {
    const start = addDays(monday, index * 7);
    return scripted.get(start) ?? blankWeek(start);
  });
}

export const DEMO_DATE = "2026-11-07";
export const DEMO_CLOCK_START = h(16, 30);

function templateShifts(): Shift[] {
  const shift = (employeeId: string, start: number, end: number): Shift => ({
    id: `vorlage-sa-${employeeId}`,
    employeeId,
    date: DEMO_DATE,
    start,
    end,
    kind: "service",
    origin: "vorlage",
  });
  return [
    shift("me", h(10), h(19)),
    shift("mf", h(10), h(16)),
    shift("mg", h(15), h(19)),
    shift("mc", h(10), h(14)),
    shift("ma", h(14), h(19)),
    shift("mb", h(14), h(19)),
  ];
}

function demoPunches(): Punch[] {
  return [
    { id: "p-me", employeeId: "me", date: DEMO_DATE, start: h(9, 55), end: null },
    { id: "p-mf", employeeId: "mf", date: DEMO_DATE, start: h(10), end: h(16) },
    { id: "p-ma", employeeId: "ma", date: DEMO_DATE, start: h(14), end: null },
    { id: "p-mb", employeeId: "mb", date: DEMO_DATE, start: h(13, 45), end: null },
    { id: "p-mc", employeeId: "mc", date: DEMO_DATE, start: h(10), end: h(14) },
  ];
}

export function initialPersonalState(): PersonalState {
  const rules = defaultRules();
  const employees = demoEmployees.map((employee) => ({ ...employee, skills: { ...employee.skills } }));
  const availability = demoAvailability();
  const exceptions: PersonalState["exceptions"] = [
    { id: "ex-1", employeeId: "mc", startDate: "2026-12-24", endDate: "2026-12-27", kind: "urlaub" },
    { id: "ex-2", employeeId: "mf", startDate: "2026-11-03", endDate: "2026-11-03", kind: "vormittags" },
  ];
  const [november] = planWeeks;
  const seeded = proposeWeek(november!, templateShifts(), { employees, availability, exceptions, rules }, "fill");
  const seededShifts = seeded.shifts.map((shift) => (shift.origin === "vorschlag" ? { ...shift, origin: "vorlage" as const } : shift));
  return {
    employees,
    availability,
    exceptions,
    rules,
    plans: {
      [november!.id]: { shifts: seededShifts, status: "entwurf" },
      "2026-12-21": { shifts: [], status: "entwurf" },
    },
    punches: demoPunches(),
    corrections: [
      { id: "c-1", punchId: "p-mc", employeeId: "mc", field: "end", from: h(14), to: h(14, 30), reason: "Übergabe an die Spätschicht hat länger gedauert.", status: "offen" },
    ],
  };
}
