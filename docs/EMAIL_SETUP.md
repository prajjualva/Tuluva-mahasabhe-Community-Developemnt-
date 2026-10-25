# Verification email setup

## Current boundary — 25 October 2026

The owner's Resend account is authenticated. Its Settings/Usage page confirmed Transactional **Free**, 0/3,000 monthly emails, 0/100 daily emails and disabled paid overages. No subscription, add-on, paid feature or automatic DNS authorization was enabled.

Added `notify.tuluworld.org.in` as a dedicated sending subdomain using Resend's displayed default Tokyo region. This does not modify the existing website, root-domain mail service or DNS. Receiving remains off. Manual DNS setup was selected rather than delegating DNS access to Resend. Domain verification, credentials and actual inbox delivery are still pending; adding a domain is not verification.

The GoDaddy sign-in page for `tuluworld.org.in` was opened for the owner. Sign in privately; never send passwords, API keys or verification codes through chat.

## DNS records

Read the current Resend dashboard before publishing these records. These are the actual public verification records displayed for this account on 25 October, not generic examples. At GoDaddy, names below are relative to `tuluworld.org.in`; do not append the root domain twice.

| Type  | Name                       | Value                                                                                                                                                                                                                        | TTL          |
| ----- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| TXT   | `resend._domainkey.notify` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCrADpJBxcQTPwOds5JzdZBPoQJ95xQdgVXERRDKHGa6sVM7YXU5XRqT/j3PULD9D3Sn3XVu0IFesrk4gfC1vldYy8HkC6CCywHE2aBMM/u4zDSqlz2XwfFUc9XzVSfAgKqC7UIKioowhxEKx9V8x1PJ355lURcQiO+MOFlBYecuQIDAQAB` | Auto/default |
| CNAME | `rsend.notify`             | `rsend-apne1.forge.rmta.net`                                                                                                                                                                                                 | Auto/default |
| CNAME | `send.notify`              | `send.forge.rmta.net`                                                                                                                                                                                                        | Auto/default |

Inspect existing records before adding anything. Do not delete/replace existing records or change root MX, nameservers, website records, existing SPF or another application's mail configuration. If any listed name already has a conflicting record, stop and reconcile ownership. Do not enable receiving or authorize automatic broad DNS changes. After publishing only the required records, use Resend's verification control and confirm every required record becomes verified.

## Application configuration

The server now supports direct Resend email without a custom delivery bridge:

```text
EMAIL_PROVIDER=resend
RESEND_API_KEY=<server-only sending key>
RESEND_FROM_EMAIL=no-reply@notify.tuluworld.org.in
```

Create a sending-only API key restricted to the verified domain, with owner approval, and save it directly to the relevant protected server environment. Do not put it in `NEXT_PUBLIC_*`, source code, logs or chat. Use separate development and production keys. Do not overwrite existing connection/authentication/encryption secrets to add email. Production will reject a `resend.dev` test sender; a syntactically valid sender does not prove actual domain verification.

Leaving `EMAIL_PROVIDER` empty or selecting `bridge` preserves the existing trusted HTTPS `EMAIL_TRANSPORT_URL`/`EMAIL_TRANSPORT_TOKEN` contract. Explicit Resend misconfiguration or delivery failure never falls back to a different provider or fake success. SMS keeps its separate HTTPS bridge and remains required by the production deployment gate; configuring email does not claim SMS readiness.

The adapter submits one validated recipient and a plain-text verification message to the fixed official API, with a 10-second timeout and redirect rejection. Non-success HTTP statuses, invalid success bodies and network failures return only generic errors. Keys, codes and provider diagnostics are never logged. No automatic retry is performed: an ambiguous timeout must not be presented as delivery success. Existing OTP expiry, throttling, hash-only persistence, single-use consumption, audit and password-reset session invalidation remain unchanged.

## Acceptance before launch

Source validation passed: **243 automated tests**, with 15 isolated PostgreSQL tests intentionally skipped in this run; ESLint, Prettier, TypeScript, Prisma schema validation and the production verification build all passed. The 23 new assertions cover direct-provider construction, errors/redaction, test-domain rejection, bridge/SMS compatibility and deployment gates. Provider calls in these tests are mocked. No live email, OTP, member contact, financial action or production database mutation was used to validate this adapter.

After verification and secure key setup, send one owner-approved test to the real owner's inbox, then verify password reset through the application's real challenge workflow. Check inbox/spam and provider events; API acceptance alone does not prove inbox delivery. Do not send development fixtures to member email addresses. Keep marketing, open/click tracking and bulk sends out of this security-email setup. Stay on Free; stop at quotas rather than enabling paid overages.

References: [Resend pricing](https://resend.com/pricing), [domain verification](https://resend.com/docs/dashboard/domains/introduction), [send-email API](https://resend.com/docs/api-reference/emails/send-email).
