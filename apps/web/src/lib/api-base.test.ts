import { afterEach, describe, expect, it, vi } from "vitest";

import { getPublicApiBaseUrl } from "./api-base";

describe("getPublicApiBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses explicit NEXT_PUBLIC_API_BASE_URL and strips trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com/");
    vi.stubEnv("NEXT_PUBLIC_USE_SAME_ORIGIN_API_PROXY", "true");
    expect(getPublicApiBaseUrl()).toBe("https://api.example.com");
  });

  it("uses same-origin proxy path when enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_SAME_ORIGIN_API_PROXY", "true");
    vi.stubGlobal("window", {
      location: { origin: "https://preview.example.com" },
    });
    expect(getPublicApiBaseUrl()).toBe("https://preview.example.com/__letaicook_api");
  });

  it("follows web host and port when enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_API_FOLLOW_WEB_HOST", "true");
    vi.stubEnv("NEXT_PUBLIC_API_PORT", "8000");
    vi.stubGlobal("window", {
      location: {
        protocol: "http:",
        hostname: "192.168.1.10",
        origin: "http://192.168.1.10:3000",
      },
    });
    expect(getPublicApiBaseUrl()).toBe("http://192.168.1.10:8000");
  });

  it("defaults to localhost:8000", () => {
    expect(getPublicApiBaseUrl()).toBe("http://localhost:8000");
  });

  it("infers letaicook-api Cloud Run host from letaicook-web host", () => {
    vi.stubGlobal("window", {
      location: {
        protocol: "https:",
        hostname: "letaicook-web-6dyzc2mqrq-uc.a.run.app",
        origin: "https://letaicook-web-6dyzc2mqrq-uc.a.run.app",
      },
    });
    expect(getPublicApiBaseUrl()).toBe("https://letaicook-api-6dyzc2mqrq-uc.a.run.app");
  });
});
