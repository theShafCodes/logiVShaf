/**
 * Google Maps Routes API v2 implementation of RouteProvider.
 * Server-side only — GOOGLE_MAPS_API_KEY must never reach the client bundle.
 *
 * Endpoint: POST routes.googleapis.com/directions/v2:computeRoutes
 * Field mask: only request distance + duration (billed only for requested fields).
 * Accepts plain-text address strings — no separate Geocoding API call needed.
 */
import { getConfig } from "@/config/env";
import type { Route } from "@/lib/pricing/types";
import { RoutingError } from "./types";
import type { RouteProvider } from "./types";

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const FIELD_MASK = "routes.distanceMeters,routes.duration";
const METRES_PER_MILE = 1609.344;

interface RoutesApiResponse {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string; // e.g. "3600s"
  }>;
  error?: { message: string };
}

export class GoogleMapsProvider implements RouteProvider {
  async getRoute(origin: string, destination: string): Promise<Route> {
    const cfg = getConfig().routing;
    if (!cfg.googleMapsApiKey) {
      throw new RoutingError("GOOGLE_MAPS_API_KEY is not configured");
    }

    let res: Response;
    try {
      res = await fetch(ROUTES_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": cfg.googleMapsApiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify({
          origin: { address: origin },
          destination: { address: destination },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_UNAWARE",
          computeAlternativeRoutes: false,
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
    } catch (err) {
      throw new RoutingError(`Routes API request failed: ${String(err)}`);
    }

    let data: RoutesApiResponse;
    try {
      data = (await res.json()) as RoutesApiResponse;
    } catch {
      throw new RoutingError("Routes API returned invalid JSON");
    }

    if (!res.ok) {
      throw new RoutingError(`Routes API HTTP ${res.status}: ${data.error?.message ?? "unknown error"}`);
    }

    const route = data.routes?.[0];
    if (!route) {
      throw new RoutingError("Routes API returned no routes");
    }
    if (route.distanceMeters == null || route.duration == null) {
      throw new RoutingError("Routes API returned no distance/duration");
    }

    // duration is a proto Duration string like "3600s"
    const durationSeconds = Number.parseInt(route.duration.replace("s", ""), 10);
    if (!Number.isFinite(durationSeconds)) {
      throw new RoutingError(`Routes API returned unparseable duration: "${route.duration}"`);
    }

    return {
      origin,
      destination,
      distanceMiles: route.distanceMeters / METRES_PER_MILE,
      durationSeconds,
    };
  }
}
