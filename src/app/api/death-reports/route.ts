import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  clientAddress,
  consumePublicDeathReportRequest,
  deathReportThrottleKey,
  ThrottleError,
} from "../../../server/auth/login-throttle";
import {
  submitDeathReport,
  uploadDeathReportDocument,
} from "../../../server/death/death-workflow-service";
import { validateDeathEvidenceFile } from "../../../server/documents/death-document-storage";

const stringValue = (form: FormData, field: string) => {
  const value = form.get(field);
  return typeof value === "string" && value.trim() ? value : undefined;
};

async function parseReportRequest(request: NextRequest) {
  if (request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
    const form = await request.formData();
    const files = form
      .getAll("documents")
      .filter(
        (value): value is File =>
          typeof value !== "string" && typeof value.arrayBuffer === "function",
      );
    return {
      input: {
        memberExternalId: stringValue(form, "memberExternalId"),
        reporterIdentity: stringValue(form, "reporterIdentity"),
        placeOfDeath: stringValue(form, "placeOfDeath"),
        dateOfDeath: stringValue(form, "dateOfDeath"),
        details: stringValue(form, "details"),
      },
      files,
    };
  }
  return { input: await request.json(), files: [] as File[] };
}

/** Anyone can report a death; the route is rate limited and returns no member PII. */
export async function POST(request: NextRequest) {
  const address = clientAddress(request.headers);
  const throttleKey = deathReportThrottleKey(address);
  try {
    await consumePublicDeathReportRequest(throttleKey);
    const { input, files } = await parseReportRequest(request);
    // Reject predictable type/size errors before creating a durable report.
    files.forEach(validateDeathEvidenceFile);
    const result = await submitDeathReport(input, {
      ipHash: createHash("sha256").update(address).digest("hex"),
      requestId: request.headers.get("x-request-id")?.slice(0, 128) || undefined,
    });
    if (result.outcome === "DUPLICATE") {
      return NextResponse.json(result, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    const documents = [];
    try {
      for (const file of files) {
        documents.push(
          await uploadDeathReportDocument({
            caseExternalId: result.case.externalId,
            reporterAccessToken: result.reportAccessToken,
            file,
          }),
        );
      }
    } catch (error) {
      // The report is valid even if a later optional file fails validation or
      // storage. Return its private reporter token so the reporter can retry securely.
      return NextResponse.json(
        {
          ...result,
          documents,
          documentError:
            error instanceof Error ? error.message : "Evidence upload could not be completed",
        },
        { status: 207, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ...result, documents },
      {
        status: result.outcome === "MEMBER_NOT_FOUND" ? 202 : 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    if (error instanceof ThrottleError)
      return NextResponse.json({ error: error.message }, { status: 429 });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Death report could not be submitted" },
      { status: 400 },
    );
  }
}
