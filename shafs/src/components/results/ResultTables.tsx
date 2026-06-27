"use client";

import { th, td, color, font, spacing, radius } from "@/styles/tokens";
import { FragilityBadge } from "@/components/common/FragilityBadge";
import type { ClassifiedItem, ExtractedTable, PageContent } from "@/types/api";

type ClassMap = Map<string, ClassifiedItem>;

function itemKey(p: number, t: number, r: number) {
  return `${p}-${t}-${r}`;
}

function clean(cell: string): string {
  return cell.replace(/\*\*/g, "").trim();
}

interface Props {
  pages: PageContent[];
  classMap: ClassMap;
}

export function ResultTables({ pages, classMap }: Props) {
  const tables = pages.flatMap((page) =>
    page.tables.map((table) => {
      const classifiedCount = table.rows.filter((_, r) =>
        classMap.has(itemKey(page.index, table.index, r)),
      ).length;
      return { page, table, isItemTable: classifiedCount > 0, classifiedCount };
    }),
  );

  if (tables.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: spacing.sm,
          padding: `${spacing.xxl}px ${spacing.xl}px`,
          background: color.surfaceSub,
          borderRadius: radius.card,
          border: `1px dashed ${color.border}`,
          textAlign: "center",
        }}
      >
        {/* UX fix H10: descriptive empty state */}
        <svg
          aria-hidden="true"
          width={32}
          height={32}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color.muted}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="9" x2="9" y2="21" />
        </svg>
        <p style={{ fontSize: font.md, fontWeight: 600, color: color.text, margin: 0 }}>
          No tables found
        </p>
        <p style={{ fontSize: font.base, color: color.muted, margin: 0, maxWidth: 340 }}>
          Ensure the PDF contains a cargo or goods table with recognisable column headers (e.g.
          &ldquo;Item&rdquo;, &ldquo;Description&rdquo;, &ldquo;Qty&rdquo;).
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.lg }}>
      {tables.map(({ page, table, isItemTable, classifiedCount }) => (
        <div key={`${page.index}-${table.index}`}>
          {/* Table meta label */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: spacing.sm,
              marginBottom: spacing.sm,
            }}
          >
            <span
              style={{
                fontSize: font.xs,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                color: color.muted,
              }}
            >
              Page {page.index + 1} · Table {table.index + 1}
            </span>
            <span
              style={{
                fontSize: font.xs,
                background: isItemTable ? color.accentMuted : color.surfaceHover,
                color: isItemTable ? color.accentDark : color.muted,
                border: `1px solid ${isItemTable ? color.accentBorder : color.border}`,
                borderRadius: 999,
                padding: "1px 8px",
                fontWeight: 500,
              }}
            >
              {isItemTable
                ? `cargo · ${classifiedCount} item${classifiedCount !== 1 ? "s" : ""}`
                : "document details"}
            </span>
          </div>

          {/* Table */}
          <div
            style={{
              overflowX: "auto",
              borderRadius: radius.card,
              border: `1px solid ${color.border}`,
            }}
          >
            <table
              style={{
                borderCollapse: "collapse",
                fontSize: font.base,
                width: "100%",
                background: color.surface,
              }}
            >
              <thead>
                <tr>
                  <th
                    scope="col"
                    style={{
                      ...th,
                      width: 44,
                      fontWeight: 400,
                      textTransform: "none",
                      letterSpacing: 0,
                      opacity: 0.5,
                    }}
                  >
                    #
                  </th>
                  {table.headers.map((h, i) => (
                    <th key={i} scope="col" style={th}>
                      {clean(h)}
                    </th>
                  ))}
                  {isItemTable && (
                    <th scope="col" style={{ ...th, width: 130 }}>
                      Classification
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => {
                  const item = classMap.get(itemKey(page.index, table.index, r));
                  return (
                    <tr
                      key={r}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLTableRowElement).style.background =
                          color.surfaceSub)
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLTableRowElement).style.background = "")
                      }
                    >
                      <td style={{ ...td, color: color.muted }}>{r + 1}</td>
                      {row.map((cell, c) => (
                        <td key={c} style={td}>
                          {clean(cell)}
                        </td>
                      ))}
                      {isItemTable && (
                        <td style={td}>{item && <FragilityBadge item={item} />}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
