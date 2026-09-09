import { MemberPortal } from "./member-portal";
export default async function MemberSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <MemberPortal section={section} />;
}
