# Main application deployment (not the stakeholder demo)

## Implemented source

- `vercel.json` selects the real Next.js application, generates Prisma after installation, runs `deploy:check` before the production build, and declares four daily jobs in UTC. It does not use the standalone demo export.
- The existing job handlers accept authenticated Vercel GETs through `CRON_SECRET`, or their existing authenticated POSTs through `INTERNAL_JOB_SECRET`. These must be distinct random secrets of at least 32 characters. User cookies and query-string credentials never authorize jobs. Jobs retain their existing bounded batches, transactional claims and idempotency; this integration does not change membership, expiry, contribution or suspension rules.
- Death evidence supports private AWS S3 storage. Uploads use opaque UUID keys, no public ACL or presigned URL, server-side encryption and a conditional write that cannot overwrite an existing object. Downloads remain behind existing case/document permission checks. Reads are size-bounded and provider diagnostics are not exposed. Compensation removes only an upload whose metadata persistence failed; no settled financial records are removed.
- Local document storage remains available for development and explicitly refuses Vercel's ephemeral filesystem. Existing local evidence is not automatically copied, deleted or made publicly available. Migrating real documents requires a separately verified migration/retention procedure.
- `npm run deploy:check` performs configuration validation and read-only checks of the production database and private bucket. It refuses development identities, missing initial Admin access, database-superuser/role-creation privileges, missing encryption/versioning or incomplete Block Public Access. It never creates roles, deletes identities, changes bucket settings or writes financial records.

## External setup still required

1. Authenticate this computer's Git client with the owner's GitHub account. Do not paste personal access tokens or passwords into chat. Push the release branch and inspect GitHub CI before promotion.
2. Per the owner's 23 October instruction, replace the existing `tuluva-mahasabhe` stakeholder-demo deployment with the main app, retaining `tuluva-mahasabhe.vercel.app`. Connect the validated release branch to that existing Vercel project. Keep the old successful deployment available for rollback and do not promote a replacement until the production configuration passes the gate. Do not point public production at the development database.
3. Provision the production PostgreSQL database and a least-privilege application role. An operational migration identity uses the direct/non-pooled `MIGRATION_DATABASE_URL`. Apply migrations and run the audited initial Admin bootstrap before opening access. Never run the development seed in production.
4. Generate fresh production authentication/job secrets and a distinct bank-encryption key. Back up the encryption key securely; never rotate the development key in place to prepare production. Set the public HTTPS `APP_URL` and other values from `.env.example` in the main-app project's server environment. Set Node.js to 24.
5. Supply a private AWS S3 bucket, `AWS_REGION`, `S3_PRIVATE_BUCKET`, and a server-side workload role. Vercel uses `AWS_ROLE_ARN` with short-lived OIDC federation; its runtime and build gate refuse missing roles instead of falling back to permanent access keys. Set `UPLOAD_STORAGE=s3`. Enable all four Block Public Access controls, default encryption and versioning. Use bucket-owner-enforced ownership, HTTPS-only access, retention/backups and a tested restore process. The app needs object Get/Put/Delete only for `death-evidence/*`; the read-only preflight also needs bucket public-access, encryption and versioning inspection permissions. Do not give it bucket-policy, IAM or bucket-deletion privileges.
6. Configure verification email using direct Resend (`EMAIL_PROVIDER=resend`, server-only `RESEND_API_KEY`, and verified-domain `RESEND_FROM_EMAIL`) or the existing HTTPS delivery bridge. Configure the separate SMS bridge and test actual verification delivery. The email provider choice does not waive the SMS release requirement. In-app reminder persistence is not proof of external delivery. Delivery credentials are server-only. See [email setup and current verification boundary](EMAIL_SETUP.md).
7. A real payment gateway can be connected later. Leaving `PAYMENT_PROVIDER` unset keeps online payments unavailable; no fake success is introduced. Selecting Razorpay requires its key ID, secret and webhook secret. Complete sandbox capture/refund/webhook tests before enabling actual online collections.
8. Run the gate and production build, then verify the deployed jobs in Vercel's logs and test the protected Member/Coordinator/Admin workflows. Hobby jobs run daily with approximate timing, so the current daily schedules are not an exact-time service guarantee. Track processed/backlog counts and duration against the bounded batch limits; larger membership volumes require an operational drain/retry scheduler within hosting limits, not silently assuming one daily invocation handles every backlog.
9. Resolve or obtain independent security acceptance for the remaining dependency findings; complete backup/key recovery, document access/retention and incident-response checks. A passing source build or configuration gate is not public-launch approval.

