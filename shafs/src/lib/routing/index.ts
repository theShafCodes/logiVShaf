import { getConfig } from "@/config/env";
import { GoogleMapsProvider } from "./google-maps.provider";
import { RoutingError } from "./types";
export { RoutingError } from "./types";
export type { RouteProvider } from "./types";

export function getRouteProvider() {
  const {provider} = getConfig().routing;
  if (provider !== "google") {
    throw new RoutingError(`Unknown ROUTE_PROVIDER: "${provider}" — only "google" is supported`);
  }
  return new GoogleMapsProvider();
}
