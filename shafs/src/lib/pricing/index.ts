/**
 * Stage 5 orchestrator. Loads the van, fetches the route, calculates the quote.
 * Mirrors packer.service.ts in shape: perf-tracked, structured logging, injectable deps.
 */
import { createLogger } from "@/lib/logger/logger";
import { PerfTracker, type PerfReport } from "@/lib/perf/tracker";
import { getConfig } from "@/config/env";
import { getRouteProvider, type RouteProvider } from "@/lib/routing";
import { FileVanRepository, type VanRepository } from "@/lib/packing/van.repository";
import { calculateQuote, PricingError } from "./calculator";
import type { Quote } from "./types";

export { PricingError };
export type { Quote } from "./types";

const logger = createLogger("pricing.service");

export interface QuoteJobInput {
  /** Every van on the job, in load order. Repeats allowed (two of the same model). */
  readonly vanIds: string[];
  readonly origin: string;
  readonly destination: string;
  readonly fragileCount: number;
  /** Payload kg per van, index-aligned with vanIds. Enables fuel line items in the quote. */
  readonly vanPayloads?: number[];
}

export interface QuoteJobResult {
  readonly quote: Quote;
  readonly perf: PerfReport;
}

export interface PricingServiceDeps {
  readonly vanRepository: VanRepository;
  readonly routeProvider: RouteProvider;
}

function defaultDeps(): PricingServiceDeps {
  return {
    vanRepository: new FileVanRepository(),
    routeProvider: getRouteProvider(),
  };
}

export async function getQuote(
  input: QuoteJobInput,
  deps: PricingServiceDeps = defaultDeps(),
): Promise<QuoteJobResult> {
  const perf = new PerfTracker(logger);
  const cfg = getConfig().routing;

  const vans = await perf.track("load-vans", async () => {
    if (input.vanIds.length === 0) throw new PricingError("no van ids supplied");
    return Promise.all(
      input.vanIds.map(async (id) => {
        const v = await deps.vanRepository.getVan(id);
        if (!v) throw new PricingError(`unknown van id "${id}"`);
        return v;
      }),
    );
  });

  const route = await perf.track("route", () =>
    deps.routeProvider.getRoute(input.origin, input.destination),
  );

  const quote = calculateQuote(route, vans, input.fragileCount, cfg.fragilitySurchargePerItem, cfg.currencySymbol, input.vanPayloads);

  logger.info("quote generated", {
    vanIds: input.vanIds,
    origin: input.origin,
    destination: input.destination,
    distanceMiles: Math.round(route.distanceMiles * 10) / 10,
    total: Math.round(quote.total * 100) / 100,
  });

  return { quote, perf: perf.report() };
}
