export function paymentPurposeLabel(value: string) {
  const labels: Record<string, string> = {
    MEMBERSHIP: "Annual membership",
    PLAN_REGISTRATION: "Community Support Plan registration",
    CONTRIBUTION: "Event contribution",
  };
  return labels[value] ?? value.replaceAll("_", " ").toLowerCase();
}

export function paymentStartFeedback(
  input: { status?: string; method?: string },
  walletSuccess: string,
) {
  if (input.status === "SUCCEEDED")
    return input.method === "WALLET"
      ? walletSuccess
      : "Payment confirmed. Your receipt is available in payment history.";
  if (input.status === "FAILED")
    return "Payment failed. Check your payment history before trying again.";
  if (input.status === "CANCELLED")
    return "This payment request was cancelled. No new payment was confirmed.";
  return "Payment is not yet confirmed. Check payment history for the current status.";
}
