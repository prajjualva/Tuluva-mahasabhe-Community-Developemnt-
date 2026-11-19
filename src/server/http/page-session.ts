import { cookies } from "next/headers";
import { cache } from "react";
import { readActiveAccessPrincipal } from "./authorize";

export const readPageSession = cache(async () => {
  const token = (await cookies()).get("access_token")?.value;
  if (!token) return null;
  try {
    const principal = await readActiveAccessPrincipal(token);
    const { permissions, coordinatorActive, memberUnavailable } = principal;
    const dashboard = permissions.has("admin:*")
      ? "/admin"
      : permissions.has("payment:review")
        ? "/payment-review"
        : memberUnavailable
          ? "/account-unavailable"
          : coordinatorActive && permissions.has("coordinator:members:manage")
            ? "/coordinator"
            : permissions.has("member:profile:read")
              ? "/member"
              : "/access-denied";
    return { dashboard, permissions, coordinatorActive, memberUnavailable };
  } catch {
    return null;
  }
});
