import { MemberPortal } from "./member-portal";
import { requirePagePermission } from "../../../server/http/page-authorize";
export default async function MemberSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  await requirePagePermission("member:profile:read", `/member/${section}`);
  return <MemberPortal section={section} />;
}
