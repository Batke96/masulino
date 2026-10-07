export { allowedActions, authorize, canAssignRole, permissionMatrix, privilegedRoles, redactChanges } from "./authz/policy";
export type { AuthzDecision, AuthzInput, Grant } from "./authz/policy";
export {
  IDENTITY_ISSUER,
  acceptInvitation,
  countActiveOwners,
  drainOutbox,
  ensurePrincipal,
  insertAudit,
  inviteStaff,
  listMemberships,
  loadActor,
  requirePermission,
  revokeMembership,
} from "./platform";
export type { ActorContext, OutboxJob } from "./platform";
