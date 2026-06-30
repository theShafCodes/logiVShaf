"use client";

import { useMemo, useState } from "react";
import { color, font, radius, spacing } from "@/styles/tokens";
import { smartNum } from "@/lib/fmt";
import { VanIcon } from "@/components/results/VanIcon";
import { volumeM3 } from "@/lib/packing/geometry";
import { useVanSession } from "@/lib/hooks/use-van-session";
import type { Van } from "@/lib/packing/packing.types";

/**
 * Fleet cost explorer (admin / fleet-management sandbox). Lets an operator hand-pick
 * a set of vans ("bands") and instantly see what that fleet costs over a what-if
 * distance — cost = miles × Σ(perMileRate), fully deterministic, no routing call.
 *
 * Compare-only: it never changes a live quote. The "cheapest same-capacity" estimate
 * is a hint the operator can adopt ("Use this") or dismiss ("Back to mine").
 */

const MIN_MI = 1;
const MAX_MI = 200;

/** Available units of a van (allocator default of 5 when unset). */
function qtyOf(v: Van): number {
  return v.quantity ?? 5;
}

/** A picked fleet is a list of van ids (repeats allowed up to availability). */
type Fleet = string[];

function fleetCost(fleet: Fleet, byId: Map<string, Van>, miles: number) {
  let rate = 0;
  let fuel = 0;
  let volume = 0;
  let payload = 0;
  for (const id of fleet) {
    const v = byId.get(id);
    if (!v) continue;
    rate += v.perMileRate;
    fuel += v.fuelCostPerMile ?? 0;
    volume += volumeM3(v.interior);
    payload += v.maxPayloadKg;
  }
  return {
    base: rate * miles,
    fuel: fuel * miles,
    total: (rate + fuel) * miles,
    volume,
    payload,
  };
}

/**
 * Cheapest set of available vans whose interior volume AND payload at least match the
 * targets. Greedy by most volume-per-£ — an estimate to compare against, not the 3D
 * packer. Deterministic and bounded by total availability.
 */
function cheapestForCapacity(vans: Van[], targetVol: number, targetPayload: number): Fleet {
  if (targetVol <= 0 && targetPayload <= 0) return [];
  const avail = new Map(vans.map((v) => [v.id, qtyOf(v)]));
  // Most capacity per pound first.
  const ranked = [...vans].sort((a, b) => volumeM3(b.interior) / b.perMileRate - volumeM3(a.interior) / a.perMileRate);
  const picks: Fleet = [];
  let vol = 0;
  let pay = 0;
  let guard = 0;
  const cap = vans.reduce((n, v) => n + qtyOf(v), 0);
  while ((vol < targetVol - 1e-6 || pay < targetPayload - 1e-6) && guard++ < cap) {
    const pick = ranked.find((v) => (avail.get(v.id) ?? 0) > 0);
    if (!pick) break;
    avail.set(pick.id, (avail.get(pick.id) ?? 0) - 1);
    picks.push(pick.id);
    vol += volumeM3(pick.interior);
    pay += pick.maxPayloadKg;
  }
  return picks;
}

