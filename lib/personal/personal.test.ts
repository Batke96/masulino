import { describe, expect, it } from "vitest";
import {
  DEMO_DATE,
  bookingWindows,
  checkAvailability,
  clampRule,
  defaultRules,
  evaluateWeek,
  formatWeekRange,
  initialPersonalState,
  parseTime,
  personalReducer,
  planWeeks,
  proposeWeek,
  requiredHeadcount,
  specialOpeningOf,
  validateCorrection,
  weekStats,
  type PersonalState,
  type Shift,
} from "./index";

const november = planWeeks[0]!;
const december = planWeeks[1]!;

function seeded(): PersonalState {
  return initialPersonalState();
}

describe("Regeln", () => {
  const rules = defaultRules();

  it("rechnet das Beispiel aus dem Regeltest: Mo, 100 Gäste, 16:00 bleibt bei der Grundbesetzung", () => {
    const result = requiredHeadcount(rules, "mo", 100, 16 * 60);
    expect(result).toMatchObject({ base: 1, extra: 0, capped: 1, capReached: false });
  });

  it("ergänzt Personal ab der Gästeschwelle und begrenzt auf die Obergrenze", () => {
    const withCap = { ...rules, days: { ...rules.days, sa: { ...rules.days.sa, max: 3 } } };
    const result = requiredHeadcount(withCap, "sa", 150, 12 * 60);
    expect(result).toMatchObject({ base: 3, extra: 1, uncapped: 4, capped: 3, capReached: true });
  });

  it("beachtet das Zeitfenster einer Bedingung", () => {
    expect(requiredHeadcount(rules, "sa", 150, 12 * 60).extra).toBe(1);
    expect(requiredHeadcount(rules, "sa", 150, 16 * 60).extra).toBe(0);
  });

  it("nimmt bei mehreren Treffern nur die höchste Bedingung", () => {
    const stacked = {
      ...rules,
      conditions: [
        { id: "a", day: "so" as const, fromGuests: 50, extra: 1 },
        { id: "b", day: "so" as const, fromGuests: 80, extra: 2 },
      ],
    };
    expect(requiredHeadcount(stacked, "so", 90, 12 * 60).extra).toBe(2);
    expect(requiredHeadcount(stacked, "so", 60, 12 * 60).extra).toBe(1);
  });

  it("hält die maximale Besetzung nie unter der Mindestbesetzung", () => {
    expect(clampRule({ ...rules.days.mo, min: 4, max: 2 })).toMatchObject({ min: 4, max: 4 });
  });

  it("erkennt eine Sonderöffnung nur, wenn die Erkennung aktiv ist", () => {
    const friday = november.days[4]!;
    expect(specialOpeningOf(friday, rules)).toMatchObject({ openAt: 9 * 60, coverFrom: 8 * 60 + 45 });
    expect(specialOpeningOf(friday, { ...rules, autoSpecialOpenings: false })).toBeNull();
  });
});

describe("Verfügbarkeit", () => {
  const state = seeded();
  const a = state.availability.ma!;

  it("akzeptiert eine Schicht innerhalb der regelmäßigen Zeiten", () => {
    expect(checkAvailability(a, [], "ma", "2026-11-02", 17 * 60, 19 * 60)).toEqual({ ok: true });
  });

  it("meldet Zeiten außerhalb des Fensters und nicht verfügbare Wochentage", () => {
    const outside = checkAvailability(a, [], "ma", "2026-11-02", 15 * 60, 19 * 60);
    expect(outside).toMatchObject({ ok: false });
    expect(JSON.stringify(outside)).toContain("17:00–19:00");
    expect(checkAvailability(a, [], "ma", "2026-11-04", 10 * 60, 12 * 60)).toMatchObject({ ok: false });
  });

  it("lässt eine Ausnahme die regelmäßige Zeit überstimmen", () => {
    const exception = { id: "x", employeeId: "ma", startDate: "2026-11-07", endDate: "2026-11-07", kind: "nachmittags" as const };
    expect(checkAvailability(a, [exception], "ma", "2026-11-07", 10 * 60, 12 * 60)).toEqual({ ok: true });
    expect(checkAvailability(a, [exception], "ma", "2026-11-07", 14 * 60, 19 * 60)).toMatchObject({ ok: false });
  });
});

