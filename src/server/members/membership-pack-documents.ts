import PDFDocument from "pdfkit";
import path from "node:path";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import type { readOwnMembershipPack } from "./membership-pack-service";

type Pack = NonNullable<Awaited<ReturnType<typeof readOwnMembershipPack>>>;
export type MembershipAttachment = {
  filename: string;
  content: string;
  content_type: "application/pdf";
};
export type MembershipDocumentKind = "id-card" | "certificate" | "receipt";
const green = "#163F33";
const cream = "#FAF5EB";
const gold = "#B68532";
const date = (value: Date) =>
  value.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export async function membershipPackPdf(pack: Pack, kind: MembershipDocumentKind) {
  const font = path.join(process.cwd(), "public/fonts/NotoSansKannada.ttf");
  const logo = await readFile(path.join(process.cwd(), "public/brand/tuluva-mahasabhe-logo.jpeg"));
  const doc = new PDFDocument({
    size: kind === "id-card" ? "A6" : "A4",
    layout: kind === "certificate" ? "landscape" : "portrait",
    margin: 0,
    font,
    info: {
      Title: `Tuluva Mahasabhe ${kind}`,
      CreationDate: pack.issuedAt,
      ModDate: pack.issuedAt,
    },
  });
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const text = (
    value: string,
    x: number,
    y: number,
    width: number,
    size = 11,
    color = green,
    align: "left" | "center" = "left",
  ) => {
    doc.fillColor(color).fontSize(size).text(value, x, y, { width, align, lineGap: 2 });
  };
  const background = () => {
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(cream);
  };
  const warning = () => {
    if (pack.testOnly)
      text(
        "TEST ONLY - NO REAL MONEY OR MEMBERSHIP ENTITLEMENT",
        14,
        doc.page.height - (kind === "certificate" ? 48 : 27),
        doc.page.width - 28,
        kind === "id-card" ? 6 : 9,
        "#9C3300",
        "center",
      );
  };
  background();
  if (kind === "id-card") {
    doc.rect(0, 0, doc.page.width, 125).fill(green);
    doc.image(logo, (doc.page.width - 45) / 2, 12, { width: 45 });
    text("Tuluva Mahasabhe", 20, 64, doc.page.width - 40, 16, cream, "center");
    text(
      "Community development program of\nTuluworld Foundation",
      20,
      89,
      doc.page.width - 40,
      8,
      cream,
      "center",
    );
    if (pack.photoBytes)
      doc.image(
        await sharp(Buffer.from(pack.photoBytes)).png().toBuffer(),
        (doc.page.width - 100) / 2,
        145,
        { width: 100, height: 100 },
      );
    let nameSize = 17;
    while (
      nameSize > 8 &&
      doc
        .fontSize(nameSize)
        .heightOfString(pack.fullName, { width: doc.page.width - 40, lineGap: 2 }) > 50
    )
      nameSize -= 0.5;
    text(pack.fullName, 20, 262, doc.page.width - 40, nameSize, green, "center");
    text("MEMBER", 20, 321, doc.page.width - 40, 10, green, "center");
    text(`Member ID\n${pack.member.externalId}`, 20, 349, doc.page.width - 40, 7, green, "center");
    warning();
    doc.addPage({ size: "A6", margin: 0 });
    background();
    text("MEMBERSHIP DETAILS", 22, 25, doc.page.width - 44, 14);
    text(`Phone: ${pack.mobile ?? "Not provided"}`, 22, 65, doc.page.width - 44, 10);
    text(`Valid until: ${date(pack.validUntil)}`, 22, 92, doc.page.width - 44, 10);
    text("Address", 22, 130, doc.page.width - 44, 9);
    const addressWidth = doc.page.width - 44;
    let size = 10;
    while (
      size > 6 &&
      doc.fontSize(size).heightOfString(pack.address, { width: addressWidth, lineGap: 2 }) > 180
    )
      size -= 0.5;
    text(pack.address, 22, 150, addressWidth, size);
    text("Issued by Tuluworld Foundation\ntuluworld@gmail.com", 22, 351, addressWidth, 8);
    warning();
  } else if (kind === "certificate") {
    doc
      .rect(22, 22, doc.page.width - 44, doc.page.height - 44)
      .lineWidth(1)
      .stroke(gold);
    doc.image(logo, (doc.page.width - 62) / 2, 43, { width: 62 });
    text("Tuluva Mahasabhe", 50, 118, doc.page.width - 100, 25, green, "center");
    text(
      "Community development program of Tuluworld Foundation",
      50,
      159,
      doc.page.width - 100,
      11,
      green,
      "center",
    );
    text(
      pack.testOnly ? "TEST MEMBERSHIP CERTIFICATE" : "MEMBERSHIP CERTIFICATE",
      50,
      205,
      doc.page.width - 100,
      17,
      green,
      "center",
    );
    text("This certifies that", 50, 254, doc.page.width - 100, 12, green, "center");
    text(
      pack.fullName,
      60,
      282,
      doc.page.width - 120,
      pack.fullName.length > 65 ? 15 : 23,
      green,
      "center",
    );
    text(
      "is registered as a Member of Tuluva Mahasabhe.",
      50,
      351,
      doc.page.width - 100,
      12,
      green,
      "center",
    );
    text(
      `Member ID: ${pack.member.externalId}\nIssued: ${date(pack.issuedAt)}     Valid until: ${date(pack.validUntil)}\nCertificate: ${pack.certificateNumber}`,
      70,
      393,
      doc.page.width - 140,
      10,
      green,
      "center",
    );
    text(
      "Membership is subject to Foundation rules and current status. Community Support Plan approval and support eligibility are separate.",
      80,
      487,
      doc.page.width - 160,
      9,
      green,
      "center",
    );
    warning();
  } else {
    doc.image(logo, 40, 35, { width: 60 });
    text("Tuluva Mahasabhe", 118, 44, doc.page.width - 160, 22);
    text("Tuluworld Foundation", 118, 83, doc.page.width - 160, 11);
    text(
      pack.grant
        ? "MEMBERSHIP FEE EXEMPTION"
        : pack.testOnly
          ? "TEST PAYMENT RECEIPT"
          : "MEMBERSHIP PAYMENT RECEIPT",
      40,
      146,
      doc.page.width - 80,
      18,
    );
    const rows = [
      [
        pack.grant ? "Exemption record" : "Receipt",
        pack.payment?.receipt?.receiptNumber ?? pack.certificateNumber,
      ],
      ["Name", pack.fullName],
      ["Member ID", pack.member.externalId],
      ["Purpose", "Initial annual membership"],
      [
        "Amount",
        new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
          (pack.payment?.amountPaise ?? 0) / 100,
        ),
      ],
      ["Method", pack.payment?.method ?? "ADMIN FEE EXEMPTION"],
      ["Payment status at issue", pack.grant ? "NO PAYMENT COLLECTED" : "SUCCEEDED"],
      ["Issued", date(pack.issuedAt)],
      [
        pack.grant ? "Grant reference" : "Payment reference",
        pack.payment?.externalId ?? pack.grant!.externalId,
      ],
    ];
    let y = 205;
    for (const [label, value] of rows) {
      text(label, 40, y, 140, 10);
      text(value, 195, y, doc.page.width - 235, 10);
      y += Math.max(
        42,
        doc.fontSize(10).heightOfString(value, { width: doc.page.width - 235 }) + 16,
      );
    }
    text(
      pack.grant
        ? "Foundation Admin approved an initial membership fee exemption. This document acknowledges that exemption. It is not a payment receipt; no money was collected."
        : "This receipt records the verified payment at issue. Later refunds or membership changes remain recorded in your account. Keep this document for your records.",
      40,
      y + 24,
      doc.page.width - 80,
      10,
    );
    warning();
  }
  doc.end();
  return completed;
}

export async function membershipPackAttachments(pack: Pack): Promise<MembershipAttachment[]> {
  const attachments: MembershipAttachment[] = [];
  for (const kind of ["id-card", "certificate", "receipt"] as const) {
    attachments.push({
      filename: `Tuluva-Mahasabhe-${pack.testOnly ? "TEST-" : ""}${pack.grant && kind === "receipt" ? "fee-exemption-record" : kind}.pdf`,
      content: (await membershipPackPdf(pack, kind)).toString("base64"),
      content_type: "application/pdf",
    });
  }
  return attachments;
}
