import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { extractPdfWithAdobe } from "@/lib/adobe-extract";
import { parseQuotation } from "@/lib/parse-quotation";

export async function POST(request: NextRequest) {
  let tempPath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("pdf") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No PDF file provided" },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { success: false, error: "File must be a PDF" },
        { status: 400 }
      );
    }

    // Create uploads directory if needed
    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    // Save uploaded file temporarily
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    tempPath = path.join(uploadsDir, `${Date.now()}_${sanitizedName}`);
    await writeFile(tempPath, buffer);

    // Extract with Adobe API
    console.log("Starting Adobe PDF extraction...");
    const adobeResult = await extractPdfWithAdobe(tempPath);

    // Debug: Log what Adobe returned
    console.log("=== ADOBE RESULT DEBUG ===");
    console.log("Total elements:", adobeResult.elements?.length || 0);

    // Find and log table elements
    const tableElements = adobeResult.elements?.filter(e => e.Path?.includes("/Table")) || [];
    console.log("Table elements found:", tableElements.length);

    if (tableElements.length > 0) {
      console.log("First table structure:", JSON.stringify(tableElements[0], null, 2).slice(0, 2000));
    } else {
      // Log first few elements to see structure
      console.log("First 3 elements:", JSON.stringify(adobeResult.elements?.slice(0, 3), null, 2));
    }
    console.log("=== END DEBUG ===");

    // Parse into structured data
    console.log("Parsing extracted data...");
    const quotation = parseQuotation(adobeResult);

    console.log(`Extraction complete: ${quotation.summary.total_items} items found`);
    return NextResponse.json(quotation);

  } catch (error) {
    console.error("Extraction error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Extraction failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    // Cleanup temp file
    if (tempPath) {
      try {
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
