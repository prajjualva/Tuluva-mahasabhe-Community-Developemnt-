import { requirePagePermission } from "../../../server/http/page-authorize";
import { CashReconciliation } from "../../components/cash-reconciliation";
export default async function CashRemittancesPage() {
  await requirePagePermission("member:cash:remit", "/member/cash-remittances");
  return (
    <main>
      <h1>Cash remittance recovery</h1>
      <p>
        You can submit evidence for your own previously collected payments, including while your
        Coordinator role is suspended.
      </p>
      <CashReconciliation />
    </main>
  );
}
