import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
import pg from "pg";

const interactiveReset = process.argv.includes("--owner-password-reset-screen");
const authenticationOnly = interactiveReset || process.argv.includes("--authentication-only");
const resumeDatabase = process.argv
  .find((argument) => argument.startsWith("--resume-reset-database="))
  ?.slice("--resume-reset-database=".length);
if (resumeDatabase && (!interactiveReset || !/^csf_test_[a-f0-9]{32}$/.test(resumeDatabase)))
  throw new Error("Only an explicitly inspected disposable reset database can be resumed.");
const acceptanceEmail = process.env.PASSWORD_RESET_ACCEPTANCE_EMAIL;
if (interactiveReset && (!acceptanceEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(acceptanceEmail)))
  throw new Error("An explicitly approved owner email is required for the isolated reset screen.");

if (process.env.NODE_ENV === "production")
  throw new Error("Isolated development verification cannot run in production.");
try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (process.env.NODE_ENV === "production")
  throw new Error("Isolated development verification cannot run in production.");
const applicationUrl = process.env.DATABASE_URL;
if (!applicationUrl) throw new Error("A development database connection is required.");
const adminUrl = new URL(process.env.MIGRATION_DATABASE_URL || applicationUrl);
if (!["postgres:", "postgresql:"].includes(adminUrl.protocol))
  throw new Error("PostgreSQL is required.");
adminUrl.hostname = adminUrl.hostname.replace("-pooler.", ".");
const databaseName = resumeDatabase || `csf_test_${randomUUID().replaceAll("-", "")}`;
const isolatedUrl = new URL(adminUrl);
isolatedUrl.pathname = `/${databaseName}`;
const client = new pg.Client({
  connectionString: adminUrl.toString(),
  connectionTimeoutMillis: 15000,
  application_name: "csf_isolated_operator",
});
let operatorConnectionClosed = false;
client.on("error", () => {
  operatorConnectionClosed = true;
  console.warn("The operator connection closed; cleanup will use a fresh connection.");
});
let created = false;
let uploadDirectory;
let activeChild;
let interrupted = false;
function stopOwnedChild() {
  interrupted = true;
  activeChild?.kill("SIGTERM");
}
process.on("SIGINT", stopOwnedChild);
process.on("SIGTERM", stopOwnedChild);

async function run(label, executable, args, env, quiet = false) {
  if (interrupted) throw new Error("isolated verification was interrupted; cleaning up.");
  console.log(`Starting ${label}.`);
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, stdio: quiet ? "ignore" : "inherit" });
    activeChild = child;
    child.on("error", () => reject(new Error(`${label} could not start.`)));
    child.on("close", (code) =>
      code === 0 || interrupted ? resolve() : reject(new Error(`${label} failed (exit ${code}).`)),
    );
  });
  console.log(`Completed ${label}.`);
  activeChild = undefined;
  if (interrupted) throw new Error("isolated verification was interrupted; cleaning up.");
}

