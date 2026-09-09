/** The database unique index on Payment.idempotencyKey is the final authority. */
export function paymentCommandKey(actorExternalId: string, requestKey: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(actorExternalId) || requestKey.trim().length < 16)
    throw new Error("Invalid idempotency input");
  return `${actorExternalId}:${requestKey}`;
}
