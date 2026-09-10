import Link from "next/link";

export default function Home() {
  return (
    <main>
      <p className="eyebrow">COMMUNITY SUPPORT FOUNDATION</p>
      <h1>Member services, built on trust.</h1>
      <p>Sign in to access your private Member, Coordinator, or Administrator portal.</p>
      <p>
        <Link href="/login">Sign in</Link> · <Link href="/death-report">Report a death</Link> ·{" "}
        <Link href="/death-support-events">Death Support Events</Link>
      </p>
    </main>
  );
}
