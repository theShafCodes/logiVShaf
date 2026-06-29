import { beforeEach, describe, expect, it, vi } from "vitest";

describe("getRouteProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('returns the Google Maps provider when ROUTE_PROVIDER="google"', async () => {
    vi.stubEnv("ROUTE_PROVIDER", "google");

    const { getRouteProvider } = await import("../index");
    const provider = getRouteProvider();

    expect(provider.constructor.name).toBe("GoogleMapsProvider");
  });

  it("rejects unsupported providers", async () => {
    vi.stubEnv("ROUTE_PROVIDER", "foo");

    const { getRouteProvider } = await import("../index");
    expect(() => getRouteProvider()).toThrow(/only "google" is supported/);
  });
});
