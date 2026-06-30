/**
 * Stage 3 orchestrator. Wires config loaders → item assembly → the packing
 * heuristic across the fleet, then ranks vans so a single best plan plus an
 * explicit "does it fit one van" signal come back. Mirrors the ingestion service
 * shape (perf.track timing, structured logging); no geometry logic lives here.
 */
import { createLogger } from "@/lib/logger/logger";
import { PerfTracker, type PerfReport } from "@/lib/perf/tracker";
import { getConfig } from "@/config/env";
import { assembleItems } from "@/lib/packing/item-assembler";
import { loadColumnMap } from "@/lib/packing/column-map";
import { loadStackabilityMatrix } from "@/lib/packing/stackability";
import { FileVanRepository, type VanRepository } from "@/lib/packing/van.repository";
import { HeuristicPacker } from "@/lib/packing/heuristic-packer";
import { allocateFleet } from "@/lib/packing/fleet-allocator";
import type { Item, Packer, PackingResult, Van } from "@/lib/packing/packing.types";
import type { ClassificationResult } from "@/lib/classification/types";
import type { StructuredDocument } from "@/lib/conversion/types";

const logger = createLogger("packing.service");

export class PackingError extends Error {
  constructor(message: string) {
    super(`[packing] ${message}`);
    this.name = "PackingError";
  }
}

export interface PackJobInput {
  readonly doc: StructuredDocument;
  readonly classification: ClassificationResult;
  /** Preferred van id; when omitted the whole fleet is ranked. */
  readonly vanId?: string;
}

export interface VanRanking {
  readonly vanId: string;
  readonly label: string;
  readonly utilization: number;
  readonly fits: boolean;
  readonly placedUnits: number;
  readonly packableUnits: number;
  readonly result: PackingResult;
}

export interface PackJobResult {
  readonly items: Item[];
  /** Units with valid dimensions (missing-dimension rows are never packable). */
  readonly packableUnits: number;
  /** The chosen fleet, in load order — one PackingResult per van used. */
  readonly fleet: PackingResult[];
  /** Convenience alias for fleet[0] (the first/primary van); legacy callers. */
  readonly selected: PackingResult;
  /** Single-van comparison across the fleet (answers "could one van do it"). */
  readonly ranking: VanRanking[];
  /** False ⇒ no single configured van holds the whole job (multi-van plan). */
  readonly fitsInSingleVan: boolean;
  /** Cargo no van in the fleet can carry (oversized / missing dimensions). */
  readonly unplaced: Item[];
  /** itemId → why it (or part of it) could not be carried. */
  readonly reasons: Record<string, string>;
  /** Σ perMileRate across the chosen fleet — drives the multi-van quote. */
  readonly totalPerMileRate: number;
  readonly perf: PerfReport;
}

function countPackableUnits(items: Item[]): number {
  return items.reduce((n, i) => (i.dimensions === null ? n : n + Math.max(1, i.quantity)), 0);
}

/** fits-first, then tightest pack; partial packs ranked by units placed. */
export function compareRankings(a: VanRanking, b: VanRanking): number {
  if (a.fits !== b.fits) return a.fits ? -1 : 1;
  if (a.fits && b.fits) return b.utilization - a.utilization;
  if (a.placedUnits !== b.placedUnits) return b.placedUnits - a.placedUnits;
  return b.utilization - a.utilization;
}

export interface PackerServiceDeps {
  readonly vanRepository: VanRepository;
  readonly packer: Packer;
}

/** Default wiring: file-backed fleet + heuristic packer tuned from config. */
function defaultDeps(): PackerServiceDeps {
  return {
    vanRepository: new FileVanRepository(),
    packer: new HeuristicPacker({ toleranceM: getConfig().packing.toleranceM }),
  };
}

export async function packJob(
  input: PackJobInput,
  deps: PackerServiceDeps = defaultDeps(),
): Promise<PackJobResult> {
  const perf = new PerfTracker(logger);

  const items = await perf.track("assemble", async () => {
    const [columnMap, matrix] = await Promise.all([loadColumnMap(), loadStackabilityMatrix()]);
    return assembleItems({
      doc: input.doc,
      classification: input.classification,
      columnMap,
      matrix,
    });
  });

  const packableUnits = countPackableUnits(items);

  // Guard: ranking packs every unit into each fleet van, so cost grows with
  // units × vans. Beyond this cap a synchronous pack takes minutes and freezes
  // the UI — fail loud with the count rather than hang. Tunable via PACKING_MAX_PACKABLE_UNITS.
  const maxPackableUnits = getConfig().packing.maxPackableUnits;
  if (packableUnits > maxPackableUnits) {
    throw new PackingError(
      `job has ${packableUnits} packable units, exceeding the limit of ${maxPackableUnits}. ` +
        `Split the cargo into smaller batches or raise PACKING_MAX_PACKABLE_UNITS.`,
    );
  }

  const vans = await perf.track("load-vans", async () => {
    const all = await deps.vanRepository.listVans();
    if (input.vanId) {
      const one = all.find((v) => v.id === input.vanId);
      if (!one) throw new PackingError(`unknown van id "${input.vanId}"`);
      return [one];
    }
    return all.slice(0, getConfig().packing.maxVansToConsider);
  });

  const ranking = await perf.track("pack", async () =>
    rankVans(items, vans, packableUnits, deps.packer),
  );

  // Cheapest combination of vans that carries the WHOLE job (overflow → +vans).
  const plan = await perf.track("allocate", async () =>
    allocateFleet(items, vans, deps.packer, {
      toleranceM: getConfig().packing.toleranceM,
    }),
  );

  // selected = primary van; fall back to the best single-van attempt when nothing
  // is packable (so the UI still has a van/interior to render an empty plan).
  const selected = plan.vans[0] ?? ranking[0]?.result;
  if (!selected) throw new PackingError("no vans available to pack into");

  logger.info("packing complete", {
    items: items.length,
    packableUnits,
    vansTried: vans.length,
    vansUsed: plan.vans.length,
    placedUnits: plan.placedUnits,
    unplaced: plan.unplaced.length,
    fitsInSingleVan: plan.fitsInSingleVan,
    totalPerMileRate: Math.round(plan.totalPerMileRate * 100) / 100,
  });

  return {
    items,
    packableUnits,
    fleet: plan.vans,
    selected,
    ranking,
    fitsInSingleVan: plan.fitsInSingleVan,
    unplaced: plan.unplaced,
    reasons: plan.reasons,
    totalPerMileRate: plan.totalPerMileRate,
    perf: perf.report(),
  };
}

export function rankVans(
  items: Item[],
  vans: Van[],
  packableUnits: number,
  packer: Packer,
): VanRanking[] {
  const rankings = vans.map((van): VanRanking => {
    const result = packer.pack(items, van);
    return {
      vanId: van.id,
      label: van.label,
      utilization: result.utilization,
      placedUnits: result.placements.length,
      packableUnits,
      fits: result.placements.length === packableUnits,
      result,
    };
  });
  return rankings.sort(compareRankings);
}
