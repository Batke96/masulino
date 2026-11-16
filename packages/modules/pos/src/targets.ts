export type DayTotal = {
  date: string;
  gross: number;
  quantity: number;
};

export type WeekdayTarget = {
  gross: number;
  quantity: number;
};

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function weekdayTargets(days: DayTotal[]): Map<number, WeekdayTarget> {
  const buckets = new Map<number, { gross: number; quantity: number; count: number }>();
  for (const day of days) {
    const weekday = weekdayOf(day.date);
    const current = buckets.get(weekday) ?? { gross: 0, quantity: 0, count: 0 };
    current.gross += day.gross;
    current.quantity += day.quantity;
    current.count += 1;
    buckets.set(weekday, current);
  }
  const targets = new Map<number, WeekdayTarget>();
  for (const [weekday, bucket] of buckets) {
    targets.set(weekday, {
      gross: bucket.gross / bucket.count,
      quantity: bucket.quantity / bucket.count,
    });
  }
  return targets;
}

export function daysInMonth(month: string): string[] {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText);
  const count = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return `${month}-${day}`;
  });
}

export function shiftMonth(month: string, delta: number): string {
  const [yearText, monthText] = month.split("-");
  const cursor = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + delta, 1));
  const year = cursor.getUTCFullYear();
  const next = String(cursor.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${next}`;
}

export function monthSpan(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${shiftMonth(month, 1)}-01` };
}

export function yearSpan(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year + 1}-01-01` };
}

export function fractionalChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}
