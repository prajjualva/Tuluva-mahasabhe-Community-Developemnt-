import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
import pg from "pg";

// Operator command, after verifying the existing Neon Free plan/usage. It creates
// a database on the existing compute; never changes the plan or copies live data.
const output = path.resolve(".env.review-operator");
async function main() {
  if (
    !process.argv.includes("--verified-existing-free-plan") ||
    process.env.NODE_ENV === "production"
  )
    throw new Error("Review provisioning requires the inspected non-production operator workflow.");
  const ownerUrl = new URL(process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL);
  if (!ownerUrl.hostname.endsWith(".neon.tech") || ownerUrl.pathname !== "/neondb")
    throw new Error("Unexpected Neon administrative target.");
  ownerUrl.hostname = ownerUrl.hostname.replace("-pooler.", ".");
  ownerUrl.searchParams.delete("pgbouncer");
  ownerUrl.searchParams.set("sslmode", "verify-full");
  const marker = randomUUID().replaceAll("-", "");
  const name = `csf_review_test_${marker}`;
  const role = `tuluva_review_${marker.slice(0, 16)}`;
  const password = randomBytes(48).toString("hex");
  const migrationUrl = new URL(ownerUrl);
  migrationUrl.pathname = `/${name}`;
  const runtimeUrl = new URL(migrationUrl);
  runtimeUrl.hostname = runtimeUrl.hostname.replace(".c-", "-pooler.c-");
  runtimeUrl.username = role;
  runtimeUrl.password = password;
  const configuration = {
    APP_REVIEW_MODE: "1",
    APP_URL: "https://tuluva-mahasabhe-review.vercel.app",
    DATABASE_URL: runtimeUrl.href,
    MIGRATION_DATABASE_URL: migrationUrl.href,
    AUTH_SECRET: randomBytes(32).toString("hex"),
    BANK_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    CRON_SECRET: randomBytes(32).toString("hex"),
    INTERNAL_JOB_SECRET: randomBytes(32).toString("hex"),
    REVIEW_MEMBER_PASSWORD: randomBytes(21).toString("base64url"),
    REVIEW_OPERATOR_PASSWORD: randomBytes(32).toString("hex"),
    EMAIL_ONLY_PILOT: "1",
    RAZORPAY_WEBHOOK_SECRET: randomBytes(32).toString("hex"),
  };
  // Exclusive creation prevents a rerun from replacing an existing handoff.
  await writeFile(output, "", { flag: "wx", mode: 0o600 });
  if (process.platform === "win32") {
    const identity = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
    const acl = spawnSync(
      "icacls.exe",
      [output, "/inheritance:r", "/grant:r", `${identity}:(F)`, "SYSTEM:(F)"],
      { stdio: "ignore" },
    );
    if (acl.status !== 0)
      throw new Error("Private review handoff permissions could not be secured.");
  }
  await writeFile(
    output,
    Object.entries(configuration)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") + "\n",
  );
  const operator = new pg.Client({
    connectionString: ownerUrl.href,
    connectionTimeoutMillis: 15000,
  });
  let database;
  let application;
  try {
    await operator.connect();
    if (!/^csf_review_test_[a-f0-9]{32}$/.test(name) || !/^tuluva_review_[a-f0-9]{16}$/.test(role))
      throw new Error("Unsafe review target.");
    await operator.query(
      `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    await operator.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
    await operator.query(`REVOKE ALL ON DATABASE "${name}" FROM PUBLIC`);
    await operator.query(`GRANT CONNECT ON DATABASE "${name}" TO "${role}"`);
    database = new pg.Client({ connectionString: migrationUrl.href });
    await database.connect();
    await database.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
    await database.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    const isolatedEnvironment = {
      ...process.env,
      ...configuration,
      NODE_ENV: "test",
      DATABASE_URL: migrationUrl.href,
      UPLOAD_STORAGE: "local",
      PAYMENT_PROVIDER: "",
      RAZORPAY_KEY_ID: "",
      RAZORPAY_KEY_SECRET: "",
      RESEND_API_KEY: "",
      EMAIL_TRANSPORT_TOKEN: "",
      SMS_TRANSPORT_TOKEN: "",
      SMS_NOTIFICATION_TRANSPORT_TOKEN: "",
    };
    const run = (args) => {
      const result = spawnSync(process.execPath, args, {
        env: isolatedEnvironment,
        stdio: "ignore",
        timeout: 600000,
      });
      if (result.status !== 0) throw new Error("Review migration/initialization failed.");
    };
    run([path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"]);
    run(["--import", "tsx", "scripts/seed-review-workspace.ts"]);
    const owner = (await database.query("SELECT current_user AS name")).rows[0].name;
    const quotedOwner = '"' + owner.replaceAll('"', '""') + '"';
    await database.query("BEGIN");
    try {
      await database.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`,
      );
      await database.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`);
      await database.query(
        `ALTER DEFAULT PRIVILEGES FOR ROLE ${quotedOwner} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${role}"`,
      );
      await database.query(
        `ALTER DEFAULT PRIVILEGES FOR ROLE ${quotedOwner} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${role}"`,
      );
      await database.query(`REVOKE ALL ON TABLE public._prisma_migrations FROM "${role}"`);
      await database.query("COMMIT");
    } catch (error) {
      await database.query("ROLLBACK");
      throw error;
    }
    application = new pg.Client({
      connectionString: runtimeUrl.href,
      connectionTimeoutMillis: 15000,
    });
    await application.connect();
    const access = (
      await application.query(
        "SELECT current_database() AS database, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, has_schema_privilege(current_user,'public','CREATE') AS schema_create, has_database_privilege(current_user,'tuluva_production','CONNECT') AS live_connect FROM pg_roles WHERE rolname=current_user",
      )
    ).rows[0];
    if (
      access.database !== name ||
      Object.entries(access).some(([key, value]) => key !== "database" && value)
    )
      throw new Error("Review runtime isolation verification failed.");
    const counts = (
      await application.query(
        "SELECT (SELECT count(*)::int FROM users) AS users, (SELECT count(*)::int FROM payments) AS payments, (SELECT count(*)::int FROM receipts) AS receipts, (SELECT count(*)::int FROM contribution_events) AS events",
      )
    ).rows[0];
    if (counts.users !== 4 || counts.payments !== 0 || counts.receipts !== 0 || counts.events !== 3)
      throw new Error("Review initialization verification failed.");
    console.log(
      JSON.stringify({
        reviewDatabase: name,
        runtimeRole: role,
        isolatedFromLiveDatabase: true,
        counts,
      }),
    );
    console.log(
      "Persistent review database ready. Credentials are in the private ignored operator file; no deployment or live data changes were made.",
    );
  } finally {
    await application?.end();
    await database?.end();
    await operator.end();
  }
}
main().catch(() => {
  console.error(
    "Review provisioning did not finish. Inspect the retained private handoff and exact resources before retrying. No credentials or provider diagnostics are printed.",
  );
  process.exitCode = 1;
});
