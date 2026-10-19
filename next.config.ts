import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Keep release verification separate from the running development demo.
  distDir: process.env.NEXT_BUILD_DIRECTORY ?? ".next",
};
export default nextConfig;
