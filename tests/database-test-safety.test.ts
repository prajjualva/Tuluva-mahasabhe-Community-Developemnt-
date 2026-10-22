import { describe, expect, it } from "vitest";
import { prepareDatabaseTestEnvironment } from "./database-test-safety";

describe("isolated database test guard", () => {
  it("does not change ordinary test environments", () => {
    const environment = { DATABASE_URL: "postgresql://localhost/main" };
    prepareDatabaseTestEnvironment(environment);
    expect(environment.DATABASE_URL).toBe("postgresql://localhost/main");
  });
  it("rejects opt-in without an explicit test target", () => {
    expect(() => prepareDatabaseTestEnvironment({ RUN_DB_INTEGRATION_TESTS: "1" })).toThrow(
      "ISOLATED_TEST_DATABASE_URL",
    );
  });
  it("rejects malformed URLs, wrong providers and non-test database names", () => {
    for (const target of ["invalid", "https://localhost/test", "postgresql://localhost/neondb"])
      expect(() =>
        prepareDatabaseTestEnvironment({
          RUN_DB_INTEGRATION_TESTS: "1",
          ISOLATED_TEST_DATABASE_URL: target,
        }),
      ).toThrow();
  });
  it("rejects the same database through pooled or direct connection variants", () => {
    expect(() =>
      prepareDatabaseTestEnvironment({
        RUN_DB_INTEGRATION_TESTS: "1",
        DATABASE_URL: "postgresql://app@ep-example-pooler.example/app_test?sslmode=require",
        ISOLATED_TEST_DATABASE_URL: "postgresql://tester@ep-example.example:5432/app_test",
      }),
    ).toThrow("must differ");
  });
  it("sets both Prisma connection variables to the explicitly isolated target", () => {
    const environment = {
      RUN_DB_INTEGRATION_TESTS: "1",
      DATABASE_URL: "postgresql://localhost/main",
      MIGRATION_DATABASE_URL: "postgresql://localhost/main",
      ISOLATED_TEST_DATABASE_URL: "postgresql://localhost/csf_test",
    };
    prepareDatabaseTestEnvironment(environment);
    expect(environment.DATABASE_URL).toBe(environment.ISOLATED_TEST_DATABASE_URL);
    expect(environment.MIGRATION_DATABASE_URL).toBe(environment.ISOLATED_TEST_DATABASE_URL);
  });
});
