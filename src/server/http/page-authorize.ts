import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requirePermissionForAccessToken } from "./authorize";

/** Protects portal pages as well as their APIs; stale sessions and suspended
 * Coordinators are rejected using the same live database authorization check. */
export async function requirePagePermission(permission: string, nextPath: string) {
  const token = (await cookies()).get("access_token")?.value;
  if (!token) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  try {
    return await requirePermissionForAccessToken(token, permission);
  } catch {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
}
