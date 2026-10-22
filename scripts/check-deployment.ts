import { Client } from "pg";
import {
  S3Client,
  GetPublicAccessBlockCommand,
  GetBucketEncryptionCommand,
  GetBucketVersioningCommand,
} from "@aws-sdk/client-s3";
import { deploymentReadiness } from "../src/server/deployment/readiness";

async function main() {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const result = deploymentReadiness(process.env);
  for (const message of result.warnings) console.warn(`WARNING: ${message}`);
  for (const message of result.errors) console.error(`BLOCKED: ${message}`);
  if (result.errors.length) {
    process.exitCode = 1;
    return;
  }
  const database = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 15000,
  });
  try {
    await database.connect();
    const development = await database.query(
      "SELECT EXISTS (SELECT 1 FROM users WHERE email LIKE $1) AS present",
      ["%@dev.local"],
    );
    if (development.rows[0]?.present) throw new Error();
    const administrators = await database.query(
      `SELECT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur."roleId" JOIN users u ON u.id = ur."userId" WHERE r.code = $1 AND ur.active = true AND u.status = $2) AS present`,
      ["ADMIN", "ACTIVE"],
    );
    if (!administrators.rows[0]?.present) throw new Error();
    const role = await database.query(
      "SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user",
    );
    if (
      !role.rows.length ||
      role.rows.some((row) => row.rolsuper || row.rolcreatedb || row.rolcreaterole)
    )
      throw new Error();
  } catch {
    console.error(
      "BLOCKED: Verify production migrations, an audited initial Admin, absence of development identities, and a least-privilege application database role. No database changes were made.",
    );
    process.exitCode = 1;
    return;
  } finally {
    await database.end();
  }
  const storage = new S3Client({ region: process.env.AWS_REGION, maxAttempts: 2 });
  const input = { Bucket: process.env.S3_PRIVATE_BUCKET };
  try {
    const options = { abortSignal: AbortSignal.timeout(15000) };
    const [access, encryption, versioning] = await Promise.all([
      storage.send(new GetPublicAccessBlockCommand(input), options),
      storage.send(new GetBucketEncryptionCommand(input), options),
      storage.send(new GetBucketVersioningCommand(input), options),
    ]);
    const block = access.PublicAccessBlockConfiguration;
    if (
      !block?.BlockPublicAcls ||
      !block.IgnorePublicAcls ||
      !block.BlockPublicPolicy ||
      !block.RestrictPublicBuckets ||
      !encryption.ServerSideEncryptionConfiguration?.Rules?.length ||
      versioning.Status !== "Enabled"
    )
      throw new Error();
  } catch {
    console.error(
      "BLOCKED: Verify S3 access, all four Block Public Access controls, default encryption and versioning. No objects or bucket settings were changed.",
    );
    process.exitCode = 1;
    return;
  } finally {
    storage.destroy();
  }
  console.log(
    "Deployment configuration and read-only database/storage checks passed. Provider delivery, backups, scheduling and independent security acceptance still require operational verification.",
  );
}
main().catch(() => {
  console.error(
    "Deployment checks could not complete. No supplied secrets or provider diagnostics are printed.",
  );
  process.exitCode = 1;
});
