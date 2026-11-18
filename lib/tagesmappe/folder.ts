import { startsWithin, windowLabel, windowsFor, type BookingKind } from "../booking/slots";

/** Rows that still fit on one overview sheet with the header and the footer. */
const OVERVIEW_CAPACITY = 12;

export type FolderSource = "live" | "example";

export type FolderBooking = {
  id: string;
  reference: string;
  name: string;
  time: string;
  children: number;
  adults: number;
  packageName: string;
  tables: readonly string[];
  kind: BookingKind;
  status: string;
};

export type OverviewRow = {
  time: string;
  name: string;
  counts: string;
};

export type OverviewPage = {
  kind: "overview";
  title: string;
  rows: OverviewRow[];
  emptyLabel: string | null;
};

export type PartyPage = {
  kind: "party";
  title: string;
  reference: string;
  when: string;
  party: string;
  coupons: string | null;
  note: string;
};

export type FolderPage = OverviewPage | PartyPage;

export type Tagesmappe = {
  dateIso: string;
  dateLabel: string;
  source: FolderSource;
  pages: FolderPage[];
};

export const handwritingNote =
  "Auf dem Ausdruck: Platz für handschriftliche Anpassungen, Coupon-Ausgabe und Abrechnung.";

const exampleDate = "2026-10-29";

export const exampleBookings: readonly FolderBooking[] = [
  {
    id: "example-mueller",
    reference: "B-1024",
    name: "Familie Müller",
    time: "14:30",
    children: 10,
    adults: 6,
    packageName: "Deluxe",
    tables: ["Tisch 7"],
    kind: "birthday",
    status: "confirmed",
  },
  {
    id: "example-schmidt",
    reference: "B-1025",
    name: "Familie Schmidt",
    time: "14:30",
    children: 8,
    adults: 4,
    packageName: "Comfort",
    tables: ["Tisch 3"],
    kind: "birthday",
    status: "confirmed",
  },
  {
    id: "example-weber",
    reference: "B-1026",
    name: "Familie Weber",
    time: "14:30",
    children: 12,
    adults: 5,
    packageName: "Deluxe",
    tables: ["Tisch 10"],
    kind: "birthday",
    status: "confirmed",
  },
];

export function exampleTagesmappe(): Tagesmappe {
  return buildTagesmappe({
    dateIso: exampleDate,
    bookings: exampleBookings,
    source: "example",
  });
}

export function folderBookingFromView(row: {
  id: string;
  reference: string;
  name: string;
  time: string;
  type: string;
  packageName: string;
  childrenCount: number;
  adultCount: number;
  tables: readonly string[];
  status: string;
}): FolderBooking {
  const haystack = `${row.type} ${row.packageName}`;
  return {
    id: row.id,
    reference: row.reference.trim() || "—",
    name: row.name.trim() || "—",
    time: row.time.trim() || "—",
    children: row.childrenCount,
    adults: row.adultCount,
    packageName: row.packageName,
    tables: row.tables,
    kind: /geburtstag|comfort|deluxe/i.test(haystack) ? "birthday" : "group",
    status: row.status,
  };
}

export function buildTagesmappe(input: {
  dateIso: string;
  bookings: readonly FolderBooking[];
  source: FolderSource;
}): Tagesmappe {
  const active = input.bookings
    .filter((booking) => booking.status !== "cancelled")
    .slice()
    .sort((left, right) => left.time.localeCompare(right.time) || left.name.localeCompare(right.name, "de"));

  const rows = active.map((booking) => ({
    time: booking.time,
    name: booking.name,
    counts: `${booking.children} K · ${booking.adults} E`,
  }));
  const slices = rows.length === 0 ? [[]] : chunk(rows, OVERVIEW_CAPACITY);
  const pages: FolderPage[] = slices.map((slice, index) => {
    const number = index + 1;
    const continued = slices.length > 1 ? ` (${index + 1}/${slices.length})` : "";
    return {
      kind: "overview",
      title: `Seite ${number} – Tagesübersicht${continued}`,
      rows: slice,
      emptyLabel: slice.length === 0 ? "Für diesen Tag gibt es keine Buchung." : null,
    };
  });

  active.forEach((booking, index) => {
    const number = slices.length + index + 1;
    const coupons = offersCoupons(booking.packageName) ? couponLine(booking.children) : null;
    pages.push({
      kind: "party",
      title: `Seite ${number} – ${booking.name}`,
      reference: booking.reference,
      when: whenLine(input.dateIso, booking),
      party: partyLine(booking),
      coupons,
      note: handwritingNote,
    });
  });

  return {
    dateIso: input.dateIso,
    dateLabel: formatFolderDate(input.dateIso),
    source: input.source,
    pages,
  };
}

export function folderMeta(folder: Tagesmappe): string {
  const count = folder.pages.length;
  const pages = count === 1 ? "1 Seite" : `${count} Seiten`;
  const origin = folder.source === "example" ? "aktuelle Beispielbuchungen" : "aktuelle Buchungen";
  return `${pages} · ${origin}`;
}

export function folderFootnote(source: FolderSource): string {
  if (source === "example") {
    return "Beispielbuchungen, keine echten Gäste. Der PDF-Download enthält dieselben Seiten und Platz zum Eintragen.";
  }
  return "Die Seiten entstehen aus den Buchungen dieses Tages. Der PDF-Download enthält zusätzlich Platz für Anpassungen, Coupon-Ausgabe und Abrechnung.";
}

export function folderFileName(folder: Tagesmappe): string {
  const safe = /^\d{4}-\d{2}-\d{2}$/.test(folder.dateIso) ? folder.dateIso : "tag";
  return `Tagesmappe-${safe}.pdf`;
}

export function formatFolderDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export function formatGeneratedAt(now: Date): string {
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("day")}.${value("month")}.${value("year")}, ${value("hour")}:${value("minute")}`;
}

function packageLabel(name: string): string {
  if (/deluxe/i.test(name)) return "Deluxe";
  if (/comfort/i.test(name)) return "Comfort";
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : "ohne Paket";
}

function offersCoupons(packageName: string): boolean {
  return /deluxe/i.test(packageName);
}

function couponLine(children: number): string {
  const noun = children === 1 ? "Essenscoupon" : "Essenscoupons";
  return `${children} ${noun} vorgesehen · Auswahl vor Ort`;
}

function partyLine(booking: FolderBooking): string {
  return `${people(booking.children, "Kind", "Kinder")} · ${people(booking.adults, "Erwachsener", "Erwachsene")} · ${packageLabel(booking.packageName)}`;
}

function people(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function whenLine(dateIso: string, booking: FolderBooking): string {
  const match = windowsFor(dateIso, booking.kind).find((window) => startsWithin(booking.time, window));
  const span = match ? windowLabel(match) : booking.time;
  return `${span} · ${tableLabel(booking.tables)}`;
}

function tableLabel(tables: readonly string[]): string {
  const names = tables.map((table) => table.trim()).filter((table) => table.length > 0);
  return names.length > 0 ? names.join(", ") : "ohne Tisch";
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}
