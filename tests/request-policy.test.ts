import { describe, expect, it } from "vitest";
import {
  isAllowedMutationOrigin,
  safeInternalRedirect,
} from "../src/server/security/request-policy";
const command = {
  method: "POST",
  pathname: "/api/member/payments",
  origin: "https://foundation.example",
  fetchSite: "same-origin",
  requestOrigin: "https://foundation.example",
};
describe("request-origin and redirect policy", () => {
  it("allows same-port loopback aliases only for explicit development mode", () => {
    const local = {
      ...command,
      requestOrigin: "http://localhost:3000",
      origin: "http://127.0.0.1:3000",
    };
    expect(isAllowedMutationOrigin(local)).toBe(false);
    expect(isAllowedMutationOrigin({ ...local, allowDevelopmentLoopback: true })).toBe(true);
    expect(
      isAllowedMutationOrigin({
        ...local,
        origin: "http://127.0.0.1:4000",
        allowDevelopmentLoopback: true,
      }),
    ).toBe(false);
    expect(
      isAllowedMutationOrigin({
        ...local,
        fetchSite: "cross-site",
        allowDevelopmentLoopback: true,
      }),
    ).toBe(false);
  });
  it("permits same-origin mutations and rejects foreign origins, including credentialed requests", () => {
    expect(isAllowedMutationOrigin(command)).toBe(true);
    expect(isAllowedMutationOrigin({ ...command, origin: "https://attacker.example" })).toBe(false);
    expect(isAllowedMutationOrigin({ ...command, fetchSite: "cross-site", origin: null })).toBe(
      false,
    );
    expect(isAllowedMutationOrigin({ ...command, origin: "null" })).toBe(false);
  });
  it("allows machine-authenticated webhook endpoints to apply their own signature checks", () => {
    expect(
      isAllowedMutationOrigin({
        ...command,
        pathname: "/api/payments/webhooks/razorpay",
        origin: null,
      }),
    ).toBe(true);
  });
  it("rejects external and protocol-relative redirect targets", () => {
    for (const target of [
      "https://bad.example",
      "//bad.example",
      "/\\bad.example",
      "/member\nheader",
    ])
      expect(safeInternalRedirect(target)).toBe("/member");
    expect(safeInternalRedirect("/member/payments-receipts")).toBe("/member/payments-receipts");
  });
});
