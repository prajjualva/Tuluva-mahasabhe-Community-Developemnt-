export type AuditInput = {
  actorId?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string;
  requestId?: string;
  beforeState?: unknown;
  afterState?: unknown;
};
export function assertOverrideReason(action: string, reason?: string): void {
  if (action.startsWith("ADMIN_OVERRIDE") && !reason?.trim())
    throw new Error("Admin overrides require a reason");
}
