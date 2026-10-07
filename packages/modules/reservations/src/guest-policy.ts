const guestFields = new Set(["organizerPhone", "notes"]);

export function classifyGuestPatch(input: Record<string, unknown>): "apply" | "staff" {
  const keys = Object.keys(input).filter((key) => key !== "expectedVersion" && input[key] !== undefined);
  if (keys.length === 0) return "staff";
  return keys.every((key) => guestFields.has(key)) ? "apply" : "staff";
}

export function guestMayMoveReservation(): false {
  return false;
}
