import { CoordinatorPlanQueue } from "./plan-queue";
import { CoordinatorCashCollection } from "./cash-collection";
import { CoordinatorDeathReportQueue } from "./death-report-queue";
import { CoordinatorCommentModeration } from "./comment-moderation";
import { CoordinatorNewsManagement } from "./news-management";
import { requirePagePermission } from "../../server/http/page-authorize";
import { CashReconciliation } from "../components/cash-reconciliation";
import { NomineeVerificationQueue } from "../components/nominee-verification";
import { coordinatorDashboardSnapshot } from "../../server/coordinators/coordinator-dashboard-service";
import { DueWaivers } from "../components/due-waivers";
import { OperationsShell } from "../components/operations-shell";
export default async function CoordinatorDashboard() {
  const actor = await requirePagePermission("coordinator:members:manage", "/coordinator");
  const data = await coordinatorDashboardSnapshot(actor.userId);
  const metrics = [
    ["Assigned Members", data.assignedMembers],
    ["Pending dues", data.pendingDues],
    ["Expired dues", data.expiredDues],
    ["Nominee verifications", data.nomineeVerifications],
    ["Death reports", data.deathReports],
    ["Cash awaiting verification", data.cashAwaitingVerification],
  ] as const;
  const overview = (
    <>
      <div className="grid">
        {metrics.map(([metric, count]) => (
          <article key={metric}>
            <p>{metric}</p>
            <strong>{count}</strong>
          </article>
        ))}
      </div>
      <article>
        <h2>Permanent referral code</h2>
        <strong>{data.referralCode}</strong>
        <p>Members may use this code while your Coordinator access is active.</p>
      </article>
      <details>
        <summary>Assigned members (first 100)</summary>
        <ul>
          {data.members.map((member) => (
            <li key={member.externalId}>
              {member.fullName} · {member.status} · {member.externalId}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
  return (
    <OperationsShell
      role="Coordinator"
      panels={[
        {
          id: "overview",
          label: "Overview",
          description:
            "Support your assigned members and keep track of outstanding community work.",
          content: overview,
        },
        {
          id: "plans",
          label: "Plan approvals",
          description: "Review paid plan registrations from members assigned to you.",
          content: <CoordinatorPlanQueue />,
        },
        {
          id: "nominees",
          label: "Nominee verification",
          description:
            "Verify nominees and supporting documents for your current assigned members.",
          content: <NomineeVerificationQueue />,
        },
        {
          id: "death-reports",
          label: "Death reports",
          description:
            "Confirm member reports and forward verified information to Foundation Admin.",
          content: <CoordinatorDeathReportQueue />,
        },
        {
          id: "cash",
          label: "Payment collections",
          description:
            "Record actual cash or manual collections. Member dues settle only after remittance verification.",
          content: <CoordinatorCashCollection />,
        },
        {
          id: "remittances",
          label: "Cash remittances",
          description:
            "Submit deposit evidence and follow collection allocations and discrepancy deadlines.",
          content: <CashReconciliation />,
        },
        {
          id: "waivers",
          label: "Waiver requests",
          description: "Request an Admin decision on an assigned member's unpaid obligation.",
          content: <DueWaivers />,
        },
        {
          id: "news",
          label: "News & comments",
          description:
            "Publish permitted community news, request Foundation-wide approval and moderate comments.",
          content: (
            <>
              <CoordinatorNewsManagement />
              <CoordinatorCommentModeration />
            </>
          ),
        },
      ]}
    />
  );
}
