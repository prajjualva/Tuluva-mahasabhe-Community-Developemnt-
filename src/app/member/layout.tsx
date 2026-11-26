import { MemberNavigation } from "./member-navigation";
import { OrganizationBrand } from "../components/organization-brand";
import { SignOutButton } from "./sign-out-button";
import { PendingDuesReminder } from "../components/pending-dues-reminder";
import { readPageSession } from "../../server/http/page-session";
import { canReadMemberIdCard } from "../../server/members/member-card-access";
export default async function MemberLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await readPageSession();
  const canViewIdCard =
    session && !session.onboardingPaymentRequired
      ? await canReadMemberIdCard(session.userId)
      : false;
  return (
    <div className="shell member-shell">
      <PendingDuesReminder />
      <aside className="portal-sidebar">
        <OrganizationBrand href="/member" />
        <MemberNavigation canViewIdCard={!!canViewIdCard} />
        <SignOutButton />
      </aside>
      <section className="workspace">{children}</section>
    </div>
  );
}
