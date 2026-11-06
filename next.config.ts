import type { NextConfig } from "next";
import { securityHeaders } from "./lib/http/headers";

const nextConfig: NextConfig = {
  /* config options here */
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "256kb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
