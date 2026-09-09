import { z } from "zod";
export const externalId = z.string().uuid();
export const positivePaise = z.number().int().positive();
export const pageInput = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(25),
});
