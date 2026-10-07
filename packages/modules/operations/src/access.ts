import type { Action } from "@masulino/contracts";
import { authorize, permissionMatrix, type ActorContext } from "@masulino/core";

export function readsOtherPeople(actor: ActorContext, action: Action, locationId: string): boolean {
  if (!authorize({ ...actor, locationId }, action).allow) return false;
  return actor.grants.some((grant) => {
    if (grant.roleKey === "employee") return false;
    const scope = permissionMatrix[grant.roleKey][action];
    if (scope === "tenant" && grant.locationId === null) return true;
    return scope === "location" && grant.locationId === locationId;
  });
}
