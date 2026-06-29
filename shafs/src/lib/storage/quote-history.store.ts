import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getConfig } from "@/config/env";
import type { Quote } from "@/types/api";

export interface QuoteHistoryEntry {
  readonly id: string;
  readonly createdAt: string;
  readonly quote: Quote;
}

export class QuoteHistoryStore {
  private cache: QuoteHistoryEntry[] | null = null;

  private path(): string {
    return resolve(process.cwd(), getConfig().quoteHistory.path);
  }

  async list(): Promise<QuoteHistoryEntry[]> {
    if (this.cache) return this.cache;
    const path = this.path();
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as QuoteHistoryEntry[];
      this.cache = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  async append(quote: Quote): Promise<QuoteHistoryEntry> {
    const entry: QuoteHistoryEntry = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `quote_${Date.now()}`,
      createdAt: new Date().toISOString(),
      quote,
    };
    const next = [entry, ...(await this.list())];
    const path = this.path();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(next, null, 2), "utf8");
    this.cache = next;
    return entry;
  }
}
