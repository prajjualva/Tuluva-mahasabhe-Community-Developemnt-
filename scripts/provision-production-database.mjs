import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
import { parseEnv } from "node:util";
import pg from "pg";

// Operator-only command. Verify the owner's approval and the actual account's
// Free plan/usage in Neon first; SQL cannot establish cloud billing status.
const databaseName = "tuluva_production";
const applicationRole = "tuluva_production_app";
// Deliberately NOT a Next.js automatically loaded .env.production.local file.
const credentialsFile = path.resolve(".env.production-operator");

async function main() {
  if (!process.argv.includes("--approved-free-plan-provision"))
    throw new Error("Explicit operator approval is required.");
  process.loadEnvFile();
  const adminUrl = new URL(process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL);
  if (
    !["postgres:", "postgresql:"].includes(adminUrl.protocol) ||
    !adminUrl.hostname.endsWith(".neon.tech") ||
    adminUrl.pathname !== "/neondb"
  )
    throw new Error("Unexpected administrative connection target.");
  adminUrl.hostname = adminUrl.hostname.replace("-pooler.", ".");
  adminUrl.searchParams.delete("pgbouncer");
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  let production;
  let application;
  try {
    await admin.connect();
    const existing = await admin.query(
      "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS database_exists, EXISTS(SELECT 1 FROM pg_roles WHERE rolname = $2) AS role_exists",
      [databaseName, applicationRole],
    );
    const migrationUrl = new URL(adminUrl);
    migrationUrl.pathname = `/${databaseName}`;
    let runtimeUrl;
    if (existing.rows[0].database_exists || existing.rows[0].role_exists) {
      if (
        !process.argv.includes("--resume-inspected-resources") ||
        !existing.rows[0].database_exists ||
        !existing.rows[0].role_exists
      )
        throw new Error("Existing resources require explicit inspected-resource recovery.");
      const saved = parseEnv(await readFile(credentialsFile, "utf8"));
      runtimeUrl = new URL(saved.DATABASE_URL);
      if (
        saved.MIGRATION_DATABASE_URL !== migrationUrl.toString() ||
        runtimeUrl.pathname !== `/${databaseName}` ||
        runtimeUrl.username !== applicationRole ||
        runtimeUrl.hostname.replace("-pooler.", ".") !== adminUrl.hostname
      )
        throw new Error("Recovery configuration does not match the fixed production target.");
    } else {
      const password = randomBytes(48).toString("hex");
      runtimeUrl = new URL(migrationUrl);
      runtimeUrl.hostname = runtimeUrl.hostname.replace(".c-", "-pooler.c-");
      runtimeUrl.username = applicationRole;
      runtimeUrl.password = password;
      // Exclusive creation prevents overwriting any existing production secrets.
      // The file is ignored by Git and is never printed or loaded by local dev.
      await writeFile(
        credentialsFile,
        `# Private operator configuration. Never commit or paste into chat.\nDATABASE_URL=${runtimeUrl}\nMIGRATION_DATABASE_URL=${migrationUrl}\n`,
        { flag: "wx", mode: 0o600 },
      );
      // Names are fixed above, password is hex generated here, never caller SQL.
      await admin.query(
        `CREATE ROLE "${applicationRole}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    }
    await admin.query(`REVOKE ALL ON DATABASE "${databaseName}" FROM PUBLIC`);
    await admin.query(`GRANT CONNECT ON DATABASE "${databaseName}" TO "${applicationRole}"`);
    production = new pg.Client({ connectionString: migrationUrl.toString() });
    await production.connect();
    await production.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
    await production.query(`GRANT USAGE ON SCHEMA public TO "${applicationRole}"`);

    const migration = spawnSync(
      process.execPath,
      [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
      {
        env: {
          ...process.env,
          DATABASE_URL: migrationUrl.toString(),
          MIGRATION_DATABASE_URL: migrationUrl.toString(),
        },
        // Provider/engine diagnostics may contain connection credentials.
        stdio: "ignore",
        timeout: 600000,
      },
    );
    if (migration.status !== 0) throw new Error("Production migration deployment failed.");

    const owner = await production.query("SELECT current_user AS owner");
    const ownerIdentifier = `"${owner.rows[0].owner.replaceAll('"', '""')}"`;
    await production.query("BEGIN");
    try {
      await production.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${applicationRole}"`,
      );
      await production.query(
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${applicationRole}"`,
      );
      await production.query(
        `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerIdentifier} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${applicationRole}"`,
      );
      await production.query(
        `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerIdentifier} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${applicationRole}"`,
      );
      // The runtime must not alter Prisma's operational migration history.
      await production.query(
        `REVOKE ALL ON TABLE public._prisma_migrations FROM "${applicationRole}"`,
      );
      await production.query("COMMIT");
    } catch (error) {
      await production.query("ROLLBACK");
      throw error;
    }

    application = new pg.Client({ connectionString: runtimeUrl.toString() });
    await application.connect();
    const access = await application.query(
      "SELECT current_database() AS database, current_user AS role, rolcreatedb, rolcreaterole, rolsuper, rolreplication, rolbypassrls, has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_schema_objects FROM pg_roles WHERE rolname = current_user",
    );
    const counts = await production.query(
      "SELECT (SELECT count(*)::int FROM public.users) AS users, (SELECT count(*)::int FROM public.payments) AS payments, (SELECT count(*)::int FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS migrations",
    );
    const actual = access.rows[0];
    if (
      actual.database !== databaseName ||
      actual.role !== applicationRole ||
      actual.rolcreatedb ||
      actual.rolcreaterole ||
      actual.rolsuper ||
      actual.rolreplication ||
      actual.rolbypassrls ||
      actual.can_create_schema_objects
    )
      throw new Error("Runtime permissions do not match the required restrictions.");
    console.log(JSON.stringify({ access: access.rows[0], counts: counts.rows[0] }));
    console.log(
      "Production database migrated; no seed, Admin identity, or financial fixtures were created. Private connection configuration saved locally; no deployment was triggered.",
    );
  } finally {
    await application?.end();
    await production?.end();
    await admin.end();
  }
}

void main().catch(() => {
  console.error(
    "Provisioning did not finish. No credentials are logged. Inspect resource state before retrying; retained resources and private configuration are never automatically deleted.",
  );
  process.exitCode = 1;
});
