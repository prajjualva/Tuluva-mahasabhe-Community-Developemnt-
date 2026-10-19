import { createHash } from "node:crypto";

export async function readCashEvidence(file: File) {
  if (file.size < 1 || file.size > 5 * 1024 * 1024)
    throw new Error("Evidence must be between 1 byte and 5 MB");
  const bytes = Buffer.from(await file.arrayBuffer());
  const valid =
    (file.type === "application/pdf" && bytes.subarray(0, 5).toString() === "%PDF-") ||
    (file.type === "image/png" &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (file.type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255);
  if (!valid || bytes.length !== file.size)
    throw new Error("Upload a valid PDF, PNG or JPEG deposit receipt");
  return {
    bytes,
    contentType: file.type,
    digest: createHash("sha256").update(bytes).digest("hex"),
  };
}
