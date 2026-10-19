import { NextResponse } from "next/server";
import { ZodError } from "zod";
export function cashRouteError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "Unauthenticated")
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (message === "Forbidden" || message.includes("access is suspended"))
    return NextResponse.json(
      { error: "You do not have permission for this action." },
      { status: 403 },
    );
  const safe = new Set([
    "Adjustment not found",
    "Ledger entry not found",
    "Adjustment has already been reviewed",
    "Collection account not found",
    "Deposit evidence not found",
    "Duplicate collection selection",
    "Idempotency key is already in use",
    "This bank reference has already been submitted",
    "Collection selection is unavailable",
    "A selected collection already awaits deposit review",
    "Deposit exceeds the selected outstanding collections",
    "Deposit has already been reviewed",
    "Every deposit collection needs one allocation",
    "Allocated receipts exceed the declared deposit",
    "Received amount must be between zero and the outstanding collection amount",
    "Rejected deposits must allocate zero; verified deposits must allocate received money",
    "Upload a valid PDF, PNG or JPEG deposit receipt",
    "Evidence must be between 1 byte and 5 MB",
    "Enter a valid rupee amount",
    "Verify remittance evidence covering this collection first",
    "A remitted collection cannot be rejected; reconcile its deposit",
    "Special Admin approval is required to collect the ₹1,000 plan payment",
    "Resolve outstanding cash discrepancies before collecting new payments",
    "A Coordinator payment is already open or settled for this due",
  ]);
  return NextResponse.json(
    {
      error:
        error instanceof ZodError
          ? "Check the submitted fields."
          : safe.has(message)
            ? message
            : "The cash operation could not be completed.",
    },
    { status: 400 },
  );
}
