import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../database/prisma";

/** Audit snapshots may contain old internal identifiers. Only safe external references leave the service. */
export function safeAuditSnapshot(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[truncated]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 2000);
  if (Array.isArray(value))
    return value.slice(0, 50).map((item) => safeAuditSnapshot(item, depth + 1));
  if (typeof value !== "object") return null;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !/password|otp|secret|token|bank|account|ifsc|credential|encrypted|storageKey|ipHash/i.test(
            key,
          ) &&
          (!/(^id$|Ids?$)/.test(key) || /externalIds?$|requestId|correlationId/i.test(key)),
      )
      .map(([key, item]) => [key, safeAuditSnapshot(item, depth + 1)]),
  );
}

export async function searchAuditLog(input: unknown) {
  const query = z
    .object({
      page: z.coerce.number().int().min(1).max(100000).default(1),
      search: z.string().trim().max(160).default(""),
      action: z.string().max(160).optional(),
      entityType: z.string().max(100).optional(),
      actorExternalId: z.string().uuid().optional(),
      requestId: z.string().max(200).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    })
    .strict()
    .parse(input);
  const where: Prisma.AuditLogWhereInput = {
    ...(query.action ? { action: { contains: query.action, mode: "insensitive" } } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.actorExternalId ? { actor: { externalId: query.actorExternalId } } : {}),
    ...(query.requestId ? { requestId: query.requestId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { action: { contains: query.search, mode: "insensitive" } },
            { entityType: { contains: query.search, mode: "insensitive" } },
            { reason: { contains: query.search, mode: "insensitive" } },
            { requestId: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { externalId: "desc" }],
      skip: (query.page - 1) * 50,
      take: 50,
      select: {
        externalId: true,
        action: true,
        entityType: true,
        createdAt: true,
        actorRole: true,
        reason: true,
        beforeState: true,
        afterState: true,
        requestId: true,
        actor: { select: { externalId: true, member: { select: { fullName: true } } } },
      },
    }),
  ]);
  return {
    total,
    page: query.page,
    records: rows.map((row) => ({
      ...row,
      beforeState: safeAuditSnapshot(row.beforeState),
      afterState: safeAuditSnapshot(row.afterState),
    })),
  };
}
