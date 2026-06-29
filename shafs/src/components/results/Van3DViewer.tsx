"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import type { PackedItem, Placement, Vec3, VanDimensions } from "@/types/api";
import { resolveDrop, validatePlacement } from "@/lib/packing/placement-validator";
import { color, font, spacing } from "@/styles/tokens";

/* ── Scale helper ───────────────────────────────────────────────────────── */

// Three.js works in metres; source data is in mm.
const MM_TO_M = 0.001;
function mm(v: number) { return v * MM_TO_M; }

/* ── Theme (single source of truth = globals.css :root) ─────────────────────
 * Three.js materials need concrete color strings, not `var(--…)`, so we resolve
 * the design-system custom properties at runtime. SSR_THEME is a fallback for
 * server renders (Three.js can't run there) — values mirror globals.css :root. */

interface Theme {
  wire: string; grid: string;
  standardFill: string; standardEdge: string;
  fragileFill: string; fragileEdge: string;
  selected: string; validGhost: string; invalidGhost: string;
}

// SSR-safe defaults — exact copies of globals.css :root. Three.js is client-only
// so these are only used when window is undefined (initial server pass, no canvas).
const SSR_THEME: Readonly<Theme> = {
  wire:         "var(--color-muted)",
  grid:         "var(--color-border-strong)",
  standardFill: "var(--color-standard-bg)",
  standardEdge: "var(--color-standard-fg)",
  fragileFill:  "var(--color-fragile-bg)",
  fragileEdge:  "var(--color-fragile-fg)",
  selected:     "var(--color-accent)",
  validGhost:   "var(--color-status-done)",
  invalidGhost: "var(--color-error)",
};

function cssVar(name: string): string {
  if (typeof window === "undefined") return name; // pass the var name; SSR canvas is inert
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || name;
}

function readTheme(): Theme {
  if (typeof window === "undefined") return SSR_THEME;
  return {
    wire:         cssVar("--color-muted"),
    grid:         cssVar("--color-border-strong"),
    standardFill: cssVar("--color-standard-bg"),
    standardEdge: cssVar("--color-standard-fg"),
    fragileFill:  cssVar("--color-fragile-bg"),
    fragileEdge:  cssVar("--color-fragile-fg"),
    selected:     cssVar("--color-accent"),
    validGhost:   cssVar("--color-status-done"),
    invalidGhost: cssVar("--color-error"),
  };
}

/* ── Coordinate mapping (van mm ⇄ three.js metres, centred on the van) ─────── */

interface Frame { vanW: number; vanD: number; vanH: number; }

function frameFor(interior: VanDimensions): Frame {
  return { vanW: mm(interior.l), vanD: mm(interior.w), vanH: mm(interior.h) };
}

/** Three.js box edge lengths for a placement (van y maps to depth, van z to up). */
function threeSize(size: Vec3) {
  return { sx: mm(size.x), sy: mm(size.z), sz: mm(size.y) };
}

/** Centre of a placement in three.js world space. */
function threeCenter(p: Pick<Placement, "position" | "size">, f: Frame): [number, number, number] {
  const { sx, sy, sz } = threeSize(p.size);
  return [
    mm(p.position.x) + sx / 2 - f.vanW / 2,
    mm(p.position.z) + sy / 2 - f.vanH / 2,
    mm(p.position.y) + sz / 2 - f.vanD / 2,
  ];
}

