import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import { apiCachePlugin } from "./src/utils/apiCachePlugin";

// Match the explicitly configured browser API origin, including local HTTP dev.
const apiConnectOrigin = new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").origin;

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
        urlPattern: ({ url }) => /^\/api\/(merchants(?:\/[^/]+)?|stats|data-info)$/.test(url.pathname),
        handler: "NetworkFirst",
        method: "GET",
        options: {
          cacheName: "apis-v2",
          plugins: [apiCachePlugin],
          cacheableResponse: { statuses: [200] },
          expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
          networkTimeoutSeconds: 8,
        },
      },
      // Never let the default GET caching rules serve old errors or geocoding.
      { urlPattern: ({ url }) => url.pathname.startsWith("/api/"), handler: "NetworkOnly", method: "GET" },
      { urlPattern: ({ url }) => url.pathname.startsWith("/api/"), handler: "NetworkOnly", method: "POST" },
    ],
  },
  extendDefaultRuntimeCaching: true,
});

const nextConfig: NextConfig = {
  output: "standalone",
  // 保留 Next 16.3.8 預設 HTML bots，加入搜尋／AI 爬蟲，讓初始 head 含完整 metadata。
  // 升級 Next 時應對照 htmlLimitedBots 文件，保留預設分享預覽爬蟲。
  htmlLimitedBots: /[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight|Googlebot|OAI-SearchBot|ChatGPT-User|GPTBot|PerplexityBot|Perplexity-User|ClaudeBot|Claude-SearchBot|Claude-User/i,
  turbopack: {},
  async rewrites() {
    return [{ source: "/sitemap-merchants-:id(\\d+).xml", destination: "/merchants/sitemap/:id.xml" }];
  },
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
              `default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https:; font-src 'self' data: https:; connect-src 'self' ${apiConnectOrigin} https://tile.openstreetmap.org https: ws: wss:; frame-ancestors 'self'; object-src 'none'; base-uri 'self'`,
          },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
