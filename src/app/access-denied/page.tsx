import Link from "next/link";
import { PublicHeader } from "../components/public-header";
import { SignOutButton } from "../member/sign-out-button";

export default function AccessDeniedPage() {
  return (
    <>
      <PublicHeader />
      <main>
        <p className="eyebrow">ACCOUNT ACCESS</p>
        <h1>This workspace isn’t available to your account.</h1>
        <p>
          You are signed in, but your current permissions do not allow this workspace. Signing in
          again with the same account will not change those permissions.
        </p>
        <p>
          If you believe you should have access, contact Foundation Admin. Suspended Coordinator
          access must be restored by an authorized Admin.
        </p>
        <p>
          <Link href="/member">Return to my member portal →</Link>
        </p>
        <SignOutButton />
      </main>
    </>
  );
}
