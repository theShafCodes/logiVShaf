"use client";

import { useEffect, useRef } from "react";
import { th, td, color, font, spacing, radius } from "@/styles/tokens";
import type { ClassifiedItem, Fragility, PageContent } from "@/types/api";

type ClassMap = Map<string, ClassifiedItem>;

function itemKey(p: number, t: number, r: number) {
  return `${p}-${t}-${r}`;
}

const FRAG_STYLE: Record<Fragility, { bg: string; fg: string; border: string }> = {
  fragile:   { bg: color.fragile.bg,  fg: color.fragile.fg,  border: color.fragile.border  },
  standard:  { bg: color.standard.bg, fg: color.standard.fg, border: color.standard.border },
  uncertain: { bg: color.review.bg,   fg: color.review.fg,   border: color.review.border   },
};

function FragilitySelect({ value, confident, onChange }: { value: Fragility; confident: boolean; onChange: (v: Fragility) => void }) {
  const { bg, fg, border } = FRAG_STYLE[value] ?? FRAG_STYLE.standard;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Fragility)}
        style={{ background: bg, color: fg, border: `1px solid ${border}`, borderRadius: 999, padding: "3px 10px", fontSize: font.xs, fontWeight: 600, cursor: "pointer" }}
      >
        <option value="fragile">Fragile</option>
        <option value="standard">Standard</option>
        <option value="uncertain">Standard?</option>
      </select>
      {!confident && <span style={{ fontSize: font.xs, color: color.muted, paddingLeft: 4 }}>low confidence</span>}
    </div>
  );
}

/** Auto-sizing textarea — grows vertically to show full content, no scroll. */
function AutoTextarea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        e.target.style.height = "auto";
        e.target.style.height = `${e.target.scrollHeight}px`;
      }}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: `1px solid ${color.border}`,
        borderRadius: 6,
        padding: "4px 6px",
        font: "inherit",
        color: color.text,
        background: color.surfaceSub,
        resize: "none",
        overflow: "hidden",
        minHeight: 28,
        display: "block",
        lineHeight: "1.5",
      }}
    />
  );
}

function clean(cell: string): string {
  return cell.replace(/\*\*/g, "").trim();
}

interface Props {
  pages: PageContent[];
  classMap: ClassMap;
  /** When false, cell inputs and add-row are hidden; fragility select is always visible. */
  editing: boolean;
  onCellChange: (pageIndex: number, tableIndex: number, rowIndex: number, colIndex: number, value: string) => void;
  onSetFragility: (pageIndex: number, tableIndex: number, rowIndex: number, value: Fragility) => void;
  onAddRow: (pageIndex: number, tableIndex: number) => void;
}

// Frozen-edge styling: header row, the "#" column (left) and the Classification
// column (right) stay visible while the middle scrolls. Sticky cells need an
// opaque background or scrolled content shows through them.
const stickyHeadBase = { position: "sticky" as const, top: 0, zIndex: 2 };
const stickyLeftCell = {
  position: "sticky" as const,
  left: 0,
  zIndex: 1,
  background: color.surface,
};
const stickyRightCell = {
  position: "sticky" as const,
  right: 0,
  zIndex: 1,
  background: color.surface,
};

export function ResultTables({
  pages,
  classMap,
  editing,
  onCellChange,
  onSetFragility,
  onAddRow,
}: Props) {
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

          {/* Table — scrolls in both axes; header and edge columns stay frozen */}
          <div
            style={{
              maxHeight: "70vh",
              overflow: "auto",
              borderRadius: radius.card,
              border: `1px solid ${isItemTable && editing ? color.accent : color.border}`,
              boxShadow: isItemTable && editing ? `0 0 0 3px ${color.accentMuted}` : undefined,
              transition: "border-color 0.15s, box-shadow 0.15s",
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
                      ...stickyHeadBase,
                      left: 0,
                      zIndex: 3,
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
                    <th key={i} scope="col" style={{ ...th, ...stickyHeadBase }}>
                      {clean(h)}
                    </th>
                  ))}
                  {isItemTable && (
                    <th
                      scope="col"
                      style={{ ...th, ...stickyHeadBase, right: 0, zIndex: 3, width: 150 }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        Classification
                        <span
                          title="Auto-classified from the description. In edit mode, 'Override' flips an item between fragile and standard if the guess is wrong."
                          aria-label="What does Override mean?"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 14,
                            height: 14,
                            borderRadius: 999,
                            border: `1px solid ${color.border}`,
                            color: color.muted,
                            fontSize: 9,
                            fontWeight: 700,
                            cursor: "help",
                          }}
                        >
                          i
                        </span>
                      </span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => {
                  const item = classMap.get(itemKey(page.index, table.index, r));
                  return (
                    <tr key={r}>
                      <td style={{ ...td, ...stickyLeftCell, color: color.muted }}>{r + 1}</td>
                      {row.map((cell, c) => (
                        <td
                          key={c}
                          style={{
                            ...td,
                            minWidth: 120,
                            whiteSpace: "normal",
                            wordBreak: "break-word",
                          }}
                        >
                          {isItemTable && editing ? (
                            <AutoTextarea
                              value={cell}
                              onChange={(v) => onCellChange(page.index, table.index, r, c, v)}
                            />
                          ) : (
                            clean(cell)
                          )}
                        </td>
                      ))}
                      {isItemTable && (
                        <td style={{ ...td, ...stickyRightCell }}>
                          {item && (
                            <FragilitySelect
                              value={item.fragility}
                              confident={item.confident}
                              onChange={(v) => onSetFragility(page.index, table.index, r, v)}
                            />
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add-row — edit mode, cargo tables only */}
          {isItemTable && editing && (
            <button
              type="button"
              onClick={() => onAddRow(page.index, table.index)}
              style={{
                marginTop: spacing.sm,
                border: `1px dashed ${color.border}`,
                background: color.surfaceSub,
                color: color.accentDark,
                borderRadius: radius.button,
                padding: "6px 12px",
                fontSize: font.sm,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + Add row
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