describe("Dienstplan 02.–08. November", () => {
  const state = seeded();
  const plan = state.plans[november.id]!;

  it("zeigt die Wochenspanne wie im Entwurf", () => {
    expect(formatWeekRange(november.start, november.end)).toBe("02.–08. November");
    expect(formatWeekRange(december.start, december.end)).toBe("21.–27. Dezember");
  });

  it("meldet im Ausgangszustand genau die offene Frühschicht am Freitag", () => {
    const issues = evaluateWeek(november, plan.shifts, state);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "blocker", code: "sonderoeffnung", date: "2026-11-06" });
    expect(issues[0]!.message).toBe(
      "Freitag, 06.11.: Die Kita-Sonderöffnung um 09:00 Uhr benötigt eine Frühschicht ab 08:45 Uhr.",
    );
  });

  it("zählt Buchungen, Schichten und Sonderöffnungen aus den Daten", () => {
    const stats = weekStats(november, plan.shifts, state.rules);
    expect(stats).toMatchObject({ birthdays: 15, kitaVisits: 1, specialOpenings: 1, shifts: plan.shifts.length });
    expect(stats.minutes).toBe(plan.shifts.reduce((sum, shift) => sum + shift.end - shift.start, 0));
  });

  it("gruppiert den Samstag in drei Zeitfenster mit den gebuchten Personen", () => {
    const saturday = november.days[5]!;
    const windows = bookingWindows(saturday, plan.shifts, state.rules);
    expect(windows.map((item) => [item.birthdays, item.persons])).toEqual([[2, 28], [1, 17], [3, 45]]);
    expect(windows.reduce((sum, item) => sum + item.persons, 0)).toBe(90);
    expect(windows[0]).toMatchObject({ children: 18, adults: 10 });
    expect(windows.every((item) => !item.short)).toBe(true);
  });

  it("löst die Sonderöffnung mit einer Schicht ab 08:45 und nennt dann die Verfügbarkeit als Hinweis", () => {
    const early: Shift = { id: "x", employeeId: "mb", date: "2026-11-06", start: 8 * 60 + 45, end: 12 * 60, kind: "service", origin: "manuell" };
    const issues = evaluateWeek(november, [...plan.shifts, early], state);
    expect(issues.filter((item) => item.severity === "blocker")).toHaveLength(0);
    expect(issues.some((item) => item.code === "verfuegbarkeit" && item.message.includes("Mitarbeiter B"))).toBe(true);
  });

  it("blockiert bei Überschneidung derselben Person", () => {
    const clash: Shift = { id: "y", employeeId: "me", date: "2026-11-05", start: 12 * 60, end: 15 * 60, kind: "service", origin: "manuell" };
    const issues = evaluateWeek(november, [...plan.shifts, clash], state);
    expect(issues.some((item) => item.code === "ueberschneidung" && item.severity === "blocker")).toBe(true);
  });

  it("macht aus einer niedrigeren Gästeschwelle einen sichtbaren Besetzungsbedarf", () => {
    const withThreshold = (fromGuests: number): PersonalState => ({
      ...state,
      rules: { ...state.rules, conditions: [{ id: "k", day: "sa", fromGuests, extra: 1 }] },
    });
    const isShort = (candidate: PersonalState) =>
      evaluateWeek(november, plan.shifts, candidate).some((item) => item.code === "unterbesetzt" && item.date === DEMO_DATE);
    expect(isShort(state)).toBe(false);
    expect(isShort(withThreshold(200))).toBe(false);
    expect(isShort(withThreshold(60))).toBe(true);
  });

  it("verlangt Toilettenreinigung, wenn die Regel aktiv ist", () => {
    const withoutCleaners: PersonalState = {
      ...state,
      employees: state.employees.map((item) => ({ ...item, skills: { ...item.skills, reinigung: false } })),
    };
    const issues = evaluateWeek(november, plan.shifts, withoutCleaners);
    expect(issues.filter((item) => item.code === "reinigung").length).toBeGreaterThan(0);
  });
});

