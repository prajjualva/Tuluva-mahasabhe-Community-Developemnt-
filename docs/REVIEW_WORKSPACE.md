# Isolated Google Play reviewer workspace

Support case `2-2741000042363` supplied general guidance on 23 November 2026: provide reusable English-language sign-in, sample records and test payment access without real payments or access to real members' records. This is not pre-compliance approval or permission to publish under an ineligible account type.

The reviewer deployment uses the same application routes, Prisma services, authorization and verified gateway integration as the live app. Use a **separate Vercel project, database, runtime login, workload role and private bucket**. Never copy live records, secrets, storage permissions or delivery credentials.

## Configuration

- `APP_REVIEW_MODE=1` belongs only in a separate `tuluva-mahasabhe-review` project. Its TLS-protected database must be named `csf_review_test_` followed by 32 lowercase hex characters. The application refuses a normal live database in this mode. The owner/migration connection stays outside runtime; the runtime database role must have no superuser, role-creation or database-creation permissions.
- Generate distinct authentication, encryption and job secrets. Jobs reject all requests in review mode; omit the cron definitions from the review project's deployment configuration too.
- Configure Razorpay Test Mode credentials and a distinct webhook secret. Live keys are refused. Create a **Test Mode** webhook at the review origin's `/api/payments/webhooks/razorpay` for `payment.captured`, `payment.failed`, `refund.processed` and `refund.failed`. Preserve the live webhook.
- Use `UPLOAD_STORAGE=s3`, `AWS_REGION=ap-south-2`, a separate `tuluva-review-*` private bucket and a dedicated workload role. Require all four Block Public Access controls, encryption, versioning and bucket-owner-enforced ownership. The live bucket is refused in review mode.
- The workload role must trust only the verified Vercel issuer/audience and exact subject `owner:tuluworld:project:tuluva-mahasabhe-review:environment:production`. Verify the actual project's Security values before saving. Restrict object access to the new bucket's `death-evidence/*`, with security-read permissions on that bucket only. Do not expand the live role or create long-lived AWS keys.
- Leave `RESEND_API_KEY`, `EMAIL_TRANSPORT_TOKEN`, `SMS_TRANSPORT_TOKEN` and `SMS_NOTIFICATION_TRANSPORT_TOKEN` unset. Both OTP and notification transports return unavailable in review mode even if credentials are passed to them. Password sign-in requires no OTP; the live authentication rules remain authoritative.
- Configure the existing public Android signing certificate fingerprints for website association. No private signing key belongs on the server.

`npm run deploy:check` still requires complete test gateway configuration, initialized fixture evidence, least-privilege database access and private storage controls. Do not bypass this gate to obtain a hosted link.

## Initialize sample records once

Create an empty dedicated database and apply all checked-in migrations over its direct connection. In a private operator env file, set review mode, the review owner database URL and distinct new passwords:

- `REVIEW_MEMBER_PASSWORD`: 16–30 random characters, matching Play Console's form limit.
- `REVIEW_OPERATOR_PASSWORD`: at least 32 random characters. Never give staff credentials to reviewers.

```powershell
node --env-file=.env.review-operator --import tsx scripts/seed-review-workspace.ts
```

The command does not fall back to the main app's `.env`. It checks `current_database()` and refuses a database containing users or audits. Migration-supplied permission/policy rows are retained. Sample setup commits in one serializable transaction; reruns cannot reset existing activity.

It creates a private fictional operator and Coordinator, two Member-only accounts, membership/plan dues, three sample contribution events, community news and a comment. No payment is seeded as successful, no receipt is invented and no real nominee or bank data is used.

| Account                          | Non-monetary initial test credit | Exercises                                                      |
| -------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| `tuluworld+playreview@gmail.com` | ₹2,000                           | Wallet payments, contributions and TEST receipts               |
| `online@review.example.invalid`  | ₹250                             | ₹250 wallet + ₹750 online plan split, online dues and failures |

Both accounts use the new Member password and have no staff grants. The primary mailbox-looking identity is independent of the live Member and receives no email. Test allocations have matching wallet commands, movements, ledger entries and `REVIEW_TEST_CREDIT_ALLOCATED` audits in this database only.

Remove fixture passwords and owner connections from deployment configuration. Store the private handoff securely; never commit credentials, print them, put them in URLs or include them in screenshots.

## Acceptance

1. Check the test banner, no-index metadata, role boundaries, profile, photos, ID card, nominees, news, reporting/blocking and deletion-request initiation using fictional inputs.
2. Pay from Wallet; check one debit/payment/ledger entry/`TEST-RCP-*` receipt, including replay idempotency. Download/share the receipt and verify its test warning. Downloaded review ID cards must identify themselves as test documents too.
3. Complete Razorpay **Test Mode** mock Netbanking success/failure. Verify actual signed webhooks reach this deployment once and update the correct records. Browser checkout success alone is insufficient. Do not fabricate a webhook to claim provider acceptance.
4. Check the ₹250/₹750 split: the due/plan stay pending until the online remainder is verified. Check retries do not duplicate money or receipts.
5. Verify the review runtime cannot access live data/storage and sends no messages or scheduled financial jobs.
6. Recheck credentials/deadlines before submission. The private operator may replenish test credit through the existing audited Admin workflow. Preserve history; do not add a public reset/seed endpoint.

The normal isolated database suite includes a separate disposable review database check. It migrates, initializes, verifies replay refusal, Member-only grants, wallet settlement, cross-Member denial, FIFO selection, TEST receipts and pending split behavior, then removes only that database. It can also run with an explicitly supplied private `REVIEW_TEST_OPERATOR_DATABASE_URL`:

```powershell
node scripts/verify-review-workspace.mjs
```

Automated assertions do not replace hosted Razorpay webhook or Android-device acceptance.

For a temporary loopback-only screen check, finish `npm run build:verify` first and append `--screen` to the helper command. It serves that build using a distinct localhost hostname, writes a private temporary sign-in handoff and waits for `stop` on stdin. Do not rebuild `.next-validation` while this screen is running. Stopping the runner removes its disposable database and private files; verify cleanup after an interrupted session.

## Connect the installed app

After hosted acceptance, set live `PLAY_REVIEW_URL=https://tuluva-mahasabhe-review.vercel.app/`. The login screen then offers reviewer access; `/app-review` redirects to the fixed test login without forwarding cookies, tokens or passwords. Only two explicitly allowlisted review hosts are accepted.

Supply both Member credentials and these instructions in Play Console's private App access form. Accurately identify sample records, test payments and restricted staff tools. Verify the transition in the Play-installed Android app. A second origin can show a browser toolbar unless included in a later build's verified origins; do not claim device acceptance without testing.

AWS sign-in and approval of the exact new workload access, review project configuration, Test Mode webhook configuration and hosted/device acceptance remain external steps. Source implementation alone does not make the workspace public.

Google's reply also says financial-service apps require a verified Organization developer account. Complete D-U-N-S and conversion, then wait at least 72 hours after conversion before submitting, as support instructed. Personal-account closed testing is not a substitute.

References: [review sign-in requirements](https://support.google.com/googleplay/android-developer/answer/15748846), [account conversion](https://support.google.com/googleplay/android-developer/answer/16260648), [Financial services policy](https://support.google.com/googleplay/android-developer/answer/9876821).
