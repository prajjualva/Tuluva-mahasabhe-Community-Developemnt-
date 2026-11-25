import Link from "next/link";
import { requirePagePermission } from "../../../server/http/page-authorize";
import { readOwnMembershipPack } from "../../../server/members/membership-pack-service";
import { OtpWorkflow } from "../../components/otp-workflow";
import { prisma } from "../../../server/database/prisma";
import { isEmailOnlyPilot } from "../../../server/auth/otp-delivery";
import { scheduleNotificationDelivery } from "../../../server/notifications/notification-delivery-service";

export default async function MembershipDocuments() {
  const actor = await requirePagePermission("member:profile:read", "/member/membership-documents");
  const pack = await readOwnMembershipPack(actor.userId);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { emailVerifiedAt: true },
  });
  if (pack && user.emailVerifiedAt)
    scheduleNotificationDelivery({
      userId: actor.userId,
      relatedExternalId: pack.externalId,
      limit: 3,
    });
  return (
    <main className="portal-content">
      <p className="eyebrow">MY MEMBERSHIP</p>
      <h1>Membership documents</h1>
      <p>
        Your issued documents record your membership at the time of issue. Check your membership
        screen for current status.
      </p>
      {pack ? (
        <article>
          <h2>Your membership pack</h2>
          <p>Certificate {pack.certificateNumber}</p>
          <div className="membership-document-actions">
            {(
              [
                ["id-card", "Download ID card"],
                ["certificate", "Download certificate"],
                ["receipt", "Download payment receipt"],
              ] as const
            ).map(([kind, label]) => (
              <a key={kind} href={`/api/member/membership-documents/${pack.externalId}/${kind}`}>
                {kind === "receipt" && pack.grant ? "Download fee exemption record" : label}
              </a>
            ))}
          </div>
          <p>
            {user.emailVerifiedAt
              ? "Your welcome email and documents are queued for delivery to your verified email. Downloads remain available here."
              : "Verify your email below to receive your welcome email and attached membership documents."}
          </p>
          {user.emailVerifiedAt && (
            <form action="/api/member/membership-documents/email" method="post">
              <button>Send my membership pack again</button>
            </form>
          )}
        </article>
      ) : (
        <article>
          <p>
            No initial membership pack has been issued for this account. Your current ID card and
            payment receipts are available from their screens.
          </p>
          <Link href="/member/id-card">View current ID card</Link>
        </article>
      )}
      {!user.emailVerifiedAt && <OtpWorkflow member emailOnly={isEmailOnlyPilot()} />}
      <Link href="/member/membership">View current membership</Link>
    </main>
  );
}
