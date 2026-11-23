import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "../components/public-header";
import { PrivacyLinks } from "../components/privacy-links";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <>
      <PublicHeader />
      <main className="policy-page">
        <h1>Privacy policy</h1>
        <p className="muted">Tuluva Mahasabhe · Updated 23 November 2026</p>
        <p>
          Tuluva Mahasabhe community development program of Tuluworld Foundation manages community
          membership, contributions and reviewed support requests. Contact{" "}
          <a href="mailto:tuluworld@gmail.com">tuluworld@gmail.com</a> with questions about your
          personal information or to exercise your privacy rights.
        </p>
        <h2>Information you provide</h2>
        <p>
          We collect your name, email address, mobile number, address, referral and Coordinator
          assignment, membership details and an optional profile photo. We keep verification status,
          password hashes and account security records to protect access.
        </p>
        <p>
          Nominee and support workflows may collect nominee relationships, contact and identity
          details, bank details, incident information, dates of birth or death, and documents needed
          to review a case. Provide information about another person only when you are authorized to
          do so. Published events and community comments may contain information approved for public
          display.
        </p>
        <h2>Payments and account activity</h2>
        <p>
          We record dues, membership and plan payments, contribution obligations, receipts,
          Foundation Wallet movements, cash collection evidence, refunds and support payments.
          Online checkout is provided by Razorpay. Payment credentials entered into Razorpay
          checkout are handled by Razorpay. The Foundation receives payment references, amounts and
          status information to reconcile payments.
        </p>
        <p>
          Session cookies keep you signed in. We also use account and request information to limit
          abuse, diagnose failures and audit sensitive actions. Network, hosting and payment
          providers may process technical information needed to deliver their services.
        </p>
        <p>
          Payment checkout can collect device identifiers, browser and network information, cookies,
          interactions and approximate location inferred from your IP address for payment processing
          and fraud prevention. The Foundation app does not request GPS access. See Razorpay’s{" "}
          <a href="https://razorpay.com/buyer-privacy-notice/">buyer privacy notice</a>
          for its handling of checkout information.
        </p>
        <p>
          We retain comment reports, moderation decisions and your blocked-author preferences.
          Reports are available to authorized Foundation Admins, not published to other members.
          Blocking affects signed-in comment visibility; it does not erase public comments. Read our{" "}
          <Link href="/community-rules">community rules</Link> before posting.
        </p>
        <h2>How information is used and shared</h2>
        <p>
          We use information to administer membership, verify contacts and nominees, collect
          contributions, review support eligibility, issue receipts, prevent fraud and communicate
          service updates. Authorized Foundation staff and assigned Coordinators access information
          according to their responsibilities. Bank details and restricted evidence use dedicated
          access controls.
        </p>
        <p>
          The platform uses Vercel for hosting, Neon for its database, AWS S3 for restricted
          document storage, Resend for email and Razorpay for online payments. These providers
          process the information necessary for their respective functions. Their infrastructure may
          process information outside India. We may disclose information when required by applicable
          law or to resolve a payment, safety or fraud dispute.
        </p>
        <h2>Public community content</h2>
        <p>
          Approved Death Support Events and public condolences can be visible to visitors. Community
          news has its designated audience. Avoid posting bank details, identity documents,
          passwords or private contact information in comments.
        </p>
        <h2>Storage and security</h2>
        <p>
          We use encrypted connections, password hashing, encrypted bank details, private document
          storage and access checks. Your profile photo is stored privately and is accessible
          through your signed-in account. An ID card you download is saved on your device and can be
          shared by you.
        </p>
        <h2>Retention and deletion</h2>
        <p>
          You can edit your profile and remove its photo from My profile. To request deletion of
          your account and associated personal data, use the{" "}
          <Link href="/delete-account">account deletion page</Link> or email the Foundation from
          your registered email address.
        </p>
        <p>
          The Foundation reviews identity and identifies information that must be retained for
          accounting, financial reconciliation, dispute resolution, fraud prevention or legal
          obligations. Payment, receipt, contribution, support and audit records may need to be
          retained for those purposes. We will explain any retained information, the reason for
          retaining it and the applicable retention period when handling your request. Backups and
          provider records are subject to their applicable retention arrangements.
        </p>
        <h2>Help and changes</h2>
        <p>
          Contact <a href="mailto:tuluworld@gmail.com">tuluworld@gmail.com</a> for access,
          correction or deletion requests, or to report a privacy concern. Material changes to this
          notice will be reflected on this page with an updated date.
        </p>
        <PrivacyLinks />
      </main>
    </>
  );
}
