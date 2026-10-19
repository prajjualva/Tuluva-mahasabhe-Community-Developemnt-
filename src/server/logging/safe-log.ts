const sensitiveKey =
  /password|otp|secret|token|authorization|cookie|bank|accountnumber|ifsc|credential|encrypted|adminnote|evidencebytes/i;

/** Defense in depth for nested diagnostic objects; never log request bodies. */
export function safeLogValue(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[TRUNCATED]";
  if (value instanceof Error)
    return { name: value.name, message: "Operation failed; sensitive error details withheld" };
  if (value instanceof Uint8Array) return "[BINARY]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeLogValue(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveKey.test(key) ? "[REDACTED]" : safeLogValue(item, depth + 1),
      ]),
    );
  }
  return value;
}
