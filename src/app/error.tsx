"use client";
import Link from "next/link";
export default function ApplicationError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main>
      <p className="eyebrow">LET'S TRY THAT AGAIN</p>
      <h1>This page could not be loaded.</h1>
      <p>
        No successful payment is confirmed by this error page. If you were paying, check your
        payment history before trying another payment.
      </p>
      <button onClick={reset}>Retry this page</button>
      <p>
        <Link href="/login">Sign in again</Link> · <Link href="/">Foundation home</Link>
      </p>
    </main>
  );
}
