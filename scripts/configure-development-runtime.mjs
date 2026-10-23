import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import console from "node:console";
import { parseEnv } from "node:util";
import { URL } from "node:url";
import pg from "pg";

async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    !process.argv.includes("--configure-existing-development-database")
  )
    throw new Error("Development operator approval required.");
  const configurationFile = path.resolve(".env");
  const original = await readFile(configurationFile, "utf8");
  const configured = parseEnv(original);
  const adminUrl = new URL(configured.MIGRATION_DATABASE_URL || configured.DATABASE_URL);
  adminUrl.hostname = adminUrl.hostname.replace("-pooler.", ".");
  if (
    !["postgres:", "postgresql:"].includes(adminUrl.protocol) ||
    adminUrl.pathname !== "/neondb" ||
    !adminUrl.hostname.endsWith(".neon.tech")
  )
    throw new Error("Only the existing Neon development database is allowed.");
  const role = "tuluva_development_app";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  let application;
  try {
    await admin.connect();
    const existing = await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role]);
    if (existing.rowCount)
      throw new Error("Inspect existing runtime configuration before retrying.");
    // Never overwrite the backup or existing runtime credentials on a rerun.
    await writeFile(path.resolve(".env.development-owner-backup"), original, {
      flag: "wx",
      mode: 0o600,
    });
    const password = randomBytes(48).toString("hex");
    const runtimeUrl = new URL(adminUrl);
    runtimeUrl.username = role;
    runtimeUrl.password = password;
    runtimeUrl.hostname = runtimeUrl.hostname.replace(".c-", "-pooler.c-");
    const owner = await admin.query("SELECT current_user AS owner");
    const ownerIdentifier = `"${owner.rows[0].owner.replaceAll('"', '""')}"`;
    await admin.query("BEGIN");
    try {
      // Fixed identifier and generated hex password; neither is caller SQL.
      await admin.query(
        `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      await admin.query(`GRANT CONNECT ON DATABASE neondb TO "${role}"`);
      await admin.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
      await admin.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`,
      );
      await admin.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`);
      await admin.query(
        `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerIdentifier} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${role}"`,
      );
      await admin.query(
        `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerIdentifier} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${role}"`,
      );
      await admin.query(`REVOKE ALL ON TABLE public._prisma_migrations FROM "${role}"`);
      await admin.query("COMMIT");
    } catch (error) {
      await admin.query("ROLLBACK");
      throw error;
    }
    application = new pg.Client({ connectionString: runtimeUrl.toString() });
    await application.connect();
    const result = await application.query(
      "SELECT current_database() AS database, current_user AS role, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, has_schema_privilege(current_user,'public','CREATE') AS can_create_schema_objects, has_database_privilege(current_user,'tuluva_production','CONNECT') AS production_access FROM pg_roles WHERE rolname=current_user",
    );
    const access = result.rows[0];
    if (
      access.database !== "neondb" ||
      access.role !== role ||
      access.rolsuper ||
      access.rolcreatedb ||
      access.rolcreaterole ||
      access.rolreplication ||
      access.rolbypassrls ||
      access.can_create_schema_objects ||
      access.production_access
    )
      throw new Error("Runtime privilege verification failed.");
    let updated = original;
    for (const [key, value] of Object.entries({
      DATABASE_URL: runtimeUrl.toString(),
      MIGRATION_DATABASE_URL: adminUrl.toString(),
    })) {
      const entry = `${key}="${value}"`;
      const pattern = new RegExp(`^${key}=.*$`, "m");
      updated = pattern.test(updated)
        ? updated.replace(pattern, () => entry)
        : `${updated}\n${entry}\n`;
    }
    await writeFile(configurationFile, updated, { mode: 0o600 });
    console.log(JSON.stringify({ developmentAccess: access }));
    console.log(
      "Development runtime configuration updated. No application records, production configuration or storage settings were changed. Restart the workspace development server to load it.",
    );
  } finally {
    await application?.end();
    await admin.end();
  }
}

void main().catch(() => {
  console.error(
    "Development configuration did not finish. No credentials are logged. Inspect retained configuration and role state before retrying; nothing is automatically deleted.",
  );
  process.exitCode = 1;
});
