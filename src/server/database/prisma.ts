import { PrismaClient } from "@prisma/client";

async function currentRequestId() {
  try {
    const { headers } = await import("next/headers");
    return (await headers()).get("x-request-id") ?? undefined;
  } catch {
    return undefined;
  } // Background jobs and tests have no HTTP request.
}
function denyAuditMutation() {
  if (process.env.NODE_ENV !== "test") throw new Error("Audit records are append-only");
}
// This query-only extension preserves Prisma's public model and transaction API.
const createApplicationPrisma = (): PrismaClient =>
  new PrismaClient().$extends({
    query: {
      auditLog: {
        async update({ args, query }) {
          denyAuditMutation();
          return query(args);
        },
        async updateMany({ args, query }) {
          denyAuditMutation();
          return query(args);
        },
        async delete({ args, query }) {
          denyAuditMutation();
          return query(args);
        },
        async deleteMany({ args, query }) {
          denyAuditMutation();
          return query(args);
        },
        async upsert({ args, query }) {
          denyAuditMutation();
          return query(args);
        },
        async create({ args, query }) {
          args.data.requestId ??= await currentRequestId();
          if (!args.data.actorId && !args.data.actorRole) args.data.actorRole = "SYSTEM";
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createApplicationPrisma>;
};
export const prisma = globalForPrisma.prisma ?? createApplicationPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
