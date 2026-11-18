import { normalizeAvailabilityDay } from "./availability";
import { initialPersonalState } from "./fixtures";
import { clampRule, nextId } from "./rules";
import type {
  AvailabilityDay,
  AvailabilityException,
  CleaningService,
  DayKey,
  DayRule,
  Employee,
  LoadCondition,
  PersonalState,
  Punch,
  Rules,
  Shift,
  WeekdayKey,
} from "./types";

export type PersonalAction =
  | { type: "restore"; state: PersonalState }
  | { type: "updateEmployee"; id: string; patch: Partial<Omit<Employee, "id" | "skills">> }
  | { type: "setSkill"; id: string; skill: keyof Employee["skills"]; value: boolean }
  | { type: "resetEmployee"; id: string }
  | { type: "setAvailabilityDay"; employeeId: string; key: WeekdayKey; day: AvailabilityDay }
  | { type: "addException"; exception: Omit<AvailabilityException, "id"> }
  | { type: "removeException"; id: string }
  | { type: "setDayRule"; key: DayKey; patch: Partial<DayRule> }
  | { type: "saveCondition"; condition: Omit<LoadCondition, "id"> & { id?: string } }
  | { type: "removeCondition"; id: string }
  | { type: "setRuleFlags"; patch: Partial<Pick<Rules, "autoSpecialOpenings" | "holidayRuleFirst" | "specialOpeningLead">> }
  | { type: "saveCleaning"; service: Omit<CleaningService, "id"> & { id?: string } }
  | { type: "removeCleaning"; id: string }
  | { type: "saveShift"; weekId: string; shift: Omit<Shift, "id" | "origin"> & { id?: string } }
  | { type: "removeShift"; weekId: string; id: string }
  | { type: "applyProposal"; weekId: string; shifts: Shift[] }
  | { type: "setPlanStatus"; weekId: string; status: "entwurf" | "veroeffentlicht" }
  | { type: "clockIn"; employeeId: string; date: string; minute: number }
  | { type: "clockOut"; punchId: string; minute: number }
  | { type: "requestCorrection"; punchId: string; field: "start" | "end"; to: number; reason: string }
  | { type: "decideCorrection"; id: string; decision: "genehmigt" | "abgelehnt" };

function touchPlan(state: PersonalState, weekId: string, shifts: Shift[]): PersonalState {
  return { ...state, plans: { ...state.plans, [weekId]: { shifts, status: "entwurf" } } };
}

