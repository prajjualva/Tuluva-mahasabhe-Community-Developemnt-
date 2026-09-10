import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_DEATH_DOCUMENT_BYTES = 10 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export type DeathEvidenceFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type StoredDeathEvidence = {
  storageKey: string;
  contentType: string;
  originalFilename: string;
  sizeBytes: number;
};

const normalizeFilename = (value: string) => {
  // Avoid a control-character regexp: it is clearer to discard every ASCII
  // control code explicitly before applying the Windows/path allowlist.
  const printable = Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 0x20 && codePoint !== 0x7f;
    })
    .join("");
  const normalized = printable
    .replace(/[\\/<>:"|?*]/g, "-")
    .trim()
    .slice(0, 160);
  return normalized || "death-evidence";
};

const assertMagicBytes = (contentType: string, bytes: Buffer) => {
  const beginsWith = (...expected: number[]) =>
    expected.every((value, index) => bytes[index] === value);
  const webp =
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";
  const valid =
    (contentType === "application/pdf" && bytes.subarray(0, 5).toString("ascii") === "%PDF-") ||
    (contentType === "image/jpeg" && beginsWith(0xff, 0xd8, 0xff)) ||
    (contentType === "image/png" && beginsWith(0x89, 0x50, 0x4e, 0x47)) ||
    (contentType === "image/webp" && webp);
  if (!valid) throw new Error("Document contents do not match the declared file type");
};

export function validateDeathEvidenceFile(file: DeathEvidenceFile) {
  if (!ALLOWED_CONTENT_TYPES.has(file.type))
    throw new Error("Only PDF, JPEG, PNG, or WebP evidence files are allowed");
  if (!Number.isInteger(file.size) || file.size <= 0 || file.size > MAX_DEATH_DOCUMENT_BYTES)
    throw new Error("Evidence file must be between 1 byte and 10 MB");
}

function localStorageRoot() {
  if ((process.env.UPLOAD_STORAGE ?? "local").toLowerCase() !== "local")
    throw new Error("The configured document storage provider is not available");
  const configured = process.env.UPLOAD_LOCAL_PATH;
  if (!configured) throw new Error("Document storage is not configured");
  return path.resolve(process.cwd(), configured);
}

function filePathForKey(storageKey: string) {
  const root = localStorageRoot();
  const target = path.resolve(root, storageKey);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Invalid document storage key");
  return target;
}

/**
 * Local storage is intentionally behind this small boundary. Production can
 * replace this module with an object-storage adapter without changing report,
 * document authorization, or metadata persistence.
 */
export async function storeDeathEvidence(
  caseExternalId: string,
  file: DeathEvidenceFile,
): Promise<StoredDeathEvidence> {
  validateDeathEvidenceFile(file);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length !== file.size) throw new Error("Evidence upload was truncated");
  assertMagicBytes(file.type, bytes);

  const storageKey = path.posix.join("death-evidence", caseExternalId, randomUUID());
  const target = filePathForKey(storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
  return {
    storageKey,
    contentType: file.type,
    originalFilename: normalizeFilename(file.name),
    sizeBytes: bytes.length,
  };
}

export async function readDeathEvidence(storageKey: string) {
  return readFile(filePathForKey(storageKey));
}

export async function removeDeathEvidence(storageKey: string) {
  await rm(filePathForKey(storageKey), { force: true });
}
