import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
import pg from "pg";

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
const databaseName = `csf_test_${randomUUID().replaceAll("-", "")}`;
const isolatedUrl = new URL(adminUrl);
isolatedUrl.pathname = `/${databaseName}`;
const client = new pg.Client({ connectionString: adminUrl.toString() });
let created = false;
let uploadDirectory;

async function run(label, executable, args, env, quiet = false) {
  console.log(`Starting ${label}.`);
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, stdio: quiet ? "ignore" : "inherit" });
    child.on("error", () => reject(new Error(`${label} could not start.`)));
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${label} failed (exit ${code}).`)),
    );
  });
  console.log(`Completed ${label}.`);
}

try {
  await client.connect();
  // This identifier is generated here, not supplied by a caller or an env var.
  if (!/^csf_test_[a-f0-9]{32}$/.test(databaseName)) throw new Error("Invalid test target.");
  await client.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  console.log(`Created disposable database ${databaseName}. Application records are untouched.`);
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
    "all database and unit tests",
    process.execPath,
    [path.resolve("node_modules/vitest/vitest.mjs"), "run", "--maxWorkers=1", "--reporter=verbose"],
    {
      ...fixtureEnvironment,
      DATABASE_URL: applicationUrl,
      MIGRATION_DATABASE_URL: process.env.MIGRATION_DATABASE_URL || "",
      ISOLATED_TEST_DATABASE_URL: isolatedUrl.toString(),
      RUN_DB_INTEGRATION_TESTS: "1",
    },
  );
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
    try {
      // Remove only the database successfully created by this invocation.
      await client.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
      console.log(
        `Removed disposable database ${databaseName}. Synthetic fixtures are not retained.`,
      );
    } catch {
      console.error(`Cleanup required for disposable database ${databaseName}.`);
      process.exitCode = 1;
    }
  }
  await client.end();
  if (uploadDirectory) {
    const resolved = path.resolve(uploadDirectory);
    if (
      path.dirname(resolved) === path.resolve(os.tmpdir()) &&
      path.basename(resolved).startsWith("csf-test-uploads-")
    )
      await rm(resolved, { recursive: true, force: true });
  }
}
