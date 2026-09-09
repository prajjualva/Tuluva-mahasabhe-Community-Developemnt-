import { NextRequest } from "next/server";
import { verifyAccessToken } from "../auth/session";
import { requirePermission } from "../auth/authorization";
export async function requireApiPermission(request: NextRequest, permission: string) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthenticated");
  const principal = await verifyAccessToken(token);
  requirePermission({ ...principal }, permission);
  return principal;
}
