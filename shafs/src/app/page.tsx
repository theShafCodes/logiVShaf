"use client";

import { useMemo, useState } from "react";
import { DropZone } from "@/components/upload/DropZone";
import { PerfPanel } from "@/components/results/PerfPanel";
import { ClassificationSummary } from "@/components/results/ClassificationSummary";
import { ResultTables } from "@/components/results/ResultTables";
import { PackingResultPanel } from "@/components/results/PackingResultPanel";
import { QuotePanel } from "@/components/results/QuotePanel";
import { AppHeader } from "@/components/layout/AppHeader";
import { VanConfigPanel } from "@/components/admin/VanConfigPanel";
import { QuotationHistory } from "@/components/results/QuotationHistory";
import { PlacesInput } from "@/components/PlacesInput";
import { color, font, spacing, radius, buttonPrimary, buttonSecondary, card } from "@/styles/tokens";
import type { ClassifiedItem, Fragility, IngestResponse, PackResponse, PageContent, QuoteResponse } from "@/types/api";

function itemKey(p: number, t: number, r: number) {
  return `${p}-${t}-${r}`;
}

function applyOverrides(items: ClassifiedItem[], overrides: Map<string, Fragility>): ClassifiedItem[] {
  return items.map((it) => {
    const key = itemKey(it.pageIndex, it.tableIndex, it.rowIndex);
    const val = overrides.get(key);
    if (val == null) return it;
    return { ...it, fragility: val, confident: val !== "uncertain", matchedTerm: null, reason: val === "uncertain" ? "manual — uncertain" : "manual override" };
  });
}

function buildClassMap(items: ClassifiedItem[], overrides: Map<string, Fragility>): Map<string, ClassifiedItem> {
  const m = new Map<string, ClassifiedItem>();
  for (const it of applyOverrides(items, overrides)) {
    m.set(itemKey(it.pageIndex, it.tableIndex, it.rowIndex), it);
  }
  return m;
}

function buildClassification(
  base: NonNullable<IngestResponse["classification"]>,
  items: ClassifiedItem[],
  overrides: Map<string, Fragility>,
) {
  const built = applyOverrides(items, overrides);
  return {
    ...base,
    items: built,
    counts: {
      fragile: built.filter((i) => i.fragility === "fragile").length,
      standard: built.filter((i) => i.fragility !== "fragile").length,
      lowConfidence: built.filter((i) => !i.confident).length,
    },
  };
}

/** Deep-copy a page so draft edits never mutate committed state. */
function clonePage(page: PageContent): PageContent {
  return {
    ...page,
    tables: page.tables.map((t) => ({ ...t, rows: t.rows.map((r) => [...r]) })),
  };
}

