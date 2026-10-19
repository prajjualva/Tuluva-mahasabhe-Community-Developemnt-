import Link from "next/link";
import { requirePagePermission } from "../../server/http/page-authorize";
import { SignOutButton } from "../member/sign-out-button";

export default async function AccountUnavailable() {
  await requirePagePermission("member:cash:remit", "/account-unavailable");
  return (
    <main>
      <h1>Membership access is closed</h1>
      <p>
        Please contact Foundation Admin for assistance. Only Admin can reopen a closed membership;
        your member identity and historical records are preserved.
      </p>
      <p>
        If you previously collected cash, you can still submit remittance evidence without regaining
        Coordinator access.
      </p>
      <Link href="/member/cash-remittances">Resolve my outstanding cash remittances</Link>
      <SignOutButton />
    </main>
  );
}
