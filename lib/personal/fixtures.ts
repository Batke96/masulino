import { makeAvailability } from "./availability";
import { proposeWeek } from "./plan";
import { defaultRules } from "./rules";
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

const MORNING: [number, number] = [h(10), h(13, 30)];
const MIDDAY: [number, number] = [h(11), h(14, 30)];
const AFTERNOON: [number, number] = [h(14), h(17, 30)];
const LATE_AFTERNOON: [number, number] = [h(15, 30), h(19)];

export function buildWeeks(): PlanWeek[] {
  bookingCounter = 0;
  const november: PlanWeek = {
    id: "2026-11-02",
    start: "2026-11-02",
    end: "2026-11-08",
    days: [
      day("2026-11-02", 13, 20, "wolken", [birthday("Familie Keller", ...AFTERNOON, 9, 4)]),
      day("2026-11-03", 12, 10, "sonne", []),
      day("2026-11-04", 11, 75, "regen", [
        birthday("Familie Braun", ...AFTERNOON, 11, 5),
        birthday("Familie Richter", ...LATE_AFTERNOON, 10, 4),
      ]),
      day("2026-11-05", 11, 45, "wolken", [birthday("Familie Sommer", h(15), h(18, 30), 11, 5)]),
      day("2026-11-06", 10, 85, "schauer", [booking("kita", "Kita Sonnenschein", h(9), h(12, 30), 52, 14)]),
      day("2026-11-07", 12, 80, "schauer", [
        birthday("Familie Weber", ...MORNING, 9, 5),
        birthday("Familie Yilmaz", ...MORNING, 9, 5),
        birthday("Familie Fischer", ...MIDDAY, 11, 6),
        birthday("Familie Schmitt", ...LATE_AFTERNOON, 10, 5),
        birthday("Familie Hoffmann", ...LATE_AFTERNOON, 10, 5),
        birthday("Familie Wagner", ...LATE_AFTERNOON, 9, 6),
      ]),
      day("2026-11-08", 13, 35, "teilweise", [
        birthday("Familie Becker", ...MORNING, 10, 5),
        birthday("Familie Koch", ...MORNING, 10, 5),
        birthday("Familie Bauer", ...MIDDAY, 9, 5),
        birthday("Familie Klein", ...LATE_AFTERNOON, 11, 6),
        birthday("Familie Wolf", ...LATE_AFTERNOON, 11, 6),
      ]),
    ],
  };
  const december: PlanWeek = {
    id: "2026-12-21",
    start: "2026-12-21",
    end: "2026-12-27",
    days: [
      day("2026-12-21", 4, 30, "wolken", [birthday("Familie Lang", ...AFTERNOON, 8, 4)]),
      day("2026-12-22", 3, 60, "schauer", [
        birthday("Familie Vogel", ...AFTERNOON, 10, 4),
        birthday("Familie Roth", ...LATE_AFTERNOON, 9, 5),
      ]),
      day("2026-12-23", 2, 70, "regen", [
        birthday("Familie Krüger", ...MORNING, 9, 5),
        birthday("Familie Berger", ...AFTERNOON, 10, 5),
        birthday("Familie Frank", ...LATE_AFTERNOON, 9, 4),
      ], { ferien: true }),
      day("2026-12-24", 1, 20, "sonne", [birthday("Familie Simon", ...MORNING, 8, 4)], { ferien: true }),
      day("2026-12-25", 0, 10, "sonne", [
        birthday("Familie Arnold", ...MORNING, 10, 5),
        birthday("Familie Möller", ...MIDDAY, 9, 5),
        birthday("Familie Busch", ...AFTERNOON, 10, 5),
        birthday("Familie Graf", ...LATE_AFTERNOON, 9, 4),
      ], { holiday: "1. Weihnachtstag", ferien: true }),
      day("2026-12-26", 2, 50, "wolken", [
        birthday("Familie Heinz", ...MORNING, 10, 5),
        birthday("Familie Albrecht", ...MORNING, 9, 5),
        birthday("Familie Lorenz", ...MIDDAY, 11, 5),
        birthday("Familie Franke", ...AFTERNOON, 9, 5),
        birthday("Familie Seidel", ...LATE_AFTERNOON, 10, 5),
        birthday("Familie Ziegler", ...LATE_AFTERNOON, 10, 5),
      ], { holiday: "2. Weihnachtstag", ferien: true }),
      day("2026-12-27", 3, 65, "regen", [
        birthday("Familie Pohl", ...MORNING, 10, 5),
        birthday("Familie Engel", ...MIDDAY, 9, 5),
        birthday("Familie Barth", ...AFTERNOON, 10, 5),
        birthday("Familie Voigt", ...LATE_AFTERNOON, 10, 5),
        birthday("Familie Kraft", ...LATE_AFTERNOON, 9, 5),
      ], { ferien: true }),
    ],
  };
  return [november, december];
}

export const planWeeks: PlanWeek[] = buildWeeks();

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
