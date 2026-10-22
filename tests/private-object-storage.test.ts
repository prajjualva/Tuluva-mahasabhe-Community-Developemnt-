import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = mocks.send;
    destroy = mocks.destroy;
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));
import {
  assertPrivateObjectKey,
  putPrivateObject,
  getPrivateObject,
  deletePrivateObject,
  MAX_PRIVATE_OBJECT_BYTES,
} from "../src/server/documents/private-object-storage";
import { storeDeathEvidence } from "../src/server/documents/death-document-storage";
const caseId = "00000000-0000-4000-8000-000000000001";
const key = `death-evidence/${caseId}/00000000-0000-4000-8000-000000000002`;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockReset();
  vi.stubEnv("S3_PRIVATE_BUCKET", "private-test-bucket");
  vi.stubEnv("AWS_REGION", "ap-south-1");
});
afterEach(() => vi.unstubAllEnvs());

describe("private object storage", () => {
  it("rejects paths, URLs, traversal and non-opaque keys before contacting S3", async () => {
    for (const invalid of [
      "../secret",
      "https://example.com/file",
      "death-evidence/../file",
      `${key}/extra`,
      key.replace(caseId, "person-name"),
    ])
      expect(() => assertPrivateObjectKey(invalid)).toThrow("Invalid document");
    await expect(getPrivateObject("../secret")).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("writes an encrypted, non-overwriting object without a public ACL", async () => {
    mocks.send.mockResolvedValue({});
    await putPrivateObject(key, Buffer.from("%PDF-"), "application/pdf");
    expect(mocks.send.mock.calls[0][0].input).toEqual({
      Bucket: "private-test-bucket",
      Key: key,
      Body: Buffer.from("%PDF-"),
      ContentType: "application/pdf",
      ContentLength: 5,
      ServerSideEncryption: "AES256",
      IfNoneMatch: "*",
    });
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
  it("bounds streamed reads and verifies declared size", async () => {
    mocks.send.mockResolvedValueOnce({
      Body: Readable.from([Buffer.from("abc")]),
      ContentLength: 3,
    });
    expect(await getPrivateObject(key)).toEqual(Buffer.from("abc"));
    mocks.send.mockResolvedValueOnce({
      Body: Readable.from([Buffer.from("abc")]),
      ContentLength: 5,
    });
    await expect(getPrivateObject(key)).rejects.toThrow("storage is unavailable");
    mocks.send.mockResolvedValueOnce({
      Body: Readable.from([Buffer.alloc(MAX_PRIVATE_OBJECT_BYTES), Buffer.from("x")]),
    });
    await expect(getPrivateObject(key)).rejects.toThrow("storage is unavailable");
  });
  it("fails closed when unconfigured or when the provider fails, without diagnostics", async () => {
    vi.stubEnv("S3_PRIVATE_BUCKET", "");
    await expect(putPrivateObject(key, Buffer.from("x"), "application/pdf")).rejects.toThrow(
      "not configured",
    );
    expect(mocks.send).not.toHaveBeenCalled();
    vi.stubEnv("S3_PRIVATE_BUCKET", "private-test-bucket");
    mocks.send.mockRejectedValue(new Error("sensitive-provider-diagnostic"));
    await expect(getPrivateObject(key)).rejects.toThrow(
      /^Private document storage is unavailable$/,
    );
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
  it("supports compensating cleanup using the same opaque key", async () => {
    mocks.send.mockResolvedValue({});
    await deletePrivateObject(key);
    expect(mocks.send.mock.calls[0][0].input).toEqual({ Bucket: "private-test-bucket", Key: key });
  });
  it("routes validated evidence to S3 and rejects unsupported file contents", async () => {
    vi.stubEnv("UPLOAD_STORAGE", "s3");
    mocks.send.mockResolvedValue({});
    const bytes = Buffer.from("%PDF-test");
    const file = {
      name: "../private.pdf",
      type: "application/pdf",
      size: bytes.length,
      arrayBuffer: async () => Uint8Array.from(bytes).buffer,
    };
    const stored = await storeDeathEvidence(caseId, file);
    expect(stored.storageKey).toMatch(/^death-evidence\//);
    expect(stored.originalFilename).not.toContain("/");
    expect(stored.sizeBytes).toBe(bytes.length);
    mocks.send.mockClear();
    await expect(storeDeathEvidence(caseId, { ...file, type: "image/jpeg" })).rejects.toThrow(
      "contents do not match",
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("refuses ephemeral local storage on Vercel", async () => {
    vi.stubEnv("UPLOAD_STORAGE", "local");
    vi.stubEnv("VERCEL", "1");
    const bytes = Buffer.from("%PDF-test");
    await expect(
      storeDeathEvidence(caseId, {
        name: "private.pdf",
        type: "application/pdf",
        size: bytes.length,
        arrayBuffer: async () => Uint8Array.from(bytes).buffer,
      }),
    ).rejects.toThrow("persistent document storage");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
