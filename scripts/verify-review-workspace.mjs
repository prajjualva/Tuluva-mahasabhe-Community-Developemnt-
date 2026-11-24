import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
import pg from "pg";

// No .env fallback: callers must explicitly supply an isolated operator connection.
const configured = process.env.REVIEW_TEST_OPERATOR_DATABASE_URL;
const screen = process.argv.includes("--screen");
if (!configured || process.env.NODE_ENV === "production")
  throw new Error("Review verification requires an explicit non-production operator connection.");
const operatorUrl = new URL(configured);
if (!["postgres:", "postgresql:"].includes(operatorUrl.protocol))
  throw new Error("PostgreSQL required.");
operatorUrl.hostname = operatorUrl.hostname.replace("-pooler.", ".");
const name = `csf_review_test_${randomUUID().replaceAll("-", "")}`;
const target = new URL(operatorUrl);
target.pathname = `/${name}`;
target.searchParams.set(
  "sslmode",
  ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ? "disable" : "verify-full",
);
const uploads = await mkdtemp(path.join(os.tmpdir(), "csf-review-uploads-"));
const environment = {
  ...process.env,
  NODE_ENV: "test",
  APP_REVIEW_MODE: "1",
  DATABASE_URL: target.href,
  MIGRATION_DATABASE_URL: target.href,
  AUTH_SECRET: randomBytes(32).toString("hex"),
  BANK_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  REVIEW_MEMBER_PASSWORD: randomBytes(21).toString("base64url"),
  REVIEW_OPERATOR_PASSWORD: randomBytes(32).toString("hex"),
  UPLOAD_STORAGE: "local",
  UPLOAD_LOCAL_PATH: uploads,
  PAYMENT_PROVIDER: "",
  RAZORPAY_KEY_ID: "",
  RAZORPAY_KEY_SECRET: "",
  RAZORPAY_WEBHOOK_SECRET: "",
  RESEND_API_KEY: "",
  EMAIL_TRANSPORT_TOKEN: "",
  SMS_TRANSPORT_TOKEN: "",
  SMS_NOTIFICATION_TRANSPORT_TOKEN: "",
};
let activeChild;
let stopped = false;
const stopScreen = () => {
  stopped = true;
  activeChild?.kill();
};
process.on("SIGINT", stopScreen);
process.on("SIGTERM", stopScreen);
if (screen) process.stdin.on("data", stopScreen);
async function run(label, args) {
  if (stopped) throw new Error("Review verification interrupted.");
  console.log(`Starting ${label}.`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env: environment,
      stdio: ["ignore", "ignore", "pipe"],
    });
    activeChild = child;
    child.stderr.on("data", (chunk) => {
      const safe = String(chunk).match(/Review assertion failed at [A-Za-z ()\d-]+\./)?.[0];
      if (safe) console.error(safe);
    });
    child.on("error", () => reject(new Error("Review verification process could not start.")));
    child.on("close", (code) =>
      code === 0 || stopped ? resolve() : reject(new Error(`${label} failed.`)),
    );
  });
  activeChild = undefined;
  if (stopped && label !== "review screen") throw new Error("Review verification interrupted.");
}
async function operator(action) {
  const client = new pg.Client({
    connectionString: operatorUrl.href,
    connectionTimeoutMillis: 15000,
  });
  try {
    await client.connect();
    await action(client);
  } finally {
    await client.end();
  }
}
let created = false;
try {
  await operator(async (client) => {
    if (!/^csf_review_test_[a-f0-9]{32}$/.test(name)) throw new Error("Invalid review target.");
    await client.query(`CREATE DATABASE "${name}"`);
    created = true;
  });
  console.log("Created a separate disposable review database; application records are untouched.");
  await run("review migrations", [
    path.resolve("node_modules/prisma/build/index.js"),
    "migrate",
    "deploy",
  ]);
  if (screen) {
    await run("review screen fixtures", ["--import", "tsx", "scripts/seed-review-workspace.ts"]);
    const portProbe = createServer();
    portProbe.listen(0, "127.0.0.1");
    await once(portProbe, "listening");
    const port = portProbe.address().port;
    await new Promise((resolve) => portProbe.close(resolve));
    environment.NODE_ENV = "production";
    environment.APP_URL = `http://review-check.localhost:${port}`;
    environment.NEXT_BUILD_DIRECTORY = ".next-validation";
    const handoff = path.join(uploads, "review-access.json");
    await writeFile(
      handoff,
      JSON.stringify({
        url: environment.APP_URL,
        email: "tuluworld+playreview@gmail.com",
        password: environment.REVIEW_MEMBER_PASSWORD,
      }),
      { flag: "wx", mode: 0o600 },
    );
    console.log(`Loopback-only review screen: ${environment.APP_URL}/login`);
    console.log(`Private local sign-in handoff: ${handoff}`);
    console.log(
      "Write stop to this runner's stdin after acceptance to remove its disposable database and files.",
    );
    await run("review screen", [
      path.resolve("node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ]);
  } else {
    await run("review service assertions", [
      "--import",
      "tsx",
      "scripts/verify-review-fixtures.ts",
    ]);
    console.log(
      "Review database checks passed: fixture isolation, Member-only permissions, wallet settlement, idempotency, receipts and split payments.",
    );
  }
} catch (error) {
  console.error(
    error instanceof Error &&
      /^(review migrations|review service assertions) failed\.$/.test(error.message)
      ? error.message
      : "Review database verification failed; credentials and database diagnostics are suppressed.",
  );
  process.exitCode = 1;
} finally {
  if (created) {
    try {
      await operator(async (client) => {
        if (
          !/^csf_review_test_[a-f0-9]{32}$/.test(name) ||
          new URL(configured).pathname === `/${name}`
        )
          throw new Error("Unsafe cleanup target.");
        await client.query(`DROP DATABASE "${name}" WITH (FORCE)`);
        console.log("Deleted only the disposable review database created by this check.");
      });
    } catch {
      console.error(`Cleanup required for disposable review database ${name}.`);
      process.exitCode = 1;
    }
  }
  const resolved = path.resolve(uploads);
  if (
    path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
    !path.basename(resolved).startsWith("csf-review-uploads-")
  ) {
    console.error("Unsafe review file cleanup target; files were retained.");
    process.exitCode = 1;
  } else await rm(resolved, { recursive: true, force: true });
  if (screen) process.stdin.pause();
}
