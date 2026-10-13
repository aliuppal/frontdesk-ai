import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every dashboard page is per-owner and request-time (cookies + RLS), so Cache Components is off:
  // pages render dynamically per request under the classic model.
  cacheComponents: false,
  turbopack: {
    rules: {
      // Only the Tailwind entry file goes through the Tailwind loader. A "*.css" glob would also catch
      // *.module.css and its `as: "*.css"` strips CSS-module scoping (class names come back undefined).
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
