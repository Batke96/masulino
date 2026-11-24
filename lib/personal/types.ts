export type WeekdayKey = "mo" | "di" | "mi" | "do" | "fr" | "sa" | "so";
export type DayKey = WeekdayKey | "feiertag";

export const weekdayKeys: readonly WeekdayKey[] = ["mo", "di", "mi", "do", "fr", "sa", "so"];
export const dayKeys: readonly DayKey[] = [...weekdayKeys, "feiertag"];

export const dayLabels: Record<DayKey, string> = {
  mo: "Mo",
  di: "Di",
  mi: "Mi",
  do: "Do",
  fr: "Fr",
  sa: "Sa",
  so: "So",
  feiertag: "Feiertag",
};

export const dayNames: Record<DayKey, string> = {
  mo: "Montag",
  di: "Dienstag",
  mi: "Mittwoch",
  do: "Donnerstag",
  fr: "Freitag",
  sa: "Samstag",
  so: "Sonntag",
  feiertag: "Feiertag",
};

export type Role = "mitarbeiter" | "schichtleiter" | "leitung" | "reinigungskraft";
export type Priority = "bedarf" | "standard" | "bevorzugt";
export type SkillKey = "kasse" | "reinigung" | "oeffnung" | "stosszeit";

export const roleLabels: Record<Role, string> = {
  mitarbeiter: "Mitarbeiter",
  schichtleiter: "Schichtleiter",
  leitung: "Leitung",
  reinigungskraft: "Reinigungskraft",
};

export const priorityLabels: Record<Priority, string> = {
  bedarf: "Bei Bedarf",
  standard: "Standard",
  bevorzugt: "Bevorzugt",
};

export const skillLabels: Record<SkillKey, string> = {
  kasse: "Kasse",
  reinigung: "Toilettenkontrolle und -reinigung",
  oeffnung: "Öffnungsdienst übernehmen",
  stosszeit: "Erfahren für stark besuchte Zeiten",
};

export const skillKeys: readonly SkillKey[] = ["kasse", "reinigung", "oeffnung", "stosszeit"];

export type Employee = {
  id: string;
  name: string;
  role: Role;
  targetHours: number;
  maxHours: number;
  priority: Priority;
  skills: Record<SkillKey, boolean>;
};

export type AvailabilityDay = { available: boolean; from: number; to: number };
export type Availability = Record<WeekdayKey, AvailabilityDay>;

export type ExceptionKind = "ganztags" | "vormittags" | "nachmittags" | "urlaub";

export const exceptionLabels: Record<ExceptionKind, string> = {
  ganztags: "Ganztägig nicht verfügbar",
  vormittags: "Vormittags nicht verfügbar",
  nachmittags: "Nachmittags nicht verfügbar",
  urlaub: "Urlaub (mehrere Tage)",
};

export const NOON = 13 * 60;

export type AvailabilityException = {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  kind: ExceptionKind;
};

export type ShiftKind = "service" | "cleaning";
export type ShiftOrigin = "manuell" | "vorschlag" | "reinigung" | "vorlage";

export type Shift = {
  id: string;
  employeeId: string;
  date: string;
  start: number;
  end: number;
  kind: ShiftKind;
  origin: ShiftOrigin;
  note?: string;
};

export type BookingKind = "geburtstag" | "kita";

export type PlanBooking = {
  id: string;
  kind: BookingKind;
  name: string;
  start: number;
  end: number;
  children: number;
  adults: number;
};

export type WeatherSymbol = "sonne" | "wolken" | "teilweise" | "regen" | "schauer";

export type PlanDay = {
  date: string;
  weather: { temperature: number; rainPercent: number; symbol: WeatherSymbol };
  holiday?: string;
  ferien?: boolean;
  bookings: PlanBooking[];
};

export type PlanWeek = {
  id: string;
  start: string;
  end: string;
  days: PlanDay[];
};

export type LeadRole = "none" | "schichtleiter" | "leitung";

export type DayRule = {
  min: number;
  max: number;
  leadRole: LeadRole;
  requireKasse: boolean;
  requireReinigung: boolean;
};

export type LoadCondition = {
  id: string;
  day: DayKey;
  fromGuests: number;
  extra: number;
  from?: number;
  to?: number;
};

export type CleaningService = {
  id: string;
  label: string;
  days: WeekdayKey[];
  start: number;
  end: number;
  enabled: boolean;
};

export type Rules = {
  days: Record<DayKey, DayRule>;
  conditions: LoadCondition[];
  autoSpecialOpenings: boolean;
  holidayRuleFirst: boolean;
  specialOpeningLead: number;
  cleaning: CleaningService[];
};

export type PlanStatus = "entwurf" | "veroeffentlicht";

export type WeekPlan = {
  shifts: Shift[];
  status: PlanStatus;
};

export type Punch = {
  id: string;
  employeeId: string;
  date: string;
  start: number;
  end: number | null;
};

export type CorrectionStatus = "offen" | "genehmigt" | "abgelehnt";

export type Correction = {
  id: string;
  punchId: string;
  employeeId: string;
  field: "start" | "end";
  from: number | null;
  to: number;
  reason: string;
  status: CorrectionStatus;
};

export type PersonalState = {
  employees: Employee[];
  availability: Record<string, Availability>;
  exceptions: AvailabilityException[];
  rules: Rules;
  plans: Record<string, WeekPlan>;
  punches: Punch[];
  corrections: Correction[];
};

export type IssueSeverity = "blocker" | "hinweis";

export type IssueFix =
  | { type: "addShift"; date: string; start: number; end: number }
  | { type: "openRules" }
  | { type: "openAvailability"; employeeId: string };

export type PlanIssue = {
  id: string;
  severity: IssueSeverity;
  date: string;
  code:
    | "keine-schichten"
    | "unterbesetzt"
    | "ueberbesetzt"
    | "kasse"
    | "leitung"
    | "reinigung"
    | "sonderoeffnung"
    | "vorlauf"
    | "reinigungsdienst"
    | "ueberschneidung"
    | "verfuegbarkeit"
    | "stunden";
  message: string;
  fix?: IssueFix;
};
