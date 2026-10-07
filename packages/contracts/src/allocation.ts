export type AdultSeatingChoice = "not_required" | "required";

export type AllocationCombination = {
  id: string;
  name: string;
  minChildren: number;
  maxChildren: number;
  minAdults: number;
  maxAdults: number;
  resourceIds: string[];
};

export type AllocationResource = {
  id: string;
  name: string;
  capacityChildren: number;
  capacityAdults: number;
  active: boolean;
};

export type OccupancyInterval = {
  resourceId: string;
  start: Date;
  end: Date;
};

export type AllocationInput = {
  children: number;
  adults: number;
  adultSeating: AdultSeatingChoice;
  startMinute: number;
  endMinute: number;
  opening: { startMinute: number; endMinute: number } | null;
  closed: boolean;
  occupancyStart: Date;
  occupancyEnd: Date;
  combinations: AllocationCombination[];
  resources: AllocationResource[];
  occupancy: OccupancyInterval[];
};

export type ChosenAllocation = {
  combinationId: string;
  combinationName: string;
  resourceIds: string[];
  occupancyStart: Date;
  occupancyEnd: Date;
};

export type AllocationResult =
  | { ok: true; choice: ChosenAllocation }
  | { ok: false; reason: "unavailable" };

export type AlternativeSlot = {
  localTime: string;
  combinationName: string;
};
