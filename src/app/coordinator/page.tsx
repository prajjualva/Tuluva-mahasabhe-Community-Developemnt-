import { CoordinatorPlanQueue } from "./plan-queue";
import { CoordinatorCashCollection } from "./cash-collection";
const metrics = [
  "Assigned Members",
  "Pending dues",
  "Expired dues",
  "Nominee verifications",
  "Death reports",
  "Cash awaiting verification",
];
export default function CoordinatorDashboard() {
  return (
    <main>
      <p className="eyebrow">COORDINATOR CONSOLE</p>
      <h1>Coordinator overview</h1>
      <p>
        Member activity and assigned-work queues are available only to authorized active
        Coordinators.
      </p>
      <div className="grid">
        {metrics.map((metric) => (
          <article key={metric}>
            <p>{metric}</p>
            <strong>Secure data available after sign-in</strong>
          </article>
        ))}
      </div>
      <CoordinatorPlanQueue />
      <CoordinatorCashCollection />
    </main>
  );
}
