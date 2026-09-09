# Production-pilot checklist

This repository is designed to run against PostgreSQL/Neon with `prisma migrate deploy`.
Do not use the development seed command in production.

## Required before launch

1. Set a production `DATABASE_URL` with a least-privilege database user.
2. Set `AUTH_SECRET` to a new random secret of at least 32 characters.
3. Set a random `INTERNAL_JOB_SECRET` and arrange a protected cron request to `POST /api/internal/jobs/plan-reminders` at least daily. The job sends five-day plan-payment reminders and expires unpaid registration dues.
4. Set a public `APP_URL`, HTTPS domain, and production hosting environment.
5. Configure a real online-payment provider and its webhook secret. Until then, online payments remain **pending** and cannot be treated as received.
6. Configure production email/SMS delivery before relying on reminder notifications outside the portal.
7. Choose encrypted document storage before enabling nominee/death-document uploads.
8. Back up the database and restrict access to the Neon project.

## Deployment order

1. Run `npm ci`.
2. Run `npx prisma migrate deploy`.
3. Run `npm run db:generate`.
4. Run `npm run test`, `npm run lint`, and `npm run build`.
5. Deploy the built application with the environment variables above.
6. Create a real Administrator through an audited bootstrap process; do not use development credentials.

## Current payment safety

- Wallet payments settle only with sufficient Foundation wallet balance.
- ₹1,000 registration can consume wallet balance first and leave only the remainder pending online.
- Cash collections require an active assigned Coordinator and an Administrator verification before the due is settled.
- Webhooks are deduplicated and payments/receipts are idempotent.
- No route marks an online payment successful merely because a browser button was clicked.
