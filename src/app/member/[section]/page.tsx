import Link from "next/link";
export default async function MemberSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const title = section.replaceAll("-", " ");
  return (
    <main>
      <p className="eyebrow">MEMBER PORTAL</p>
      <h2>{title}</h2>
      <p>
        This secure section is ready for the authenticated Member data flow being introduced in
        Phase 3.
      </p>
      <p>Private information is always scoped to the signed-in member.</p>
      <Link href="/member">Return to dashboard</Link>
    </main>
  );
}
