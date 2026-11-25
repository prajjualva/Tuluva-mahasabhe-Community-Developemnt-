import { describe, expect, it } from "vitest";
import {
  membershipPackPdf,
  membershipPackAttachments,
} from "../src/server/members/membership-pack-documents";
import type { readOwnMembershipPack } from "../src/server/members/membership-pack-service";
type Pack = NonNullable<Awaited<ReturnType<typeof readOwnMembershipPack>>>;
export const sampleMembershipPack = {
  id: "00000000-0000-4000-8000-000000000003",
  externalId: "00000000-0000-4000-8000-000000000004",
  memberId: "00000000-0000-4000-8000-000000000005",
  paymentId: "00000000-0000-4000-8000-000000000006",
  grantId: null,
  grant: null,
  fullName: "ಪೂಜಾ ಶೆಟ್ಟಿ / Pooja Shetty",
  address: "Sample House, Review Street, Mangaluru, Karnataka 575006",
  mobile: "+919000009000",
  photoBytes: null,
  issuedAt: new Date("2026-11-25T05:00:00Z"),
  validUntil: new Date("2027-11-25T05:00:00Z"),
  testOnly: true,
  certificateNumber: "TEST-TM-MEM-12345678",
  member: { externalId: "00000000-0000-4000-8000-000000000001" },
  payment: {
    externalId: "00000000-0000-4000-8000-000000000002",
    amountPaise: 36900,
    method: "WALLET",
    receipt: {
      id: "receipt",
      paymentId: "payment",
      issuedAt: new Date("2026-11-25T05:00:00Z"),
      receiptNumber: "TEST-RCP-2026-12345678",
    },
  },
} satisfies Pack;
describe("issued membership PDF documents", () => {
  it("labels a no-payment Admin grant as an exemption record rather than a financial receipt", async () => {
    const attachments = await membershipPackAttachments({
      ...sampleMembershipPack,
      paymentId: null,
      payment: null,
      grantId: "00000000-0000-4000-8000-000000000009",
      grant: { externalId: "00000000-0000-4000-8000-000000000010" },
    });
    expect(attachments).toHaveLength(3);
    expect(attachments.some((item) => item.filename.includes("fee-exemption-record"))).toBe(true);
    expect(attachments.some((item) => item.filename.includes("receipt"))).toBe(false);
  });
  it.each(["id-card", "certificate", "receipt"] as const)(
    "renders a deterministic %s for email idempotency, with embedded Kannada font",
    async (kind) => {
      const first = await membershipPackPdf(sampleMembershipPack, kind);
      const replay = await membershipPackPdf(sampleMembershipPack, kind);
      expect(first.subarray(0, 4).toString()).toBe("%PDF");
      expect(first.equals(replay)).toBe(true);
      expect(first.length).toBeLessThan(1024 * 1024);
      expect(first.toString("latin1")).toContain("/FontFile2");
      expect(first.toString("latin1")).not.toContain("/JavaScript");
    },
  );
});
