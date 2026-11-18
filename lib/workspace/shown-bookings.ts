/**
 * Signed-in workplace must not paint the fixture list while the live
 * response is still in flight. An empty live list stays empty.
 * The fixture walkthrough is the only path that keeps the sample rows.
 */

export function shownBookings<T extends { id: string; status?: string }>(input: {
  liveMode: boolean;
  live: readonly T[] | null;
  fixtures: readonly T[];
  hiddenIds?: readonly string[];
}): { rows: T[]; loading: boolean } {
  const loading = input.liveMode && input.live === null;
  const source = loading ? [] : [...(input.live ?? input.fixtures)];
  const hidden = new Set(input.hiddenIds ?? []);
  return {
    loading,
    rows: source.filter((row) => row.status !== "cancelled" && !hidden.has(row.id)),
  };
}
