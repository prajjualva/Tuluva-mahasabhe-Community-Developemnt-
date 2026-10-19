import { requirePagePermission } from "../../../server/http/page-authorize";
import { MemberProfile } from "../member-profile";
import { OtpWorkflow } from "../../components/otp-workflow";
export default async function ProfilePage() {
  await requirePagePermission("member:profile:read", "/member/profile");
  return (
    <main>
      <h1>My profile</h1>
      <MemberProfile />
      <OtpWorkflow member />
    </main>
  );
}
