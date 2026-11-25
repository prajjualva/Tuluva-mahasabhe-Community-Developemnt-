import { z } from "zod";

const pendingDuesSchema = z.array(
  z.object({
    externalId: z.uuid(),
    purpose: z.enum(["MEMBERSHIP", "PLAN_REGISTRATION", "CONTRIBUTION"]),
    amountPaise: z.number().int().positive().safe(),
    dueAt: z.iso.datetime(),
    status: z.enum(["PENDING", "OVERDUE", "EXPIRED"]),
  }),
);

export type PendingDue = z.infer<typeof pendingDuesSchema>[number];

// Payment screens already present the dues and existing checkout recovery controls.
export function shouldCheckPendingDues(pathname: string) {
  return (
    ["/member", "/coordinator", "/admin"].some(
      (root) => pathname === root || pathname.startsWith(`${root}/`),
    ) &&
    ![
      "/member/dues",
      "/member/payments-receipts",
      "/member/community-support-plan",
      "/member/wallet",
      "/member/cash-remittances",
    ].some((path) => pathname === path || pathname.startsWith(`${path}/`))
  );
}

/** Only the authorized API decides payability; never derive it from a plan badge. */
export async function readPendingDues(signal: AbortSignal): Promise<PendingDue[] | null> {
  try {
    const response = await fetch("/api/member/dues", {
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
    if (!response.ok) return null;
    const parsed = pendingDuesSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function pendingDuesKey(dues: PendingDue[]) {
  return JSON.stringify(
    dues
      .map(({ externalId, amountPaise, dueAt, status }) => [externalId, amountPaise, dueAt, status])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}
