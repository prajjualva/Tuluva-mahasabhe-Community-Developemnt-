# Dependency security review — 22 October 2026

## Launch review — 21 November 2026

The new audit reported four package findings: the Prisma/config/Effect chain accounts for three high package findings from one Effect advisory, and Next.js has one moderate package finding covering three advisories. These findings supersede the zero-finding result recorded on 19 November; audit results change as advisories are published.

- Raise Next.js and its matching lint-tool minimum to **15.5.29**, the patched Next.js 15 release for the image optimizer SVG check, Edge response cookie-header exposure and forwarded-response issues. Keep the existing framework major and PostCSS security override.
- Scope `effect` **3.22.5** to `@prisma/config`. The installed Prisma configuration package pins vulnerable Effect 3.21.0; the maintainer's fix starts at 3.22.1. This stays on Effect 3 rather than overriding Prisma to Effect 4 or downgrading Prisma to clear the audit. Validate configuration loading, schema validation, generation, isolated migrations and the full test/build pipeline with the override.
- These are dependency changes. They do not alter financial rules, membership state, payment settlement, database schema or the Android upload key.
- Verification after patching: full-tree and production-only npm audits report zero known vulnerabilities. All 319 tests in 79 files passed in isolated PostgreSQL CI, including Prisma generation and migrations; local type checking, ESLint, Prettier, Prisma validation and the Next.js 15.5.29 production build passed. CI now also rejects known moderate-or-higher npm audit findings, rather than relying only on the advisory counts printed by installation.

References: [Effect maintainer advisory](https://github.com/Effect-TS/effect/security/advisories/GHSA-7589-6fvf-x4pw), [Next.js image advisory](https://github.com/vercel/next.js/security/advisories/GHSA-7qx7-33qx-rqx2), [Next.js cookie advisory](https://github.com/vercel/next.js/security/advisories/GHSA-f3mh-rxg3-f5g2), [Next.js forwarded-response advisory](https://github.com/vercel/next.js/security/advisories/GHSA-pc58-hwjq-p385).

## Launch review — 19 November 2026

This section supersedes the earlier dependency finding counts. The full npm audit now reports zero known vulnerabilities with the current lockfile.

- Upgraded the application validator from Zod 3 to Zod 4.6.7 for GHSA-mrhx-c7xc-m3w5. Dictionary schemas now declare their string key type explicitly. Razorpay refund receipt and notes remain explicitly optional, preserving webhook compatibility when a provider omits either field.
- Upgraded the Vercel AWS credential provider to 3.3.21 and scoped its cli-config dependency to Zod 4.6.7.
- The compatibility review found Prisma configuration imports the named deepmerge export for merging trusted configuration. Scoped only @prisma/config's deepmerge-ts dependency to 8.0.2 for GHSA-ggr8-5vv4-36mx. Prisma remains on version 6. Schema generation, validation, migrations and application builds must pass with this override.
- Applied compatible dependency fixes with npm audit fix, without a forced framework or Prisma upgrade.

References: [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [Zod migration guide](https://zod.dev/v4/changelog), [DeepmergeTS advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).

## Scope and decisions

The application remains on Next.js 15, Prisma 6, PostgreSQL, TypeScript and Vitest. No business-rule, schema, payment-provider or architecture migration is included.

- Apply compatible npm security fixes, including Next.js 15.5.28 and Vite 7.3.7. Raise the declared Next.js/Next lint-tool minimum to 15.5.28 so a regenerated lockfile does not silently select the old minimum.
- Declare Node.js 22.12.0 as the minimum, matching the installed Vite toolchain. CI continues to use Node.js 24; this does not require a new Node major for the existing development environment.
- Override only Next.js's transitive PostCSS to 8.5.31, retaining the PostCSS 8 API major. Validate CSS compilation and a full production build. This must be reevaluated when upgrading Next.js.
- Upgrade the development-only test runner and its matching coverage package together from Vitest 3 to 4.1.12, with Vite explicitly pinned to 7.3.7. This removes the old Tinypool dependency and addresses the reported mock-server issues without moving the app framework or database stack to new majors. Vitest compiles JSX with its automatic runtime independently of Next's required JSX preservation; the initial-state UI tests no longer need a global React runtime shim.
- Do not downgrade Next's lint tooling to clear an audit label. Do not force a Prisma major upgrade or override DeepmergeTS across major versions without a separate compatibility review. An audit exception is not a security acceptance.

References: [npm audit behavior](https://docs.npmjs.com/cli/v11/commands/npm-audit/), [Next.js advisory](https://github.com/vercel/next.js/security/advisories/GHSA-4jqv-mc3x-m676), [Vitest mock advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9), [Vitest 4 migration guide](https://v4.vitest.dev/guide/migration.html).

## CI isolation

The existing GitHub workflow provisions PostgreSQL 16 per job. Its integration-test step now passes `ISOLATED_TEST_DATABASE_URL` explicitly and clears application/migration defaults only for that step. Migration/seed steps still target the disposable service. No live/member database is used by CI fixtures.

## Acceptance

- Full-tree npm audit: 18 findings before this work (including 2 critical), 8 high findings afterward, no critical/moderate findings remaining at verification time.
- `npm audit --omit=dev` still reports three high findings in the Prisma/configuration dependency chain. Do not claim the production dependency tree is vulnerability-free simply because Next.js/PostCSS findings are cleared.
- The remaining eight package findings arise from two roots: `braces` through Next lint tooling and `deepmerge-ts` through Prisma's configuration toolchain. npm reports no compatible fix for those installed parent versions. Do not describe these as eight independent exploitable application defects, but do not dismiss them as accepted risks either. Review their reachability and upstream remediation before launch.
- The unchanged 189 non-database tests pass under Vitest 4.1.12, including a successful V8 coverage run. Current non-database coverage is 22.91% of server/domain lines; that is not comprehensive financial-path coverage or a replacement for isolated database tests.
- The full isolated PostgreSQL verification subsequently passed all 204 tests in 52 files, with zero skipped cases. All 24 migrations applied to the disposable database; setup, tests and cleanup completed without changing the application database. The serial remote run took 951.73 seconds.
- After adding the private-storage, cron and deployment-safety checks, the latest full run passed all 222 tests in 56 files with zero skipped cases (949.17 seconds). The disposable database and fixtures were removed successfully. The added AWS SDK did not change the eight remaining audit findings.
- Updated Next.js 15.5.28/PostCSS 8.5.31 production build passed. Type checking, ESLint, formatting, Prisma validation and dependency-tree consistency passed after resolving the temporary generated-types race caused by running tsc concurrently with Next's output regeneration.

Any unresolved advisories remain a release-review requirement, not a claim that a passing build makes the app production-ready.

## Reachability review during deployment preparation

The built Next.js runtime trace files inspected before deployment preparation did not list `deepmerge-ts`, `@prisma/config`, `fast-glob`, `micromatch` or `braces`. Local package-source inspection found DeepmergeTS used by Prisma's configuration merge and Fast Glob used by the Next ESLint plugin's root-directory utility. The application does not import those tools in request-domain services. This narrows the identified exposure to trusted build/configuration inputs; it is not a proof of non-exploitability or an independent security sign-off. Do not run untrusted code/configuration in a privileged deployment environment.

The [DeepmergeTS maintainer advisory](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx) specifies recursive object graphs as the trigger and notes plain JSON alone does not create it. No public request-to-Prisma-configuration-merge path was identified in this review. No vulnerable dependency was hidden or downgraded to make audit output disappear.
