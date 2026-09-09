import { AdminPlanQueue } from "./plan-queue";
import { AdminCashQueue } from "./cash-queue";
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
export default function AdminDashboard() {
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
    </main>
  );
}
