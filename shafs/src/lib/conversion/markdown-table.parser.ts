/**
 * Parses GitHub-flavoured markdown tables (the form Mistral OCR emits) into a
 * grid. Pure and deterministic — no I/O, no config — so it is trivially
 * verifiable in isolation.
 *
 * A markdown table is:
 *   | A | B |
 *   | - | - |
 *   | 1 | 2 |
 * The second row is the header/body separator (dashes, optional colons).
 */
import type { ExtractedTable, TableRow } from "@/lib/conversion/types";

const SEPARATOR_CELL = /^:?-{1,}:?$/;

/** Splits one markdown table line into trimmed cells, honouring escaped pipes. */
function splitRow(line: string): TableRow {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let buf = "";
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "\\" && trimmed[i + 1] === "|") {
      buf += "|";
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  cells.push(buf.trim());
  return cells;
}

function isTableLine(line: string): boolean {
  return line.trim().startsWith("|");
}

function isSeparatorRow(cells: TableRow): boolean {
  return cells.length > 0 && cells.every((c) => SEPARATOR_CELL.test(c.trim()));
}

/** Extracts every markdown table found in `markdown`, in document order. */
export function parseMarkdownTables(markdown: string): ExtractedTable[] {
  const lines = markdown.split(/\r?\n/);
  const tables: ExtractedTable[] = [];

  let i = 0;
  while (i < lines.length) {
    if (!isTableLine(lines[i] ?? "")) {
      i++;
      continue;
    }

    // Collect a contiguous block of table lines.
    const block: string[] = [];
    while (i < lines.length && isTableLine(lines[i] ?? "")) {
      block.push(lines[i] as string);
      i++;
    }

    // Need at least header + separator to be a real table.
    if (block.length < 2) continue;
    const headerCells = splitRow(block[0] as string);
    if (!isSeparatorRow(splitRow(block[1] as string))) continue;

    const width = headerCells.length;
    const rows: TableRow[] = block
      .slice(2)
      .map(splitRow)
      .map((cells) => normaliseWidth(cells, width));

    tables.push({ index: tables.length, headers: normaliseWidth(headerCells, width), rows });
  }

  return tables;
}

/** Pads/truncates a row so every row matches the header width (handles ragged OCR output). */
function normaliseWidth(cells: TableRow, width: number): TableRow {
  if (cells.length === width) return cells;
  if (cells.length > width) return cells.slice(0, width);
  return [...cells, ...Array<string>(width - cells.length).fill("")];
}
