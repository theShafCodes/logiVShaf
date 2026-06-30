"use client";

import { useEffect, useState } from "react";
import { color, font, spacing, radius } from "@/styles/tokens";
import { smartNum } from "@/lib/fmt";
import { Van3DViewer } from "@/components/results/Van3DViewer";
import { VanIcon } from "@/components/results/VanIcon";
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

  // Placements are lifted out of the per-van cards so only ONE van renders its
  // (expensive) 3D canvas at a time while manual edits to the others survive a
  // switch. Re-sync only when the packer actually produces new placements — a
  // signature over item ids + positions, so an unrelated parent re-render or a
  // manual drag here never clobbers in-progress edits.
  const packerSig = fleet
    .map((r) => r.placements.map((p) => `${p.itemId}@${p.position.x},${p.position.y},${p.position.z}`).join(","))
    .join("|");
  const [placementsByVan, setPlacementsByVan] = useState<Placement[][]>(() => fleet.map((r) => [...r.placements]));
  useEffect(() => {
    setPlacementsByVan(fleet.map((r) => [...r.placements]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packerSig]);

  // Which van is maximised in the focus viewer.
  const [focused, setFocused] = useState(0);
  useEffect(() => {
    if (focused > fleet.length - 1) setFocused(0);
  }, [fleet.length, focused]);

  const onVanPlacements = (vanIndex: number, next: Placement[]) => {
    const current = placementsByVan[vanIndex] ?? [];
    const curIds = new Set(current.map((p) => p.itemId));
    next.filter((p) => !curIds.has(p.itemId)).forEach((p) => onItemPlaced(p.itemId));
    setPlacementsByVan((prev) => prev.map((arr, i) => (i === vanIndex ? next : arr)));
  };

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

      {/* Per-van detail — a gallery: pick a van from the strip, study it in the
          big focus viewer. Only the focused van mounts a 3D canvas, so a 25-van
          fleet stays light instead of stacking 25 WebGL scenes down the page. */}
      {fleet.length > 1 && (
        <VanStrip
          fleet={fleet}
          placementsByVan={placementsByVan}
          focused={focused}
          onPick={setFocused}
        />
      )}
      {fleet[focused] && (
        <VanCard
          key={focused}
          index={focused}
          total={fleet.length}
          result={fleet[focused]}
          placements={placementsByVan[focused] ?? fleet[focused].placements}
          onPlacementsChange={(next) => onVanPlacements(focused, next)}
          onPrev={fleet.length > 1 ? () => setFocused((i) => (i - 1 + fleet.length) % fleet.length) : undefined}
          onNext={fleet.length > 1 ? () => setFocused((i) => (i + 1) % fleet.length) : undefined}
          nameFor={nameFor}
          itemById={itemById}
        />
      )}

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

/* ── Van strip — collapsed thumbnails, one per van, click to maximise ─────── */

function VanStrip({
  fleet, placementsByVan, focused, onPick,
}: {
  fleet: PackingResult[];
  placementsByVan: Placement[][];
  focused: number;
  onPick: (i: number) => void;
}) {
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: spacing.sm }}>
        <p style={{ ...label, margin: 0 }}>Fleet — {fleet.length} vans</p>
        <span style={{ fontSize: font.xs, color: color.muted }}>Tap a van to inspect its load</span>
      </div>
      <div style={{ display: "flex", gap: spacing.sm, overflowX: "auto", paddingBottom: spacing.xs }}>
        {fleet.map((r, i) => {
          const isOn = i === focused;
          const placed = (placementsByVan[i] ?? r.placements).length;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(i)}
              title={`Van ${i + 1} — ${r.van.label}`}
              style={{
                flex: "0 0 auto",
                width: 104,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: spacing.sm,
                borderRadius: radius.card - 4,
                cursor: "pointer",
                background: isOn ? color.accentMuted : color.surfaceSub,
                border: `1px solid ${isOn ? color.accent : color.border}`,
              }}
            >
              <span style={{ display: "flex", alignItems: "flex-end", height: 34 }}>
                <VanIcon lengthMm={r.van.interior.l} heightMm={r.van.interior.h} px={52} />
              </span>
              <span style={{ fontSize: font.xs, fontWeight: 700, color: color.text }}>Van {i + 1}</span>
              <span style={{ fontSize: font.xs, color: color.muted, whiteSpace: "nowrap" }}>
                {placed} item{placed !== 1 ? "s" : ""} · {smartNum(r.utilization * 100)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Per-van card (the maximised focus view) ─────────────────────────────── */

function VanCard({
  index, total, result, placements, onPlacementsChange, onPrev, onNext, nameFor, itemById,
}: {
  index: number;
  total: number;
  result: PackingResult;
  placements: Placement[];
  onPlacementsChange: (next: Placement[]) => void;
  onPrev?: () => void;
  onNext?: () => void;
  nameFor: (id: string) => string;
  itemById: Map<string, PackedItem>;
}) {
  const placed = placements.length;
  const totalWeight = placements.reduce((s, p) => s + p.weightKg, 0);
  const payloadUtil = totalWeight / result.van.maxPayloadKg;
  const names = placements.map((p) => nameFor(p.itemId));
  const { volumeFill, floorFootprint } = computeUtilization(placements, result.van.interior);

  const isModified = placements.length !== result.placements.length ||
    placements.some((p, i) => {
      const orig = result.placements[i];
      return !orig || p.position.x !== orig.position.x || p.position.y !== orig.position.y || p.position.z !== orig.position.z;
    });

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm, flexWrap: "wrap", gap: spacing.sm }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: spacing.sm, flexWrap: "wrap" }}>
          <p style={{ ...label, margin: 0 }}>Van {index + 1}{total > 1 ? ` of ${total}` : ""}</p>
          <span style={{ fontSize: font.md ?? font.sm, fontWeight: 600, color: color.text }}>{result.van.label}</span>
          <span style={{ fontSize: font.sm, color: color.muted }}>
            {describeVan(result.van.interior, result.van.maxPayloadKg)}
          </span>
        </div>
        <div style={{ display: "flex", gap: spacing.xs, alignItems: "center" }}>
          {isModified && (
            <button
              type="button"
              onClick={() => onPlacementsChange([...result.placements])}
              title="Restore the computer-suggested layout"
              style={{ ...navBtn, borderColor: color.accent, color: color.accent }}
            >
              Reset layout
            </button>
          )}
          {(onPrev || onNext) && (
            <>
              <button type="button" onClick={onPrev} aria-label="Previous van" style={navBtn}>‹ Prev</button>
              <button type="button" onClick={onNext} aria-label="Next van" style={navBtn}>Next ›</button>
            </>
          )}
        </div>
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
        onPlacementsChange={onPlacementsChange}
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
                    <td style={tdNum}>{smartNum(p.position.x)}</td>
                    <td style={tdNum}>{smartNum(result.van.interior.w - (p.position.y + p.size.y))}</td>
                    <td style={tdNum}>{smartNum(p.position.y)}</td>
                    <td style={tdNum}>{smartNum(p.position.z)}</td>
                    <td style={tdNum}>{smartNum(p.size.x)}×{smartNum(p.size.y)}×{smartNum(p.size.z)}</td>
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

const navBtn: React.CSSProperties = {
  border: `1px solid ${color.border}`,
  background: color.surfaceSub,
  color: color.text,
  borderRadius: 999,
  padding: "4px 12px",
  fontSize: font.xs,
  fontWeight: 600,
  cursor: "pointer",
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