/** Invert the floor-plane mapping: a world (x,z) hit → van (x,y) origin in mm. */
function worldToVanXY(worldX: number, worldZ: number, size: Vec3, f: Frame): { x: number; y: number } {
  const { sx, sz } = threeSize(size);
  return {
    x: Math.round((worldX + f.vanW / 2 - sx / 2) / MM_TO_M),
    y: Math.round((worldZ + f.vanD / 2 - sz / 2) / MM_TO_M),
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ── Item box ───────────────────────────────────────────────────────────── */

interface ItemBoxProps {
  placement: Placement;
  frame: Frame;
  theme: Theme;
  index: number;
  name?: string;
  selected: boolean;
  editable: boolean;
  onPointerDownBox?: (index: number, e: ThreeEvent<PointerEvent>) => void;
}

function ItemBox({ placement, frame, theme, index, name, selected, editable, onPointerDownBox }: ItemBoxProps) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);

  const { sx, sy, sz } = threeSize(placement.size);
  const [cx, cy, cz] = threeCenter(placement, frame);

  const fill = placement.fragile ? theme.fragileFill : theme.standardFill;
  const edge = selected ? theme.selected : placement.fragile ? theme.fragileEdge : theme.standardEdge;
  const label = String(index + 1);

  useFrame(() => {
    if (meshRef.current) meshRef.current.scale.setScalar(hovered || selected ? 1.03 : 1);
  });

  return (
    <group>
      <mesh
        ref={meshRef}
        position={[cx, cy, cz]}
        onPointerEnter={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={editable ? (e) => onPointerDownBox?.(index, e) : undefined}
      >
        <boxGeometry args={[sx, sy, sz]} />
        <meshStandardMaterial color={fill} transparent opacity={selected ? 0.92 : 0.82} />
      </mesh>
      <lineSegments position={[cx, cy, cz]}>
        <edgesGeometry args={[new THREE.BoxGeometry(sx, sy, sz)]} />
        <lineBasicMaterial color={edge} linewidth={selected ? 2 : 1} />
      </lineSegments>
      <Html position={[cx, cy + sy / 2 + 0.03, cz]} center>
        <div style={{
          background: placement.fragile ? theme.fragileEdge : theme.standardEdge,
          color: color.onAccent,
          borderRadius: "50%", width: 20, height: 20,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, pointerEvents: "none",
          boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
        }}>
          {label}
        </div>
      </Html>
      {hovered && !selected && (
        <Html position={[cx, cy + sy / 2 + 0.12, cz]} center>
          <div style={tooltip}>
            <strong>{label}. {name ?? `Item ${label}`}</strong>
            <br />
            {(placement.size.x/1000).toFixed(2)}×{(placement.size.y/1000).toFixed(2)}×{(placement.size.z/1000).toFixed(2)} m
            <br />
            {placement.weightKg} kg &nbsp;
            <span style={{ color: placement.fragile ? color.fragile.fg : color.standard.fg }}>
              {placement.fragile ? "Fragile" : "Standard"}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

/* ── Drag ghost + capture plane ─────────────────────────────────────────── */

interface Ghost {
  index: number;
  candidate: Placement;
  valid: boolean;
  reason?: string;
}

function GhostBox({ ghost, frame, theme }: { ghost: Ghost; frame: Frame; theme: Theme }) {
  const { sx, sy, sz } = threeSize(ghost.candidate.size);
  const [cx, cy, cz] = threeCenter(ghost.candidate, frame);
  const tint = ghost.valid ? theme.validGhost : theme.invalidGhost;
  const edge = ghost.candidate.fragile ? theme.fragileEdge : theme.standardEdge;
  const label = String(ghost.index + 1);
  return (
    <group>
      <mesh position={[cx, cy, cz]}>
        <boxGeometry args={[sx, sy, sz]} />
        <meshStandardMaterial color={tint} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <lineSegments position={[cx, cy, cz]}>
        <edgesGeometry args={[new THREE.BoxGeometry(sx, sy, sz)]} />
        <lineBasicMaterial color={edge} />
      </lineSegments>
      <Html position={[cx, cy + sy / 2 + 0.03, cz]} center>
        <div style={{
          background: ghost.candidate.fragile ? theme.fragileEdge : theme.standardEdge,
          color: color.onAccent,
          borderRadius: "50%", width: 20, height: 20,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, pointerEvents: "none",
          boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
          opacity: 0.85,
        }}>
          {label}
        </div>
      </Html>
      {!ghost.valid && ghost.reason && (
        <Html position={[cx, cy + sy / 2 + 0.14, cz]} center>
          <div style={{ ...tooltip, borderColor: theme.invalidGhost, color: color.error }}>{ghost.reason}</div>
        </Html>
      )}
    </group>
  );
}

/* ── Scene ───────────────────────────────────────────────────────────────── */

/* ── Camera capture — exposes camera ref outside Canvas ─────────────────── */

function CameraCapture({ cameraRef }: { cameraRef: React.MutableRefObject<THREE.Camera | null> }) {
  const { camera } = useThree();
  useEffect(() => { cameraRef.current = camera; }, [camera, cameraRef]);
  return null;
}

interface SceneProps {
  placements: Placement[];
  interior: VanDimensions;
  itemNames?: string[];
  theme: Theme;
  editable: boolean;
  onPlacementsChange?: (next: Placement[]) => void;
  cameraRef: React.MutableRefObject<THREE.Camera | null>;
}

function Scene({ placements, interior, itemNames, theme, editable, onPlacementsChange, cameraRef }: SceneProps) {
  const f = frameFor(interior);
  const [selected, setSelected] = useState<number | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  // Pointer offset (world x,z) between the grab point and the box centre, so the
  // box doesn't jump under the cursor when the drag starts.
  const grab = useRef<{ index: number; dx: number; dz: number } | null>(null);

  const dragging = ghost !== null;

  const beginDrag = (index: number, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setSelected(index);
    const [cx, , cz] = threeCenter(placements[index]!, f);
    grab.current = { index, dx: cx - e.point.x, dz: cz - e.point.z };
    setGhost({ index, candidate: placements[index]!, valid: true });
  };

  const updateDrag = (e: ThreeEvent<PointerEvent>) => {
    const g = grab.current;
    if (g === null) return;
    e.stopPropagation();
    const moving = placements[g.index]!;
    const others = placements.filter((_, i) => i !== g.index);

    const worldX = e.point.x + g.dx;
    const worldZ = e.point.z + g.dz;
    let { x, y } = worldToVanXY(worldX, worldZ, moving.size, f);
    x = clamp(x, 0, Math.round(interior.l - moving.size.x));
    y = clamp(y, 0, Math.round(interior.w - moving.size.y));
    // Settle onto whatever is under the footprint, snapping x/y so the box rests
    // fully on its support — otherwise hand-positioned stacks never align and the
    // support check rejects them.
    const drop = resolveDrop(x, y, moving.size, others);
    const z = drop.z;

    const candidate: Placement = { ...moving, position: drop };
    // Policy: a non-stackable item may only rest on the floor.
    let verdict = validatePlacement(
      {
        position: candidate.position,
        size: candidate.size,
        weightKg: candidate.weightKg,
        fragile: candidate.fragile,
      },
      { others, interior, toleranceMm: 5 },
    );
    if (verdict.ok && z > 0 && !moving.stackable) {
      verdict = { ok: false, reason: "this item cannot be stacked" };
    }
    setGhost({ index: g.index, candidate, valid: verdict.ok, reason: verdict.reason });
  };

  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    const g = grab.current;
    grab.current = null;
    if (g === null || ghost === null) { setGhost(null); return; }
    e.stopPropagation();
    if (ghost.valid) {
      const next = placements.map((p, i) => (i === g.index ? ghost.candidate : p));
      onPlacementsChange?.(next);
    }
    setGhost(null); // invalid ⇒ snaps back (original placements untouched)
  };

  return (
    <>
      <CameraCapture cameraRef={cameraRef} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} />
      <VanWireframe interior={interior} theme={theme} />
      <WallLabels interior={interior} theme={theme} />

      {placements.map((p, i) =>
        dragging && ghost!.index === i ? null : (
          <ItemBox
            key={i}
            placement={p}
            frame={f}
            theme={theme}
            index={i}
            name={itemNames?.[i]}
            selected={selected === i}
            editable={editable}
            onPointerDownBox={beginDrag}
          />
        ),
      )}

      {ghost && <GhostBox ghost={ghost} frame={f} theme={theme} />}

      {/* Invisible capture plane — only active mid-drag so it never blocks orbit. */}
      {dragging && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
          onPointerMove={updateDrag}
          onPointerUp={endDrag}
        >
          <planeGeometry args={[1000, 1000]} />
          <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
        </mesh>
      )}

      <gridHelper args={[mm(interior.l), 6, theme.grid, theme.grid]} position={[0, -f.vanH / 2, 0]} />
      <OrbitControls enableDamping dampingFactor={0.1} enabled={!dragging} makeDefault />
    </>
  );
}

/* ── Wall labels (rotation-aware: shows max 2 most-visible faces) ─────────── */

// The y=0 (van origin) wall sits at three.js -z; in the default loader view that
// wall reads on the RIGHT, so it carries the "Right" label and y=w carries "Left".
const WALL_DEFS = [
  { name: "Rear",  normal: new THREE.Vector3(-1, 0,  0), priority: 2 },
  { name: "Right", normal: new THREE.Vector3( 0, 0, -1), priority: 1 },
  { name: "Left",  normal: new THREE.Vector3( 0, 0,  1), priority: 0 },
  { name: "Top",   normal: new THREE.Vector3( 0, 1,  0), priority: 0 },
] as const;

function wallCenter(name: string, f: Frame): THREE.Vector3 {
  if (name === "Rear")  return new THREE.Vector3(-f.vanW / 2, f.vanH * 0.1, 0);
  if (name === "Right") return new THREE.Vector3(0, f.vanH * 0.1, -f.vanD / 2);
  if (name === "Left")  return new THREE.Vector3(0, f.vanH * 0.1,  f.vanD / 2);
  return new THREE.Vector3(0, f.vanH / 2, 0); // Top
}

function wallLabelPos(name: string, f: Frame): [number, number, number] {
  const c = wallCenter(name, f);
  return [c.x, c.y, c.z];
}

function WallLabels({ interior, theme }: { interior: VanDimensions; theme: Theme }) {
  const f = frameFor(interior);
  const { camera } = useThree();
  const [visible, setVisible] = useState<Set<string>>(new Set());

  useFrame(() => {
    const scored = WALL_DEFS.map((w) => ({
      name: w.name,
      dot: camera.position.clone().sub(wallCenter(w.name, f)).normalize().dot(w.normal),
      priority: w.priority,
    }));
    const top2 = new Set(
      scored
        .filter((s) => s.dot > 0.25)
        .sort((a, b) => b.priority - a.priority || b.dot - a.dot)
        .slice(0, 2)
        .map((s) => s.name),
    );
    setVisible(top2);
  });

  return (
    <>
      {WALL_DEFS.map((w) =>
        visible.has(w.name) ? (
          <Html key={w.name} position={wallLabelPos(w.name, f)} center>
            <span
              style={{
                opacity: 0.28,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: theme.wire,
                textTransform: "uppercase",
                pointerEvents: "none",
                userSelect: "none",
                whiteSpace: "nowrap",
              }}
            >
              {w.name}
            </span>
          </Html>
        ) : null,
      )}
    </>
  );
}

/* ── Van wireframe ──────────────────────────────────────────────────────── */

function VanWireframe({ interior, theme }: { interior: VanDimensions; theme: Theme }) {
  const f = frameFor(interior);
  return (
    <lineSegments>
      <edgesGeometry args={[new THREE.BoxGeometry(f.vanW, f.vanH, f.vanD)]} />
      <lineBasicMaterial color={theme.wire} />
    </lineSegments>
  );
}

/* ── Legend ─────────────────────────────────────────────────────────────── */

function Legend({ theme, editable }: { theme: Theme; editable: boolean }) {
  return (
    <div style={{ display: "flex", gap: spacing.md, marginTop: spacing.xs, alignItems: "center", flexWrap: "wrap" }}>
      <LegendSwatch fill={theme.standardFill} edge={theme.standardEdge} label="Standard" />
      <LegendSwatch fill={theme.fragileFill} edge={theme.fragileEdge} label="Fragile" />
      <span style={{ fontSize: font.xs, color: color.muted, marginLeft: "auto" }}>
        {editable
          ? "Click to select · Drag item to move · Orbit empty space · Scroll to zoom"
          : "Drag to rotate · Scroll to zoom"}
      </span>
    </div>
  );
}

function LegendSwatch({ fill, edge, label }: { fill: string; edge: string; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: font.xs, color: color.muted }}>
      <span style={{ width: 12, height: 12, background: fill, border: `1px solid ${edge}`, borderRadius: 2, display: "inline-block" }} />
      {label}
    </span>
  );
}

