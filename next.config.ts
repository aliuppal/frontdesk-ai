import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every dashboard page is per-owner and request-time (cookies + RLS), so Cache Components is off:
  // pages render dynamically per request under the classic model.
  cacheComponents: false,
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
