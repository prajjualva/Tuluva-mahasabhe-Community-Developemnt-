/** A failed read must not be presented as an empty queue or a zero balance. */
export async function readRecord<T>(
  path: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  try {
    const response = await fetcher(path, { cache: "no-store" });
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, status: 0 };
  }
}
