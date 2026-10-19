import { requirePagePermission } from "../../../server/http/page-authorize";
import { MemberProfile } from "../member-profile";
export default async function CoordinatorPage() {
  await requirePagePermission("member:profile:read", "/member/coordinator");
  return (
    <main>
      <h1>My Coordinator</h1>
      <MemberProfile coordinatorOnly />
    </main>
  );
}
