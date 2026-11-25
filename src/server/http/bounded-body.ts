export async function readBoundedBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Request body is required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Request is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}
