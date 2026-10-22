import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  member: vi.fn(),
  existing: vi.fn(),
  event: vi.fn(),
  wallet: vi.fn(),
  settle: vi.fn(),
  select: vi.fn(),
  create: vi.fn(),
  checkout: vi.fn(),
  availability: vi.fn(),
}));
vi.mock("../src/server/http/authorize", () => ({ requireApiPermission: mocks.authorize }));
vi.mock("../src/server/database/prisma", () => ({
  prisma: {
    payment: { findUnique: mocks.existing },
    contribution: { findFirst: mocks.event },
    wallet: { findUnique: mocks.wallet },
  },
}));
vi.mock("../src/server/payments/payment-service", () => ({
  memberIdForUser: mocks.member,
  createPaymentCommand: mocks.create,
}));
vi.mock("../src/server/payments/wallet-service", () => ({ payDueFromWallet: mocks.settle }));
vi.mock("../src/server/payments/contribution-service", () => ({
  selectContributionDue: mocks.select,
}));
vi.mock("../src/server/payments/online-payment-service", () => ({
  createOnlineCheckout: mocks.checkout,
  onlinePaymentAvailability: mocks.availability,
}));
import { POST } from "../src/app/api/member/contributions/pay/route";

describe("contribution checkout settlement and replay", () => {
  const eventExternalId = "23ca8ef5-2f29-414a-b2c0-d0ef84322d35";
  const payment = {
    id: "internal-payment",
    externalId: "public-payment",
    memberId: "internal-member",
    dueId: "internal-due",
    method: "WALLET",
    status: "SUCCEEDED",
    amountPaise: 10_000,
    due: { purpose: "CONTRIBUTION", externalId: "public-due" },
  };
  const invoke = (body = {}) =>
    POST(
      new NextRequest("http://localhost/api/member/contributions/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          method: "ONLINE",
          idempotencyKey: "same-contribution-command",
          ...body,
        }),
      }),
    );
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ userId: "actor" });
    mocks.member.mockResolvedValue("internal-member");
    mocks.existing.mockResolvedValue(null);
    mocks.wallet.mockResolvedValue({ balancePaise: 10_000 });
    mocks.select.mockResolvedValue({
      id: "internal-due",
      externalId: "public-due",
      amountPaise: 10_000,
    });
    mocks.settle.mockResolvedValue({ payment });
    mocks.availability.mockReturnValue({ available: false });
    mocks.event.mockResolvedValue({ id: "internal-contribution" });
  });
  it("returns the actual wallet settlement method for an online wallet-first request", async () => {
    const response = await invoke();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ method: "WALLET", status: "SUCCEEDED", amountPaise: 10_000 });
    expect(JSON.stringify(body)).not.toContain("internal-");
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("replays an online intent that already settled from wallet without another debit", async () => {
    mocks.existing.mockResolvedValue(payment);
    const response = await invoke();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "SUCCEEDED", method: "WALLET" });
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("rejects reuse of a command for a different specific event", async () => {
    mocks.existing.mockResolvedValue(payment);
    mocks.event.mockResolvedValue(null);
    expect((await invoke({ method: "WALLET", eventExternalId })).status).toBe(400);
    expect(mocks.event.mock.calls[0][0].where).toMatchObject({
      memberId: "internal-member",
      dueId: "internal-due",
      event: { externalId: eventExternalId },
    });
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  it("does not replay another member's payment", async () => {
    mocks.existing.mockResolvedValue({ ...payment, memberId: "someone-else" });
    expect((await invoke()).status).toBe(400);
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  it("does not replace an existing online command with a wallet command", async () => {
    mocks.existing.mockResolvedValue({ ...payment, method: "ONLINE", status: "PENDING" });
    expect((await invoke({ method: "WALLET" })).status).toBe(400);
  });
  it("does not resume a pending attempt for a cancelled or waived contribution", async () => {
    for (const status of ["CANCELLED", "WAIVED"]) {
      mocks.existing.mockResolvedValue({
        ...payment,
        method: "ONLINE",
        status: "PENDING",
        due: { ...payment.due, status, dueAt: new Date() },
      });
      expect((await invoke()).status).toBe(400);
    }
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("keeps expired contribution dues payable while requiring real provider checkout", async () => {
    mocks.existing.mockResolvedValue({
      ...payment,
      method: "ONLINE",
      status: "PENDING",
      due: { ...payment.due, status: "EXPIRED", dueAt: new Date(0) },
    });
    mocks.checkout.mockResolvedValueOnce({
      available: true,
      checkout: { orderId: "provider-order" },
    });
    const response = await invoke();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "PENDING",
      method: "ONLINE",
      checkout: { orderId: "provider-order" },
    });
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  it("reports unavailable online payment without creating or settling a payment", async () => {
    mocks.wallet.mockResolvedValue({ balancePaise: 0 });
    expect((await invoke()).status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });
});
