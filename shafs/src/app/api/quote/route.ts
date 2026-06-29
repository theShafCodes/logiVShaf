/**
 * Thin HTTP wrapper over the pricing service. No business logic — validates the
 * request shape, delegates to getQuote, shapes the JSON response.
 * Body: { vanIds: string[], origin, destination, fragileCount }
 */
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger/logger";
import { getQuote, PricingError } from "@/lib/pricing";
import { RoutingError } from "@/lib/routing";
import { QuoteHistoryStore } from "@/lib/storage/quote-history.store";

export const runtime = "nodejs";

const logger = createLogger("api.quote");
const history = new QuoteHistoryStore();

function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `req_${Date.now()}`;
}

export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();
  try {
    const body = (await request.json()) as {
      vanIds?: unknown;
      origin?: string;
      destination?: string;
      fragileCount?: number;
      vanPayloads?: unknown;
    };

    const vanIds = Array.isArray(body?.vanIds)
      ? body.vanIds.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim())
      : [];
    if (vanIds.length === 0) {
      return NextResponse.json(
        { success: false, requestId, error: "Missing or empty 'vanIds'." },
        { status: 400 },
      );
    }
    if (typeof body?.origin !== "string" || body.origin.trim() === "") {
      return NextResponse.json(
        { success: false, requestId, error: "Missing or empty 'origin'." },
        { status: 400 },
      );
    }
    if (typeof body?.destination !== "string" || body.destination.trim() === "") {
      return NextResponse.json(
        { success: false, requestId, error: "Missing or empty 'destination'." },
        { status: 400 },
      );
    }
    const fragileCount = body.fragileCount ?? 0;
    if (typeof fragileCount !== "number" || !Number.isFinite(fragileCount) || fragileCount < 0) {
      return NextResponse.json(
        { success: false, requestId, error: "'fragileCount' must be a non-negative number." },
        { status: 400 },
      );
    }

    const rawPayloads = Array.isArray(body?.vanPayloads)
      ? (body.vanPayloads as unknown[]).filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0)
      : undefined;
    const vanPayloads = rawPayloads?.length === vanIds.length ? rawPayloads : undefined;

    const result = await getQuote({
      vanIds,
      origin: body.origin.trim(),
      destination: body.destination.trim(),
      fragileCount: Math.round(fragileCount),
      vanPayloads,
    });

    await history.append(result.quote);

    return NextResponse.json({ success: true, requestId, ...result });
  } catch (err) {
    if (err instanceof RoutingError || err instanceof PricingError) {
      return NextResponse.json({ success: false, requestId, error: err.message }, { status: 400 });
    }
    if (err instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, requestId, error: "Request body is not valid JSON." },
        { status: 400 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("unexpected quote error", { requestId, error: msg });
    return NextResponse.json(
      { success: false, requestId, error: msg },
      { status: 500 },
    );
  }
}
