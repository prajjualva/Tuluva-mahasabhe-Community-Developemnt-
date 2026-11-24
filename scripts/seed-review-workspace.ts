import { PrismaClient } from "@prisma/client";
import { assertReviewEnvironment } from "../src/server/deployment/review-environment";
import { seedReviewWorkspace } from "../src/server/deployment/review-fixtures";

// Explicit --env-file only. Never fall back to the normal application's .env.
async function main() {
  assertReviewEnvironment();
  const database = new PrismaClient();
  try {
    const result = await seedReviewWorkspace(database, process.env);
    console.log(
      `Created ${result.sampleMembers} fictional Members and ${result.sampleEvents} sample events in the isolated review database. Credentials were not printed.`,
    );
  } finally {
    await database.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "Review setup failed. Verify isolation and the empty migrated database; no credentials or provider diagnostics are printed.",
  );
  process.exitCode = 1;
});
