# Isolated Google Play reviewer workspace

Support case `2-2741000042363` supplied general guidance on 23 November 2026: provide reusable English-language sign-in, sample records and test payment access without real payments or access to real members' records. This is not pre-compliance approval or permission to publish under an ineligible account type.

The reviewer deployment uses the same application routes, Prisma services, authorization and verified gateway integration as the live app. Use a **separate Vercel project, database, runtime login, workload role and private bucket**. Never copy live records, secrets, storage permissions or delivery credentials.

## Configuration

- `APP_REVIEW_MODE=1` belongs only in a separate `tuluva-mahasabhe-review` project. Its TLS-protected database must be named `csf_review_test_` followed by 32 lowercase hex characters. The application refuses a normal live database in this mode. The owner/migration connection stays outside runtime; the runtime database role must have no superuser, role-creation or database-creation permissions.
- Generate distinct authentication, encryption and job secrets. Jobs reject all requests in review mode; omit the cron definitions from the review project's deployment configuration too.
- Deploy the review project with the checked-in `vercel.review.json` configuration (copy it to the isolated staging archive's `vercel.json`). It keeps the same production build and readiness gates while defining no cron schedules. Preserve the main project's `vercel.json`.
- Configure Razorpay Test Mode credentials and a distinct webhook secret. Live keys are refused. Create a **Test Mode** webhook at the review origin's `/api/payments/webhooks/razorpay` for `payment.captured`, `payment.failed`, `refund.processed` and `refund.failed`. Preserve the live webhook.
- Use `UPLOAD_STORAGE=s3`, `AWS_REGION=ap-south-2`, a separate `tuluva-review-*` private bucket and a dedicated workload role. Require all four Block Public Access controls, encryption, versioning and bucket-owner-enforced ownership. The live bucket is refused in review mode.
- The workload role must trust only the verified Vercel issuer/audience and exact subject `owner:tuluworld:project:tuluva-mahasabhe-review:environment:production`. Verify the actual project's Security values before saving. Restrict object access to the new bucket's `death-evidence/*`, with security-read permissions on that bucket only. Do not expand the live role or create long-lived AWS keys.
- Leave `RESEND_API_KEY`, `EMAIL_TRANSPORT_TOKEN`, `SMS_TRANSPORT_TOKEN` and `SMS_NOTIFICATION_TRANSPORT_TOKEN` unset. Both OTP and notification transports return unavailable in review mode even if credentials are passed to them. Password sign-in requires no OTP; the live authentication rules remain authoritative.
- Configure the existing public Android signing certificate fingerprints for website association. No private signing key belongs on the server.

`npm run deploy:check` still requires complete test gateway configuration, initialized fixture evidence, least-privilege database access and private storage controls. Do not bypass this gate to obtain a hosted link.

### Provisioned resources

Checked again on 25 November 2026: the AWS console redirects to sign-in. The dedicated reviewer bucket/workload role and hosted acceptance remain blocked on account authentication. The main application continues using its existing production storage; this reviewer setup is separate.

- The separate Vercel project `tuluva-mahasabhe-review` (`prj_RYTQ4fdr0FTUEBYTd8xYdFACG5uD`) exists on the inspected Hobby team, with Node 24 and team-issued OIDC enabled. It has not been deployed or promoted yet.
- Persistent database `csf_review_test_1c1782d4cccf42c8b7486ab9d4bd8d05` was created on the existing inspected Neon Free-plan compute, migrated and initialized. Runtime role `tuluva_review_1c1782d4cccf42c8` has no administrative/schema-creation privileges and cannot connect to `tuluva_production`. No production records were copied.
- Seventeen encrypted Production variables were installed in this review project, including distinct application secrets and Razorpay **Test Mode** credentials. Migration-owner access, fixture passwords and email/SMS delivery credentials are excluded from runtime configuration.
- [Review trust policy](aws-review-trust.json) and [review storage policy](aws-review-storage-policy.json) are prepared for role `tuluva-review-documents` and bucket `tuluva-review-documents-20261124-f8b2c4`. Neither AWS resource has been created: the AWS session is signed out. Their configured names are references, not evidence that storage works. Verify the account, project OIDC values and exact access before applying these policies.
- A new Test Mode webhook, storage verification, hosted acceptance and reviewer-origin Android acceptance remain pending. Preserve the existing live webhook and storage role.

The 25 November paid-onboarding release is migrated in this database. Separate fictional onboarding accounts exercised the initial wallet payment and the Admin fee-exemption grant, with the resulting ID card, certificate and receipt/exemption records. These append-only review records are retained. All 353 tests passed in CI run [45573362621](https://github.com/prajjualva/Tuluva-mahasabhe-Community-Developemnt-/actions/runs/45573362621), including the isolated database cases. The new local phone acceptance does not replace the hosted webhook, real inbox or Android-device checks below.

## Initialize sample records once

The initial persistent setup can be provisioned with `node --env-file=.env scripts/provision-review-database.mjs --verified-existing-free-plan` after inspecting the existing Neon plan and usage. This creates a randomly named database and a separate restricted login on the existing compute, applies migrations and initializes the sample records. It refuses to overwrite `.env.review-operator`, secures that file before writing credentials, denies the runtime connection to the live database and verifies that no payments/receipts were seeded. Interrupted provisioning retains its exact private handoff for inspection; do not rerun blindly or delete application records.

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

An additional local browser check against the persistent isolated review database verified an actual wallet debit, receipt preview and HTML download, geometric profile-avatar upload and front/back ID-card PNG download. The receipt and ID-card downloads visibly identify themselves as test documents without real monetary value or membership entitlement. The primary sample wallet now holds ₹1,900 after its ₹100 contribution; retain that isolated test history. The temporary local screen server was stopped. It was not a hosted reviewer deployment.

Evidence is saved under the private local handoff folder `C:/Users/Admin/Downloads/Tuluva-Mahasabhe-Play-Store/`: `reviewer-receipt-validated.jpg`, `reviewer-test-receipt.html`, `reviewer-id-card-validated.jpg` and `reviewer-test-id-card.png`. These artifacts contain fictional reviewer data only. The complete source validation passed 336 tests across 84 files, without skips, in [CI run 45334808541](https://github.com/prajjualva/Tuluva-mahasabhe-Community-Developemnt-/actions/runs/45334808541).

For a temporary loopback-only screen check, finish `npm run build:verify` first and append `--screen` to the helper command. It serves that build using a distinct localhost hostname, writes a private temporary sign-in handoff and waits for `stop` on stdin. Do not rebuild `.next-validation` while this screen is running. Stopping the runner removes its disposable database and private files; verify cleanup after an interrupted session.

## Connect the installed app

After hosted acceptance, set live `PLAY_REVIEW_URL=https://tuluva-mahasabhe-review.vercel.app/`. The login screen then offers reviewer access; `/app-review` redirects to the fixed test login without forwarding cookies, tokens or passwords. Only two explicitly allowlisted review hosts are accepted.

Supply both Member credentials and these instructions in Play Console's private App access form. Accurately identify sample records, test payments and restricted staff tools. Verify the transition in the Play-installed Android app. A second origin can show a browser toolbar unless included in a later build's verified origins; do not claim device acceptance without testing.

AWS sign-in and approval of the exact new workload access, Test Mode webhook configuration and hosted/device acceptance remain external steps. Source implementation alone does not make the workspace public. The connected Prajwal mailbox search found no new D-U-N-S reply; the Foundation mailbox could not be checked because its Google session had expired. Do not interpret this as confirmation that every mailbox has no reply.

Google's reply also says financial-service apps require a verified Organization developer account. Complete D-U-N-S and conversion, then wait at least 72 hours after conversion before submitting, as support instructed. Personal-account closed testing is not a substitute.

References: [review sign-in requirements](https://support.google.com/googleplay/android-developer/answer/15748846), [account conversion](https://support.google.com/googleplay/android-developer/answer/16260648), [Financial services policy](https://support.google.com/googleplay/android-developer/answer/9876821).
