export type OfficialReceiptDocument = {
  receiptNumber: string;
  issuedAt: Date;
  amountPaise: number;
  method: string;
  status: string;
  providerReference: string | null;
  paymentExternalId: string;
  member: { externalId: string; fullName: string } | null;
  due: { externalId: string; purpose: string } | null;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const formatMoney = (amountPaise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amountPaise / 100);

/**
 * Produces a self-contained, printable official receipt document. The member
 * download route authorizes ownership before this function is ever called.
 */
export function officialReceiptHtml(receipt: OfficialReceiptDocument) {
  const rows: Array<[string, string]> = [
    ["Receipt number", receipt.receiptNumber],
    ["Issued", receipt.issuedAt.toISOString()],
    ["Member", receipt.member?.fullName ?? "Member"],
    ["Member ID", receipt.member?.externalId ?? "—"],
    ["Purpose", receipt.due?.purpose ?? "Foundation payment"],
    ["Amount", formatMoney(receipt.amountPaise)],
    ["Payment method", receipt.method],
    ["Payment status", receipt.status],
    ["Payment reference", receipt.paymentExternalId],
  ];
  if (receipt.providerReference) rows.push(["Provider reference", receipt.providerReference]);
  const table = rows
    .map(
      ([label, value]) =>
        `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(receipt.receiptNumber)}</title>
<style>body{font-family:Arial,sans-serif;color:#14261d;margin:48px;max-width:720px}h1{margin-bottom:4px}.eyebrow{color:#3b6b4e;font-weight:700;letter-spacing:.08em;font-size:12px}table{border-collapse:collapse;width:100%;margin-top:28px}th,td{padding:12px;border-bottom:1px solid #cbd5cf;text-align:left;vertical-align:top}th{width:35%;color:#395044}footer{margin-top:32px;font-size:12px;color:#53645a}@media print{body{margin:24px}}</style>
</head><body><p class="eyebrow">COMMUNITY SUPPORT FOUNDATION</p><h1>Official payment receipt</h1><p>This document records a successful Foundation payment.</p><table>${table}</table><footer>Keep this receipt for your Foundation records.</footer></body></html>`;
}

export function officialReceiptShareText(receipt: OfficialReceiptDocument) {
  return [
    "Community Support Foundation — Official payment receipt",
    `Receipt: ${receipt.receiptNumber}`,
    `Member: ${receipt.member?.fullName ?? "Member"}`,
    `Purpose: ${receipt.due?.purpose ?? "Foundation payment"}`,
    `Amount: ${formatMoney(receipt.amountPaise)}`,
    `Method: ${receipt.method}`,
    `Status: ${receipt.status}`,
    `Issued: ${receipt.issuedAt.toLocaleString("en-IN")}`,
    `Reference: ${receipt.paymentExternalId}`,
  ].join("\n");
}
