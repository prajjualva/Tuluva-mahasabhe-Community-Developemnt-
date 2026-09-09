export type Principal = {
  userId: string;
  permissions: Set<string>;
  coordinatorSuspended?: boolean;
};
export function requirePermission(principal: Principal, permission: string): void {
  if (principal.coordinatorSuspended && permission.startsWith("coordinator:"))
    throw new Error("Coordinator access is suspended");
  if (!principal.permissions.has(permission) && !principal.permissions.has("admin:*"))
    throw new Error("Forbidden");
}
export const PERMISSIONS = [
  "member:profile:read",
  "member:profile:write",
  "coordinator:members:manage",
  "coordinator:cash:collect",
  "coordinator:death:confirm",
  "admin:*",
  "audit:read",
  "nominee:bank:verify",
] as const;
