import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/.well-known/assetlinks.json/route";

const firstFingerprint = Array<string>(32).fill("AB").join(":");
const secondFingerprint = Array<string>(32).fill("CD").join(":");

afterEach(() => vi.unstubAllEnvs());

describe("Android website association", () => {
  it("serves the established package and a single Play signing fingerprint", async () => {
    vi.stubEnv("ANDROID_PLAY_SIGNING_SHA256", firstFingerprint);

    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "org.tuluworld.communitysupport",
          sha256_cert_fingerprints: [firstFingerprint],
        },
      },
    ]);
  });

  it("includes distinct fingerprints when Play uses several signing certificates", async () => {
    vi.stubEnv(
      "ANDROID_PLAY_SIGNING_SHA256",
      ` ${firstFingerprint}, ${secondFingerprint.toLowerCase()},${firstFingerprint} `,
    );

    expect(await GET().json()).toMatchObject([
      { target: { sha256_cert_fingerprints: [firstFingerprint, secondFingerprint] } },
    ]);
  });

  it.each([undefined, "", `${firstFingerprint}, invalid`])(
    "withholds the association when fingerprint configuration is missing or invalid (%s)",
    (value) => {
      vi.stubEnv("ANDROID_PLAY_SIGNING_SHA256", value);

      const response = GET();

      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
    },
  );
});
