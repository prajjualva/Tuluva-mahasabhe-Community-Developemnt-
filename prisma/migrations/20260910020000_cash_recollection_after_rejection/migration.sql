-- Retain rejected cash collections as immutable history, but permit a fresh
-- collection for the same due. At most one non-rejected collection may exist
-- for a due, preventing duplicate open/settled cash collection attempts.
DROP INDEX "cash_collections_dueId_key";

CREATE UNIQUE INDEX "cash_collections_one_open_or_paid_due_key"
  ON "cash_collections"("dueId")
  WHERE "status" IN ('RECEIVED_BY_COORDINATOR', 'PENDING_ADMIN_VERIFICATION', 'PAID');

CREATE INDEX "cash_collections_dueId_status_idx"
  ON "cash_collections"("dueId", "status");
