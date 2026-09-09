import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { verifyCashCollection } from "../../../../../../server/coordinators/cash-payment-service";

const bodySchema = z.object({
  approved: z.boolean(),
  reason: z.string().trim().min(3).max(1000).optional(),
});
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { collectionId } = await params;
    const body = bodySchema.parse(await request.json());
    return NextResponse.json(
      await verifyCashCollection(collectionId, principal.userId, body.approved, body.reason),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request denied" },
      { status: 400 },
    );
  }
}
