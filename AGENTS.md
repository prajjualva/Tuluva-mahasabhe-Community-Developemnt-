# Community Support Foundation engineering rules

## Architecture

- Use TypeScript, Next.js application/API boundary, PostgreSQL, Prisma, Zod, and Vitest unless a documented migration decision is approved.
- Put business decisions in `src/domain` or server domain services; UI must not calculate financial amounts or enforce authoritative status transitions.
- External API identifiers are UUID `externalId` values. Never expose internal database IDs by default.
- Use Prisma transactions for every financial or state-changing multi-record action. Add idempotency keys to payment-facing commands.

## Terminology and financial invariants

- This is a Community Support Foundation, not insurance. Use the product terminology supplied in the brief.
- Money is integer paise only. Use `src/domain/money.ts`; never JavaScript floating point.
- Contributions, Foundation Ledger entries, support payments, receipts, wallet movements, cash collections, and audits are append-oriented. Do not delete or mutate settled records; make compensating records.
- Policy values belong to versioned scheme settings, never scattered constants.

## Security

- Authorize every server action by permissions and relationship, not UI role checks. A suspended Coordinator loses all `coordinator:*` permissions immediately.
- Never expose, log, or serialize OTPs, password hashes, bank data, payment credentials, admin notes, or restricted documents.
- Validate input with Zod, use allowlisted DTOs, use ORM/parameterized database access, and apply rate limiting to auth and public-report endpoints.
- Store bank details encrypted and retrieve them only in an explicitly authorized server service. Use opaque storage keys and authorize document downloads.

## Quality

- Add focused tests for new financial, eligibility, authorization, and status-transition rules before considering them complete.
- Run `npm run test`, `npm run lint`, and `npm run build` after meaningful changes. Keep migrations and seed data current.
- Development seed credentials must stay development-only and be documented. Never create seeded production-like financial records.
