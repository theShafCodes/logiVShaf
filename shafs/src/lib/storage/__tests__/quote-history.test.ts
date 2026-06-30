import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QuoteHistoryStore } from "@/lib/storage/quote-history.store";

const originalCwd = process.cwd();
let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "quote-history-"));
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

describe("QuoteHistoryStore", () => {
  it("appends and reads back quote history", async () => {
    const store = new QuoteHistoryStore();
    const quote = {
      route: { origin: "A", destination: "B", distanceMiles: 12, durationSeconds: 600, distanceMethod: "road" as const },
      vans: [],
      lineItems: [],
      subtotal: 0,
      surcharges: 0,
      total: 0,
    };
    await store.append(quote);
    const entries = await store.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.quote.route.origin).toBe("A");
  });
});
