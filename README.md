# Community Support Foundation

Community Support Foundation application with persistent Member, Coordinator and Foundation Admin workflows. It is not an insurance system. A passing local build is not approval for a public financial launch.

## Stack

- Next.js + TypeScript for the responsive web application and server API boundary
- PostgreSQL + Prisma for typed relational data access and migrations
- Zod validation, Argon2id passwords, permission-based authorization, structured Pino logs
- Vitest tests, ESLint, Prettier, and GitHub Actions CI

## Structure

- `src/app` – application UI and protected API routes for Member, Coordinator, and Administrator workflows
- `src/domain` – central money and configurable scheme rules
- `src/server` – transactional services for membership, plans, contributions, payments, wallets, receipts, nominees, death/support cases, notifications, news, cash reconciliation, ledger and Admin commands
- `prisma` – relational schema, migrations, and development seed
- `tests` – domain, authorization, provider-contract and PostgreSQL integration tests

## Setup

1. Install Node.js 22+ and PostgreSQL 16+.
2. Copy `.env.example` to `.env`, generate a unique `AUTH_SECRET`, and provide a dedicated development PostgreSQL/Neon `DATABASE_URL`. Never commit this file.
3. Install packages: `npm install`
4. Apply the checked-in migrations: `npm run db:deploy`, then `npm run db:generate`. Neon migrations use a direct connection; the app can use its pooled connection.
5. Seed development-only data: `npm run db:seed`
6. Start: `npm run dev`

Validation commands: `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, `npx prisma validate`, and `npm run build`.

To include real-database integration tests, use a disposable development/test database with migrations and development roles seeded, set `RUN_DB_INTEGRATION_TESTS=1`, then run `npm test -- --maxWorkers=1`. These tests create and clean up synthetic financial fixtures. Do not run them against a live membership database. CI provisions an isolated PostgreSQL instance and runs the complete suite.

See [the production-pilot checklist](docs/PRODUCTION_PILOT.md) before deployment.

For the local demonstration, see [the role-by-role walkthrough](docs/DEMO_WALKTHROUGH.md). Use `npm run build:verify` to validate a production build without overwriting the running demo's development output.

The [Phase 10 and 11 acceptance checklist](docs/PHASE_10_11_ACCEPTANCE.md) maps cash, reconciliation, ledger, Admin and audit requirements to the implemented workflows and separates external activation requirements.

## Security and financial design

Amounts are integer paise. The server calculates payable amounts from persisted dues/versioned settings. Multi-record financial changes use serializable Prisma transactions with bounded concurrency retries, payment idempotency and provider-event uniqueness. Settled records are retained; refunds and wallet compensation append history. Audit writes have request correlation IDs and application-level mutation protection.

Bank details use authenticated AES-256-GCM encryption with a separate production key and are excluded from general DTOs. Explicit bank review is permission/relationship checked and audited. Passwords use Argon2id; one-use OTP challenges persist only hashes, expiry and attempt counters. Contact changes retain old contact information until verification and revoke sessions afterward. Nested diagnostic fields are scrubbed. Protected files use opaque keys or restricted database bytes, size/type validation and authorized audited downloads.

Development-only accounts are `admin@dev.local`, `coordinator@dev.local`, and `member@dev.local`, with password `DevelopmentOnly-ChangeMe1!`; referral code `TULUVA01`. Seeding is blocked under `NODE_ENV=production`. Never deploy these identities or seed financial activity into a production database.

## Locked lifecycle rules

- Annual ₹369 dues have calendar-month grace and unique billing cycles. Six actually expired ₹100 contributions cause inactivity. Paying a contribution alone never reactivates an inactive member.
- Every approved/published event creates ₹100 obligations for members who existed at event creation, including INACTIVE members. Later joiners are excluded. Contribution obligation and support eligibility at the actual date of death are separate.
- Reactivation requires all outstanding dues plus the current successful ₹369 payment and resumes the existing plan/waiting dates without a second ₹1,000.
- A full calendar year inactive closes access. Admin-only reopening preserves identity/wallet/history, cancels old unpaid dues, and creates new ₹369/₹1,000 requirements with a new six-month wait.
- The specific locked Coordinator exemption overrides those fee requirements: Coordinators do not pay ₹369/₹1,000 but still owe ₹100. Appointment/reopening exemptions are audited. Permanent referral codes cannot be edited; suspension disables operations and referral use.
- Coordinators may request unpaid-due waivers; only Admin decides, with mandatory reason, identity and timestamp. A waiver is not a payment and does not activate membership or a plan.

## Production configuration and remaining external activation

See `.env.example` and [the release checklist](docs/PRODUCTION_PILOT.md) for all variables and deployment steps.

- Required infrastructure: production PostgreSQL, least-privilege DB identity, HTTPS hosting/domain, protected daily jobs, backups, monitoring, and persistent private document storage. Local death evidence requires a private persistent volume, not ephemeral serverless disk. Cash/nominee/adjustment evidence is database-backed.
- Required keys: independent strong `AUTH_SECRET`, stable base64 32-byte `BANK_ENCRYPTION_KEY`, and `INTERNAL_JOB_SECRET`.
- Online payments use a real Razorpay adapter behind a provider boundary. Set provider/API/webhook credentials and test capture, replay, failure and refund scenarios before enabling real collection. Unconfigured online payments do not succeed.
- OTP delivery uses trusted HTTPS email/SMS bridges configured by `EMAIL_TRANSPORT_URL/TOKEN` and `SMS_TRANSPORT_URL/TOKEN`. Without a bridge, OTP requests fail explicitly; no code is returned or logged. General in-app notifications are persistent; additional-channel adapters report unavailable until connected.
- Support payouts support an audited manual bank-transfer boundary, with explicit transaction reference/outcome and no automatic retry. A live automated bank-payout provider is a separate external integration, not simulated.
- On a fresh production database, initialize the first Admin with `npm run admin:bootstrap` using the three documented bootstrap environment variables; no development seed.

Public launch still requires provider onboarding, deployment configuration, backup/key-recovery drills, operational reconciliation and independent security review. These are not established merely by tests or source completion.
