import { requirePermission, type Principal } from "../auth/authorization";

export type CoordinatorState = { id: string; status: "ACTIVE" | "SUSPENDED"; referralCode: string };
export function assertCoordinatorActive(state: CoordinatorState) {
  if (state.status !== "ACTIVE") throw new Error("Coordinator is suspended");
}
export function canUseReferral(state: CoordinatorState) {
  return state.status === "ACTIVE";
}
export function createReferralCode(existing: Set<string>, candidate: string) {
  const normalized = candidate.trim().toUpperCase();
  if (!/^[A-Z0-9]{6,16}$/.test(normalized) || existing.has(normalized))
    throw new Error("Referral code is invalid or already in use");
  return normalized;
}
export function assertAssignedMemberAccess(
  principal: Principal,
  coordinator: CoordinatorState,
  assignedCoordinatorId: string,
) {
  requirePermission(principal, "coordinator:members:manage");
  assertCoordinatorActive(coordinator);
  if (coordinator.id !== assignedCoordinatorId)
    throw new Error("Forbidden: member is not assigned to this Coordinator");
}
export function coordinatorSuspensionPlan(
  mode: "FOUNDATION_ADMIN" | "TRANSFER",
  replacementCoordinatorId?: string,
) {
  if (mode === "TRANSFER" && !replacementCoordinatorId)
    throw new Error("A replacement active Coordinator is required");
  return {
    mode,
    replacementCoordinatorId,
    memberMessage:
      mode === "FOUNDATION_ADMIN"
        ? "Foundation Admin is temporarily managing your account."
        : "Your Coordinator assignment has been updated.",
  };
}
