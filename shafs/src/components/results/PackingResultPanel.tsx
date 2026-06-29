"use client";

import { useEffect, useState } from "react";
import { color, font, spacing, radius } from "@/styles/tokens";
import { smartNum } from "@/lib/fmt";
import { Van3DViewer } from "@/components/results/Van3DViewer";
import { describeVan } from "@/lib/packing/van-format";
import { computeUtilization } from "@/lib/packing/placement-validator";
import type { PackedItem, PackingResult, Placement, UnplacedItem } from "@/types/api";

interface PackingResultPanelProps {
  /** Chosen fleet, in load order — one entry per van used. */
  fleet: PackingResult[];
  /** Item references so placements can be labelled by description, not just number. */
  items: PackedItem[];
  /** Cargo no van can carry (oversized / missing dimensions). */
  unplaced: UnplacedItem[];
  reasons: Record<string, string>;
  fitsInSingleVan: boolean;
  packableUnits: number;
}

export function PackingResultPanel({
  fleet,
  items,
  unplaced: unplacedProp,
  reasons,
  fitsInSingleVan,
  packableUnits,
}: PackingResultPanelProps) {
  const itemName = new Map(items.map((i) => [i.id, i.name]));
  const nameFor = (id: string) => itemName.get(id) ?? id;
  const itemById = new Map(items.map((i) => [i.id, i]));

  // Local unplaced state so manually-dragged items can be removed from the list.
  const [localUnplaced, setLocalUnplaced] = useState(unplacedProp);
  useEffect(() => setLocalUnplaced(unplacedProp), [unplacedProp]);
  const unplaced = localUnplaced;

  const onItemPlaced = (itemId: string) =>
    setLocalUnplaced((prev) => prev.filter((u) => u.id !== itemId));

  const placedUnits = fleet.reduce((s, r) => s + r.placements.length, 0);
  const totalWeightKg = fleet.reduce(
    (s, r) => s + r.placements.reduce((w, p) => w + p.weightKg, 0),
    0,
  );
  const totalCapacityKg = fleet.reduce((s, r) => s + r.van.maxPayloadKg, 0);
  const fleetPayloadUtil = totalCapacityKg > 0 ? totalWeightKg / totalCapacityKg : 0;
  const fleetVolumeUtil = fleet.reduce((s, r) => s + r.utilization, 0) / Math.max(1, fleet.length);
  const weightLimited = fleetPayloadUtil > 0.65 && fleetVolumeUtil < 0.25;
  const complete = unplaced.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.md }}>
      {/* Summary */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
          <p style={label}>Load plan{fleet.length > 1 ? ` — ${fleet.length} vans` : ""}</p>
          <span style={badge(fitsInSingleVan ? "ok" : complete ? "info" : "warn")}>
            {fitsInSingleVan ? "Fits one van" : complete ? `Needs ${fleet.length} vans` : "Cargo unplaced"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: spacing.sm }}>
          <StatTile label="Vehicles" value={String(fleet.length)} />
          <StatTile label="Units placed" value={`${placedUnits}/${packableUnits}`} />
          <StatTile label="Unplaced" value={String(unplaced.length)} accent={unplaced.length > 0} />
          <StatTile label="Total weight" value={`${smartNum(totalWeightKg)} kg`} />
        </div>
        {weightLimited && (
          <p style={{ fontSize: font.xs, color: color.muted, marginTop: spacing.sm, marginBottom: 0 }}>
            Weight-constrained load — van selected for payload capacity ({smartNum(fleetPayloadUtil * 100)}% of {smartNum(totalCapacityKg)} kg used), not volume ({smartNum(fleetVolumeUtil * 100)}% fill). Smaller vans in this fleet cannot carry {smartNum(totalWeightKg)} kg in a single trip.
          </p>
        )}
        {!weightLimited && complete && fleet.length > 1 && (
          <p style={{ fontSize: font.xs, color: color.muted, marginTop: spacing.sm, marginBottom: 0 }}>
            Why these {fleet.length} vans — this is the cheapest combination that carries every item. Each van is filled as fully as the load allows, and when two combinations cost the same the one with fewer, fuller vans is chosen.
          </p>
        )}
      </div>

      {/* Fleet reference — the one table that names the actual vehicles/ids */}
      <div style={card}>
        <p style={{ ...label, marginBottom: spacing.sm }}>Fleet reference</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: font.sm }}>
            <thead>
              <tr>
                {["#", "Vehicle", "Van ID", "Description", "Items", "Weight", "Payload", "Volume"].map((h) => (
                  <th key={h} style={{ ...th, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fleet.map((r, i) => {
                return (
                  <tr key={i}>
                    <td style={{ ...td, color: color.muted }}>{i + 1}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{r.van.label}</td>
                    <td style={{ ...td, color: color.muted, fontVariantNumeric: "tabular-nums" }}>{r.van.id}</td>
                    <td style={td}>{describeVan(r.van.interior, r.van.maxPayloadKg)}</td>
                    <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{r.placements.length}</td>
                    <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{smartNum(r.placements.reduce((s,p)=>s+p.weightKg,0))} kg</td>
                    <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{smartNum(r.placements.reduce((s,p)=>s+p.weightKg,0) / r.van.maxPayloadKg * 100)}%</td>
                    <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{smartNum(r.utilization * 100)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-van detail (brand-free: "Van N" + description) */}
      {fleet.map((r, vi) => (
        <VanCard key={vi} index={vi} result={r} nameFor={nameFor} itemById={itemById} onItemPlaced={onItemPlaced} />
      ))}

      {/* Genuinely unplaced cargo — draggable onto a van 3D viewer */}
      {unplaced.length > 0 && (
        <div style={card}>
          <p style={{ ...label, marginBottom: spacing.sm }}>Unplaced — could not be carried ({unplaced.length})</p>
          <p style={{ fontSize: font.xs, color: color.muted, marginBottom: spacing.sm }}>
            Drag an item from this list onto a van above to manually place it.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs }}>
            {unplaced.map((item) => {
              const packedItem = itemById.get(item.id);
              const canDrag = packedItem?.dimensions != null;
              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    fontSize: font.sm, padding: `${spacing.xs}px 0`,
                    borderBottom: `1px solid ${color.border}`,
                    opacity: canDrag ? 1 : 0.55,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: spacing.xs }}>
                    {canDrag && (
                      <span
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/van-item", JSON.stringify(packedItem));
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        title="Drag to place manually"
                        style={{ cursor: "grab", color: color.muted, fontSize: font.xs, userSelect: "none", lineHeight: 1 }}
                      >⠿</span>
                    )}
                    <span style={{ fontWeight: 600, color: color.text, userSelect: "text" }}>{item.name} ×{item.quantity}</span>
                  </div>
                  <span style={{ color: color.muted, userSelect: "text" }}>{reasons[item.id] ?? "unknown"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Per-van card ───────────────────────────────────────────────────────── */

function VanCard({
  index, result, nameFor, itemById, onItemPlaced,
}: {
  index: number;
  result: PackingResult;
  nameFor: (id: string) => string;
  itemById: Map<string, PackedItem>;
  onItemPlaced: (itemId: string) => void;
}) {
  const [placements, setPlacements] = useState<Placement[]>(result.placements);
  // Sync when packing reruns (e.g. fragility toggle triggers repack → new result prop).
  useEffect(() => { setPlacements(result.placements); }, [result.placements]);
  const placed = placements.length;
  const totalWeight = placements.reduce((s, p) => s + p.weightKg, 0);
  const payloadUtil = totalWeight / result.van.maxPayloadKg;
  const names = placements.map((p) => nameFor(p.itemId));
  const { volumeFill, floorFootprint } = computeUtilization(placements, result.van.interior);

  const handlePlacementsChange = (next: Placement[]) => {
    // Find any new placements added (not in current list) and fire onItemPlaced.
    const currentIds = new Set(placements.map((p) => p.itemId));
    next.filter((p) => !currentIds.has(p.itemId)).forEach((p) => onItemPlaced(p.itemId));
    setPlacements(next);
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: spacing.sm, flexWrap: "wrap", gap: spacing.sm }}>
        <p style={{ ...label, margin: 0 }}>Van {index + 1}</p>
        <span style={{ fontSize: font.sm, color: color.muted }}>
          {describeVan(result.van.interior, result.van.maxPayloadKg)}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: spacing.sm, marginBottom: spacing.md }}>
        <StatTile label="Volume fill" value={`${smartNum(volumeFill * 100)}%`} />
        <StatTile label="Floor used" value={`${smartNum(floorFootprint * 100)}%`} />
        <StatTile label="Payload used" value={`${smartNum(payloadUtil * 100)}%`} accent={payloadUtil > 0.8} />
        <StatTile label="Items" value={String(placed)} />
      </div>

      <Van3DViewer
        placements={placements}
        interior={result.van.interior}
        itemNames={names}
        editable
        onPlacementsChange={handlePlacementsChange}
        itemById={itemById}
      />

      {placed > 0 && (
        <details style={{ marginTop: spacing.md }}>
          <summary style={{ ...label, cursor: "pointer" }}>Placements ({placed})</summary>
          <div style={{ overflowX: "auto", marginTop: spacing.sm }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: font.xs }}>
              <thead>
                <tr>
                  {["#", "Item", "From rear (m)", "From left (m)", "From right (m)", "Height from floor (m)", "Size L×W×H (m)", "Weight (kg)", "Type"].map((h) => (
                    <th key={h} style={{ ...th, whiteSpace: "nowrap", padding: "5px 8px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {placements.map((p, i) => (
                  <tr key={i} style={{ background: p.fragile ? color.fragile.bg : "transparent" }}>
                    <td style={{ ...tdSm, color: color.muted }}>{i + 1}</td>
                    <td style={{ ...tdSm, fontWeight: 600 }}>{nameFor(p.itemId)}</td>
                    <td style={tdNum}>{smartNum(p.position.x / 1000)}</td>
                    <td style={tdNum}>{smartNum((result.van.interior.w - (p.position.y + p.size.y)) / 1000)}</td>
                    <td style={tdNum}>{smartNum(p.position.y / 1000)}</td>
                    <td style={tdNum}>{smartNum(p.position.z / 1000)}</td>
                    <td style={tdNum}>{smartNum(p.size.x / 1000)}×{smartNum(p.size.y / 1000)}×{smartNum(p.size.z / 1000)}</td>
                    <td style={tdNum}>{smartNum(p.weightKg)}</td>
                    <td style={{ ...tdSm, color: p.fragile ? color.fragile.fg : color.standard.fg, fontWeight: 600 }}>
                      {p.fragile ? "Fragile" : "Standard"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: font.xs, color: color.muted, marginTop: spacing.sm, marginBottom: 0 }}>
            All distances in metres. Numbers match the wall labels on the 3D view above &mdash; each is the gap from that interior wall to the item&apos;s nearest face, at floor level.
          </p>
        </details>
      )}
    </div>
  );
}

/* ── Shared styles ──────────────────────────────────────────────────────── */

const card: React.CSSProperties = {
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.card,
  padding: spacing.lg,
};

const label: React.CSSProperties = {
  margin: 0,
  fontSize: font.xs,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  color: color.muted,
};

function badge(kind: "ok" | "info" | "warn"): React.CSSProperties {
  const palette =
    kind === "ok"
      ? color.standard
      : kind === "info"
      ? { bg: color.accentMuted, fg: color.accent, border: color.accentBorder }
      : color.fragile;
  return {
    fontSize: font.xs,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: radius.badge,
    background: palette.bg,
    color: palette.fg,
    border: `1px solid ${palette.border}`,
  };
}

const th: React.CSSProperties = {
  padding: "6px 10px",
  textAlign: "left",
  background: color.surfaceSub,
  color: color.muted,
  fontWeight: 600,
  borderBottom: `1px solid ${color.border}`,
};

const td: React.CSSProperties = {
  padding: "6px 10px",
  color: color.text,
  borderBottom: `1px solid ${color.border}`,
};

const tdSm: React.CSSProperties = { padding: "5px 8px", color: color.text, borderBottom: `1px solid ${color.border}` };
const tdNum: React.CSSProperties = { ...tdSm, fontVariantNumeric: "tabular-nums" };

/* ── Sub-components ─────────────────────────────────────────────────────── */

function StatTile({ label: tileLabel, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? color.fragile.bg : color.surfaceSub,
      border: `1px solid ${accent ? color.fragile.border : color.border}`,
      borderRadius: radius.card - 4,
      padding: `${spacing.sm}px ${spacing.md}px`,
    }}>
      <div style={{ fontSize: font.xl - 4, fontWeight: 700, color: accent ? color.fragile.fg : color.text, lineHeight: 1.1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: font.xs, color: color.muted, marginTop: spacing.xs, fontWeight: 500 }}>
        {tileLabel}
      </div>
    </div>
  );
}
