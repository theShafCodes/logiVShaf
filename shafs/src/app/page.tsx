"use client";

import { useMemo, useState } from "react";
import { DropZone } from "@/components/upload/DropZone";
import { PerfPanel } from "@/components/results/PerfPanel";
import { ClassificationSummary } from "@/components/results/ClassificationSummary";
import { ResultTables } from "@/components/results/ResultTables";
import { AppHeader } from "@/components/layout/AppHeader";
import { color, font, spacing, radius } from "@/styles/tokens";
import type { ClassifiedItem, IngestResponse } from "@/types/api";

function itemKey(p: number, t: number, r: number) {
  return `${p}-${t}-${r}`;
}

type Status = "idle" | "processing" | "done" | "error";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientMs, setClientMs] = useState<number | null>(null);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  const classMap = useMemo(() => {
    const m = new Map<string, ClassifiedItem>();
    for (const it of result?.classification?.items ?? []) {
      m.set(itemKey(it.pageIndex, it.tableIndex, it.rowIndex), it);
    }
    return m;
  }, [result]);

  const status: Status = loading
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
    const startedAt = performance.now();
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch("/api/ingest", { method: "POST", body: form });
      const data: IngestResponse = await res.json();
      setClientMs(Math.round((performance.now() - startedAt) * 100) / 100);
      if (data.success) setResult(data);
      else setError(data.error ?? "Ingestion failed.");
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setResult(null);
    setError(null);
    setFile(f);
    if (f) void runIngest(f);
  };

  const itemCount = result?.classification?.items.length ?? 0;

  return (
    <>
      <AppHeader status={status} filename={file?.name} />

      <div
        className="page-grid"
        style={{
          maxWidth: 1200,
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
          </div>

          {/* Stats card — visible when results are available */}
          {result?.classification && (
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
                  value={String(result.classification.counts.fragile)}
                  accent={result.classification.counts.fragile > 0}
                  accentColor={color.fragile.fg}
                  accentBg={color.fragile.bg}
                />
                <StatBox
                  label="Standard"
                  value={String(result.classification.counts.standard)}
                  accent={false}
                  accentColor={color.standard.fg}
                  accentBg={color.standard.bg}
                />
              </div>

              <ClassificationSummary classification={result.classification} />

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
          {result?.classification && (
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
              </div>

              <ResultTables pages={result.document!.pages} classMap={classMap} />
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
