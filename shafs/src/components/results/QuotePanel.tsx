"use client";

import { color, font, spacing, radius, sectionLabel, td, tdMuted, th } from "@/styles/tokens";
import { smartGBP } from "@/lib/fmt";
import type { Quote } from "@/types/api";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function QuotePanel({ quote }: { quote: Quote }) {
  const multi = quote.vans.length > 1;
  const mapSrc = `/api/map?origin=${encodeURIComponent(quote.route.origin)}&destination=${encodeURIComponent(quote.route.destination)}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.lg }}>
      <div>
        <p style={sectionLabel}>Route</p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: spacing.sm,
            marginTop: spacing.xs,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: font.base, color: color.text, fontWeight: 600 }}>
            {quote.route.origin}
          </span>
          <span style={{ color: color.muted, fontSize: font.base }}>→</span>
          <span style={{ fontSize: font.base, color: color.text, fontWeight: 600 }}>
            {quote.route.destination}
          </span>
          <span style={routeBadge}>
            {quote.route.distanceMiles.toFixed(1)} mi · {formatDuration(quote.route.durationSeconds)}
          </span>
          <span style={routeBadge}>
            {quote.vans.length} vehicle{multi ? "s" : ""}
          </span>
          <span style={{ fontSize: 11, color: color.muted, fontStyle: "italic" }}>
            {(quote.route.distanceMethod ?? "road") === "road"
              ? "road distance · Google Maps"
              : "straight-line est. · no Maps key"}
          </span>
        </div>
      </div>

      <div>
        <p style={{ ...sectionLabel, marginBottom: spacing.xs }}>Route map</p>
        <iframe
          src={mapSrc}
          title="Route map"
          style={{
            width: "100%",
            height: 320,
            border: `1px solid ${color.border}`,
            borderRadius: radius.card,
            background: color.surfaceSub,
          }}
        />
      </div>

      <div>
        <p style={{ ...sectionLabel, marginBottom: spacing.xs }}>Vehicles</p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>#</th>
              <th style={{ ...th, width: "100%" }}>Description</th>
              <th style={{ ...th, whiteSpace: "nowrap" }}>Van ID</th>
              <th style={{ ...th, textAlign: "right", whiteSpace: "nowrap" }}>Rate</th>
              <th style={{ ...th, textAlign: "right", whiteSpace: "nowrap" }}>Distance cost</th>
            </tr>
          </thead>
          <tbody>
            {quote.vans.map((v, i) => (
              <tr key={`${v.id}-${i}`}>
                <td style={tdMuted}>{i + 1}</td>
                <td style={td}>{v.description}</td>
                <td style={{ ...tdMuted, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{v.id}</td>
                <td style={{ ...tdMuted, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                  £{v.perMileRate.toFixed(2)}/mi
                </td>
                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                  {smartGBP(v.distanceCost)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <p style={{ ...sectionLabel, marginBottom: spacing.xs }}>Breakdown</p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, width: "100%" }}>Item</th>
              <th style={{ ...th, textAlign: "right", whiteSpace: "nowrap" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {quote.lineItems.map((item) => (
              <tr key={item.label}>
                <td style={tdMuted}>{item.label}</td>
                <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {smartGBP(item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td
                style={{
                  ...td,
                  fontWeight: 700,
                  color: color.text,
                  fontSize: font.md,
                  borderTop: `2px solid ${color.borderStrong}`,
                  borderBottom: "none",
                }}
              >
                Total
              </td>
              <td
                style={{
                  ...td,
                  fontWeight: 700,
                  fontSize: font.md,
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                  color: color.accent,
                  borderTop: `2px solid ${color.borderStrong}`,
                  borderBottom: "none",
                }}
              >
                {smartGBP(quote.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

const routeBadge: React.CSSProperties = {
  fontSize: font.sm,
  color: color.muted,
  background: color.surfaceSub,
  border: `1px solid ${color.border}`,
  borderRadius: radius.badge,
  padding: "2px 10px",
};
