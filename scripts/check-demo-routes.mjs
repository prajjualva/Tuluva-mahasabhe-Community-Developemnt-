import process from "node:process";
import { URL } from "node:url";
const fetch = globalThis.fetch;
const AbortSignal = globalThis.AbortSignal;
if (process.env.NODE_ENV === "production")
  throw new Error("Development identity checks must not run in production");
const base = new URL(process.env.DEMO_BASE_URL ?? "http://127.0.0.1:3000");
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname))
  throw new Error("Demo checks are restricted to the local development server");
const password = process.env.DEMO_TEST_PASSWORD ?? "DevelopmentOnly-ChangeMe1!";
let checks = 0;
async function check(path, expected, cookie) {
  const response = await fetch(new URL(path, base), {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
    signal: AbortSignal.timeout(60000),
  });
  if (response.status !== expected)
    throw new Error(
      `Route check failed: ${path} returned ${response.status}, expected ${expected}`,
    );
  if (expected === 200 && response.headers.get("content-type")?.includes("application/json")) {
    const body = await response.text();
    if (/"(?:passwordHash|bankEncrypted|evidenceBytes|storageKey)"\s*:/.test(body))
      throw new Error(`Restricted field exposure in ${path}`);
  }
  checks += 1;
  process.stdout.write(`PASS ${path} (${expected})\n`);
}
await check("/api/health", 200);
await check("/api/death-events", 200);
for (const role of ["admin", "coordinator", "member"]) {
  let cookie;
  try {
    const login = await fetch(new URL("/api/auth/login", base), {
      method: "POST",
      headers: { "content-type": "application/json", origin: base.origin },
      body: JSON.stringify({ email: `${role}@dev.local`, password }),
      signal: AbortSignal.timeout(60000),
    });
    if (!login.ok) throw new Error(`Development ${role} sign-in failed (${login.status})`);
    cookie = login.headers.get("set-cookie")?.split(";")[0];
    if (!cookie?.startsWith("access_token="))
      throw new Error("Expected a protected session cookie");
    const paths =
      role === "admin"
        ? [
            "/api/admin/dashboard",
            "/api/admin/users?search=admin%40dev.local",
            "/api/admin/payments?status=FAILED",
            "/api/admin/ledger",
            "/api/admin/coordinators",
            "/api/admin/audit?page=1",
          ]
        : role === "coordinator"
          ? [
              "/api/coordinator/members",
              "/api/coordinator/plans",
              "/api/coordinator/nominees",
              "/api/coordinator/news",
            ]
          : [
              "/api/member/profile",
              "/api/member/dues",
              "/api/member/wallet",
              "/api/member/receipts",
              "/api/member/news",
              "/api/member/notifications",
            ];
    for (const path of paths) await check(path, 200, cookie);
    if (role !== "admin") await check("/api/admin/users", 403, cookie);
    if (role === "member")
      await check("/api/admin/receipts/CASH-2026-000001/download", 403, cookie);
  } finally {
    if (cookie) {
      const logout = await fetch(new URL("/api/auth/logout", base), {
        method: "POST",
        headers: { cookie, origin: base.origin },
        signal: AbortSignal.timeout(60000),
      });
      if (!logout.ok) {
        process.stderr.write("A development check session could not be invalidated.\n");
        process.exitCode = 1;
      }
    }
  }
}
if (process.exitCode) throw new Error("Development session cleanup failed");
process.stdout.write(
  `Completed ${checks} local route/security checks. No financial commands were submitted.\n`,
);
