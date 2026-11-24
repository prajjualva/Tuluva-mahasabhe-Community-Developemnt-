import { notFound, redirect } from "next/navigation";
import { reviewPortalUrl } from "../../server/deployment/review-portal";

export const dynamic = "force-dynamic";

export default function AppReviewPage() {
  const destination = reviewPortalUrl();
  if (!destination) notFound();
  // No credential or session token is ever forwarded to the separate workspace.
  redirect(destination);
}
