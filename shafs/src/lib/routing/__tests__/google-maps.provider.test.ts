import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

describe("GoogleMapsProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the Google Routes API v2 endpoint and parses distance/duration", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
    vi.stubEnv("MAPS_TIMEOUT_MS", "2500");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        routes: [{ distanceMeters: 32186.88, duration: "1800s" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GoogleMapsProvider } = await import("../google-maps.provider");
    const provider = new GoogleMapsProvider();
    const route = await provider.getRoute("London, UK", "Manchester, UK");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Goog-Api-Key": "test-key",
          "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
        }),
        body: JSON.stringify({
          origin: { address: "London, UK" },
          destination: { address: "Manchester, UK" },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_UNAWARE",
          computeAlternativeRoutes: false,
        }),
      }),
    );
    expect(route).toEqual({
      origin: "London, UK",
      destination: "Manchester, UK",
      durationSeconds: 1800,
      distanceMiles: 20,
      distanceMethod: "road",
    });
  });

  it("fails fast when the API key is missing", async () => {
    const { GoogleMapsProvider } = await import("../google-maps.provider");
    await expect(new GoogleMapsProvider().getRoute("A", "B")).rejects.toThrow(
      /GOOGLE_MAPS_API_KEY is not configured/,
    );
  });
});
