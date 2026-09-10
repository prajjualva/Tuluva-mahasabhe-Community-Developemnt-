import { AdminPlanQueue } from "./plan-queue";
import { AdminCashQueue } from "./cash-queue";
import { AdminAuditFeed } from "./audit-feed";
import { AdminWalletCredit } from "./wallet-credit";
import { AdminPaymentRefunds } from "./payment-refunds";
import { requirePagePermission } from "../../server/http/page-authorize";
const queues = [
  "Member status summary",
  "Coordinator management",
  "Plan approvals",
  "Nominee verification",
  "Death report review",
  "Cash verification",
  "Foundation Ledger",
  "Audit activity",
];
export default async function AdminDashboard() {
  await requirePagePermission("admin:*", "/admin");
  return (
    <main>
      <p className="eyebrow">ADMIN COMMAND CENTER</p>
      <h1>Foundation operations</h1>
      <p>Administrative queues require an authorized Admin session and are fully audited.</p>
      <div className="grid">
        {queues.map((queue) => (
          <article key={queue}>
            <p>{queue}</p>
            <strong>Available after secure sign-in</strong>
          </article>
        ))}
      </div>
      <AdminPlanQueue />
      <AdminCashQueue />
      <AdminWalletCredit />
      <AdminPaymentRefunds />
      <AdminAuditFeed />
    </main>
  );
}
