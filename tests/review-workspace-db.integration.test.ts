import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, it, expect } from "vitest";

const databaseDescribe = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
databaseDescribe("persistent isolated reviewer workspace", () => {
  it("creates and verifies a separate review database, then cleans up only that database", async () => {
    const result = await promisify(execFile)(
      process.execPath,
      ["scripts/verify-review-workspace.mjs"],
      {
        env: {
          ...process.env,
          REVIEW_TEST_OPERATOR_DATABASE_URL: process.env.MIGRATION_DATABASE_URL,
        },
        timeout: 600_000,
      },
    );
    expect(result.stdout).toContain("Review database checks passed");
    expect(result.stdout).toContain("Deleted only the disposable review database");
  }, 630_000);
});
