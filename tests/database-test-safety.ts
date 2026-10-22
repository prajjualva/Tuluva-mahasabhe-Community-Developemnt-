type TestEnvironment = Record<string, string | undefined>;

/** Never let destructive integration fixtures fall back to Prisma's .env database. */
export function prepareDatabaseTestEnvironment(environment: TestEnvironment) {
  if (environment.RUN_DB_INTEGRATION_TESTS !== "1") return;
  const candidate = environment.ISOLATED_TEST_DATABASE_URL;
  if (!candidate) throw new Error("Database tests require ISOLATED_TEST_DATABASE_URL.");
  let target: URL;
  try {
    target = new URL(candidate);
  } catch {
    throw new Error("The isolated test database URL is invalid.");
  }
  if (!["postgres:", "postgresql:"].includes(target.protocol))
    throw new Error("Database tests require PostgreSQL.");
  // An explicit disposable/test database name is an additional operator guard;
  // it does not make a production database safe merely by changing credentials.
  const databaseName = decodeURIComponent(target.pathname.slice(1));
  if (!/(^|[_-])test([_-]|$)/i.test(databaseName))
    throw new Error("Use a dedicated database whose name contains a separate test segment.");
  const identity = (value: string) => {
    const url = new URL(value);
    return `${url.hostname.replace(/-pooler(?=\.)/, "")}:${url.port || "5432"}${url.pathname}`;
  };
  for (const configured of [environment.DATABASE_URL, environment.MIGRATION_DATABASE_URL]) {
    if (configured && identity(configured) === identity(candidate))
      throw new Error("The isolated test database must differ from the application database.");
  }
  environment.DATABASE_URL = candidate;
  environment.MIGRATION_DATABASE_URL = candidate;
}
