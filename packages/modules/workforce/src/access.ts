import type { Action } from "@masulino/contracts";
import { authorize, permissionMatrix, type ActorContext } from "@masulino/core";

export function allows(actor: ActorContext, action: Action, locationId: string): boolean {
  return authorize({ ...actor, locationId }, action).allow;
}

/** Location-wide workforce rows. An employee grant never qualifies, even when the action is allowed for oneself. */
export function readsOtherPeople(actor: ActorContext, action: Action, locationId: string): boolean {
  if (!allows(actor, action, locationId)) return false;
  return actor.grants.some((grant) => {
    if (grant.roleKey === "employee") return false;
    const scope = permissionMatrix[grant.roleKey][action];
    if (scope === "tenant" && grant.locationId === null) return true;
    return scope === "location" && grant.locationId === locationId;
  });
}

export function seesDraftPlans(actor: ActorContext, locationId: string): boolean {
  return (
    allows(actor, "workforce.schedule.propose", locationId) ||
    allows(actor, "workforce.schedule.publish", locationId)
  );
}
