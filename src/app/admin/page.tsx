import { AdminPlanQueue } from "./plan-queue";
import { CashReconciliation } from "../components/cash-reconciliation";
import { AdminAuditFeed } from "./audit-feed";
import { AdminWalletCredit } from "./wallet-credit";
import { AdminPaymentRefunds } from "./payment-refunds";
import { AdminDeathSupportQueue } from "./death-support-queue";
import { AdminSupportPaymentQueue } from "./support-payment-queue";
import { AdminNewsQueue } from "./news-queue";
import { AdminCoordinatorManagement } from "./coordinator-management";
import { AdminFoundationLedger } from "./foundation-ledger";
import { AdminOverview } from "./overview";
import { AdminMemberManagement } from "./member-management";
import { NomineeVerificationQueue } from "../components/nominee-verification";
import { requirePagePermission } from "../../server/http/page-authorize";
import { DueWaivers } from "../components/due-waivers";
import { OperationsShell } from "../components/operations-shell";
export default async function AdminDashboard() {
  await requirePagePermission("admin:*", "/admin");
  return (
    <OperationsShell
      role="Admin"
      panels={[
        {
          id: "overview",
          label: "Overview",
          description:
            "Your Foundation at a glance. Review live activity and the decisions that need your attention.",
          content: <AdminOverview />,
        },
        {
          id: "members",
          label: "Members",
          description:
            "Find a member, review their history, manage assignments and reopen eligible closed accounts.",
          content: <AdminMemberManagement />,
        },
        {
          id: "coordinators",
          label: "Coordinators",
          description: "Manage Coordinator appointments, assignments, suspension and restoration.",
          content: <AdminCoordinatorManagement />,
        },
        {
          id: "plans",
          label: "Plan approvals",
          description:
            "Review Community Support Plan approvals, cash permissions and payment deadline extensions.",
          content: <AdminPlanQueue />,
        },
        {
          id: "nominees",
          label: "Nominee verification",
          description:
            "Review restricted evidence and verify nominees without exposing bank data in general records.",
          content: <NomineeVerificationQueue admin />,
        },
        {
          id: "death-reports",
          label: "Death Support Events",
          description:
            "Review death reports, publish verified events and moderate public information.",
          content: <AdminDeathSupportQueue />,
        },
        {
          id: "support",
          label: "Support payments",
          description:
            "Verify eligibility, documents and bank details before authorizing ₹1,00,000 community support.",
          content: <AdminSupportPaymentQueue />,
        },
        {
          id: "payments",
          label: "Payments & refunds",
          description: "Review received payments, unapplied funds and audited refund workflows.",
          content: <AdminPaymentRefunds />,
        },
        {
          id: "cash",
          label: "Cash reconciliation",
          description:
            "Verify deposit evidence, allocate received funds and resolve collection discrepancies.",
          content: <CashReconciliation admin />,
        },
        {
          id: "wallet",
          label: "Foundation Wallet",
          description:
            "Issue authorized Foundation credits with a recorded reason and duplicate protection.",
          content: <AdminWalletCredit />,
        },
        {
          id: "waivers",
          label: "Due waivers",
          description:
            "Decide Coordinator requests. A waiver never automatically activates a membership or plan.",
          content: <DueWaivers admin />,
        },
        {
          id: "ledger",
          label: "Foundation Ledger",
          description:
            "Trace credits, support payments, refunds and evidence-backed operational adjustments.",
          content: <AdminFoundationLedger />,
        },
        {
          id: "news",
          label: "Community news",
          description: "Approve Foundation-wide updates and manage published news and comments.",
          content: <AdminNewsQueue />,
        },
        {
          id: "audit",
          label: "Audit trail",
          description:
            "Search accountable actions by actor, event, reason, timestamp and request reference.",
          content: <AdminAuditFeed />,
        },
      ]}
    />
  );
}
