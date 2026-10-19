import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";

try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const configured = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!configured) throw new Error("Database configuration is required for migration deployment");
const target = new URL(configured);
// Neon transaction pooling retains session advisory locks. Migrations use a
// direct connection; application traffic can keep its pooled DATABASE_URL.
if (!process.env.MIGRATION_DATABASE_URL && target.hostname.endsWith(".neon.tech")) {
  target.hostname = target.hostname.replace("-pooler.", ".");
  target.searchParams.delete("pgbouncer");
}
const result = spawnSync(
  process.execPath,
  [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: target.toString() },
  },
);
process.exit(result.status ?? 1);