export function personalReducer(state: PersonalState, action: PersonalAction): PersonalState {
  switch (action.type) {
    case "restore":
      return action.state;

    case "updateEmployee":
      return {
        ...state,
        employees: state.employees.map((employee) => (employee.id === action.id ? { ...employee, ...action.patch } : employee)),
      };

    case "setSkill":
      return {
        ...state,
        employees: state.employees.map((employee) =>
          employee.id === action.id ? { ...employee, skills: { ...employee.skills, [action.skill]: action.value } } : employee,
        ),
      };

    case "resetEmployee": {
      const baseline = initialPersonalState().employees.find((employee) => employee.id === action.id);
      if (!baseline) return state;
      return { ...state, employees: state.employees.map((employee) => (employee.id === action.id ? baseline : employee)) };
    }

    case "setAvailabilityDay": {
      const current = state.availability[action.employeeId];
      if (!current) return state;
      return {
        ...state,
        availability: {
          ...state.availability,
          [action.employeeId]: { ...current, [action.key]: normalizeAvailabilityDay(action.day) },
        },
      };
    }

    case "addException": {
      const id = nextId("ex", state.exceptions);
      return { ...state, exceptions: [...state.exceptions, { ...action.exception, id }] };
    }

    case "removeException":
      return { ...state, exceptions: state.exceptions.filter((item) => item.id !== action.id) };

    case "setDayRule":
      return {
        ...state,
        rules: {
          ...state.rules,
          days: { ...state.rules.days, [action.key]: clampRule({ ...state.rules.days[action.key], ...action.patch }) },
        },
      };

    case "saveCondition": {
      const { id, ...rest } = action.condition;
      const conditions = id
        ? state.rules.conditions.map((item) => (item.id === id ? { ...rest, id } : item))
        : [...state.rules.conditions, { ...rest, id: nextId("cond", state.rules.conditions) }];
      return { ...state, rules: { ...state.rules, conditions } };
    }

    case "removeCondition":
      return { ...state, rules: { ...state.rules, conditions: state.rules.conditions.filter((item) => item.id !== action.id) } };

    case "setRuleFlags":
      return { ...state, rules: { ...state.rules, ...action.patch } };

    case "saveCleaning": {
      const { id, ...rest } = action.service;
      const cleaning = id
        ? state.rules.cleaning.map((item) => (item.id === id ? { ...rest, id } : item))
        : [...state.rules.cleaning, { ...rest, id: nextId("clean", state.rules.cleaning) }];
      return { ...state, rules: { ...state.rules, cleaning } };
    }

    case "removeCleaning":
      return { ...state, rules: { ...state.rules, cleaning: state.rules.cleaning.filter((item) => item.id !== action.id) } };

    case "saveShift": {
      const plan = state.plans[action.weekId];
      const shifts = plan?.shifts ?? [];
      const { id, ...rest } = action.shift;
      const next = id
        ? shifts.map((item) => (item.id === id ? { ...item, ...rest, id, origin: "manuell" as const } : item))
        : [...shifts, { ...rest, id: nextId("schicht", shifts), origin: "manuell" as const }];
      return touchPlan(state, action.weekId, next);
    }

    case "removeShift": {
      const shifts = (state.plans[action.weekId]?.shifts ?? []).filter((item) => item.id !== action.id);
      return touchPlan(state, action.weekId, shifts);
    }

    case "applyProposal":
      return touchPlan(state, action.weekId, action.shifts);

    case "setPlanStatus": {
      const plan = state.plans[action.weekId] ?? { shifts: [], status: "entwurf" as const };
      return { ...state, plans: { ...state.plans, [action.weekId]: { ...plan, status: action.status } } };
    }

    case "clockIn": {
      const open = state.punches.find((item) => item.employeeId === action.employeeId && item.end === null);
      if (open) return state;
      const punch: Punch = {
        id: nextId("p", state.punches),
        employeeId: action.employeeId,
        date: action.date,
        start: action.minute,
        end: null,
      };
      return { ...state, punches: [...state.punches, punch] };
    }

    case "clockOut":
      return {
        ...state,
        punches: state.punches.map((item) =>
          item.id === action.punchId && item.end === null && action.minute > item.start ? { ...item, end: action.minute } : item,
        ),
      };

    case "requestCorrection": {
      const punch = state.punches.find((item) => item.id === action.punchId);
      if (!punch) return state;
      const reason = action.reason.trim();
      if (!reason || reason.length > 500) return state;
      if (state.corrections.some((item) => item.punchId === action.punchId && item.status === "offen")) return state;
      return {
        ...state,
        corrections: [
          ...state.corrections,
          {
            id: nextId("c", state.corrections),
            punchId: punch.id,
            employeeId: punch.employeeId,
            field: action.field,
            from: action.field === "start" ? punch.start : punch.end,
            to: action.to,
            reason,
            status: "offen",
          },
        ],
      };
    }

    case "decideCorrection": {
      const correction = state.corrections.find((item) => item.id === action.id);
      if (!correction || correction.status !== "offen") return state;
      const punches =
        action.decision === "genehmigt"
          ? state.punches.map((item) => (item.id === correction.punchId ? { ...item, [correction.field]: correction.to } : item))
          : state.punches;
      return {
        ...state,
        punches,
        corrections: state.corrections.map((item) => (item.id === action.id ? { ...item, status: action.decision } : item)),
      };
    }
  }
}
