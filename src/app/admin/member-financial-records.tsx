import { paymentPurposeLabel } from "../member/payment-feedback";

type Due = {
  externalId: string;
  amountPaise: number;
  purpose: string;
  status: string;
  dueAt: string;
};
type Payment = {
  externalId: string;
  amountPaise: number;
  method: string;
  status: string;
  createdAt?: string;
  due?: { purpose: string; status: string } | null;
  receipt: { receiptNumber: string } | null;
};
const money = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value / 100);
export const recordStatusLabel = (value: string) => value.toLowerCase().replaceAll("_", " ");

export function AdminMemberFinancialRecords({
  dues,
  payments,
}: {
  dues: Due[];
  payments: Payment[];
}) {
  return (
    <div className="member-financial-records">
      <section aria-label="Member dues">
        <h4>Dues</h4>
        {!dues.length && <p className="muted">No dues recorded.</p>}
        <ul className="member-record-list">
          {dues.map((due) => (
            <li key={due.externalId}>
              <div className="member-record-heading">
                <strong>{paymentPurposeLabel(due.purpose)}</strong>
                <strong className="member-record-amount">{money(due.amountPaise)}</strong>
              </div>
              <div className="member-record-meta">
                <span className="member-record-status" data-status={due.status}>
                  {recordStatusLabel(due.status)}
                </span>
                <span>
                  Due {new Date(due.dueAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Member payment history">
        <h4>Payment history</h4>
        {!payments.length && <p className="muted">No payments recorded.</p>}
        <ul className="member-record-list">
          {payments.map((payment) => (
            <li key={payment.externalId}>
              <div className="member-record-heading">
                <strong>
                  {payment.due ? paymentPurposeLabel(payment.due.purpose) : "Foundation payment"}
                </strong>
                <strong className="member-record-amount">{money(payment.amountPaise)}</strong>
              </div>
              <div className="member-record-meta">
                <span className="member-record-status" data-status={payment.status}>
                  {recordStatusLabel(payment.status)}
                </span>
                <span>{recordStatusLabel(payment.method)}</span>
                {payment.createdAt && (
                  <span>
                    {new Date(payment.createdAt).toLocaleDateString("en-IN", {
                      dateStyle: "medium",
                    })}
                  </span>
                )}
              </div>
              {payment.status === "PENDING" && payment.due?.status === "WAIVED" && (
                <p className="member-record-note">
                  Fee exempted. The previous gateway order is retained for reconciliation; this is
                  not a payment request.
                </p>
              )}
              {payment.receipt ? (
                <a
                  className="member-receipt-link"
                  href={`/api/admin/receipts/${encodeURIComponent(payment.receipt.receiptNumber)}/download`}
                >
                  Download receipt <span aria-hidden="true">↗</span>
                </a>
              ) : (
                <p className="member-record-note">Receipt available after confirmed payment.</p>
              )}
              <details className="member-record-reference">
                <summary>Payment reference</summary>
                <code>{payment.externalId}</code>
                {payment.receipt && (
                  <p>
                    Receipt: <code>{payment.receipt.receiptNumber}</code>
                  </p>
                )}
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
