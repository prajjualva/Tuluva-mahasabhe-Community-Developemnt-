import Link from "next/link";
import { notFound } from "next/navigation";
import { isReviewWorkspace } from "../../server/deployment/review-environment";

export const dynamic = "force-dynamic";

export default function ReviewGuide() {
  if (!isReviewWorkspace()) notFound();
  return (
    <main className="page-shell">
      <p className="eyebrow">GOOGLE PLAY REVIEW</p>
      <h1>Test the Member experience</h1>
      <p>This workspace contains fictional people and test funds. Use only sample information.</p>
      <ol>
        <li>
          Sign in with the reusable Member credentials supplied in Play Console. No OTP is required.
        </li>
        <li>
          The Wallet reviewer has test credit. Pay the membership or plan due from Wallet, then open
          the resulting TEST receipt.
        </li>
        <li>
          The Online reviewer has a small test wallet balance. Start the plan payment to test the
          wallet and online split, or pay a contribution online.
        </li>
        <li>
          Razorpay checkout must display Test Mode. Use its mock Netbanking success or failure
          screen. Never enter real payment details.
        </li>
        <li>
          Payment status changes only after the verified gateway response. Reopen My dues and
          Receipts to check the result.
        </li>
        <li>
          View sample events, community news, profile, nominees, ID card and account-deletion
          requests. Report or block a sample comment to test safety controls.
        </li>
      </ol>
      <p>
        Staff approvals remain permission restricted. Reviewer accounts have Member access only.
        Contact the developer through Play Console if test credit needs replenishing.
      </p>
      <Link className="button" href="/member">
        Open Member workspace
      </Link>{" "}
      <Link href="/login">Sign in</Link>
    </main>
  );
}
