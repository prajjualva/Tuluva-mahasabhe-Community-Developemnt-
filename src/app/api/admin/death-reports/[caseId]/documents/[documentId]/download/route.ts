import { NextRequest, NextResponse } from "next/server";
import { downloadDeathDocumentForAdmin } from "../../../../../../../../server/death/death-workflow-service";
import { requireApiPermission } from "../../../../../../../../server/http/authorize";

const contentDisposition = (filename: string) =>
  `attachment; filename="${filename.replaceAll(/["\\\r\n]/g, "-")}"`;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string; documentId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { caseId, documentId } = await params;
    const document = await downloadDeathDocumentForAdmin(caseId, documentId, principal.userId);
    return new NextResponse(new Uint8Array(document.bytes), {
      headers: {
        "Content-Type": document.contentType,
        "Content-Disposition": contentDisposition(document.originalFilename),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Evidence document access denied" }, { status: 403 });
  }
}
