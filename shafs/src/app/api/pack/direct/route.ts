/**
 * POST /api/pack/direct — Stage 3 test endpoint.
 * Accepts a pre-assembled Item[] (skipping the PDF/classification pipeline) and
 * runs the packer directly. Supports single-van mode (vanId provided → force one
 * van, overflow reported unplaced) and auto mode (no vanId → cheapest multi-van
 * fleet allocation, mirroring the real /api/pack flow).
 */
import { NextResponse } from "next/server";
import { getConfig } from "@/config/env";
import { HeuristicPacker } from "@/lib/packing/heuristic-packer";
import { FileVanRepository } from "@/lib/packing/van.repository";
import { allocateFleet } from "@/lib/packing/fleet-allocator";
import { PackingError } from "@/lib/packing/packer.service";
import type { Item } from "@/lib/packing/packing.types";

export const runtime = "nodejs";

function countPackableUnits(items: Item[]): number {
  return items.reduce((n, i) => (i.dimensions !== null ? n + Math.max(1, i.quantity) : n), 0);
}

export async function POST(request: Request): Promise<Response> {
  let body: { items?: unknown; vanId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Request body is not valid JSON." }, { status: 400 });
  }

  if (!Array.isArray(body?.items) || body.items.length === 0) {
    return NextResponse.json({ success: false, error: "Body must include a non-empty 'items' array." }, { status: 400 });
  }

  const items = body.items as Item[];
  const vanId = typeof body.vanId === "string" ? body.vanId : undefined;

  try {
    const cfg = getConfig().packing;
    const packer = new HeuristicPacker({ toleranceMm: cfg.toleranceMm });
    const repo = new FileVanRepository();
    const packableUnits = countPackableUnits(items);

    if (vanId) {
      const van = await repo.getVan(vanId);
      if (!van) {
        return NextResponse.json({ success: false, error: `Unknown van id "${vanId}".` }, { status: 400 });
      }
      const selected = packer.pack(items, van);
      return NextResponse.json({
        success: true,
        items,
        fleet: [selected],
        selected,
        fitsInSingleVan: selected.unplaced.length === 0,
        unplaced: selected.unplaced,
        reasons: selected.reasons,
        totalPerMileRate: van.perMileRate,
        packableUnits,
      });
    }

    const allVans = await repo.listVans();
    const vans = allVans.slice(0, cfg.maxVansToConsider);
    if (vans.length === 0) {
      return NextResponse.json({ success: false, error: "No vans configured." }, { status: 400 });
    }
    const plan = allocateFleet(items, vans, packer, { toleranceMm: cfg.toleranceMm });
    // When nothing is placeable (all oversized / dimensionless), still succeed and
    // report the unplaced cargo — fall back to an empty pack so the UI has a van to
    // render. Mirrors packer.service so both endpoints behave consistently.
    const selected = plan.vans[0] ?? packer.pack(items, vans[0]!);

    return NextResponse.json({
      success: true,
      items,
      fleet: plan.vans,
      selected,
      fitsInSingleVan: plan.fitsInSingleVan,
      unplaced: plan.unplaced,
      reasons: plan.reasons,
      totalPerMileRate: plan.totalPerMileRate,
      packableUnits,
    });
  } catch (err) {
    if (err instanceof PackingError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "Internal error." }, { status: 500 });
  }
}
