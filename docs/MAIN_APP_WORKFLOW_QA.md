# Main application workflow QA — 23 October 2026

This is a main-app source and local workflow review, not public-launch approval. The hosted stakeholder demo was not updated, seeded or reset.

## Implemented fixes

- Contribution payment responses now include the actual method and integer-paise amount. An online intent fulfilled from sufficient wallet funds is displayed as a confirmed wallet payment, not pending online payment.
- Idempotent contribution replays allow that authoritative wallet-first result without another debit. A reused key must still belong to the signed-in member and the same requested event. Pending checkout recovery rejects cancelled/waived dues while preserving the payability of expired contribution obligations.
- Member records distinguish successful zero/empty results from unavailable records. One failed request does not reject all other reads. Dues, balances, receipts, payment history, plan and membership failures have explicit recovery UI; unavailable dues do not produce payment buttons.
- Membership refresh, reactivation and receipt viewing now use the existing in-flight command guard. A previous receipt is cleared before loading another receipt.
- Wallet-success feedback requires a succeeded server status. Pending, failed, cancelled and unknown statuses are not presented as settled payments.
- Sign-out now blocks repeated requests, waits for the server response and reports failure without pretending that the session ended.
- Valid accounts lacking a role see an access-denied page instead of an endless sign-in loop. Closed membership and expired-session routing remain distinct. No permission check was weakened.
- News/inbox and public-event failures can be retried and are not labelled as empty content. Plan queues and Coordinator collection screens distinguish loading, error and empty states.
- Coordinator/Admin plan commands and Coordinator collection buttons have in-flight guards and visible connection-error handling. Temporary Coordinator-stage Admin approval no longer claims that final activation/waiting-period approval already occurred.
- Member screen titles, descriptions and due-purpose labels are readable. No financial amounts or authoritative statuses are recalculated in UI.
- Admin payment reads now distinguish loading/unavailable/empty results, clear stale records, ignore out-of-order filter responses and offer retry. Refund actions have a synchronous in-flight guard; pagination is disabled while records are unavailable or loading.
- Admin wallet credit has a synchronous in-flight guard and locks its input details while awaiting confirmation, retaining the existing server idempotency key for uncertain retries.
- Unexpected sign-in backend failures return a generic 503 without diagnostics or a session cookie, rather than incorrectly blaming invalid input. Invalid JSON/input remains 400 and incorrect credentials remain 401.

## Validation

### Additional UI and guide pass — 23 October 2026

- Simplified the public and authenticated visual system: light sidebar, restrained green accents, flatter cards, quieter borders and more whitespace. Warning, payment-state and authorization behaviour was preserved.
- Added `/guide`, linked from public, Member and operations navigation. It contains 21 task guides covering each workspace, membership/plan distinctions, contribution obligations, payment states, wallet, receipts, support reviews and privacy. Role filters and multi-word search run only over educational content; protected screens remain server-authorized. Native expandable answers work with a keyboard. The homepage also has three expandable process sections linked to real screens.
- Admin member search no longer reports a false empty count while loading or retains stale results after failed reads. It ignores out-of-order searches, clears previous profiles, provides recovery controls and disables unavailable pagination/assignment actions. Commands use a synchronous in-flight guard. Keyboard selection of an operations section now focuses its named heading instead of dropping focus to the body.
- Public home, About, sign-in, registration, events and death-report pages received an initial 320px mobile layout/label/image-description check. Additional loaded Member profile/notification and Admin member-list checks showed no page-level horizontal overflow at that width. No financial commands, approvals, cash submissions, comments or synthetic records were created.
- The new guide was checked at 320px and 1440px: no page-level horizontal overflow; search located the wallet split explanation, Enter expanded its answer, a nonmatching query displayed recovery controls, Clear filters restored all 21 guides and the Member filter excluded Admin-specific guidance. The Admin focus fix was confirmed in-browser with focus on `H1#operations-heading`.
- The current normal suite passes 215 tests; 15 PostgreSQL integration cases are intentionally skipped without an isolated test database. Eight new UI/content tests cover member loading safety, the named/focusable operations landmark, guide structure, filtering and locked-rule explanations. The preceding full isolated PostgreSQL run below remains the database baseline; it was not rerun solely for these presentation changes.
- All 21 authenticated local route/security checks passed again after the guide and visual changes; no financial commands were submitted. Browser sessions used for private UI checks were signed out, the temporary viewport was reset, and the public Guide page was left open as a local preview. Text/button and input-border contrast were checked for the revised colours; this is not a full independent accessibility certification.
- These changes are local and have not been pushed to the production-tracked branch or deployed. External account setup remains deferred to the user; the existing hosted demo is unchanged.