describe("Planvorschlag", () => {
  const state = seeded();

  it("ist deterministisch", () => {
    const first = proposeWeek(december, [], state, "rebuild");
    const second = proposeWeek(december, [], state, "rebuild");
    expect(second.shifts).toEqual(first.shifts);
  });

  it("füllt die Weihnachtswoche, ohne Obergrenzen, Überschneidungen oder Urlaub zu verletzen", () => {
    const result = proposeWeek(december, [], state, "rebuild");
    expect(result.added.length).toBeGreaterThan(10);
    for (const employee of state.employees) {
      const mine = result.shifts.filter((item) => item.employeeId === employee.id);
      expect(mine.reduce((sum, item) => sum + item.end - item.start, 0)).toBeLessThanOrEqual(employee.maxHours * 60);
      for (const a of mine) {
        for (const b of mine) {
          if (a !== b && a.date === b.date) expect(a.start < b.end && b.start < a.end).toBe(false);
        }
      }
    }
    const issues = evaluateWeek(december, result.shifts, state);
    expect(issues.some((item) => item.code === "verfuegbarkeit")).toBe(false);
    expect(issues.some((item) => item.code === "keine-schichten")).toBe(false);
    expect(result.shifts.some((item) => item.employeeId === "mc" && item.date >= "2026-12-24")).toBe(false);
  });

  it("benennt verbleibende Lücken statt sie zu verstecken", () => {
    const result = proposeWeek(december, [], state, "rebuild");
    const blockers = evaluateWeek(december, result.shifts, state).filter((item) => item.severity === "blocker");
    expect(blockers.map((item) => item.code)).toEqual(["unterbesetzt"]);
    expect(blockers[0]!.date).toBe("2026-12-27");
  });

  it("behält im Modus Lücken ergänzen die vorhandenen Schichten", () => {
    const plan = state.plans[november.id]!;
    const filled = proposeWeek(november, plan.shifts, state, "fill");
    expect(filled.added).toHaveLength(0);
    expect(filled.shifts).toHaveLength(plan.shifts.length);
  });

  it("verwirft im Modus neu berechnen die alten Schichten", () => {
    const plan = state.plans[november.id]!;
    const rebuilt = proposeWeek(november, plan.shifts, state, "rebuild");
    expect(rebuilt.removed).toHaveLength(plan.shifts.length);
    expect(rebuilt.shifts.every((item) => item.origin !== "vorlage")).toBe(true);
  });

  it("bleibt bei der Sonderöffnung ehrlich, wenn niemand ab 08:45 verfügbar ist", () => {
    const result = proposeWeek(november, [], state, "rebuild");
    const issues = evaluateWeek(november, result.shifts, state);
    expect(issues.some((item) => item.code === "sonderoeffnung")).toBe(true);
  });
});

