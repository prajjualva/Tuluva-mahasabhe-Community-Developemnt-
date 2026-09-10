import { z } from "zod";

/**
 * A member can initiate only self-service payment methods. Cash is recorded by
 * an assigned Coordinator and manual settlement is an administrative workflow;
 * neither may be created from a member-controlled request.
 */
export const memberPaymentRequestSchema = z.object({
  dueId: z.string().uuid(),
  idempotencyKey: z.string().min(16).max(200),
  method: z.enum(["ONLINE", "WALLET"]),
});
