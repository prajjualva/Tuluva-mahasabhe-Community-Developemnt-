import { describe, expect, it } from "vitest";
import { coordinatorAppointmentState } from "../src/domain/coordinator-appointment";

describe("Coordinator appointment readiness", () => {
  it.each(["CLOSED", "DECEASED"])("refuses a %s member", (memberStatus) => {
    expect(
      coordinatorAppointmentState({
        memberStatus,
        hasCoordinatorProfile: false,
        pendingFeePayments: 0,
      }),
    ).toMatchObject({ canAppoint: false, code: "MEMBER_UNAVAILABLE" });
  });
  it("directs existing and suspended profiles to Coordinator management", () => {
    expect(
      coordinatorAppointmentState({
        memberStatus: "ACTIVE",
        hasCoordinatorProfile: true,
        pendingFeePayments: 0,
      }),
    ).toMatchObject({ canAppoint: false, code: "ALREADY_COORDINATOR" });
  });
  it("requires server verification rather than treating a pending fee as paid", () => {
    expect(
      coordinatorAppointmentState({
        memberStatus: "ACTIVE",
        hasCoordinatorProfile: false,
        pendingFeePayments: 1,
      }),
    ).toMatchObject({ canAppoint: true, code: "FEES_PENDING" });
  });
});
