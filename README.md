# Community Support Foundation

Production-oriented foundation for a community support platform. It is not an insurance system.

## Stack

- Next.js + TypeScript for the responsive web application and server API boundary
- PostgreSQL + Prisma for typed relational data access and migrations
- Zod validation, Argon2id passwords, permission-based authorization, structured Pino logs
- Vitest tests, ESLint, Prettier, and GitHub Actions CI

## Structure

- `src/app` – application UI and route boundary (UI phases intentionally not built yet)
- `src/domain` – central money and configurable scheme rules
- `src/server/auth`, `audit`, `payments`, `validation`, `logging` – server-only security and integration foundations
- `prisma` – relational schema, migrations, and development seed
- `tests` – domain and authorization foundation tests

## Setup

1. Install Node.js 22+ and PostgreSQL 16+.
2. Copy `.env.example` to `.env`, generate a unique `AUTH_SECRET`, and provide a local PostgreSQL `DATABASE_URL`.
3. Install packages: `npm install`
4. Create the schema: `npm run db:migrate -- --name initial_foundation`
5. Seed development-only data: `npm run db:seed`
6. Start: `npm run dev`

Useful validation commands: `npm run test`, `npm run lint`, `npm run build`, `npm run format:check`.

## Security and financial design

Amounts are integer paise. The client never decides financial amounts; later payment endpoints must calculate them from server-side dues/settings and execute writes within transactions. Payment records have idempotency keys and webhook events have provider-event uniqueness. Financial and audit history is append-oriented.

Bank details are intended for encrypted storage only (`bankEncrypted`) and are excluded from public API contracts. Passwords use Argon2id. OTP designs persist only a hash, expiry, and attempt counters. Logs redact credentials and sensitive bank fields.

The development seed password is printed only for local development: `admin@dev.local` / `DevelopmentOnly-ChangeMe1!`. Change it immediately if used outside a disposable local database.
