import type { BookingKind, TimeWindow } from "./slots";
import { startsWithin } from "./slots";

export type TableSeat = {
  id: number;
  seats: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Positions follow the Wiesbaden floor plan: percentages of the room. */
export const tableSeats: TableSeat[] = [
  { id: 1, seats: 6, x: 6.2, y: 26, w: 6.2, h: 18 },
  { id: 2, seats: 12, x: 26.2, y: 16, w: 6.4, h: 30 },
  { id: 3, seats: 12, x: 35.6, y: 16, w: 6.4, h: 30 },
  { id: 4, seats: 11, x: 45, y: 17, w: 6.4, h: 28 },
  { id: 5, seats: 18, x: 55.2, y: 7.5, w: 7, h: 39 },
  { id: 6, seats: 18, x: 65.6, y: 7.5, w: 7, h: 39 },
  { id: 7, seats: 12, x: 76, y: 7.5, w: 7, h: 33 },
  { id: 8, seats: 9, x: 74.2, y: 45, w: 15.2, h: 9 },
  { id: 9, seats: 16, x: 69.2, y: 60, w: 24.2, h: 11 },
  { id: 10, seats: 15, x: 69.2, y: 76, w: 24.2, h: 11 },
  { id: 11, seats: 12, x: 55.2, y: 58, w: 6.6, h: 32 },
  { id: 12, seats: 12, x: 45.6, y: 58, w: 6.6, h: 32 },
  { id: 13, seats: 11, x: 36, y: 58, w: 6.6, h: 32 },
  { id: 14, seats: 12, x: 26.4, y: 58, w: 6.6, h: 32 },
  { id: 15, seats: 12, x: 16.8, y: 58, w: 6.6, h: 32 },
  { id: 16, seats: 15, x: 6.2, y: 50, w: 7.2, h: 40 },
];

export type RoomMark = { x: number; y: number; label: string };

export const roomColumns: RoomMark[] = [
  { x: 50.4, y: 3.4, label: "Säule" },
  { x: 47.2, y: 48.5, label: "Säule" },
  { x: 3.4, y: 91.5, label: "Säule" },
  { x: 40.6, y: 92.2, label: "Säule" },
  { x: 90.6, y: 47.5, label: "Säule" },
  { x: 90.2, y: 89.5, label: "Säule" },
];

export type FloorBooking = {
  id: string;
  name: string;
  time: string;
  type: string;
  status: string;
  tables: string[];
  detail?: string;
};

export function tableIndex(name: string): number | null {
  const match = /^(?:tisch|t)\s*0*(\d{1,2})$/i.exec(name.trim());
  if (!match) return null;
  const index = Number(match[1]);
  if (index < 1 || index > 16) return null;
  return index;
}

export function matchesKind(type: string, kind: BookingKind): boolean {
  if (kind === "birthday") return type === "Geburtstag";
  return type === "Gruppe";
}

export function placeBookings(
  bookings: FloorBooking[],
  kind: BookingKind,
  window: TimeWindow,
): { byTable: Map<number, FloorBooking[]>; unmatched: FloorBooking[] } {
  const byTable = new Map<number, FloorBooking[]>();
  const unmatched: FloorBooking[] = [];
  for (const booking of bookings) {
    if (!matchesKind(booking.type, kind) || !startsWithin(booking.time, window)) continue;
    const known = booking.tables.map(tableIndex).filter((index): index is number => index !== null);
    const unknown = booking.tables.filter((name) => tableIndex(name) === null);
    if (unknown.length > 0) unmatched.push(booking);
    for (const index of known) {
      const list = byTable.get(index) ?? [];
      list.push(booking);
      byTable.set(index, list);
    }
  }
  return { byTable, unmatched };
}

export function seatTone(bookings: FloorBooking[]): "free" | "reserved" | "booked" {
  if (bookings.length === 0) return "free";
  if (bookings.every((booking) => booking.status === "requested")) return "reserved";
  return "booked";
}

export const occupancyDayCount = 10;

export type OccupancyBooking = {
  date: string;
  time: string;
  type: string;
  tables: string[];
  children: number;
  adults: number;
};

export type OccupancyRow = {
  label: string;
  values: number[];
  people: number[];
  seats: number;
};

export type OccupancyHeatmap = {
  columns: string[];
  rows: OccupancyRow[];
  house: OccupancyRow;
};

function dayColumnLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const when = new Date(Date.UTC(year!, month! - 1, day!));
  const name = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" }).format(when).replace(/\.$/, "");
  return `${name} ${day}.`;
}

function emptyDays(count: number): number[] {
  return Array.from({ length: count }, () => 0);
}

/** One column per day. A booking counts on its day, not across the hours of its window. */
export function tableOccupancyHeatmap(dates: readonly string[], bookings: OccupancyBooking[]): OccupancyHeatmap {
  const columns = dates.map(dayColumnLabel);
  const people = new Map<number, number[]>(tableSeats.map((seat) => [seat.id, emptyDays(dates.length)]));
  const housePeople = emptyDays(dates.length);
  const houseSeats = tableSeats.reduce((sum, seat) => sum + seat.seats, 0);
  dates.forEach((date, column) => {
    for (const booking of bookings) {
      if (booking.date !== date) continue;
      const party = Math.max(0, booking.children) + Math.max(0, booking.adults);
      if (party === 0) continue;
      const indexes = [...new Set(booking.tables.map(tableIndex).filter((index): index is number => index !== null))];
      if (indexes.length === 0) continue;
      for (const index of indexes) {
        const row = people.get(index);
        if (!row) continue;
        row[column] = (row[column] ?? 0) + party;
      }
      housePeople[column] = (housePeople[column] ?? 0) + party;
    }
  });
  const rows = tableSeats.map((seat) => {
    const booked = people.get(seat.id) ?? emptyDays(dates.length);
    return {
      label: `Tisch ${seat.id}`,
      seats: seat.seats,
      people: booked,
      values: booked.map((count) => (seat.seats > 0 ? count / seat.seats : 0)),
    };
  });
  const house = {
    label: "Alle Tische",
    seats: houseSeats,
    people: housePeople,
    values: housePeople.map((count) => (houseSeats > 0 ? count / houseSeats : 0)),
  };
  return { columns, rows, house };
}
