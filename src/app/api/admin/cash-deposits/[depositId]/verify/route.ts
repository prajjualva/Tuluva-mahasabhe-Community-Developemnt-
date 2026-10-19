import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { verifyCashDeposit } from "../../../../../../server/coordinators/cash-reconciliation-service";
import { parseRupeesToPaise } from "../../../../../../domain/cash-reconciliation";
import { cashRouteError } from "../../../../cash-route-response";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ depositId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { depositId } = await params;
    const command = z
      .object({
        approved: z.boolean(),
        reason: z.string(),
        allocations: z
          .array(
            z
              .object({ collectionExternalId: z.string().uuid(), receivedRupees: z.string() })
              .strict(),
          )
          .max(50),
      })
      .strict()
      .parse(await request.json());
    return NextResponse.json(
      await verifyCashDeposit(principal.userId, depositId, {
        ...command,
        allocations: command.allocations.map(({ receivedRupees, ...item }) => ({
          ...item,
          receivedAmountPaise: parseRupeesToPaise(receivedRupees),
        })),
      }),
    );
  } catch (error) {
    return cashRouteError(error);
  }
}
