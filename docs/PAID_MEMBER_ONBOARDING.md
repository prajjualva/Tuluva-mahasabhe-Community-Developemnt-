# Paid member onboarding

New public registrations use onboarding policy v1. Registration requires a JPEG/PNG/WebP profile photo, re-encoded without metadata, and atomically creates the Member, photo, membership history and versioned annual fee due. The first due is linked as `registrationDueId`. Registration signs the new user in and sends them directly to `/membership-payment`.

Server authorization checks the linked due and its successful, unrefunded settlement on every protected request. New unpaid users can use enrollment status, their own initial payment initiation/resumption/cancellation, contact verification, sign-out and account deletion. A client redirect, gateway success handler, pending cash collection, unrelated payment or ordinary due waiver cannot unlock the workspace. Payment commands remain idempotent and use server amounts. Online payments require signed provider settlement; wallet and Coordinator-remittance verification use their existing persistent workflows.

Existing members have no registration-due link and retain their previous access and renewal grace rules. Coordinator fee exemptions remain intact. This does not waive contributions or approve a Community Support Plan.

## Admin access controls

Admin → Members → Activate a registered membership exposes:

- **Record payment already received**: requires full-funds confirmation, received date, unique bank/cash reference and reason. The server checks live Admin permission, settles the initial fee and appends the payment, official receipt, Foundation Ledger entry, membership pack and audit in one serializable transaction. Replays return the original result; a changed command cannot reuse its key.
- **Grant membership with fee exemption**: requires explicit exemption confirmation and a reason. A persistent grant records the approving Admin and timestamp. The initial due is waived, access is granted and the welcome pack contains a fee-exemption acknowledgement. No successful payment, cash receipt or ledger credit is invented.

Both actions refuse closed/deceased accounts and unresolved pending checkouts/collections. They cover initial membership only. Normal renewals, reactivation, contribution obligations and support-plan approvals retain their separate rules.

## Membership documents and email

Verified initial settlement creates one immutable issue snapshot per payment; an approved fee exemption creates one issue snapshot per grant. The snapshot contains the Member's name, address, mobile, photo and original-cycle validity, with a unique certificate number. It does not include passwords, bank data or staff reasons. Document generation happens outside financial transactions.

The issued pack provides a two-sided PDF ID card, membership certificate and payment receipt (or an explicitly labelled exemption record). The embedded OFL Noto Sans Kannada font supports Kannada names. The supplied Foundation logo is used. These historical documents identify the status at issue; current membership and Community Support Plan eligibility remain separate. In an isolated review workspace, test warnings remain visible on every document.

A generic account-created email is queued at registration. The welcome email with three PDF attachments is queued atomically after settlement/grant. Private attachments are sent only to a verified email; the existing queue handles concurrent claims, provider idempotency, retries and failure states. Users can download their own pack under Membership documents and request a rate-limited resend. Refunded initial payments lose paid-onboarding access and are excluded from active pack downloads/email. Original financial and issued records remain for audit.

Migration `20261125070000_paid_member_onboarding` is additive. Apply it through a direct database connection before deploying this source. No existing Member is retroactively linked or seeded with a payment/grant by this migration. New tables require the existing application's least-privilege default grants. No live records or funds are needed for acceptance tests; use the isolated PostgreSQL suite and a private review workspace for screen checks.
