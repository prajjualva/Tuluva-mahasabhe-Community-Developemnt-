import { assertOverrideReason } from "../audit/audit";
import { requirePermission, type Principal } from "../auth/authorization";
export function requireAdmin(principal: Principal) {
  requirePermission(principal, "admin:*");
}
export function adminOverride(principal: Principal, action: string, reason: string) {
  requireAdmin(principal);
  assertOverrideReason(`ADMIN_OVERRIDE_${action}`, reason);
  return { action, reason, audited: true };
}
export function approveNews(principal: Principal, status: "PENDING_APPROVAL" | "DRAFT") {
  requireAdmin(principal);
  if (status !== "PENDING_APPROVAL") throw new Error("Only pending news can be approved");
  return "PUBLISHED" as const;
}
export function moderateComment(principal: Principal, reason: string) {
  requirePermission(principal, "coordinator:members:manage");
  if (!reason.trim()) throw new Error("Moderation reason is required");
  return { moderated: true, reason };
}
