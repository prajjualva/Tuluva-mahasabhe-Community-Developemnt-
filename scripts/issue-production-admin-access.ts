import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";
import { issueInitialAdminAccess } from "../src/server/auth/initial-admin-access";

async function main() {
  if (!process.argv.includes("--owner-approved-initial-access"))
    throw new Error("Explicit initial-access operator approval is required");
  const configuration = parseEnv(await readFile(path.resolve(".env.production-operator"), "utf8"));
  const databaseUrl = configuration.DATABASE_URL;
  if (!databaseUrl) throw new Error("Production operator connection is missing");
  const target = new URL(databaseUrl);
  if (target.pathname !== "/tuluva_production" || target.username !== "tuluva_production_app")
    throw new Error("Unexpected production connection target");
  const handoff = path.resolve(".env.admin-access");
  // Create an empty, exclusive file first. Apply the already verified private
  // operator ACL before putting any credential into it. Never overwrite a handoff.
  await writeFile(handoff, "", { flag: "wx", mode: 0o600 });
  if (process.platform === "win32") {
    // Windows PowerShell needs its own module search path when launched from PowerShell 7.
    const windowsPowerShellEnvironment = { ...process.env };
    for (const name of Object.keys(windowsPowerShellEnvironment)) {
      if (name.toLowerCase() === "psmodulepath") delete windowsPowerShellEnvironment[name];
    }
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        [
          "$ErrorActionPreference = 'Stop'",
          "$source = Get-Acl -LiteralPath '.env.production-operator'",
          "if (-not $source.AreAccessRulesProtected) { throw 'Operator ACL must be private' }",
          "$section = [System.Security.AccessControl.AccessControlSections]::Access",
          "$sourceAccess = $source.GetSecurityDescriptorSddlForm($section)",
          "$destination = New-Object System.Security.AccessControl.FileSecurity",
          "$destination.SetSecurityDescriptorSddlForm($sourceAccess, $section)",
          "(Get-Item -Force -LiteralPath '.env.admin-access').SetAccessControl($destination)",
          "if ((Get-Acl -LiteralPath '.env.admin-access').GetSecurityDescriptorSddlForm($section) -ne $sourceAccess) { throw 'Handoff ACL does not match' }",
        ].join("; "),
      ],
      { env: windowsPowerShellEnvironment, stdio: "ignore", windowsHide: true, timeout: 15000 },
    );
  } else await chmod(handoff, 0o600);
  const password = randomBytes(30).toString("base64url");
  await writeFile(
    handoff,
    [
      "# PRIVATE: view locally only. Never commit, screenshot, email or paste into chat.",
      "# Initial production Admin handoff, not development/demo credentials.",
      "# Production login is not available until deployment/configuration is complete.",
      "# Replace this temporary password using verified password reset once available.",
      "ADMIN_EMAIL=tuluworld@gmail.com",
      `TEMPORARY_ADMIN_PASSWORD=${password}`,
      "",
    ].join("\n"),
  );
  const database = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await issueInitialAdminAccess(database, {
      email: "tuluworld@gmail.com",
      password,
      reason:
        "Owner explicitly requested a temporary password for initial production Admin access before first sign-in.",
    });
    process.stdout.write(
      "Initial temporary access issued and audited. View the protected local handoff file privately. No credential is printed.\n",
    );
  } finally {
    await database.$disconnect();
  }
}

void main().catch(() => {
  process.stderr.write(
    "Initial access issuance did not complete. No credentials are logged. Inspect account/audit state before retrying; retained handoff files are not overwritten or automatically deleted.\n",
  );
  process.exitCode = 1;
});
