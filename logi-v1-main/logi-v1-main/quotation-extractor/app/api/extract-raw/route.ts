import { NextRequest, NextResponse } from "next/server";
import { extractPdfWithAdobe } from "@/lib/adobe-extract";
import * as fs from "fs";
import * as path from "path";

// Returns RAW table data from Adobe - no parsing, no conversion
export async function POST(request: NextRequest) {
  let tempFilePath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("pdf") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No PDF file provided" },
        { status: 400 }
      );
    }

    // Save to temp file
    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    tempFilePath = path.join(uploadsDir, `${Date.now()}_${fileName}`);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tempFilePath, buffer);

    // Extract with Adobe
    const adobeResult = await extractPdfWithAdobe(tempFilePath);

    // Get RAW tables - no parsing
    const rawTables: { index: number; path: string; rows: string[][] }[] = [];

    let tableIndex = 0;
    for (const element of adobeResult.elements) {
      if (element.Path?.includes("/Table") && element.Table) {
        const rows: string[][] = [];

        for (const row of element.Table) {
          const cells: string[] = [];
          for (const cell of row) {
            // Get raw text, just clean up \r
            let text = "";
            if (cell && typeof cell === "object" && "Text" in cell) {
              text = (cell as { Text?: string }).Text || "";
            } else if (typeof cell === "string") {
              text = cell;
            }
            cells.push(text.replace(/\r/g, "").trim());
          }
          rows.push(cells);
        }

        rawTables.push({
          index: tableIndex++,
          path: element.Path || "",
          rows,
        });
      }
    }

    return NextResponse.json({
      success: true,
      raw_tables: rawTables,
    });
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
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}
