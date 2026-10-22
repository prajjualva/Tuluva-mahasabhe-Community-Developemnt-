import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";

describe("stakeholder demo production isolation", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("returns a hard 404 for demo routes in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const path of ["/demo", "/demo/fictional-member.png", "/death-support-events/demo"]) {
      expect(middleware(new NextRequest(`https://foundation.example${path}`)).status).toBe(404);
    }
  });
  it("allows the development presentation without changing live routes", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(
      middleware(new NextRequest("http://127.0.0.1:3000/demo")).headers.get("x-middleware-next"),
    ).toBe("1");
    vi.stubEnv("NODE_ENV", "production");
    expect(
      middleware(new NextRequest("https://foundation.example/death-support-events")).headers.get(
        "x-middleware-next",
      ),
    ).toBe("1");
  });
});
