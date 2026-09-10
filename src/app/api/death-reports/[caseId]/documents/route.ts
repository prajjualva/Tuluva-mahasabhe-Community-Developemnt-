import { NextRequest, NextResponse } from "next/server";
import {
  clientAddress,
  consumePublicDeathReportRequest,
  deathReportEvidenceThrottleKey,
  ThrottleError,
} from "../../../../../server/auth/login-throttle";
import { uploadDeathReportDocument } from "../../../../../server/death/death-workflow-service";

type UploadableFormFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

/** A reporter can add restricted evidence using the private token returned at intake. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    await consumePublicDeathReportRequest(
      deathReportEvidenceThrottleKey(clientAddress(request.headers)),
    );
    const { caseId } = await params;
    const token = request.headers.get("x-death-report-access-token") ?? "";
    const form = await request.formData();
    const file = form.get("document");
    if (
      typeof file === "string" ||
      !file ||
      typeof (file as UploadableFormFile).arrayBuffer !== "function"
    )
      throw new Error("An evidence document is required");
    const document = await uploadDeathReportDocument({
      caseExternalId: caseId,
      reporterAccessToken: token,
      file: file as UploadableFormFile,
    });
    return NextResponse.json(
      { document },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ThrottleError)
      return NextResponse.json({ error: error.message }, { status: 429 });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Evidence upload denied" },
      { status: 400 },
    );
  }
}
