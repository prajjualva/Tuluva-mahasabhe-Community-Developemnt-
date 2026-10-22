# Production-pilot checklist

This repository is designed to run against PostgreSQL/Neon with `prisma migrate deploy`.
Do not use the development seed command in production.

## Required before launch

The main-app deployment configuration, private S3 storage setup, authenticated Vercel cron jobs and fail-closed deployment checks are documented in [MAIN_APP_DEPLOYMENT.md](MAIN_APP_DEPLOYMENT.md). Use a separate production database from development. The owner has requested replacing the existing public demo in the same Vercel project/address, retaining its previous deployment for rollback.

1. Set a production `DATABASE_URL` with a least-privilege database user.
2. Set `AUTH_SECRET` to a new random secret of at least 32 characters.
   Set `BANK_ENCRYPTION_KEY` to a separate base64-encoded 32-byte key before enabling bank/nominee entry. Back this key up securely; changing or losing it without a data re-encryption migration makes existing records unreadable.
3. Set a random `INTERNAL_JOB_SECRET` and arrange protected cron requests at least daily to `POST /api/internal/jobs/membership-dues`, `/api/internal/jobs/plan-reminders`, `/api/internal/jobs/due-reminders` and `/api/internal/jobs/cash-reconciliation`, with the secret in `x-internal-job-secret`. These jobs generate annual renewals, enforce membership grace/closure, five-day reminders, unpaid registration expiry and the 30-day cash discrepancy escalation/suspension. The deployment scheduler must actually invoke these endpoints; merely deploying source does not schedule them.
4. Set a public `APP_URL`, HTTPS domain, and production hosting environment.
5. Configure a real online-payment provider and its webhook secret. Until then, online payments remain **pending** and cannot be treated as received.
6. Configure production email/SMS delivery before relying on reminder notifications outside the portal.
7. Choose encrypted document storage before enabling nominee/death-document uploads.
8. Back up the database and restrict access to the Neon project.

## Deployment order

1. Run `npm ci`.
2. Run `npm run db:deploy`. This uses `MIGRATION_DATABASE_URL` when supplied and selects Neon's direct hostname for migrations when the application URL uses its pooler. Keep pooled traffic for the app; Prisma migration advisory locks require a session connection.
3. Run `npm run db:generate`.
4. Run `npm run test`, `npm run lint`, and `npm run build`.
5. Deploy the built application with the environment variables above.
6. On a fresh production database, supply `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (16+ characters), and `BOOTSTRAP_ADMIN_REASON`, then run `npm run admin:bootstrap`. It refuses existing Admin installations or identity takeovers, initializes permissions/settings, and audits the first identity. Remove these environment inputs immediately afterward. Never run the development seed in production.

## Current payment safety

- Wallet payments settle only with sufficient Foundation wallet balance.
- ₹1,000 registration can consume wallet balance first and leave only the remainder pending online.
- Cash collections require an active assigned Coordinator and an Administrator verification before the due is settled.
- Every collection immediately issues a numbered CASH/MANUAL receipt marked pending until remittance verification. Combined deposits retain each member receipt, store restricted evidence, and allocate verified money explicitly per receipt. Shortfalls block new collection; recovery remains available to the original collector at `/member/cash-remittances` even after suspension.
- Operational ledger debits require an evidence-backed adjustment request and an explicit audited Admin approval. Posted ledger records are never edited through the application.
- Webhooks are deduplicated and payments/receipts are idempotent.
- No route marks an online payment successful merely because a browser button was clicked.
- Captures for waived/cancelled/expired obligations are recorded as unapplied funds and flagged for Admin refund review, never used to reactivate membership. Deadline decisions use the signed provider event timestamp, not the payment entity's earlier creation time; see the [provider's webhook samples](https://github.com/razorpay/markdown-docs/blob/master/webhooks/payments.md).

## Release acceptance, not a production claim

Automated tests and a successful build validate source behavior, not the deployed banking or delivery integrations. Before public launch, complete gateway sandbox capture/refund/webhook tests, a controlled real-money reconciliation, SMS/email delivery and abuse tests, HTTPS/proxy-origin tests, database backup/restore and encryption-key recovery, private storage retention/backup/access checks, monitoring/alerting, and an independent security review.

Database integration tests create explicitly synthetic identities and financial fixtures and remove them afterward. Run them only against a dedicated development/test database, never a live member database. CI provisions its own PostgreSQL service.

For local verification with a development PostgreSQL role that can create databases, `npm run test:database` creates a uniquely named disposable database, migrates it, installs development identities/settings there, and runs all tests against it. It removes that database and its synthetic fixtures afterward, including on test failure; it never migrates or seeds the application database. It also uses a separate temporary document directory. A failure to clean up is reported explicitly. Do not interrupt the process before cleanup finishes.

Alternatively, provision and migrate a dedicated database yourself, then set `ISOLATED_TEST_DATABASE_URL` and `RUN_DB_INTEGRATION_TESTS=1`. Vitest rejects missing targets, non-PostgreSQL URLs, database names without a separate `test` segment, and targets matching the application/migration database. That naming guard does not replace real isolation.

Dependency security findings and upgrade decisions are tracked in [the dependency review](DEPENDENCY_SECURITY_REVIEW.md). Outstanding advisories require review before release even when the app builds successfully.