type Status = "idle" | "processing" | "done" | "error";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientMs, setClientMs] = useState<number | null>(null);
  const [pages, setPages] = useState<PageContent[]>([]);
  const [manualOverrides, setManualOverrides] = useState<Map<string, Fragility>>(new Map());
  const [extraItems, setExtraItems] = useState<ClassifiedItem[]>([]);

  // Staged edit mode — drafts are committed only on Save.
  const [editing, setEditing] = useState(false);
  const [draftPages, setDraftPages] = useState<PageContent[]>([]);
  const [draftOverrides, setDraftOverrides] = useState<Map<string, Fragility>>(new Map());
  const [draftExtraItems, setDraftExtraItems] = useState<ClassifiedItem[]>([]);

  // Stage 3 — packing
  const [packResult, setPackResult] = useState<PackResponse | null>(null);
  const [packing, setPacking] = useState(false);

  // Stage 5 — quote
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  // True only once the value was picked from the suggestion list — free-typed text stays false.
  const [originSelected, setOriginSelected] = useState(false);
  const [destinationSelected, setDestinationSelected] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [quoteResult, setQuoteResult] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  const serverItems = useMemo(() => result?.classification?.items ?? [], [result]);

  // What the table renders — draft sources while editing, committed otherwise.
  const viewPages = editing ? draftPages : pages.length ? pages : result?.document?.pages ?? [];
  const viewExtraItems = editing ? draftExtraItems : extraItems;
  const viewOverrides = editing ? draftOverrides : manualOverrides;

  const classMap = useMemo(
    () => buildClassMap([...serverItems, ...viewExtraItems], viewOverrides),
    [serverItems, viewExtraItems, viewOverrides],
  );

  // Committed classification — feeds packing on Save and the item count.
  const classification = useMemo(
    () =>
      result?.classification
        ? buildClassification(result.classification, [...serverItems, ...extraItems], manualOverrides)
        : null,
    [result, serverItems, extraItems, manualOverrides],
  );

  const status: Status = loading || packing
    ? "processing"
    : error
    ? "error"
    : result
    ? "done"
    : "idle";

  const runIngest = async (f: File) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setClientMs(null);
    setPackResult(null);
    setQuoteResult(null);
    setQuoteError(null);
    const startedAt = performance.now();
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch("/api/ingest", { method: "POST", body: form });
      const data: IngestResponse = await res.json();
      setClientMs(Math.round((performance.now() - startedAt) * 100) / 100);
      if (data.success) {
        setResult(data);
        setPages(data.document?.pages ?? []);
        setManualOverrides(new Map());
        setExtraItems([]);
        setEditing(false);
        void runPack(data);
      } else {
        setError(data.error ?? "Ingestion failed.");
      }
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const runPack = async (ingest: IngestResponse) => {
    if (!ingest.document || !ingest.classification) return;
    setPacking(true);
    setPackResult(null);
    try {
      const res = await fetch("/api/pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: ingest.document, classification: ingest.classification }),
      });
      const data: PackResponse = await res.json();
      if (data.success) setPackResult(data);
    } catch {
      // packing failure is non-blocking — quote form stays hidden
    } finally {
      setPacking(false);
    }
  };

  const rerunPack = async (nextPages: PageContent[], nextClassification: NonNullable<typeof classification>) => {
    if (!result?.document) return;
    await runPack({
      ...result,
      document: { ...result.document, pages: nextPages },
      classification: nextClassification,
    });
  };

  // ── Staged editing — all mutations target draft state; nothing re-packs until Save ──
  const enterEdit = () => {
    setDraftPages((pages.length ? pages : result?.document?.pages ?? []).map(clonePage));
    setDraftOverrides(new Map(manualOverrides));
    setDraftExtraItems(extraItems.map((it) => ({ ...it })));
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = () => {
    setPages(draftPages);
    setManualOverrides(draftOverrides);
    setExtraItems(draftExtraItems);
    setEditing(false);
    if (result?.classification) {
      const merged = buildClassification(
        result.classification,
        [...(result.classification.items ?? []), ...draftExtraItems],
        draftOverrides,
      );
      void rerunPack(draftPages, merged);
    }
  };

  const updateCell = (pageIndex: number, tableIndex: number, rowIndex: number, colIndex: number, value: string) => {
    setDraftPages((prev) =>
      prev.map((page) =>
        page.index !== pageIndex
          ? page
          : {
              ...page,
              tables: page.tables.map((table) =>
                table.index !== tableIndex
                  ? table
                  : {
                      ...table,
                      rows: table.rows.map((row, r) =>
                        r !== rowIndex ? row : row.map((cell, c) => (c === colIndex ? value : cell)),
                      ),
                    },
              ),
            },
      ),
    );
  };

  const setFragility = (pageIndex: number, tableIndex: number, rowIndex: number, value: Fragility) => {
    const key = itemKey(pageIndex, tableIndex, rowIndex);
    const autoFragility: Fragility = serverItems.find(
      (it) => it.pageIndex === pageIndex && it.tableIndex === tableIndex && it.rowIndex === rowIndex,
    )?.fragility ?? "standard";
    const update = (prev: Map<string, Fragility>): Map<string, Fragility> => {
      const next = new Map(prev);
      if (value === autoFragility) next.delete(key);
      else next.set(key, value);
      return next;
    };
    if (editing) {
      setDraftOverrides(update);
    } else {
      const nextOverrides = update(manualOverrides);
      setManualOverrides(nextOverrides);
      if (result?.classification) {
        const merged = buildClassification(result.classification, [...serverItems, ...extraItems], nextOverrides);
        void rerunPack(pages.length ? pages : result.document?.pages ?? [], merged);
      }
    }
  };

  const addRow = (pageIndex: number, tableIndex: number) => {
    const table = draftPages.find((p) => p.index === pageIndex)?.tables.find((t) => t.index === tableIndex);
    if (!table) return;
    const newRowIndex = table.rows.length;
    const blankRow = Array<string>(table.headers.length).fill("");
    setDraftPages((prev) =>
      prev.map((page) =>
        page.index !== pageIndex
          ? page
          : {
              ...page,
              tables: page.tables.map((t) =>
                t.index !== tableIndex ? t : { ...t, rows: [...t.rows, blankRow] },
              ),
            },
      ),
    );
    setDraftExtraItems((prev) => [
      ...prev,
      {
        pageIndex,
        tableIndex,
        rowIndex: newRowIndex,
        label: "",
        fragility: "standard",
        confident: false,
        matchedTerm: null,
        reason: "manual entry",
      },
    ]);
  };

  const runQuote = async () => {
    if (!packResult?.selected || !originSelected || !destinationSelected) return;
    const fleet = packResult.fleet?.length ? packResult.fleet : [packResult.selected];
    const vanIds = fleet.map((r) => r.van.id);
    if (vanIds.length === 0) return;
    const vanPayloads = fleet.map((r) => r.placements.reduce((s, p) => s + p.weightKg, 0));
    setQuoting(true);
    setQuoteResult(null);
    setQuoteError(null);
    // Fragility surcharge is per fragile unit across the WHOLE fleet, not one van.
    const fragileCount = fleet.reduce(
      (n, r) => n + r.placements.filter((p) => p.fragile).length,
      0,
    );
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vanIds,
          origin: origin.trim(),
          destination: destination.trim(),
          fragileCount,
          vanPayloads,
        }),
      });
      const data: QuoteResponse = await res.json();
      if (data.success) setQuoteResult(data);
      else setQuoteError(data.error ?? "Quote failed.");
    } catch {
      setQuoteError("Network error — could not reach the server.");
    } finally {
      setQuoting(false);
    }
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setResult(null);
    setError(null);
    setPackResult(null);
    setQuoteResult(null);
    setQuoteError(null);
    setOrigin("");
    setDestination("");
    setOriginSelected(false);
    setDestinationSelected(false);
    setExtraItems([]);
    setEditing(false);
    setFile(f);
    if (f) void runIngest(f);
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setClientMs(null);
    setPages([]);
    setManualOverrides(new Map());
    setExtraItems([]);
    setEditing(false);
    setDraftPages([]);
    setDraftOverrides(new Map());
    setDraftExtraItems([]);
    setPackResult(null);
    setOrigin("");
    setDestination("");
    setOriginSelected(false);
    setDestinationSelected(false);
    setQuoteResult(null);
    setQuoteError(null);
  };

  const itemCount = classification?.items.length ?? 0;

  return (
    <>
      <AppHeader status={status} filename={file?.name} />

      <div
        className="page-grid"
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: `${spacing.xl}px ${spacing.xl}px`,
        }}
      >
        {/* ── Left sidebar ──────────────────────────────────────────── */}
        <aside
          className="sidebar-sticky"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: spacing.md,
            position: "sticky",
            top: 56 + spacing.xl,
          }}
        >
          {/* Upload card */}
          <div
            style={{
              background: color.surface,
              border: `1px solid ${color.border}`,
              borderRadius: radius.card,
              padding: spacing.lg,
              boxShadow: color.shadow,
              display: "flex",
              flexDirection: "column",
              gap: spacing.md,
            }}
          >
            <div>
              <p
                style={{
                  fontSize: font.xs,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  color: color.muted,
                  margin: 0,
                  marginBottom: spacing.xs,
                }}
              >
                Upload
              </p>
              <h1
                style={{
                  fontSize: font.lg,
                  fontWeight: 700,
                  margin: 0,
                  color: color.text,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.2,
                }}
              >
                PDF Ingestion
              </h1>
              <p
                style={{
                  fontSize: font.sm,
                  color: color.muted,
                  marginTop: spacing.xs,
                  marginBottom: 0,
                  lineHeight: 1.5,
                }}
              >
                Upload a quotation or cargo PDF to classify items automatically.
              </p>
            </div>

            <DropZone
              loading={loading}
              hasFile={file !== null}
              filename={file?.name}
              error={error}
              onSelect={handleSelect}
              onRerun={() => file && void runIngest(file)}
            />

            {(result || error) && !loading && (
              <button
                type="button"
                onClick={handleReset}
                style={{
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  borderRadius: radius.card - 4,
                  border: `1px solid ${color.border}`,
                  background: color.surfaceSub,
                  color: color.muted,
                  fontSize: font.sm,
                  fontWeight: 500,
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                Start Over / New Quote
              </button>
            )}
          </div>

          <VanConfigPanel />

          <QuotationHistory />

          {/* Stats card — visible when results are available */}
          {classification && result && (
            <div
              style={{
                background: color.surface,
                border: `1px solid ${color.border}`,
                borderRadius: radius.card,
                padding: spacing.lg,
                boxShadow: color.shadow,
                display: "flex",
                flexDirection: "column",
                gap: spacing.lg,
              }}
            >
              {/* Summary counts */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: spacing.sm,
                }}
              >
                <StatBox
                  label="Total items"
                  value={String(itemCount)}
                  accent={false}
                />
                <StatBox
                  label="Pages"
                  value={String(result.document?.pageCount ?? "—")}
                  accent={false}
                />
                <StatBox
                  label="Fragile"
                  value={String(classification.counts.fragile)}
                  accent={classification.counts.fragile > 0}
                  accentColor={color.fragile.fg}
                  accentBg={color.fragile.bg}
                />
                <StatBox
                  label="Standard"
                  value={String(classification.counts.standard)}
                  accent={false}
                  accentColor={color.standard.fg}
                  accentBg={color.standard.bg}
                />
              </div>

              <ClassificationSummary classification={classification} />

              {result.perf && (
                <PerfPanel
                  perf={result.perf}
                  provider={result.provider}
                  clientMs={clientMs}
                />
              )}
            </div>
          )}

          {/* Loading skeleton card */}
          {loading && (
            <div
              role="status"
              aria-label="Processing PDF"
              style={{
                background: color.surface,
                border: `1px solid ${color.border}`,
                borderRadius: radius.card,
                padding: spacing.lg,
                boxShadow: color.shadow,
                display: "flex",
                flexDirection: "column",
                gap: spacing.md,
              }}
            >
              <SkeletonRow width="60%" />
              <SkeletonRow width="80%" />
              <SkeletonRow width="45%" />
            </div>
          )}
        </aside>

        {/* ── Main content area ─────────────────────────────────────── */}
        <main style={{ display: "flex", flexDirection: "column", gap: spacing.xl, minWidth: 0 }}>
          {/* Empty state when nothing loaded */}
          {!file && !loading && (
            <div
              style={{
                background: color.surface,
                border: `1px solid ${color.border}`,
                borderRadius: radius.card,
                boxShadow: color.shadow,
                padding: `${spacing.xxl + spacing.xl}px ${spacing.xl}px`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: spacing.md,
                textAlign: "center",
              }}
            >
              {/* UX fix H10: instructive empty state */}
              <div
                aria-hidden="true"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  background: color.accentMuted,
                  border: `1px solid ${color.accentBorder}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width={26}
                  height={26}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={color.accent}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <div>
                <h2
                  style={{
                    fontSize: font.md + 2,
                    fontWeight: 700,
                    color: color.text,
                    margin: 0,
                    letterSpacing: "-0.01em",
                  }}
                >
                  No PDF loaded
                </h2>
                <p
                  style={{
                    fontSize: font.base,
                    color: color.muted,
                    marginTop: spacing.xs,
                    marginBottom: 0,
                    maxWidth: 380,
                    lineHeight: 1.6,
                  }}
                >
                  Upload a quotation or cargo manifest PDF using the panel on the left.
                  Your items will appear here after classification.
                </p>
              </div>
            </div>
          )}

          {/* PDF preview */}
          {previewUrl && (
            <div
              style={{
                background: color.surface,
                border: `1px solid ${color.border}`,
                borderRadius: radius.card,
                boxShadow: color.shadow,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: `${spacing.md}px ${spacing.lg}px`,
                  borderBottom: `1px solid ${color.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <p
                  style={{
                    fontSize: font.xs,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    color: color.muted,
                    margin: 0,
                  }}
                >
                  Preview — {file?.name}
                </p>
                {result?.document && (
                  <span
                    style={{
                      fontSize: font.xs,
                      color: color.muted,
                      background: color.surfaceSub,
                      border: `1px solid ${color.border}`,
                      borderRadius: 999,
                      padding: "2px 10px",
                    }}
                  >
                    {result.document.pageCount} page{result.document.pageCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <iframe
                src={previewUrl}
                title="PDF preview"
                style={{
                  width: "100%",
                  height: 520,
                  border: "none",
                  display: "block",
                }}
              />
            </div>
          )}

          {/* Results table */}
          {classification && result && (
            <div
              style={{
                background: color.surface,
                border: `1px solid ${color.border}`,
                borderRadius: radius.card,
                boxShadow: color.shadow,
                padding: spacing.lg,
                display: "flex",
                flexDirection: "column",
                gap: spacing.lg,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: spacing.sm,
                }}
              >
                <p
                  style={{
                    fontSize: font.xs,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    color: color.muted,
                    margin: 0,
                  }}
                >
                  Classified items
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: spacing.sm }}>
                  <span
                    style={{
                      fontSize: font.sm,
                      color: color.muted,
                      background: color.surfaceSub,
                      border: `1px solid ${color.border}`,
                      borderRadius: 999,
                      padding: "2px 10px",
                    }}
                  >
                    {itemCount} item{itemCount !== 1 ? "s" : ""}
                  </span>
                  {editing ? (
                    <>
                      <button type="button" onClick={cancelEdit} style={buttonSecondary(false)}>
                        Cancel
                      </button>
                      <button type="button" onClick={saveEdit} style={buttonPrimary(false)}>
                        Save changes
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={enterEdit} style={buttonSecondary(false)}>
                      Edit table
                    </button>
                  )}
                </div>
              </div>

              <ResultTables
                pages={viewPages}
                classMap={classMap}
                editing={editing}
                onCellChange={updateCell}
                onSetFragility={setFragility}
                onAddRow={addRow}
              />
            </div>
          )}

          {/* Stage 3 — Load plan (which van, does it fit, how it packs) */}
          {packing && !packResult && (
            <div
              role="status"
              aria-label="Calculating load plan"
              style={{
                ...card,
                display: "flex",
                alignItems: "center",
                gap: spacing.md,
                color: color.muted,
                fontSize: font.sm,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  border: `2px solid ${color.border}`,
                  borderTopColor: color.accent,
                  animation: "spin 0.8s linear infinite",
                }}
              />
              Calculating 3D load plan…
            </div>
          )}

          {packResult?.selected && (
            <PackingResultPanel
              fleet={packResult.fleet?.length ? packResult.fleet : [packResult.selected]}
              items={packResult.items ?? []}
              unplaced={packResult.unplaced ?? []}
              reasons={packResult.reasons ?? {}}
              fitsInSingleVan={packResult.fitsInSingleVan ?? false}
              packableUnits={packResult.packableUnits ?? 0}
            />
          )}

          {/* Stage 5 — Quote */}
          {packResult?.selected && (
            <div
              style={{
                ...card,
                display: "flex",
                flexDirection: "column",
                gap: spacing.lg,
              }}
            >
              {/* Header */}
              <div>
                <p
                  style={{
                    fontSize: font.xs,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    color: color.muted,
                    margin: 0,
                    marginBottom: spacing.xs,
                  }}
                >
                  Route & Price
                </p>
                <h2
                  style={{
                    fontSize: font.lg,
                    fontWeight: 700,
                    margin: 0,
                    color: color.text,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.2,
                  }}
                >
                  Get a Quote
                </h2>
                <p
                  style={{
                    fontSize: font.sm,
                    color: color.muted,
                    marginTop: spacing.xs,
                    marginBottom: 0,
                  }}
                >
                  {(() => {
                    const fleet = packResult.fleet?.length ? packResult.fleet : [packResult.selected];
                    const weight = Math.round(
                      fleet.reduce((s, r) => s + r.placements.reduce((w, p) => w + p.weightKg, 0), 0),
                    );
                    return (
                      <>
                        Vehicles: <strong>{fleet.length}</strong> · Total cargo weight:{" "}
                        <strong>{weight} kg</strong>
                      </>
                    );
                  })()}
                </p>
              </div>

              {/* Address inputs */}
              <div style={{ display: "flex", gap: spacing.md, flexWrap: "wrap" }}>
                <label style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: spacing.xs }}>
                  <span style={{ fontSize: font.sm, fontWeight: 600, color: color.muted }}>Origin</span>
                  <PlacesInput
                    value={origin}
                    onChange={(v) => { setOrigin(v); setOriginSelected(false); }}
                    onSelect={(v) => { setOrigin(v); setOriginSelected(true); }}
                    placeholder="e.g. London, UK"
                    style={{
                      padding: "9px 12px",
                      borderRadius: radius.input,
                      border: `1px solid ${origin.trim() && !originSelected ? color.error : color.border}`,
                      background: color.surfaceSub,
                      color: color.text,
                      fontSize: font.base,
                      outline: "none",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                  {origin.trim() && !originSelected && (
                    <span style={{ fontSize: font.xs, color: color.error }}>Select a location from the list.</span>
                  )}
                </label>
                <label style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: spacing.xs }}>
                  <span style={{ fontSize: font.sm, fontWeight: 600, color: color.muted }}>Destination</span>
                  <PlacesInput
                    value={destination}
                    onChange={(v) => { setDestination(v); setDestinationSelected(false); }}
                    onSelect={(v) => { setDestination(v); setDestinationSelected(true); }}
                    placeholder="e.g. Manchester, UK"
                    style={{
                      padding: "9px 12px",
                      borderRadius: radius.input,
                      border: `1px solid ${destination.trim() && !destinationSelected ? color.error : color.border}`,
                      background: color.surfaceSub,
                      color: color.text,
                      fontSize: font.base,
                      outline: "none",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                  {destination.trim() && !destinationSelected && (
                    <span style={{ fontSize: font.xs, color: color.error }}>Select a location from the list.</span>
                  )}
                </label>
              </div>

              <button
                type="button"
                disabled={quoting || !originSelected || !destinationSelected}
                onClick={() => void runQuote()}
                style={buttonPrimary(quoting || !originSelected || !destinationSelected)}
              >
                {quoting ? "Calculating…" : "Get Quote"}
              </button>

              {quoteError && (
                <p
                  style={{
                    fontSize: font.sm,
                    color: color.error,
                    background: color.errorBg,
                    border: `1px solid ${color.errorBorder}`,
                    borderRadius: radius.card - 4,
                    padding: `${spacing.sm}px ${spacing.md}px`,
                    margin: 0,
                  }}
                >
                  {quoteError}
                </p>
              )}

              {quoteResult?.quote && <QuotePanel quote={quoteResult.quote} />}
            </div>
          )}
        </main>
      </div>
    </>
  );
}

/* ── Local sub-components ────────────────────────────────────────────── */

function StatBox({
  label,
  value,
  accent,
  accentColor,
  accentBg,
}: {
  label: string;
  value: string;
  accent: boolean;
  accentColor?: string;
  accentBg?: string;
}) {
  return (
    <div
      style={{
        background: accent && accentBg ? accentBg : color.surfaceSub,
        border: `1px solid ${color.border}`,
        borderRadius: radius.card - 4,
        padding: `${spacing.sm + 2}px ${spacing.md}px`,
      }}
    >
      <div
        style={{
          fontSize: font.xl - 4,
          fontWeight: 700,
          color: accent && accentColor ? accentColor : color.text,
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: font.xs,
          color: color.muted,
          marginTop: spacing.xs,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function SkeletonRow({ width }: { width: string }) {
  return (
    <div
      aria-hidden="true"
      style={{
        height: 14,
        borderRadius: 4,
        width,
        background: color.border,
        animation: "shimmer 1.4s ease-in-out infinite",
      }}
    />
  );
}
