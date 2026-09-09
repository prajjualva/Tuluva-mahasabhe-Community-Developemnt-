import type { Principal } from "./authorization";
export function mayReadNomineeBankDetails(
  principal: Principal,
  nomineeMemberUserId: string,
): boolean {
  return (
    principal.userId === nomineeMemberUserId ||
    principal.permissions.has("nominee:bank:verify") ||
    principal.permissions.has("admin:*")
  );
}
