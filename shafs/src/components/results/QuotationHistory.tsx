"use client";

import { useEffect, useState } from "react";
import { color, font, spacing, radius } from "@/styles/tokens";
import type { QuoteHistoryEntry } from "@/lib/storage/quote-history.store";

interface HistoryResponse {
  readonly entries: QuoteHistoryEntry[];
}

export function QuotationHistory() {
  const [entries, setEntries] = useState<QuoteHistoryEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/history")
      .then((r) => r.json())
      .then((data: HistoryResponse) => setEntries(data.entries ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  if (!loading && entries.length === 0) return null;

  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.card,
        boxShadow: color.shadow,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `${spacing.md}px ${spacing.lg}px`,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          gap: spacing.sm,
        }}
      >
        <span style={{ fontSize: font.sm, fontWeight: 600, color: color.text }}>
          Quote History {loading ? "" : `(${entries.length})`}
        </span>
        <span style={{ fontSize: font.xs, color: color.muted }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          style={{
            borderTop: `1px solid ${color.border}`,
            display: "flex",
            flexDirection: "column",
            gap: 1,
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          {entries.map((entry) => (
            <div
              key={entry.id}
              style={{
                padding: `${spacing.sm}px ${spacing.lg}px`,
                borderBottom: `1px solid ${color.border}`,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: font.sm, fontWeight: 600, color: color.text }}>
                  {entry.quote.route.origin} → {entry.quote.route.destination}
                </span>
                <span style={{ fontSize: font.xs, color: color.muted, fontVariantNumeric: "tabular-nums" }}>
                  {new Date(entry.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div style={{ display: "flex", gap: spacing.md }}>
                <span style={{ fontSize: font.xs, color: color.muted }}>
                  {Math.round(entry.quote.route.distanceMiles)} mi
                </span>
                <span style={{ fontSize: font.xs, color: color.muted }}>
                  {entry.quote.vans.length} van{entry.quote.vans.length !== 1 ? "s" : ""}
                </span>
                <span
                  style={{
                    fontSize: font.xs,
                    fontWeight: 700,
                    color: color.text,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  £{entry.quote.total.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
