import Link from "next/link";
import { requirePagePermission } from "../../../server/http/page-authorize";
import { readOwnMemberCard } from "../../../server/members/member-card-service";
import { MemberIdCard } from "./member-id-card";
import { isReviewWorkspace } from "../../../server/deployment/review-environment";
import { MembershipCardPaymentRequiredError } from "../../../server/members/member-card-access";

export default async function MemberIdCardPage() {
  const actor = await requirePagePermission("member:profile:read", "/member/id-card");
  let profile;
  try {
    profile = await readOwnMemberCard(actor.userId);
  } catch (error) {
    if (!(error instanceof MembershipCardPaymentRequiredError)) throw error;
    return (
      <main>
        <h1>Member ID card</h1>
        <article>
          <h2>Membership payment required</h2>
          <p>
            Your member ID card becomes available after verified membership payment or an approved
            Foundation fee exemption.
          </p>
          <Link className="button-link" href="/member/dues">
            View membership payment
          </Link>
        </article>
      </main>
    );
  }

  return (
    <main>
      <Link className="portal-back-link" href="/member/profile">
        ← My profile
      </Link>
      <h1>Member ID card</h1>
      {profile.photoUpdatedAt ? (
        <MemberIdCard
          testOnly={isReviewWorkspace()}
          name={profile.fullName}
          memberId={profile.externalId}
          address={profile.address}
          mobile={profile.user.mobile}
          designation={profile.designation}
          membershipStatus={profile.status}
          validity={profile.validity}
          photoUrl={`/api/member/profile/photo?v=${encodeURIComponent(profile.photoUpdatedAt.toISOString())}`}
          memberSince={profile.joinedAt.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "Asia/Kolkata",
          })}
        />
      ) : (
        <article>
          <p>Add your profile photo to create your member ID card.</p>
          <Link className="button-link" href="/member/profile">
            Add profile photo
          </Link>
        </article>
      )}
    </main>
  );
}
