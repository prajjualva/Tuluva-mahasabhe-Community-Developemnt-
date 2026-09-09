import Link from "next/link";

export default function Home() {
  return (
    <main>
      <p className="eyebrow">COMMUNITY SUPPORT FOUNDATION</p>
      <h1>Member services, built on trust.</h1>
      <p>The secure Member portal foundation is ready.</p>
      <Link href="/member">View Member dashboard</Link>
    </main>
  );
}
