import type { AllocationCombination, AllocationInput, AllocationResult } from "@masulino/contracts";

export type { AllocationCombination, AllocationInput, AllocationResult };

function overlaps(leftStart: Date, leftEnd: Date, rightStart: Date, rightEnd: Date): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function isFeasible(input: AllocationInput, combination: AllocationCombination): boolean {
  if (input.closed || input.opening === null) return false;
  if (input.startMinute < input.opening.startMinute) return false;
  if (input.endMinute > input.opening.endMinute) return false;
  if (input.endMinute <= input.startMinute) return false;
  if (input.occupancyEnd <= input.occupancyStart) return false;
  if (input.children < combination.minChildren || input.children > combination.maxChildren) {
    return false;
  }
  if (input.adults < combination.minAdults || input.adults > combination.maxAdults) return false;
  if (combination.resourceIds.length === 0) return false;

  const resources = combination.resourceIds.map((id) => input.resources.find((row) => row.id === id));
  if (resources.some((row) => !row || !row.active)) return false;

  const childCapacity = resources.reduce((sum, row) => sum + (row?.capacityChildren ?? 0), 0);
  if (childCapacity < input.children) return false;

  if (input.adultSeating === "required") {
    const adultCapacity = resources.reduce((sum, row) => sum + (row?.capacityAdults ?? 0), 0);
    if (adultCapacity < input.adults) return false;
  }

  for (const resourceId of combination.resourceIds) {
    const busy = input.occupancy.some(
      (row) =>
        row.resourceId === resourceId &&
        overlaps(input.occupancyStart, input.occupancyEnd, row.start, row.end),
    );
    if (busy) return false;
  }
  return true;
}

export function allocate(input: AllocationInput): AllocationResult {
  const feasible = input.combinations.filter((combination) => isFeasible(input, combination));
  feasible.sort((left, right) => {
    const leftCapacity = capacityOf(input, left);
    const rightCapacity = capacityOf(input, right);
    const unused = leftCapacity - input.children - (rightCapacity - input.children);
    if (unused !== 0) return unused;
    const byName = left.name.localeCompare(right.name);
    if (byName !== 0) return byName;
    return left.id.localeCompare(right.id);
  });
  const choice = feasible[0];
  if (!choice) return { ok: false, reason: "unavailable" };
  return {
    ok: true,
    choice: {
      combinationId: choice.id,
      combinationName: choice.name,
      resourceIds: [...choice.resourceIds],
      occupancyStart: input.occupancyStart,
      occupancyEnd: input.occupancyEnd,
    },
  };
}

function capacityOf(input: AllocationInput, combination: AllocationCombination): number {
  return combination.resourceIds.reduce((sum, id) => {
    const resource = input.resources.find((row) => row.id === id);
    return sum + (resource?.capacityChildren ?? 0);
  }, 0);
}

export function defaultPreparationTasks(): string[] {
  return ["Tische vorbereiten"];
}
