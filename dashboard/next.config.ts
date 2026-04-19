import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is only needed for the Docker build; Vercel serves
  // the app as serverless functions and ignores this setting.
  output: process.env.NEXT_STANDALONE ? "standalone" : undefined,

  // Strip the X-Powered-By header to reduce response size.
  poweredByHeader: false,

  experimental: {
    // Tree-shake barrel exports from heavy dependencies so only the
    // individual components/icons that are actually imported end up in
    // the client bundle. This significantly reduces initial JS for pages
    // that import from these packages.
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "radix-ui",
      "cmdk",
      "react-markdown",
      "remark-gfm",
    ],

    // Inline CSS into the HTML response instead of loading it as a separate
    // render-blocking <link> stylesheet. Eliminates one network round-trip
    // before first paint.
    inlineCss: true,
  },
};

export default nextConfig;
