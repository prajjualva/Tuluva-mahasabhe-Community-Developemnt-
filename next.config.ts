import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./public/fonts/**", "./public/brand/tuluva-mahasabhe-logo.jpeg"],
  },
  // Keep release verification separate from the running development demo.
  distDir: process.env.NEXT_BUILD_DIRECTORY ?? ".next",
};
export default nextConfig;
