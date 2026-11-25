import { requirePagePermission } from "../../server/http/page-authorize";
import { isEmailOnlyPilot } from "../../server/auth/otp-delivery";
import { readOwnOnboarding } from "../../server/members/onboarding-service";
import { MembershipPayment } from "./payment";
import { OrganizationBrand } from "../components/organization-brand";
import { SignOutButton } from "../member/sign-out-button";
import { redirect } from "next/navigation";

export default async function MembershipPaymentPage() {
  const actor = await requirePagePermission("member:profile:read", "/membership-payment");
  const state = await readOwnOnboarding(actor.userId);
  if (!state.due) redirect("/member");
  return (
    <main className="onboarding-shell">
      <header>
        <OrganizationBrand href="/membership-payment" />
        <SignOutButton />
      </header>
      <MembershipPayment initial={state} emailOnly={isEmailOnlyPilot()} />
    </main>
  );
}
