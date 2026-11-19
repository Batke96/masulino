import { tableSeats, type TableSeat } from "../booking/tables";

/** Same package the local Spielwelt seed stores for today's sample visits. */
export const fixturePackage = {
  name: "Geburtstagsfeier Fixture",
  durationMinutes: 120,
  priceMinor: 25000,
  currency: "EUR",
  minChildren: 1,
  maxChildren: 16,
} as const;

export type WorkplaceFixture = {
  reference: string;
  status: "confirmed" | "requested";
  name: string;
  email: string;
  phone: string;
  start: string;
  end: string;
  children: number;
  adults: number;
  seated: boolean;
  source: "staff_phone" | "staff_walk_in";
  task: string | null;
};

/**
 * The two visits the local seed adds on top of the three Tagesmappe parties.
 * They are what Übersicht shows above Müller, Schmidt and Weber.
 */
export const workplaceFixtures: readonly WorkplaceFixture[] = [
  {
    reference: "MS-FIXTURE1",
    status: "confirmed",
    name: "Familie Beispiel",
    email: "familie@example.test",
    phone: "030000000",
    start: "14:00",
    end: "16:00",
    children: 8,
    adults: 4,
    seated: true,
    source: "staff_phone",
    task: "Tische vorbereiten",
  },
  {
    reference: "MS-REQUEST1",
    status: "requested",
    name: "Familie Anfrage",
    email: "anfrage@example.test",
    phone: "030000001",
    start: "11:00",
    end: "13:00",
    children: 6,
    adults: 2,
    seated: false,
    source: "staff_walk_in",
    task: null,
  },
];

export function homeTableSeat(): TableSeat {
  const seat = tableSeats
    .filter((item) => item.seats >= 8)
    .sort((left, right) => left.seats - right.seats || left.id - right.id)[0];
  if (!seat) throw new Error("No floor table fits 8 children");
  return seat;
}

export function shiftClock(time: string, minutes: number): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new Error(`Bad time ${time}`);
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  if (total < 0 || total >= 24 * 60) throw new Error(`Time ${time} shifted by ${minutes} leaves the day.`);
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
