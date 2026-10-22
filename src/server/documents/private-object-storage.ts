import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

export const MAX_PRIVATE_OBJECT_BYTES = 10 * 1024 * 1024;
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const keyPattern = new RegExp(`^death-evidence/${uuid}/${uuid}$`, "i");

export function assertPrivateObjectKey(key: string) {
  if (!keyPattern.test(key)) throw new Error("Invalid document storage key");
}

function storage() {
  const bucket = process.env.S3_PRIVATE_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) throw new Error("Private document storage is not configured");
  // The AWS credential chain supports workload roles or server-only credentials.
  // No public URLs, browser credentials or caller-controlled endpoints are used.
  return { bucket, client: new S3Client({ region, maxAttempts: 3 }) };
}

export async function putPrivateObject(key: string, bytes: Buffer, contentType: string) {
  assertPrivateObjectKey(key);
  if (!bytes.length || bytes.length > MAX_PRIVATE_OBJECT_BYTES)
    throw new Error("Invalid private document size");
  const { bucket, client } = storage();
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        ContentLength: bytes.length,
        ServerSideEncryption: "AES256",
        IfNoneMatch: "*",
      }),
      { abortSignal: AbortSignal.timeout(20000) },
    );
  } catch {
    throw new Error("Private document storage is unavailable");
  } finally {
    client.destroy();
  }
}

export async function getPrivateObject(key: string) {
  assertPrivateObjectKey(key);
  const { bucket, client } = storage();
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(20000),
    });
    if (!response.Body) throw new Error("Missing private document");
    const body = response.Body as Readable;
    if ((response.ContentLength ?? 0) > MAX_PRIVATE_OBJECT_BYTES) {
      body.destroy();
      throw new Error("Oversized private document");
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of body) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_PRIVATE_OBJECT_BYTES) throw new Error("Oversized private document");
      chunks.push(bytes);
    }
    if (!size || (response.ContentLength !== undefined && size !== response.ContentLength))
      throw new Error("Incomplete private document");
    return Buffer.concat(chunks, size);
  } catch {
    throw new Error("Private document storage is unavailable");
  } finally {
    client.destroy();
  }
}

/** Used only to compensate an upload whose metadata transaction did not commit. */
export async function deletePrivateObject(key: string) {
  assertPrivateObjectKey(key);
  const { bucket, client } = storage();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error("Private document storage is unavailable");
  } finally {
    client.destroy();
  }
}
