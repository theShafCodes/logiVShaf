/**
 * GET /api/places?q=<query> — autocomplete address suggestions via OpenStreetMap Nominatim.
 * Proxied server-side to avoid CORS and to add the required User-Agent header.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ suggestions: [] });

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=0`;
    const res = await fetch(url, {
      headers: { "User-Agent": "logistics-quoting-tool/1.0 (demo)" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return NextResponse.json({ suggestions: [] });
    const data = (await res.json()) as Array<{ display_name: string }>;
    return NextResponse.json({ suggestions: data.map((r) => r.display_name) });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
