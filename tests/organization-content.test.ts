import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { organization } from "../src/content/organization";

describe("main application organisation branding", () => {
  it("attributes organisation content to Tuluworld's official HTTPS website", () => {
    expect(organization.name).toBe("TuluWorld Foundation");
    expect(new URL(organization.website).origin).toBe("https://www.tuluworld.org.in");
    expect(new URL(organization.aboutUrl).origin).toBe(new URL(organization.website).origin);
    expect(new Set(organization.pillars.map((item) => item.title)).size).toBe(3);
  });
  it("keeps original local logo assets as valid PNG images", () => {
    for (const file of ["tuluworld-logo-dark.png", "tuluworld-logo-light.png"]) {
      const data = readFileSync(new URL(`../public/brand/${file}`, import.meta.url));
      expect(data.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(data.readUInt32BE(16)).toBeGreaterThan(0);
      expect(data.readUInt32BE(20)).toBeGreaterThan(0);
    }
  });
});
