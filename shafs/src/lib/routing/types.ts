import type { Route } from "@/lib/pricing/types";

export interface RouteProvider {
  getRoute(origin: string, destination: string): Promise<Route>;
}

export class RoutingError extends Error {
  constructor(message: string) {
    super(`[routing] ${message}`);
    this.name = "RoutingError";
  }
}
