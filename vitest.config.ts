import { defineConfig } from "vitest/config";
import { prepareDatabaseTestEnvironment } from "./tests/database-test-safety";

if (process.env.RUN_DB_INTEGRATION_TESTS === "1") {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
prepareDatabaseTestEnvironment(process.env);

export default defineConfig({
  // Next must retain JSX for its compiler; tests compile TSX independently.
  esbuild: { jsx: "automatic" },
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: { provider: "v8", include: ["src/domain/**", "src/server/**"] },
  },
});
