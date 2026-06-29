import { describeVan } from "@/lib/packing/van-format";
import { fuelRateForPayload } from "@/lib/packing/van-cost";
import type { Van } from "@/lib/packing/packing.types";
import type { Quote, QuoteLineItem, QuoteVan, Route } from "./types";

export class PricingError extends Error {
  constructor(message: string) {
    super(`[pricing] ${message}`);
    this.name = "PricingError";
  }
}

/**
 * Per-van full-route pricing: every vehicle drives the same origin→destination
 * route. Base distance cost = distance × perMileRate. When vanPayloads are
 * supplied, a fuel line item is added per van using the weight-adjusted rate.
 */
export function calculateQuote(
  route: Route,
  vans: Van[],
  fragileCount: number,
  fragilitySurchargePerItem: number,
  currencySymbol = "£",
  vanPayloads?: number[],
): Quote {
  if (vans.length === 0) {
    throw new PricingError("at least one van is required to price a job");
  }

  const multi = vans.length > 1;

  const quoteVans: QuoteVan[] = vans.map((van) => {
    if (van.perMileRate <= 0) {
      throw new PricingError(`van "${van.label}" has no per-mile rate configured`);
    }
    return {
      id: van.id,
      label: van.label,
      description: describeVan(van.interior, van.maxPayloadKg),
      perMileRate: van.perMileRate,
      distanceCost: route.distanceMiles * van.perMileRate,
    };
  });

  // Base distance line items
  const lineItems: QuoteLineItem[] = quoteVans.map((v, i) => ({
    label: multi
      ? `Van ${i + 1} — distance (${route.distanceMiles.toFixed(1)} mi @ ${currencySymbol}${v.perMileRate.toFixed(2)}/mi)`
      : `Distance (${route.distanceMiles.toFixed(1)} mi @ ${currencySymbol}${v.perMileRate.toFixed(2)}/mi)`,
    amount: v.distanceCost,
  }));

  // Fuel line items (payload-adjusted; omitted when vanPayloads not provided)
  let fuelSubtotal = 0;
  if (vanPayloads) {
    for (let i = 0; i < vans.length; i++) {
      const fuelRate = fuelRateForPayload(vans[i]!, vanPayloads[i] ?? 0);
      if (fuelRate <= 0) continue;
      const amount = route.distanceMiles * fuelRate;
      fuelSubtotal += amount;
      lineItems.push({
        label: multi
          ? `Van ${i + 1} — fuel (${route.distanceMiles.toFixed(1)} mi @ ${currencySymbol}${fuelRate.toFixed(3)}/mi)`
          : `Fuel (${route.distanceMiles.toFixed(1)} mi @ ${currencySymbol}${fuelRate.toFixed(3)}/mi)`,
        amount,
      });
    }
  }

  const distanceSubtotal = quoteVans.reduce((sum, v) => sum + v.distanceCost, 0);
  const subtotal = distanceSubtotal + fuelSubtotal;

  const surcharges = fragileCount * fragilitySurchargePerItem;
  if (surcharges > 0) {
    lineItems.push({
      label: `Fragility surcharge (${fragileCount} item${fragileCount !== 1 ? "s" : ""} × ${currencySymbol}${fragilitySurchargePerItem.toFixed(2)})`,
      amount: surcharges,
    });
  }

  return {
    route,
    vans: quoteVans,
    lineItems,
    subtotal,
    surcharges,
    total: subtotal + surcharges,
  };
}
