import { MemberPortal } from "./[section]/member-portal";
import { requirePagePermission } from "../../server/http/page-authorize";

export default async function MemberDashboard() {
  await requirePagePermission("member:profile:read", "/member");
  return <MemberPortal section="dashboard" />;
}
