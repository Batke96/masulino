export {
  allowedActions,
  authorize,
  canAssignRole,
  canRemoveGrants,
  grantableRoles,
  holdsPrivilegedGrant,
  mfaSatisfiedForSession,
  permissionMatrix,
  privilegedRoles,
  redactChanges,
  roleNeedsLocation,
  rolesActorMayGrant,
  staffRoleOrder,
} from "./authz/policy";
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
export { createStaffAccount, listStaffDirectory, removeStaffAccount } from "./staff-accounts";
export type { ActorContext, OutboxJob } from "./platform";
export type { StaffCredentialPort, StaffDirectory, StaffPerson } from "./staff-accounts";