References: [Vercel cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs), [cron plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [AWS S3 SDK](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/).

## Validation boundary

### Development parity — 23 October 2026

At the owner's request, development was brought into alignment with the production database structure/runtime-privilege pattern, without copying production data or secrets:

- Verified the existing development `neondb` already has all 24 migrations and an active `admin@dev.local` development identity. No reset, seed, record copy or new financial fixtures were necessary.
- Created a distinct `tuluva_development_app` runtime login with a new random password and table CRUD/sequence usage/schema usage, but no migration-history access, superuser, database/role creation, replication, RLS bypass or schema-object creation rights. A live privilege check confirmed it **cannot connect to `tuluva_production`**.
- Updated only the local `.env` database entries: runtime traffic uses the restricted pooled login; migration operations retain the direct owner connection. The original configuration is backed up in Git-ignored `.env.development-owner-backup`. Both files have Windows ACLs restricted to the operator, SYSTEM and Administrators. They must not be uploaded or shared. The production operator file was not changed.
- The guarded operator command is `node scripts/configure-development-runtime.mjs --configure-existing-development-database`. It refuses production mode, unexpected database targets, existing roles and backup overwrites. Inspect retained state after any interrupted invocation; never blindly rerun or delete existing records to retry.
- Restarted only the known workspace development server on `http://127.0.0.1:3000`. Private uploads remain local in development; production-only AWS federation/trust was not broadened. No additional cloud service, compute or paid plan was enabled.

Both environments use the same source code. This does not replicate production infrastructure credentials, make localhost publicly accessible or claim live payment/email/SMS delivery. The existing password-reset UI uses verified email/SMS codes and remains dependent on a real delivery bridge; no OTP is exposed or bypassed for development.

### Isolated production PostgreSQL — 23 October 2026

The owner approved provisioning only without paid upgrades. The authenticated Neon console confirmed **Free plan**, 1.14 CU-hours used and 37.38 MB project storage before provisioning. No plan, compute size, paid feature or billing setting was changed. Free quotas still apply; this does not promise unlimited free production operation or free external delivery/payment services.

- Created a separate `tuluva_production` database on the existing project/compute. The existing `neondb` development database was not migrated, seeded or reset.
- Applied all **24** existing migrations through a direct, non-pooled operational connection. The first migration invocation did not finish; after read-only inspection, the retry applied all migrations, and a subsequent deployment confirmed the completed state.
- Created `tuluva_production_app` with application table CRUD, sequence usage/select and schema usage only. Verified no superuser, database creation, role creation, replication, RLS bypass or schema-object creation privileges. It has no access to Prisma's migration-history table. Future table/sequence grants apply only to objects created by the operational owner in this database.
- Generated a unique random application password locally, without printing it. Private connection configuration is in Git-ignored `.env.production-operator`, restricted by Windows ACL to the current operator, SYSTEM and Administrators. This filename deliberately is **not** automatically loaded by Next.js, so local development and build verification do not silently target production. Do not upload this file, print its contents or put the migration-owner connection in the application's runtime environment.
- The operator-only provisioning command is `node scripts/provision-production-database.mjs --approved-free-plan-provision`. It refuses existing resources unless an operator explicitly supplies `--resume-inspected-resources` after inspection; recovery validates saved connection targets and never overwrites passwords/configuration or deletes resources. This command cannot verify Neon billing from SQL: actual console-plan and owner approval checks are mandatory before use.
- Verified **zero users and zero payments**. No development seed or synthetic financial records were created. The requested initial Admin email is `tuluworld@gmail.com`; the identity has **not** been bootstrapped yet and still requires secure password setup. No password should be sent through chat.

Production Vercel database/secrets configuration, initial Admin bootstrap, external delivery configuration, live OIDC/private document validation and production acceptance remain pending. The existing operational database-owner credential was previously supplied through chat and must be rotated through Neon before public launch; coordinate the dependent development/operator connection updates rather than silently breaking them. The newly generated application credential was not shared through chat. No deployment or Git push was triggered by this provisioning step. Tests must continue to use disposable isolated databases, never this production database.

### Provisioned private bucket — 23 October 2026

With the owner's explicit approval, the following empty S3 bucket was created through the AWS console:

```text
AWS_REGION=ap-south-2
S3_PRIVATE_BUCKET=tuluva-foundation-documents-prod-20261023-f8b2c4
```

The console confirmed successful creation and the persisted settings: Hyderabad region, versioning enabled, default SSE-S3 encryption, bucket-owner-enforced ownership (ACLs disabled), and all four Block Public Access controls enabled. No documents were uploaded and no AWS plan or support subscription was changed. Workload access was separately authorized and configured as described below; no IAM user or access keys were created.

### Production-only workload access — 23 October 2026

- After explicit owner approval, created the IAM OIDC provider `https://oidc.vercel.com/tuluworld` with audience `https://vercel.com/tuluworld`. Verified these values against the existing Vercel project's Security settings; no issuer setting was changed.
- Created role `tuluva-main-app-documents-production` with a single inline policy, `PrivateDocumentsAndSecurityRead`. Its persisted trust uses `StringEquals` for both audience and subject `owner:tuluworld:project:tuluva-mahasabhe:environment:production`. No project/environment wildcard is trusted. Preview/development are intentionally excluded.
- The role allows only `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on this bucket's `death-evidence/*`, and `s3:GetBucketPublicAccessBlock`, `s3:GetEncryptionConfiguration`, `s3:GetBucketVersioning` on this bucket. Both allow statements require `aws:SecureTransport=true`. It has no bucket administration, IAM, other-bucket, object-version deletion or bucket-list permission. A versioned delete is a compensating delete marker, not permanent erasure of historical versions.
- Saved the following non-secret values to this existing Vercel project's **Production environment only**:

```text
AWS_REGION=ap-south-2
S3_PRIVATE_BUCKET=tuluva-foundation-documents-prod-20261023-f8b2c4
AWS_ROLE_ARN=arn:aws:iam::360908957233:role/tuluva-main-app-documents-production
UPLOAD_STORAGE=s3
```

- No permanent credentials, root keys, secrets in chat, deployment or production database changes were used. Vercel confirmed that a new deployment is needed for the saved settings to take effect; no redeploy was requested.
- Added the official `@vercel/oidc-aws-credentials-provider` integration to the document client and deployment preflight, using requested 15-minute STS sessions. Local non-Vercel workloads retain the existing AWS SDK credential chain. An invalid/configured workload role never falls back silently to permanent keys.
- Added five focused tests for workload selection, no permanent-key fallback, invalid-role redaction, the non-Vercel local chain and the production configuration gate. The current normal suite passes 220 tests, with 15 isolated PostgreSQL cases intentionally skipped; the preceding full isolated database run remains documented in the workflow QA report. No financial logic or records were changed.

A bucket-wide `DenyInsecureTransport` policy was subsequently saved and verified in the persisted Permissions view. It denies all S3 actions on this bucket and its objects over HTTP for non-AWS-service principals, following AWS's service-principal exclusion guidance; the exclusion grants no access. All public-access blocks remain enabled.

This is cloud configuration and source validation, not a successful live document transfer or production-readiness claim. The new adapter code is local until explicitly pushed/deployed. Live production OIDC exchange/upload/download/compensation tests, private-route authorization acceptance, version recovery and retention/backup acceptance remain separate launch tasks. Do not point a local development instance at production documents to test this role. Keep production secrets out of this document and chat; never use root access keys.

References: [Vercel AWS federation](https://vercel.com/docs/oidc/aws), [OIDC credential-provider reference](https://vercel.com/docs/oidc/reference), [S3 public-access inspection permissions](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetPublicAccessBlock.html).

S3 tests use a mocked SDK to validate private request construction, credential selection, size bounds, error handling and routing. They do not prove a deployed OIDC exchange, live transfer, retention or reliability. The preflight is expected to fail on the current development environment; that is a successful safety check, not a source/build failure. Cloud provisioning above is complete only to its stated boundary; live production validation and other external services remain pending.
