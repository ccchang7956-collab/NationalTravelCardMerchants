import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  // Automatic reload can interrupt an offline navigation and restore the previous URL.
  reloadOnOnline: false,
  fallbacks: {
    document: "/offline",
  },
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: /\/api\/(merchants|stats|data-info)/,
        handler: "NetworkFirst",
        method: "GET",
        options: {
          cacheName: "apis",
          expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
          networkTimeoutSeconds: 8,
        },
      },
      { urlPattern: /\/api\//, handler: "NetworkOnly", method: "POST" },
    ],
  },
  extendDefaultRuntimeCaching: true,
});

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {},
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https:; font-src 'self' data: https:; connect-src 'self' https://nominatim.openstreetmap.org https://tile.openstreetmap.org https: ws: wss:; frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
          },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
