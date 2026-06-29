import { NextResponse } from "next/server";
import { QuoteHistoryStore } from "@/lib/storage/quote-history.store";

export const runtime = "nodejs";

const history = new QuoteHistoryStore();

export async function GET(): Promise<Response> {
  const entries = await history.list();
  return NextResponse.json({ entries });
}
