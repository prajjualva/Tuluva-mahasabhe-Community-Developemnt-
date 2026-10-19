# Phase 10 and 11 source acceptance

This checklist describes implemented source and validation boundaries, not approval for a public financial launch.

## Phase 10 — Cash, reconciliation and Foundation Ledger

| Requirement                                                  | Persistent implementation and validation                                                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ₹100/₹369 collection; special Admin authorization for ₹1,000 | Assigned active Coordinator scope, server-owned due amount, blocked collection for unresolved discrepancies; payment command idempotency                           |
| Immediate unique CASH receipt, pending verification          | Transactional annual sequence and official receipt created with the collection; due remains unpaid until verified remittance                                       |
| Combined deposits, individual member receipts                | Evidence-backed deposit and per-collection allocation records; receipt identity retained                                                                           |
| Partial remittance / shortfall                               | Positive allocations post actual received funds; covered payments settle; uncovered amounts create discrepancies                                                   |
| 30-day resolution deadline                                   | Persistent deadline and escalation marker; protected reconciliation job suspends and initiates Admin investigation exactly once                                    |
| Suspension reconciliation                                    | Outstanding collections inventoried immediately; no invented remittance or discarded obligations                                                                   |
| Suspended collector recovery                                 | Member-owned remittance/evidence path independent of Coordinator permissions                                                                                       |
| Ledger credits/debits and documents                          | Persisted payment/support/refund/adjustment ledger movements, external references, operator/System identity, timestamps, statuses and restricted evidence/vouchers |
| Operational adjustments                                      | Evidence-backed request and explicit audited Admin approval/rejection; duplicate decisions cannot duplicate ledger debits                                          |
| Financial integrity                                          | Prisma transactions, serializable retries, wallet version/balance guards, receipt uniqueness and compensating refunds                                              |
| Money received after waiver/cancellation                     | Records unapplied funds and flags Admin refund review; does not resurrect a due, membership or plan                                                                |

Real PostgreSQL tests cover combined deposits, shortfalls, replay, IDOR, receipt continuity, restriction on rejecting discrepancies, timed suspension, suspended recovery, operational adjustments and unapplied remittances.

## Phase 11 — Admin command center and audit

| Requirement             | Implemented workspace                                                                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete dashboard      | Live member/Coordinator status groups, approvals, death/support work, contributions, failed payments, cash/discrepancy work, wallet, ledger, news, audit, waivers, adjustments and temporary management                |
| Member management       | Search/filter/pagination; profile; membership/plan history; dues; payment/receipt downloads; wallet activity; nominee/document access; Coordinator transfers with before/after assignment, reason, actor and timestamp |
| Coordinator management  | Appointment, assignments, transfer, suspension, restoration, permanent referral code display, assigned members, cash activity and lifecycle/transfer history                                                           |
| Account permissions     | Search all identities, including Admins without Member profiles; audited role decisions; immediate revocation; self/last-Admin safeguards                                                                              |
| Decisions and overrides | Existing nominee, plan, death/event, dispute, support, cash, news, waiver and ledger-adjustment workflows; reasons/identity/timestamps persisted for sensitive decisions                                               |
| Payment management      | Search and pagination across pending/successful/failed/cancelled/refunded records, unapplied-funds flags, protected official receipt downloads and original-method refund workflow                                     |
| Audit command center    | Search/filter by actor/action/entity/date/request; safe before/after snapshots; reasons and timestamps; no application edit/delete path                                                                                |

Real PostgreSQL tests cover restricted nominee evidence/bank access, retained verified nominees during pending replacement, role changes, immediate Coordinator suspension/reassignment, audited restoration and last-Admin/self-revocation safeguards. Focused boundary tests cover receipt authorization, truthful payment statuses, query allowlists and complete queue counters.

## External activation is separate

- The protected daily jobs must be connected to the hosting scheduler.
- A real online gateway requires provider credentials and webhook configuration.
- Support payout recording requires an actual authorized bank transfer/reference; no fake automated bank payout exists.
- SMS/email delivery requires configured providers/transport bridges.
- Deployment requires HTTPS, private persistent document storage, key management, backups and monitoring.
- Independent security and operational acceptance remain required before public launch.
