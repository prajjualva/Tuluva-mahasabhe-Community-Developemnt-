const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export function isAllowedMutationOrigin(input: {
  method: string;
  pathname: string;
  origin: string | null;
  fetchSite: string | null;
  requestOrigin: string;
  appUrl?: string;
  allowDevelopmentLoopback?: boolean;
}) {
  if (SAFE_METHODS.has(input.method)) return true;
  // These machine endpoints authenticate signed payloads or a scheduler secret.
  if (
    input.pathname.startsWith("/api/payments/webhooks/") ||
    input.pathname.startsWith("/api/internal/jobs/")
  )
    return true;
  if (input.fetchSite === "cross-site") return false;
  if (!input.origin) return input.fetchSite !== "cross-site";
  const allowed = new Set([input.requestOrigin]);
  if (input.appUrl) {
    try {
      allowed.add(new URL(input.appUrl).origin);
    } catch {
      return false;
    }
  }
  // Next's development server may canonicalize 127.0.0.1 to localhost.
  // Permit only equivalent loopback origins, at the same port, in development.
  if (input.allowDevelopmentLoopback) {
    for (const origin of [...allowed]) {
      const parsed = new URL(origin);
      if (["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
        for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
          parsed.hostname = hostname;
          allowed.add(parsed.origin);
        }
      }
    }
  }
  try {
    return allowed.has(new URL(input.origin).origin);
  } catch {
    return false;
  }
}

export function safeInternalRedirect(value: string | null, fallback = "/member") {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\r\n]/.test(value)
  )
    return fallback;
  return value;
}
