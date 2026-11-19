import Link from "next/link";

export function PrivacyLinks() {
  return (
    <nav className="privacy-links" aria-label="Privacy and account help">
      <Link href="/privacy">Privacy</Link>
      <Link href="/delete-account">Delete account</Link>
      <a href="mailto:tuluworld@gmail.com">Contact support</a>
    </nav>
  );
}
