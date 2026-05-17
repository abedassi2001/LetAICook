import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Pin Turbopack root to this app (avoids 404s when another lockfile exists higher up). */
const appRoot = path.dirname(fileURLToPath(import.meta.url));

/** Server-side only at build; proxies /__letaicook_api/* to your FastAPI origin. */
const apiProxyTarget = process.env.LETAICOOK_API_PROXY_TARGET?.trim().replace(
  /\/$/,
  "",
);

const nextConfig: NextConfig = {
  /** Cloud Run Docker image (`apps/web/Dockerfile.prod` sets DOCKER_BUILD=true). */
  ...(process.env.DOCKER_BUILD === "true" ? { output: "standalone" as const } : {}),
  /** Monorepo / stray lockfiles: trace and resolve from this app only. */
  outputFileTracingRoot: appRoot,
  turbopack: {
    root: appRoot,
  },
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [
      {
        source: "/__letaicook_api/:path*",
        destination: `${apiProxyTarget}/:path*`,
      },
    ];
  },
};

export default nextConfig;
