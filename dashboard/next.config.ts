import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is only needed for the Docker build; Vercel serves
  // the app as serverless functions and ignores this setting.
  output: process.env.NEXT_STANDALONE ? "standalone" : undefined,
};

export default nextConfig;