try {
  await client.connect();
  // Fresh identifiers are generated here. Resumption is an explicit operator
  // recovery of this workflow's exact previously logged disposable database.
  if (!/^csf_test_[a-f0-9]{32}$/.test(databaseName)) throw new Error("Invalid test target.");
  if (resumeDatabase) {
    const ownership = await client.query(
      "SELECT pg_get_userbyid(datdba)=current_user AS owned, (SELECT count(*)::int FROM pg_stat_activity WHERE datname=$1) AS sessions FROM pg_database WHERE datname=$1",
      [databaseName],
    );
    if (!ownership.rows[0]?.owned || ownership.rows[0].sessions !== 0)
      throw new Error("isolated reset recovery requires an owned, unused test database.");
    const probe = new pg.Client({ connectionString: isolatedUrl.toString() });
    try {
      await probe.connect();
      const state = await probe.query(
        'SELECT EXISTS(SELECT 1 FROM users u JOIN members m ON m."userId"=u.id WHERE u.email=$1 AND m."fullName"=$2) AS expected_identity, (SELECT count(*)::int FROM payments) AS payments, (SELECT count(*)::int FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS migrations',
        [acceptanceEmail.toLowerCase(), "Isolated password reset check"],
      );
      if (
        !state.rows[0]?.expected_identity ||
        state.rows[0].payments !== 0 ||
        state.rows[0].migrations !== 24
      )
        throw new Error("isolated reset recovery target does not match the inspected workflow.");
    } finally {
      await probe.end();
    }
    created = true;
    console.log(
      `Resumed inspected disposable database ${databaseName}; existing application data is untouched. Completed tests and seed are not rerun.`,
    );
  } else {
    await client.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    console.log(`Created disposable database ${databaseName}. Application records are untouched.`);
  }
  // Do not hold an idle operator connection while tests or the owner UI run.
  // Neon can close it while scaling down; an unhandled pg error would otherwise
  // terminate the runner and strand the owner's verification form.
  await client.end();
  operatorConnectionClosed = true;
  uploadDirectory = await mkdtemp(path.join(os.tmpdir(), "csf-test-uploads-"));
  const fixtureEnvironment = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: isolatedUrl.toString(),
    MIGRATION_DATABASE_URL: isolatedUrl.toString(),
    AUTH_SECRET: randomBytes(32).toString("hex"),
    BANK_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    UPLOAD_STORAGE: "local",
    UPLOAD_LOCAL_PATH: uploadDirectory,
  };
  if (!resumeDatabase) {
    await run(
      "isolated migrations",
      process.execPath,
      [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
      fixtureEnvironment,
    );
    // The development seed prints credentials; suppress that output entirely.
    await run(
      "isolated development identity/settings setup",
      process.execPath,
      ["--import", "tsx", "prisma/seed.ts"],
      fixtureEnvironment,
      true,
    );
    await run(
      authenticationOnly ? "isolated authentication tests" : "all database and unit tests",
      process.execPath,
      [
        path.resolve("node_modules/vitest/vitest.mjs"),
        "run",
        ...(authenticationOnly
          ? [
              "tests/auth-db.integration.test.ts",
              "tests/password-reset-db.integration.test.ts",
              "tests/initial-admin-access-db.integration.test.ts",
              "tests/otp-delivery.test.ts",
            ]
          : []),
        "--maxWorkers=1",
        "--reporter=verbose",
      ],
      {
        ...fixtureEnvironment,
        DATABASE_URL: applicationUrl,
        MIGRATION_DATABASE_URL: process.env.MIGRATION_DATABASE_URL || "",
        ISOLATED_TEST_DATABASE_URL: isolatedUrl.toString(),
        RUN_DB_INTEGRATION_TESTS: "1",
      },
    );
  }
  if (interactiveReset) {
    if (
      process.env.EMAIL_PROVIDER !== "resend" ||
      !process.env.RESEND_API_KEY ||
      !process.env.RESEND_FROM_EMAIL
    )
      throw new Error(
        "isolated owner acceptance requires the configured development email provider.",
      );
    const { PrismaClient } = await import("@prisma/client");
    const { default: argon2 } = await import("argon2");
    const acceptance = new PrismaClient({ datasources: { db: { url: isolatedUrl.toString() } } });
    try {
      if (!resumeDatabase)
        await acceptance.user.create({
          data: {
            email: acceptanceEmail.toLowerCase(),
            passwordHash: await argon2.hash(randomBytes(48).toString("hex"), {
              type: argon2.argon2id,
            }),
            roles: { create: { role: { connect: { code: "MEMBER" } } } },
            member: {
              create: {
                fullName: "Isolated password reset check",
                address: "Temporary local acceptance database only",
              },
            },
          },
        });
    } finally {
      await acceptance.$disconnect();
    }
    console.log(
      "Opening a temporary loopback-only reset screen on http://reset-check.localhost:3001/login. Its distinct host keeps browser cookies separate from the main app. The owner must enter their own emailed code and choose a test-only password there. No code or password is logged. Stop this runner after acceptance to remove the isolated database and documents.",
    );
    await run(
      "isolated owner password-reset screen",
      process.execPath,
      [
        path.resolve("node_modules/next/dist/bin/next"),
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3001",
      ],
      {
        ...fixtureEnvironment,
        NODE_ENV: "development",
        APP_URL: "http://reset-check.localhost:3001",
        // This already ignored/typed output keeps the main .next instance separate.
        // Do not run build:verify concurrently with this temporary screen.
        NEXT_BUILD_DIRECTORY: ".next-validation",
        CRON_SECRET: randomBytes(32).toString("hex"),
        INTERNAL_JOB_SECRET: randomBytes(32).toString("hex"),
      },
    );
  }
} catch (error) {
  // Never serialize a connection error, which may contain credentials.
  console.error(
    error?.message?.startsWith("isolated ") || error?.message?.startsWith("all database")
      ? error.message
      : "Isolated database verification could not complete.",
  );
  process.exitCode = 1;
} finally {
  if (created) {
    const cleanup = new pg.Client({
      connectionString: adminUrl.toString(),
      connectionTimeoutMillis: 15000,
      application_name: "csf_isolated_cleanup",
    });
    cleanup.on("error", () => {});
    try {
      // Remove only the created database or explicitly validated recovery target.
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
      console.log(
        `Removed disposable database ${databaseName}. Synthetic fixtures are not retained.`,
      );
    } catch {
      console.error(`Cleanup required for disposable database ${databaseName}.`);
      process.exitCode = 1;
    } finally {
      await cleanup.end();
    }
  }
  if (!operatorConnectionClosed) await client.end();
  if (uploadDirectory) {
    const resolved = path.resolve(uploadDirectory);
    if (
      path.dirname(resolved) === path.resolve(os.tmpdir()) &&
      path.basename(resolved).startsWith("csf-test-uploads-")
    )
      await rm(resolved, { recursive: true, force: true });
  }
}
