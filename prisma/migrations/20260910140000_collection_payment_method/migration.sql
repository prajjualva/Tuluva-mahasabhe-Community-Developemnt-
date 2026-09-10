-- Both physical cash and documented manual payments follow the same
-- Coordinator collection and Administrator verification control path.
ALTER TABLE "cash_collections"
  ADD COLUMN "method" "PaymentMethod" NOT NULL DEFAULT 'CASH';
