/**
 * Thin HTTP wrapper over the packing service. No business logic — it validates
 * the request shape, delegates to packJob, and shapes the JSON response. Body is
 * the ingest endpoint's output: { document, classification, vanId? }.
 */
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger/logger";
import { packJob, PackingError } from "@/lib/packing/packer.service";
import type { StructuredDocument } from "@/lib/conversion/types";
import type { ClassificationResult } from "@/lib/classification/types";

export const runtime = "nodejs";

const logger = createLogger("api.pack");

function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `req_${Date.now()}`;
}

export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();
  try {
    const body = (await request.json()) as {
      document?: StructuredDocument;
      classification?: ClassificationResult;
      vanId?: string;
    };

    if (!body?.document || !Array.isArray(body.document.pages)) {
      return NextResponse.json(
        { success: false, requestId, error: "Missing or malformed 'document'." },
        { status: 400 },
      );
    }
    if (!body?.classification || !Array.isArray(body.classification.items)) {
      return NextResponse.json(
        { success: false, requestId, error: "Missing or malformed 'classification'." },
        { status: 400 },
      );
    }

    const result = await packJob({
      doc: body.document,
      classification: body.classification,
      vanId: body.vanId,
    });

    return NextResponse.json({ success: true, requestId, ...result });
  } catch (err) {
    if (err instanceof PackingError) {
      return NextResponse.json({ success: false, requestId, error: err.message }, { status: 400 });
    }
    if (err instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, requestId, error: "Request body is not valid JSON." },
        { status: 400 },
      );
    }
    logger.error("unexpected packing error", { requestId, error: String(err) });
    return NextResponse.json(
      { success: false, requestId, error: "Internal error." },
      { status: 500 },
    );
  }
}
