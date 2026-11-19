import { StakeholderDemo } from "../demo/stakeholder-demo";
import { requirePagePermission } from "../../server/http/page-authorize";

export default async function PaymentReviewPage() {
  await requirePagePermission("payment:review", "/payment-review");
  return <StakeholderDemo livePortal={false} paymentReview />;
}
