import { NextRequest, NextResponse } from "next/server";
import { isAllowedMutationOrigin } from "./server/security/request-policy";

export function middleware(request: NextRequest) {
  // Do not stream a presentation-only route behind an HTTP 200 loading shell.
  // This gate also protects client navigations and the legacy demo-event URL.
  if (
    process.env.NODE_ENV === "production" &&
    (request.nextUrl.pathname === "/demo" ||
      request.nextUrl.pathname.startsWith("/demo/") ||
      request.nextUrl.pathname === "/death-support-events/demo")
  )
    return new NextResponse("Not found", { status: 404 });
  const requestId = crypto.randomUUID();
  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    !isAllowedMutationOrigin({
      method: request.method,
      pathname: request.nextUrl.pathname,
      origin: request.headers.get("origin"),
      fetchSite: request.headers.get("sec-fetch-site"),
      requestOrigin: request.nextUrl.origin,
      appUrl: process.env.APP_URL,
      allowDevelopmentLoopback: process.env.NODE_ENV === "development",
    })
  )
    return NextResponse.json({ error: "Cross-origin request denied" }, { status: 403 });
  // This limit is additional to per-file and form validation in upload services.
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 25 * 1024 * 1024)
    return NextResponse.json({ error: "Request is too large" }, { status: 413 });
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set(
    "content-security-policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      `script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === "development" ? "'unsafe-eval' " : ""}https://checkout.razorpay.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://*.razorpay.com",
      "font-src 'self'",
      "connect-src 'self' https://*.razorpay.com",
      "frame-src https://*.razorpay.com",
      "form-action 'self'",
    ].join("; "),
  );
  if (process.env.NODE_ENV === "production")
    response.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  if (request.nextUrl.pathname.startsWith("/api/"))
    response.headers.set("cache-control", "private, no-store");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
