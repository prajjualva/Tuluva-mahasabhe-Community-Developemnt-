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
  } catch (error) {
    if (
      error instanceof Error &&
      ["Forbidden", "Coordinator access is suspended"].includes(error.message)
    )
      redirect("/access-denied");
    if (
      error instanceof Error &&
      error.message === "Membership access is closed; contact Foundation Admin"
    )
      redirect("/account-unavailable");
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
}