### Previous full database and workflow baseline

- The latest full isolated run passed 222 automated tests across 56 files with no skipped cases: 207 non-database tests plus all 15 PostgreSQL integration cases. The serial remote run took 949.17 seconds.
- `npm run test:database` created a unique disposable Neon database, applied all 24 migrations, installed development-only identities/settings there and ran the entire suite. It then removed the disposable database and synthetic records successfully. Application/member records were not migrated, seeded or removed. Temporary test document storage was also separate from application uploads.
- Integration opt-in now fails before fixtures import unless `ISOLATED_TEST_DATABASE_URL` is explicitly provided, uses PostgreSQL with a separate `test` segment in its database name, and differs from the configured app/migration database (including pooled/direct variants). Five focused tests cover the guard. Provision and migrate that disposable database separately before enabling `RUN_DB_INTEGRATION_TESTS=1`; do not point it at the app's database or use this naming guard as a substitute for actual isolation.
- The new focused tests include eight contribution-route cases, seven record/feedback cases and four protected-page redirect cases. Three new regression assertions failed before their fixes and passed afterward.
- Additional tests cover the Admin payment screen's initial loading/action safety and four sign-in failure classifications, including closed-on-failure session behavior.
- Deployment preparation adds tests for Vercel cron authentication, protected job dispatch, private S3 requests/size bounds/error handling, serverless local-storage rejection and fail-closed deployment configuration. S3 request tests mock the SDK; a real production bucket, its IAM policy and live cron invocation are not claimed as validated.
- Type checking, ESLint, Prettier, Prisma validation and a real production build (`build:verify`, isolated output) passed.
- 21 authenticated local API/access smoke checks passed using the existing development identities. No payment, wallet credit, approval, support transfer or other financial command was submitted.
- Browser checks use `localhost:3000`, leaving the user's `127.0.0.1` authentication cookies alone. Checks include Member sign-in, own dashboard/payment data, a forbidden Admin attempt, return to own workspace, sign-out, and Coordinator sign-in/dashboard/queue/collection controls.
- The Member payment screen was checked at a 390 × 844 viewport; no horizontal overflow was observed. The viewport was restored afterward.
- Admin navigation, plan/support queues and payment filtering were reviewed without submitting approvals, refunds or financial commands. At 390 × 844, the payment screen's content width was 375px and the mobile menu opened/closed on navigation. The FAILED filter returned only the existing failed payment. The temporary viewport was reset and the isolated Admin session signed out.
- Following the dependency updates, all 21 authenticated local API/access smoke checks passed again and the branded About page was visually checked. The development server was restarted on Next.js 15.5.28; no hosted deployment was changed.

## Dependency review

Installing the missing React DOM test declarations surfaced existing npm audit findings (initially 18 total, including two critical across the full dependency tree). Targeted updates reduced this to eight high findings and zero critical findings; the production-only audit still reports three high findings in the Prisma/configuration chain. Next.js remains on major 15 and Prisma on major 6. The development-only Vitest/coverage pair was upgraded together to 4.1.12, its Vite dependency pinned to 7.3.7, and Next's PostCSS constrained to 8.5.31. All unchanged non-database assertions pass, including a V8 coverage run. Remaining advisories must be reviewed before release; passing the build does not clear this security gate. See [dependency security decisions](DEPENDENCY_SECURITY_REVIEW.md).

## Not claimed

This does not constitute complete live financial end-to-end testing. The isolated PostgreSQL regressions passed, but real gateway capture/refund/webhooks, SMS/email delivery, deployed scheduler invocation, private persistent storage, backup/restore, key recovery and independent security/operational acceptance remain separate release requirements. Existing financial records and locked business rules were preserved. Latest source changes are local unless explicitly pushed/deployed later.
