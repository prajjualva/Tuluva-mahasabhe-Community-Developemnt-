import Link from "next/link";
import { OrganizationBrand } from "./organization-brand";
import { readPageSession } from "../../server/http/page-session";

export async function PublicHeader() {
  const session = await readPageSession();
  return (
    <header className="public-header">
      <OrganizationBrand href={session?.dashboard} />
      <div className="public-links">
        <Link href="/about">About Tuluworld</Link>
        <Link href="/guide">Guide</Link>
        {process.env.NODE_ENV !== "production" && <Link href="/demo">Explore demo</Link>}
        <Link href="/death-support-events">Support events</Link>
        {session ? (
          <>
            {session.permissions.has("member:profile:read") &&
              !session.memberUnavailable &&
              !session.onboardingPaymentRequired && <Link href="/member/profile">My profile</Link>}
            <Link className="public-dashboard-link" href={session.dashboard}>
              {session.onboardingPaymentRequired ? "Complete membership" : "My dashboard"}
            </Link>
          </>
        ) : (
          <Link href="/login">Member sign in</Link>
        )}
      </div>
    </header>
  );
}
