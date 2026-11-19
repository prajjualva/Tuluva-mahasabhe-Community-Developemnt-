import type { Metadata } from "next";
import Link from "next/link";
import { readPageSession } from "../../server/http/page-session";
import { PublicHeader } from "../components/public-header";
import { PrivacyLinks } from "../components/privacy-links";
import { DeletionForm } from "./deletion-form";

export const metadata: Metadata = { title: "Delete account" };
export default async function DeleteAccountPage() {
  const session = await readPageSession();
  return (
    <>
      <PublicHeader />
      <main className="policy-page">
        <h1>Delete your Tuluva Mahasabhe account</h1>
        <p>Request deletion of your Tuluva Mahasabhe account and its associated personal data.</p>
        {session ? (
          <DeletionForm />
        ) : (
          <article>
            <h2>Submit your request</h2>
            <p>
              Sign in to record a request directly, or email the Foundation from your registered
              email address.
            </p>
            <p>
              <Link className="button-link" href="/login?next=%2Fdelete-account">
                Sign in to request deletion
              </Link>
            </p>
            <a href="mailto:tuluworld@gmail.com?subject=Tuluva%20Mahasabhe%20account%20deletion%20request">
              Email tuluworld@gmail.com
            </a>
            <p>
              If you cannot access your account, email your name and registered email or member
              reference. The Foundation will arrange identity verification.
            </p>
          </article>
        )}
        <h2>What happens next</h2>
        <p>
          The Foundation verifies your identity and reviews the request. Profile photos and other
          personal account information are considered for deletion. The Foundation will explain any
          information retained for legal, accounting, fraud-prevention or dispute purposes, why it
          is retained and for how long.
        </p>
        <p>
          Submitting a request records it for review. You can check its status here and cancel it
          while it is under review. Financial obligations, refunds or unresolved support cases may
          require follow-up. Email support if you need help or want to track a request submitted by
          email.
        </p>
        <p>
          Read our <Link href="/privacy">privacy policy</Link> for more about data processing and
          retention.
        </p>
        <PrivacyLinks />
      </main>
    </>
  );
}