describe("Zeiterfassung und Zustand", () => {
  it("stempelt ein und aus und verhindert doppeltes Einstempeln", () => {
    let state = seeded();
    state = personalReducer(state, { type: "clockIn", employeeId: "mg", date: DEMO_DATE, minute: 16 * 60 + 30 });
    const punch = state.punches.find((item) => item.employeeId === "mg")!;
    expect(punch).toMatchObject({ start: 990, end: null });
    const again = personalReducer(state, { type: "clockIn", employeeId: "mg", date: DEMO_DATE, minute: 17 * 60 });
    expect(again.punches).toHaveLength(state.punches.length);
    state = personalReducer(state, { type: "clockOut", punchId: punch.id, minute: 18 * 60 });
    expect(state.punches.find((item) => item.id === punch.id)!.end).toBe(1080);
  });

  it("übernimmt eine genehmigte Korrektur und verändert bei Ablehnung nichts", () => {
    const state = seeded();
    const open = state.corrections.find((item) => item.status === "offen")!;
    const approved = personalReducer(state, { type: "decideCorrection", id: open.id, decision: "genehmigt" });
    expect(approved.punches.find((item) => item.id === open.punchId)!.end).toBe(14 * 60 + 30);
    expect(approved.corrections.find((item) => item.id === open.id)!.status).toBe("genehmigt");
    const twice = personalReducer(approved, { type: "decideCorrection", id: open.id, decision: "abgelehnt" });
    expect(twice.corrections.find((item) => item.id === open.id)!.status).toBe("genehmigt");
    const rejected = personalReducer(state, { type: "decideCorrection", id: open.id, decision: "abgelehnt" });
    expect(rejected.punches.find((item) => item.id === open.punchId)!.end).toBe(14 * 60);
  });

  it("nimmt je Stempelzeit nur eine offene Korrektur an", () => {
    const state = seeded();
    const again = personalReducer(state, { type: "requestCorrection", punchId: "p-mc", field: "end", to: 15 * 60, reason: "Noch einmal" });
    expect(again.corrections).toHaveLength(state.corrections.length);
    const other = personalReducer(state, { type: "requestCorrection", punchId: "p-ma", field: "start", to: 13 * 60 + 45, reason: "Früher angefangen" });
    expect(other.corrections).toHaveLength(state.corrections.length + 1);
  });

  it("prüft Korrekturen auf Reihenfolge, Grund und Länge", () => {
    const punch = seeded().punches.find((item) => item.id === "p-mc")!;
    expect(validateCorrection(punch, "end", parseTime("09:00"), "Grund")).toMatch(/nach dem Beginn/);
    expect(validateCorrection(punch, "end", parseTime("14:30"), " ")).toMatch(/Grund/);
    expect(validateCorrection(punch, "end", parseTime("14:30"), "x".repeat(501))).toMatch(/500/);
    expect(validateCorrection(punch, "end", parseTime("14:00"), "Grund")).toMatch(/unverändert/);
    expect(validateCorrection(punch, "end", null, "Grund")).toMatch(/Uhrzeit/);
    expect(validateCorrection(punch, "end", parseTime("14:30"), "Übergabe")).toBeNull();
  });

  it("setzt die Veröffentlichung bei einer Schichtänderung zurück", () => {
    let state = seeded();
    state = personalReducer(state, { type: "setPlanStatus", weekId: november.id, status: "veroeffentlicht" });
    expect(state.plans[november.id]!.status).toBe("veroeffentlicht");
    state = personalReducer(state, {
      type: "saveShift",
      weekId: november.id,
      shift: { employeeId: "mg", date: "2026-11-02", start: 14 * 60, end: 18 * 60, kind: "service" },
    });
    expect(state.plans[november.id]!.status).toBe("entwurf");
    expect(state.plans[november.id]!.shifts.at(-1)).toMatchObject({ employeeId: "mg", origin: "manuell" });
  });

  it("begrenzt Regeländerungen und setzt ein Profil zurück", () => {
    let state = seeded();
    state = personalReducer(state, { type: "setDayRule", key: "mo", patch: { min: 5 } });
    expect(state.rules.days.mo).toMatchObject({ min: 5, max: 5 });
    state = personalReducer(state, { type: "updateEmployee", id: "ma", patch: { targetHours: 30 } });
    state = personalReducer(state, { type: "setSkill", id: "ma", skill: "reinigung", value: true });
    state = personalReducer(state, { type: "resetEmployee", id: "ma" });
    expect(state.employees.find((item) => item.id === "ma")).toMatchObject({ targetHours: 12 });
    expect(state.employees.find((item) => item.id === "ma")!.skills.reinigung).toBe(false);
  });
});
