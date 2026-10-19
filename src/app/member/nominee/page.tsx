import { requirePagePermission } from "../../../server/http/page-authorize";
import { MemberNomineeManager } from "./nominee-manager";
export default async function NomineePage() {
  await requirePagePermission("member:profile:read", "/member/nominee");
  return (
    <main>
      <h1>My nominees</h1>
      <MemberNomineeManager />
    </main>
  );
}
