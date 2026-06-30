/**
 * Fallback RouteProvider when no Google Maps key is configured.
 * Geocodes addresses via Nominatim (OSM) then computes haversine straight-line distance.
 * Duration is estimated at 50 mph — good enough for cost modelling, not real scheduling.
 */
import type { Route } from "@/lib/pricing/types";
import { RoutingError } from "./types";
import type { RouteProvider } from "./types";

const EARTH_MILES = 3958.8;
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
// Nominatim policy: ≤1 req/s. We geocode origin then destination sequentially.
const NOMINATIM_TIMEOUT_MS = 5000;

interface NominatimResult { lat: string; lon: string; }

async function geocode(address: string): Promise<{ lat: number; lon: number }> {
  const url = `${NOMINATIM}?q=${encodeURIComponent(address)}&format=json&limit=1`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "logistics-quoting-tool/1.0 (demo)" },
      signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
    });
  } catch (err) {
    throw new RoutingError(`Geocoding request failed for "${address}": ${String(err)}`);
  }
  if (!res.ok) throw new RoutingError(`Geocoding failed for "${address}": HTTP ${res.status}`);
  const data = (await res.json()) as NominatimResult[];
  if (!data[0]) throw new RoutingError(`No location found for "${address}"`);
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => d * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export class StraightLineProvider implements RouteProvider {
  async getRoute(origin: string, destination: string): Promise<Route> {
    const from = await geocode(origin);
    const to = await geocode(destination);
    const distanceMiles = haversineMiles(from.lat, from.lon, to.lat, to.lon);
    const durationSeconds = Math.round((distanceMiles / 50) * 3600);
    return { origin, destination, distanceMiles, durationSeconds, distanceMethod: "straight-line" };
  }
}
