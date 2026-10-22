import { describe, expect, it } from "vitest";
import {
  DEMO_STORAGE_KEY,
  demoReducer,
  demoStateSchema,
  initialDemoState,
  demoCheckoutQuote,
  demoNavigation,
  demoSectionForRole,
  applyDemoRoleAction,
} from "../src/demo/stakeholder-state";

const stamp = { id: "payment-1", now: "2026-10-19T10:00:00.000Z" };
const pay = {
  type: "PAY" as const,
  dueId: "due-raghav",
  method: "WALLET_FIRST" as const,
  success: true,
  ...stamp,
};
describe("isolated stakeholder presentation simulator", () => {
  const batch = {
    type: "PAY_ALL" as const,
    dueIds: ["due-raghav", "due-leela", "due-suresh"],
    method: "WALLET_FIRST" as const,
    success: true,
    ...stamp,
  };
  it("settles all outstanding dues in one action with matching allocation and separate receipts", () => {
    const original = initialDemoState();
    const quote = demoCheckoutQuote(original, batch.dueIds, batch.method);
    const state = demoReducer(original, batch);
    expect(quote).toEqual({ totalPaise: 30_000, walletPaise: 20_000, onlinePaise: 10_000 });
    expect(state.dues.every((due) => due.status === "PAID")).toBe(true);
    expect(state.walletPaise).toBe(5000);
    expect(state.payments.reduce((sum, payment) => sum + payment.walletPaise, 0)).toBe(
      quote.walletPaise,
    );
    expect(state.payments.reduce((sum, payment) => sum + payment.onlinePaise, 0)).toBe(
      quote.onlinePaise,
    );
    expect(new Set(state.payments.map((payment) => payment.receiptNumber)).size).toBe(3);
    expect(demoReducer(state, batch)).toBe(state);
  });
  it("does not settle any due or debit the wallet when a full payment fails", () => {
    const state = demoReducer(initialDemoState(), { ...batch, success: false });
    expect(state.walletPaise).toBe(25_000);
    expect(state.dues.every((due) => due.status === "PENDING")).toBe(true);
    expect(state.payments[0].receiptNumber).toBeNull();
    expect(state.movements).toHaveLength(1);
  });
  it("refuses stale, empty or unknown batches before changing anything", () => {
    const state = demoReducer(initialDemoState(), pay);
    for (const dueIds of [[], ["unknown"], batch.dueIds])
      expect(() => demoReducer(state, { ...batch, id: "new", dueIds })).toThrow();
    expect(state.payments).toHaveLength(1);
  });
  it("supports all-online bulk payment without using wallet funds", () => {
    const state = demoReducer(initialDemoState(), { ...batch, method: "ONLINE" });
    expect(state.walletPaise).toBe(25_000);
    expect(state.payments.reduce((sum, item) => sum + item.onlinePaise, 0)).toBe(30_000);
  });
  it("includes membership and approved plan dues in pay-all while preserving the plan split rule", () => {
    let state = demoReducer(initialDemoState(), { type: "RENEW_MEMBERSHIP" });
    state = demoReducer(demoReducer(state, { type: "APPROVE_PLAN" }), { type: "APPROVE_PLAN" });
    const dueIds = state.dues.map((due) => due.id);
    const quote = demoCheckoutQuote(state, dueIds, "WALLET_FIRST");
    state = demoReducer(state, { ...batch, dueIds });
    expect(quote.totalPaise).toBe(166_900);
    expect(state.planStage).toBe("WAITING_PERIOD");
    expect(state.walletPaise).toBe(0);
    expect(state.payments).toHaveLength(5);
    expect(state.payments.reduce((sum, item) => sum + item.onlinePaise, 0)).toBe(quote.onlinePaise);
  });
  it("keeps member navigation separate even when a privileged hash is requested", () => {
    expect(
      demoNavigation.MEMBER.some(([id]) =>
        ["admin", "adminpayments", "approvals", "coordinator", "members"].includes(id),
      ),
    ).toBe(false);
    expect(demoSectionForRole("MEMBER", "admin")).toBe("dashboard");
    expect(demoSectionForRole("COORDINATOR", "admin")).toBe("coordinator");
    expect(demoSectionForRole("ADMIN", "payments")).toBe("admin");
  });
  it("requires Coordinator then Admin review and only lets the member pay", () => {
    let state = initialDemoState();
    expect(() => applyDemoRoleAction(state, "MEMBER", { type: "APPROVE_PLAN" })).toThrow();
    expect(() => applyDemoRoleAction(state, "ADMIN", { type: "APPROVE_PLAN" })).toThrow();
    state = applyDemoRoleAction(state, "COORDINATOR", { type: "APPROVE_PLAN" });
    expect(() => applyDemoRoleAction(state, "COORDINATOR", { type: "APPROVE_PLAN" })).toThrow();
    state = applyDemoRoleAction(state, "ADMIN", { type: "APPROVE_PLAN" });
    expect(state.planStage).toBe("PAYMENT_PENDING");
    expect(() => applyDemoRoleAction(state, "ADMIN", pay)).toThrow();
    expect(applyDemoRoleAction(state, "MEMBER", { ...pay, dueId: "due-plan" }).planStage).toBe(
      "WAITING_PERIOD",
    );
  });
  it("starts with three event dues and no fabricated settled payment", () => {
    const state = initialDemoState();
    expect(state.dues).toHaveLength(3);
    expect(state.payments).toHaveLength(0);
    expect(demoStateSchema.safeParse(state).success).toBe(true);
    expect(DEMO_STORAGE_KEY).toBe("csf:stakeholder-demo:v1");
  });
  it("settles a contribution with linked wallet, receipt, due and inbox changes", () => {
    const state = demoReducer(initialDemoState(), pay);
    expect(state.walletPaise).toBe(15_000);
    expect(state.dues[0].status).toBe("PAID");
    expect(state.payments[0]).toMatchObject({
      receiptNumber: "DEMO-00001",
      walletPaise: 10_000,
      onlinePaise: 0,
    });
    expect(state.movements[0].amountPaise).toBe(-10_000);
    expect(state.notices[0].target).toBe("receipts");
    expect(demoStateSchema.safeParse(state).success).toBe(true);
  });
  it("does not duplicate a paid due even with a different payment command", () => {
    const state = demoReducer(initialDemoState(), pay);
    expect(demoReducer(state, pay)).toBe(state);
    expect(demoReducer(state, { ...pay, id: "other" })).toBe(state);
  });
  it("keeps failure payable and leaves wallet, receipt and movement unchanged", () => {
    const original = initialDemoState();
    const state = demoReducer(original, { ...pay, success: false });
    expect(state.walletPaise).toBe(original.walletPaise);
    expect(state.dues[0].status).toBe("PENDING");
    expect(state.movements).toEqual(original.movements);
    expect(state.payments[0].receiptNumber).toBeNull();
  });
  it("uses online alone when a regular due cannot be covered by the wallet", () => {
    const state = demoReducer({ ...initialDemoState(), walletPaise: 5000 }, pay);
    expect(state.walletPaise).toBe(5000);
    expect(state.payments[0]).toMatchObject({ walletPaise: 0, onlinePaise: 10_000 });
  });
  it("requires both approvals and splits plan registration wallet plus online", () => {
    let state = demoReducer(initialDemoState(), { type: "APPROVE_PLAN" });
    expect(state.planStage).toBe("ADMIN_REVIEW");
    expect(state.dues).toHaveLength(3);
    state = demoReducer(state, { type: "APPROVE_PLAN" });
    expect(state.planStage).toBe("PAYMENT_PENDING");
    expect(demoReducer(state, { type: "APPROVE_PLAN" })).toBe(state);
    state = demoReducer(state, { ...pay, dueId: "due-plan" });
    expect(state.planStage).toBe("WAITING_PERIOD");
    expect(state.walletPaise).toBe(0);
    expect(state.payments[0]).toMatchObject({ walletPaise: 25_000, onlinePaise: 75_000 });
  });
  it("records membership renewal once", () => {
    const state = demoReducer(initialDemoState(), { type: "RENEW_MEMBERSHIP" });
    expect(demoReducer(state, { type: "RENEW_MEMBERSHIP" })).toBe(state);
    expect(demoReducer(state, { ...pay, dueId: "due-membership" }).payments[0].amountPaise).toBe(
      36_900,
    );
  });
  it("credits top-ups once and refuses fractional, negative or excessive amounts", () => {
    const command = { type: "TOP_UP" as const, amountPaise: 50_000, ...stamp };
    const state = demoReducer(initialDemoState(), command);
    expect(state.walletPaise).toBe(75_000);
    expect(demoReducer(state, command)).toBe(state);
    for (const amountPaise of [-1, 1.5, 1_000_001])
      expect(() => demoReducer(initialDemoState(), { ...command, amountPaise })).toThrow();
  });
  it("supports readable notifications, referrals and comments without mutating the original", () => {
    const original = initialDemoState();
    const state = demoReducer(original, { type: "READ", id: "welcome" });
    expect(state.notices[0].read).toBe(true);
    expect(original.notices[0].read).toBe(false);
    const referred = demoReducer(state, {
      type: "REFER",
      id: "new",
      name: " New Member ",
      area: " Udupi ",
    });
    expect(referred.referrals.at(-1)?.name).toBe("New Member");
    const commented = demoReducer(referred, {
      type: "COMMENT",
      id: "comment",
      target: "health",
      body: " Thank you ",
    });
    expect(commented.comments[0].body).toBe("Thank you");
    expect(demoStateSchema.safeParse(commented).success).toBe(true);
    expect(initialDemoState().payments).toEqual([]);
  });
});