/* ── Screenshot helper — lives inside Canvas so it can access the GL renderer ── */

function ScreenshotHelper({ captureRef }: { captureRef: React.MutableRefObject<(() => void) | null> }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    captureRef.current = () => {
      gl.render(scene, camera);
      const url = gl.domElement.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = "van-load-plan.png";
      a.click();
    };
    return () => { captureRef.current = null; };
  }, [gl, scene, camera, captureRef]);
  return null;
}

/* ── Public component ───────────────────────────────────────────────────── */

export interface Van3DViewerProps {
  placements: Placement[];
  interior: VanDimensions;
  /** Per-placement item names (index-aligned with `placements`) for tooltips. */
  itemNames?: string[];
  heightPx?: number;
  /** Enable click-to-select + constraint-checked drag refinement. */
  editable?: boolean;
  /** Called with the updated placements after a valid drag commits. */
  onPlacementsChange?: (next: Placement[]) => void;
  /** Item lookup map — enables dropping unplaced items from the sidebar into this viewer. */
  itemById?: Map<string, PackedItem>;
}

export function Van3DViewer({
  placements,
  interior,
  itemNames,
  heightPx = 480,
  editable = false,
  onPlacementsChange,
  itemById,
}: Van3DViewerProps) {
  const captureRef = useRef<(() => void) | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const canvasDivRef = useRef<HTMLDivElement>(null);
  const theme = useMemo(readTheme, []);

  const diag = Math.sqrt(mm(interior.l) ** 2 + mm(interior.w) ** 2 + mm(interior.h) ** 2);
  const camZ = diag * 1.5;

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!itemById) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!itemById) return;
    const raw = e.dataTransfer.getData("application/van-item");
    if (!raw) return;

    let item: PackedItem;
    try { item = JSON.parse(raw); } catch { return; }
    if (!item.dimensions) return;

    const cam = cameraRef.current;
    const div = canvasDivRef.current;
    if (!cam || !div) return;

    const rect = div.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const f = frameFor(interior);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), cam);

    // Floor plane: y = -vanH/2 → THREE.Plane normal=(0,1,0), constant=vanH/2
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), f.vanH / 2);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(floorPlane, hit)) return;

    // Natural orientation: l→x, w→y, h→z
    const size: Vec3 = { x: item.dimensions.l, y: item.dimensions.w, z: item.dimensions.h };

    let { x, y } = worldToVanXY(hit.x, hit.z, size, f);
    x = clamp(x, 0, Math.round(interior.l - size.x));
    y = clamp(y, 0, Math.round(interior.w - size.y));

    const drop = resolveDrop(x, y, size, placements);

    const newPlacement: Placement = {
      itemId: item.id,
      position: drop,
      size,
      fragile: item.fragility === "fragile",
      weightKg: item.weightKg,
      canSupportWeightKg: item.canSupportWeightKg,
      stackable: item.stackable,
      maxStackPressureKpa: item.maxStackPressureKpa,
    };

    const verdict = validatePlacement(
      { position: newPlacement.position, size, weightKg: item.weightKg, fragile: newPlacement.fragile },
      { others: placements, interior, toleranceMm: 5 },
    );

    if (verdict.ok) {
      onPlacementsChange?.([...placements, newPlacement]);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => captureRef.current?.()}
          style={{
            border: `1px solid ${color.border}`,
            background: color.surfaceSub,
            color: color.text,
            borderRadius: 999,
            padding: "6px 10px",
            fontSize: font.xs,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Export PNG
        </button>
      </div>
      <div
        ref={canvasDivRef}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{ width: "100%", height: heightPx, borderRadius: 8, overflow: "hidden", background: color.surfaceSub, border: `1px solid ${color.border}` }}
      >
        {/* Camera sits behind the REAR doors (-x) looking toward the cab — the
            loader's natural view, so "Left"/"Right" wall labels match screen
            left/right instead of mirroring. */}
        <Canvas camera={{ position: [-camZ * 0.6, camZ * 0.5, camZ], fov: 45 }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
          <ScreenshotHelper captureRef={captureRef} />
          <Scene
            placements={placements}
            interior={interior}
            itemNames={itemNames}
            theme={theme}
            editable={editable}
            onPlacementsChange={onPlacementsChange}
            cameraRef={cameraRef}
          />
        </Canvas>
      </div>
      <Legend theme={theme} editable={editable} />
    </div>
  );
}

/* ── Shared styles ──────────────────────────────────────────────────────── */

const tooltip: React.CSSProperties = {
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: font.xs,
  color: color.text,
  whiteSpace: "nowrap",
  pointerEvents: "none",
  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
};
