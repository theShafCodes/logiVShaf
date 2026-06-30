import { getConfig } from "@/config/env";
import { GoogleMapsProvider } from "./google-maps.provider";
import { StraightLineProvider } from "./straight-line.provider";
import { RoutingError } from "./types";
export { RoutingError } from "./types";
export type { RouteProvider } from "./types";

export function getRouteProvider() {
  const { provider, googleMapsApiKey } = getConfig().routing;
  if (provider !== "google") {
    throw new RoutingError(`Unknown ROUTE_PROVIDER: "${provider}" — only "google" is supported`);
  }
  // No API key → fall back to straight-line haversine (modelled scenario)
  if (!googleMapsApiKey) return new StraightLineProvider();
  return new GoogleMapsProvider();
}
