/** Fixed operator-configured destinations only; never accepts a request URL or credentials. */
export function reviewPortalUrl(environment: Record<string, string | undefined> = process.env) {
  if (!environment.PLAY_REVIEW_URL) return null;
  try {
    const url = new URL(environment.PLAY_REVIEW_URL);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      !["tuluva-mahasabhe-review.vercel.app", "review.tuluworld.org.in"].includes(url.hostname)
    )
      return null;
    return new URL("/login", url).href;
  } catch {
    return null;
  }
}
