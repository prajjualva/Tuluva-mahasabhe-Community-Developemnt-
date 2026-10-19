import { MemberPortal } from "./member-portal";
import { requirePagePermission } from "../../../server/http/page-authorize";
import { notFound } from "next/navigation";
export default async function MemberSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (
    ![
      "membership",
      "community-support-plan",
      "dues",
      "payments-receipts",
      "wallet",
      "notifications",
      "community-news",
    ].includes(section)
  )
    notFound();
  await requirePagePermission("member:profile:read", `/member/${section}`);
  return <MemberPortal section={section} />;
}
