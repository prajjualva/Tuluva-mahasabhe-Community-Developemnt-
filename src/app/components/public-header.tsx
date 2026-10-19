import Link from "next/link";
export function PublicHeader() {
  return (
    <header className="public-header">
      <Link className="brand-lockup" href="/">
        <span className="brand-seal" aria-hidden="true">
          CS
        </span>
        <span>
          Community Support<small>FOUNDATION</small>
        </span>
      </Link>
      <div className="public-links">
        <Link href="/death-support-events">Support events</Link>
        <Link href="/login">
          Member sign in <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </header>
  );
}
