import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { CoordinatorAppointmentError } from "../src/domain/coordinator-appointment";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), appoint: vi.fn(), delivery: vi.fn() }));
vi.mock("../src/server/http/authorize", () => ({ requireApiPermission: mocks.authorize }));
vi.mock("../src/server/admin/admin-command-service", () => ({
  createCoordinatorProfile: mocks.appoint,
}));
vi.mock("../src/server/notifications/notification-delivery-service", () => ({
  scheduleNotificationDelivery: mocks.delivery,
}));
import { POST } from "../src/app/api/admin/coordinators/route";
const request = () =>
  new NextRequest("https://example.invalid/api/admin/coordinators", {
    method: "POST",
    body: JSON.stringify({ memberExternalId: crypto.randomUUID() }),
  });
describe("Coordinator appointment boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ userId: "admin" });
  });
  it("authorizes before performing financial or role changes", async () => {
    mocks.authorize.mockRejectedValue(new Error("Forbidden"));
    expect((await POST(request())).status).toBe(403);
    expect(mocks.appoint).not.toHaveBeenCalled();
    expect(mocks.delivery).not.toHaveBeenCalled();
  });
  it("shows an allowlisted business failure beside the appointment without leaking internals", async () => {
    mocks.appoint.mockRejectedValue(
      new CoordinatorAppointmentError("FEES_PENDING", "Reconcile the pending payment first."),
    );
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "FEES_PENDING",
      error: "Reconcile the pending payment first.",
    });
    expect(mocks.delivery).not.toHaveBeenCalled();
  });
  it("redacts unexpected provider and database failures", async () => {
    mocks.appoint.mockRejectedValue(new Error("private database connection and credentials"));
    expect(await (await POST(request())).json()).toEqual({
      error: "Coordinator could not be appointed",
    });
  });
});
