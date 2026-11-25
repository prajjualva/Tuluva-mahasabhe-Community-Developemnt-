# Paid member onboarding

New public registrations use onboarding policy v1. Registration requires a JPEG/PNG/WebP profile photo, re-encoded without metadata, and atomically creates the Member, photo, membership history and versioned annual fee due. The first due is linked as `registrationDueId`. Registration signs the new user in and sends them directly to `/membership-payment`.

Server authorization checks the linked due and its successful, unrefunded settlement on every protected request. New unpaid users can use enrollment status, their own initial payment initiation/resumption/cancellation, contact verification, sign-out and account deletion. A client redirect, gateway success handler, pending cash collection, unrelated payment or ordinary due waiver cannot unlock the workspace. Payment commands remain idempotent and use server amounts. Online payments require signed provider settlement; wallet and Coordinator-remittance verification use their existing persistent workflows.

Existing members have no registration-due link and retain their previous access and renewal grace rules. Coordinator fee exemptions remain intact. This does not waive contributions or approve a Community Support Plan.

## Admin access controls

Admin → Members → Activate a registered membership exposes:

- **Record payment already received**: requires full-funds confirmation, received date, unique bank/cash reference and reason. The server checks live Admin permission, settles the initial fee and appends the payment, official receipt, Foundation Ledger entry, membership pack and audit in one serializable transaction. Replays return the original result; a changed command cannot reuse its key.
- **Grant membership with fee exemption**: requires explicit exemption confirmation and a reason. A persistent grant records the approving Admin and timestamp. The initial due is waived, access is granted and the welcome pack contains a fee-exemption acknowledgement. No successful payment, cash receipt or ledger credit is invented.

Both actions refuse closed/deceased accounts and unresolved pending checkouts/collections. They cover initial membership only. Normal renewals, reactivation, contribution obligations and support-plan approvals retain their separate rules.

## Pending-dues reminder

The Member, Coordinator and Admin workspaces check only the signed-in user's payable dues through the existing authorized API. A native modal presents individual server amounts and a Continue payment link to the dues screen, where existing online-checkout recovery and wallet controls remain authoritative. Staff without their own Member dues see no reminder. Failed/denied reads and empty results do not produce a payment demand.

The reminder appears on a workspace visit/reload while dues remain. Later/Escape/Close dismisses the same obligations for that mounted workspace, avoiding repetition on every menu click; new or changed obligations can appear after a fresh check. Visible workspaces refresh on return and once per minute. Payment/plan/wallet/remittance screens are excluded to avoid interrupting a payment. No reminder action initiates a charge or changes financial records.

## Membership documents and email

Verified initial settlement creates one immutable issue snapshot per payment; an approved fee exemption creates one issue snapshot per grant. The snapshot contains the Member's name, address, mobile, photo and original-cycle validity, with a unique certificate number. It does not include passwords, bank data or staff reasons. Document generation happens outside financial transactions.

Registration, settlement and Admin activation have a bounded 60-second database transaction budget for their combined audit/history/notification/document-snapshot writes. A remote Neon phone acceptance check exposed the previous 20-second ceiling. Rendering PDFs and contacting gateways/email providers remain outside these transactions; timeouts roll back rather than partially unlocking or charging a member.

The issued pack provides a two-sided PDF ID card, membership certificate and payment receipt (or an explicitly labelled exemption record). The embedded OFL Noto Sans Kannada font supports Kannada names. The supplied Foundation logo is used. These historical documents identify the status at issue; current membership and Community Support Plan eligibility remain separate. In an isolated review workspace, test warnings remain visible on every document.

A generic account-created email is queued at registration. The welcome email with three PDF attachments is queued atomically after settlement/grant. Private attachments are sent only to a verified email; the existing queue handles concurrent claims, provider idempotency, retries and failure states. Users can download their own pack under Membership documents and request a rate-limited resend. Refunded initial payments lose paid-onboarding access and are excluded from active pack downloads/email. Original financial and issued records remain for audit.

Migration `20261125070000_paid_member_onboarding` is additive. Apply it through a direct database connection before deploying this source. No existing Member is retroactively linked or seeded with a payment/grant by this migration. New tables require the existing application's least-privilege default grants. No live records or funds are needed for acceptance tests; use the isolated PostgreSQL suite and a private review workspace for screen checks.

## Validated website release - 25 November 2026

Source `b9c604b` passed [CI run 45573362621](https://github.com/prajjualva/Tuluva-mahasabhe-Community-Developemnt-/actions/runs/45573362621): **353 tests across 87 files, zero skips**, including isolated PostgreSQL acceptance. Prisma validation/migration/seed, type checking, lint, formatting, dependency audit and production build passed. Normal local execution passed 317 tests with 36 database cases intentionally skipped; the full CI run executed those cases.

The additive migration was applied through direct connections to the persistent review database and `tuluva_production`. Production runtime access to both new tables was verified. No real Member was marked paid, granted membership or populated with test documents for acceptance.

Deployment `dpl_FLa39SneHKiwPBeVJSJJCkc2iaBC` was built with production database/storage preflight, checked while protected, then promoted to `https://tuluva-mahasabhe.vercel.app`. Public registration now requires the photo and describes the next membership-fee step; the updated privacy notice and Android association respond successfully. Anonymous enrollment/Admin APIs return 403. Review mode is absent from the public website.

Phone-width acceptance in the isolated review workspace verified that direct dashboard access returned an unpaid account to the payment step, one test-wallet payment settled the initial fee, the workspace unlocked and three distinct PDFs downloaded. The actual files were inspected for their correct document types and test warnings. Crowded links found during visual review were replaced by separate touch targets; Member documents and Admin forms fit a 390px viewport without horizontal overflow. Both offline-payment and no-payment-grant forms were inspected. The separate grant service was exercised against fictional records only. The temporary local screen server and its sign-in handoff were removed afterward; the persistent review history was retained.

These checks verify source, persistence and the tested screen flows. They do not claim a real Member payment or real inbox delivery was performed as part of this acceptance. Automatic private email attachments still require the recipient's verified email and successful configured-provider acceptance. Public Google Play release and the separate hosted reviewer environment retain their existing external requirements.