export function FleetCostExplorer() {
  const { vans, loadError, reload } = useVanSession();
  const [fleet, setFleet] = useState<Fleet>([]);
  const [miles, setMiles] = useState(50);
  // Holds the operator's own fleet while previewing the optimised one, so "Back to mine" can restore it.
  const [savedFleet, setSavedFleet] = useState<Fleet | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const byId = useMemo(() => new Map(vans.map((v) => [v.id, v])), [vans]);
  // Smallest → largest, so the icon row reads as a size ramp.
  const sorted = useMemo(
    () => [...vans].sort((a, b) => volumeM3(a.interior) - volumeM3(b.interior)),
    [vans],
  );
  const maxVol = useMemo(() => Math.max(1, ...vans.map((v) => volumeM3(v.interior))), [vans]);
  // Group by size band for the catalogue. Insertion order follows `sorted` (ascending
  // volume), so bands appear smallest-first with no hardcoded ordering.
  const bands = useMemo(() => {
    const m = new Map<string, Van[]>();
    for (const v of sorted) {
      const key = v.sizeClass ?? "Other";
      const arr = m.get(key) ?? [];
      arr.push(v);
      m.set(key, arr);
    }
    return [...m.entries()];
  }, [sorted]);

  // How many of each van are still free to add.
  const used = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of fleet) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [fleet]);
  const remaining = (v: Van) => qtyOf(v) - (used.get(v.id) ?? 0);

  const add = (v: Van) => {
    if (remaining(v) <= 0) return;
    setFleet((f) => [...f, v.id]);
    setSavedFleet(null);
  };
  const removeAt = (i: number) => {
    setFleet((f) => f.filter((_, j) => j !== i));
    setSavedFleet(null);
  };

  const cost = fleetCost(fleet, byId, miles);
  const optimised = useMemo(
    () => cheapestForCapacity(vans, cost.volume, cost.payload),
    [vans, cost.volume, cost.payload],
  );
  const optCost = fleetCost(optimised, byId, miles);
  const previewing = savedFleet !== null;
  // Only meaningful when the operator has built something and isn't already on the optimised set.
  const showCompare = fleet.length > 0 && !previewing && optimised.length > 0;
  const saving = showCompare ? cost.total - optCost.total : 0;

  const useOptimised = () => {
    setSavedFleet(fleet);
    setFleet(optimised);
  };
  const backToMine = () => {
    if (savedFleet) setFleet(savedFleet);
    setSavedFleet(null);
  };

  return (
    <div style={cardStyle}>
      <div>
        <p style={sectionLabel}>Fleet planner · what-if</p>
        <h3 style={{ margin: 0, fontSize: font.md, color: color.text, fontWeight: 700, letterSpacing: "-0.01em" }}>
          Cost planner
        </h3>
        <p style={{ margin: `${spacing.xs}px 0 0`, fontSize: font.xs, color: color.muted, lineHeight: 1.5 }}>
          Build a fleet from the vans in <strong>Fleet setup</strong> above, then slide the distance to compare cost. What-if only — your live quote is untouched.
        </p>
      </div>

      {/* ── Van catalogue: icons sized to capacity ── */}
      <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: spacing.md }}>
        <p style={miniLabel}>Available vans — grouped by size class, tap or drag to add</p>
        <div style={{ display: "flex", flexDirection: "column", gap: spacing.sm, maxHeight: 220, overflow: "auto", paddingRight: 2 }}>
          {bands.map(([cls, groupVans]) => (
            <div key={cls} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <p style={bandHeader}>
                {cls} <span style={{ color: color.muted, fontWeight: 500 }}>· {groupVans.length}</span>
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {groupVans.map((v) => {
                  const left = remaining(v);
                  // Icon width ramps with volume so the row reads as a true size ladder.
                  const iconPx = Math.round(26 + 26 * (volumeM3(v.interior) / maxVol)); // 26–52 px
                  return (
                    <button
                      key={v.id}
                      type="button"
                      draggable={left > 0}
                      onDragStart={(e) => e.dataTransfer.setData("text/van-id", v.id)}
                      onClick={() => add(v)}
                      disabled={left <= 0}
                      title={`${v.label} · ${v.interior.l.toFixed(2)}×${v.interior.w.toFixed(2)}×${v.interior.h.toFixed(2)} m · ${v.maxPayloadKg} kg · £${v.perMileRate.toFixed(2)}/mi · ${left} of ${qtyOf(v)} free`}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2,
                        padding: "6px 8px",
                        minWidth: 64,
                        border: `1px solid ${color.border}`,
                        borderRadius: radius.input,
                        background: left > 0 ? color.surfaceSub : "transparent",
                        color: color.text,
                        cursor: left > 0 ? "grab" : "not-allowed",
                        opacity: left > 0 ? 1 : 0.4,
                      }}
                    >
                      <span aria-hidden="true" style={{ display: "flex", alignItems: "flex-end", height: 30 }}>
                        <VanIcon lengthMm={v.interior.l} heightMm={v.interior.h} px={iconPx} />
                      </span>
                      <span style={{ fontSize: font.xs, fontWeight: 600, lineHeight: 1.1, textAlign: "center" }}>{v.label}</span>
                      <span style={{ fontSize: font.xs, color: color.muted }}>£{v.perMileRate.toFixed(2)}/mi · {left} left</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {vans.length === 0 && !loadError && <span style={{ fontSize: font.xs, color: color.muted }}>Loading fleet…</span>}
          {loadError && (
            <span style={{ fontSize: font.xs, color: color.error }}>
              Couldn’t load the fleet.{" "}
              <button type="button" onClick={reload} style={{ ...linkBtn, color: color.error, textDecoration: "underline" }}>Retry</button>
            </span>
          )}
        </div>
      </div>

      {/* ── Your fleet (drop target) ── */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const id = e.dataTransfer.getData("text/van-id");
          const v = byId.get(id);
          if (v) add(v);
        }}
        style={{
          borderTop: `1px solid ${color.border}`,
          paddingTop: spacing.md,
          marginTop: spacing.md,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <p style={miniLabel}>{previewing ? "Cheapest same-capacity fleet" : "Your fleet"}</p>
          {fleet.length > 0 && !previewing && (
            <button type="button" onClick={() => setFleet([])} style={linkBtn}>Clear</button>
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            minHeight: 44,
            padding: 6,
            borderRadius: radius.input,
            border: `1px dashed ${dragOver ? color.accent : color.border}`,
            background: dragOver ? color.accentMuted : "transparent",
          }}
        >
          {fleet.length === 0 && (
            <span style={{ fontSize: font.xs, color: color.muted, alignSelf: "center" }}>
              Drop vans here, or tap one above.
            </span>
          )}
          {fleet.map((id, i) => {
            const v = byId.get(id);
            if (!v) return null;
            return (
              <span key={`${id}-${i}`} style={chip}>
                {v.label}
                {!previewing && (
                  <button type="button" onClick={() => removeAt(i)} aria-label={`Remove ${v.label}`} style={chipX}>×</button>
                )}
              </span>
            );
          })}
        </div>
      </div>

      {/* ── Distance + cost ── */}
      {fleet.length > 0 && (
        <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: spacing.md, marginTop: spacing.md, display: "flex", flexDirection: "column", gap: spacing.sm }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ ...miniLabel, marginBottom: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label htmlFor="fce-distance">Distance (one-way)</label>
              {/* UX fix H7: precise numeric entry alongside the slider */}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <input
                  id="fce-distance"
                  type="number"
                  min={MIN_MI}
                  value={miles}
                  onChange={(e) => setMiles(Math.max(MIN_MI, Number(e.target.value) || MIN_MI))}
                  style={{ width: 60, padding: "3px 6px", borderRadius: radius.input, border: `1px solid ${color.border}`, background: color.surfaceSub, color: color.text, fontSize: font.xs, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                />
                <span style={{ color: color.muted }}>mi</span>
              </span>
            </span>
            <input
              type="range"
              aria-label="Distance in miles"
              min={MIN_MI}
              max={MAX_MI}
              value={Math.min(miles, MAX_MI)}
              onChange={(e) => setMiles(Number(e.target.value))}
              style={{ width: "100%", accentColor: color.accent }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: spacing.sm }}>
            <Stat label="Trip cost" value={`£${smartNum(cost.total)}`} big />
            <Stat label="Base + fuel /mi" value={`£${smartNum(cost.total / Math.max(1, miles))}`} />
            <Stat label="Volume" value={`${smartNum(cost.volume)} m³`} />
            <Stat label="Payload" value={`${smartNum(cost.payload)} kg`} />
          </div>
          <p style={{ margin: 0, fontSize: font.xs, color: color.muted }}>
            £{smartNum(cost.base)} distance + £{smartNum(cost.fuel)} fuel over {miles} mi.
          </p>

          {/* ── Compare against cheapest same-capacity fleet ── */}
          {showCompare && (
            <div style={{ background: color.surfaceSub, border: `1px solid ${color.border}`, borderRadius: radius.input, padding: spacing.sm }}>
              {saving > 0.01 ? (
                <p style={{ margin: 0, fontSize: font.xs, color: color.text }}>
                  A cheaper fleet with the same capacity costs <strong>£{smartNum(optCost.total)}</strong> — you could save{" "}
                  <strong style={{ color: color.success }}>£{smartNum(saving)}</strong> at {miles} mi.
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: font.xs, color: color.success }}>
                  ✓ Your fleet is already the cheapest for this capacity.
                </p>
              )}
              {saving > 0.01 && (
                <button type="button" onClick={useOptimised} style={{ ...linkBtn, marginTop: 4 }}>
                  Use cheapest →
                </button>
              )}
            </div>
          )}
          {previewing && (
            <button type="button" onClick={backToMine} style={linkBtn}>← Back to my fleet</button>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  return (
    <div style={{ background: color.surfaceSub, border: `1px solid ${color.border}`, borderRadius: radius.input, padding: `${spacing.xs + 2}px ${spacing.sm}px` }}>
      <div style={{ fontSize: big ? font.lg - 4 : font.md, fontWeight: 700, color: color.text, lineHeight: 1.1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: font.xs, color: color.muted, marginTop: 2, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.card,
  padding: spacing.lg,
  display: "flex",
  flexDirection: "column",
  gap: spacing.md,
};
const sectionLabel: React.CSSProperties = { fontSize: font.xs, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: color.muted, margin: "0 0 2px" };
const miniLabel: React.CSSProperties = { fontSize: font.xs, fontWeight: 600, color: color.muted, margin: `0 0 ${spacing.sm}px` };
const bandHeader: React.CSSProperties = { fontSize: font.xs, fontWeight: 700, color: color.text, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", position: "sticky", top: 0, background: color.surface, padding: "2px 0" };
const chip: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 4px 3px 10px", borderRadius: radius.badge, background: color.accentMuted, border: `1px solid ${color.accentBorder}`, color: color.text, fontSize: font.xs, fontWeight: 600 };
const chipX: React.CSSProperties = { border: "none", background: "transparent", color: color.muted, cursor: "pointer", fontSize: font.md, lineHeight: 1, padding: "0 4px" };
const linkBtn: React.CSSProperties = { border: "none", background: "transparent", color: color.accent, cursor: "pointer", fontSize: font.xs, fontWeight: 600, padding: 0, alignSelf: "flex-start" };
