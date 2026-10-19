# Demo walkthrough

This is a development demonstration, not a public financial launch. No action should pretend to capture an online payment or send a real bank payout without the required provider or an actual recorded bank transfer.

## Open and sign in

Open http://127.0.0.1:3000. Use the home-page links to view registration, public support events, reporting and account sign-in.

Development-only identities:

| Workspace        | Email                 |
| ---------------- | --------------------- |
| Member           | member@dev.local      |
| Coordinator      | coordinator@dev.local |
| Foundation Admin | admin@dev.local       |

The local development password is `DevelopmentOnly-ChangeMe1!`. It must never be used in production. The development referral code is `TULUVA01`. No seeded financial transactions are required for a demonstration; genuine empty states are intentional.

## Member walkthrough

1. Open the dashboard: identity, assigned Coordinator, current membership/plan, links to dues, wallet and official receipts.
2. Open Profile and Nominee: member-owned profile editing, verified-contact changes, nominee requests and restricted evidence.
3. Open Membership and Community Support Plan: annual membership, explicit reactivation, registration deadline and approval/waiting-period state.
4. Open Dues: separate ₹100 obligations, FIFO and specific-event payment choices. Online collection remains unavailable until a real gateway is configured.
5. Open Payments & Receipts and Wallet: review actual persisted history; view/download/share only your own receipts.
6. Open Notifications and Community News: private inbox, scoped published news and comments.

## Coordinator walkthrough

Sign out before switching identities. The Coordinator console has separate sections for Overview, Plan approvals, Nominee verification, Death reports, Payment collections, Cash remittances, Waiver requests and News/comments.

Only current assigned members are permitted. Record cash only when it was actually received. Pending receipts do not mark a due paid: evidence-backed Foundation remittance verification is required. A suspended Coordinator retains only their own cash-recovery workflow, not Coordinator permissions.

## Admin walkthrough

The Admin console separates Overview, Members, Coordinators, Plans, Nominees, Death Support Events, Support payments, Payments/refunds, Cash reconciliation, Wallet, Waivers, Ledger, News and Audit.

Use Overview task links or sidebar navigation. Sensitive decisions require reasons and audit identities; bank data is available only through an explicitly authorized review. A ₹1 lakh support payment never waits for every ₹100 contribution, but cannot bypass the required verification/dispute gates.

Do not initiate a real payout simply to demonstrate the UI. Use the automated integration suite on an isolated test database to demonstrate financial state transitions safely.

## Responsive and failure-state checks

- Desktop: sidebar navigation, readable cards, isolated work panels and safe empty states.
- Mobile: accessible menu toggle, single-column content and horizontally scrollable tables.
- Expired session: sign in again; do not repeat a financial command before checking payment history.
- Unconfigured payment or OTP delivery: explicit unavailable state, never simulated success.
- Inactive membership: contribution payment alone does not reactivate.
- Closed membership: restricted access, preserved identity/wallet and Admin-only reopening.

## Validation

Use `npm run build:verify` while the demo is running; it performs a real production build in `.next-validation` without overwriting the demo's development output. Normal deployment still uses `npm run build` and `npm start`.

With the local server running and development identities present, `npm run demo:check` signs into isolated test sessions for each role, reads the working APIs, verifies Admin-only denials and checks for restricted-field exposure. It submits no financial commands and invalidates only its own test sessions. It refuses non-loopback URLs and must not be run against production.

Public launch separately requires production credentials, infrastructure/storage configuration, backups, job scheduling, operational acceptance and an independent security review.
