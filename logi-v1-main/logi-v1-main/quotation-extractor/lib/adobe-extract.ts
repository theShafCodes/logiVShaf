import {
  ServicePrincipalCredentials,
  PDFServices,
  MimeType,
  ExtractPDFParams,
  ExtractElementType,
  ExtractPDFJob,
  ExtractPDFResult,
} from "@adobe/pdfservices-node-sdk";
import * as fs from "fs";
import AdmZip from "adm-zip";
import { Readable } from "stream";
import * as XLSX from "xlsx";
import { AdobeExtractResult, AdobeElement } from "@/types/quotation";

interface TableData {
  filePath: string;
  rows: string[][];
}

export async function extractPdfWithAdobe(pdfPath: string): Promise<AdobeExtractResult> {
  const clientId = process.env.PDF_SERVICES_CLIENT_ID;
  const clientSecret = process.env.PDF_SERVICES_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Adobe API credentials not configured. Please set PDF_SERVICES_CLIENT_ID and PDF_SERVICES_CLIENT_SECRET in .env.local");
  }

  if (clientSecret === "YOUR_CLIENT_SECRET_HERE") {
    throw new Error("Please replace YOUR_CLIENT_SECRET_HERE with your actual Adobe PDF Services Client Secret in .env.local");
  }

  let readStream: fs.ReadStream | null = null;

  try {
    // Create credentials
    const credentials = new ServicePrincipalCredentials({
      clientId,
      clientSecret,
    });

    // Create PDF Services instance
    const pdfServices = new PDFServices({ credentials });

    // Upload the PDF
    readStream = fs.createReadStream(pdfPath);
    const inputAsset = await pdfServices.upload({
      readStream,
      mimeType: MimeType.PDF,
    });

    // Configure extraction parameters (TEXT + TABLES)
    const params = new ExtractPDFParams({
      elementsToExtract: [
        ExtractElementType.TEXT,
        ExtractElementType.TABLES,
      ],
    });

    // Create and submit the extraction job
    const job = new ExtractPDFJob({ inputAsset, params });
    const pollingURL = await pdfServices.submit({ job });

    // Wait for job completion
    const pdfServicesResponse = await pdfServices.getJobResult({
      pollingURL,
      resultType: ExtractPDFResult,
    });

    // Get the result asset
    const resultAsset = pdfServicesResponse.result?.resource;
    if (!resultAsset) {
      throw new Error("No result asset returned from Adobe API");
    }

    const streamAsset = await pdfServices.getContent({ asset: resultAsset });

    // Save ZIP to temp file
    const zipPath = pdfPath.replace(".pdf", "_extract.zip");
    const writeStream = fs.createWriteStream(zipPath);

    await new Promise<void>((resolve, reject) => {
      if (streamAsset.readStream instanceof Readable) {
        streamAsset.readStream.pipe(writeStream);
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      } else {
        reject(new Error("Invalid stream asset from Adobe API"));
      }
    });

    // Extract from ZIP
    const zip = new AdmZip(zipPath);

    // Get structuredData.json
    const jsonContent = zip.readAsText("structuredData.json");
    if (!jsonContent) {
      throw new Error("No structuredData.json found in Adobe response");
    }
    const extractedData: AdobeExtractResult = JSON.parse(jsonContent);

    // Extract and parse Excel table files
    const tableDataMap = new Map<string, string[][]>();
    const zipEntries = zip.getEntries();

    for (const entry of zipEntries) {
      if (entry.entryName.startsWith("tables/") && entry.entryName.endsWith(".xlsx")) {
        try {
          const buffer = entry.getData();
          const workbook = XLSX.read(buffer, { type: "buffer" });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];

          // Convert to array of arrays (rows)
          const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: "",
            raw: false
          });

          tableDataMap.set(entry.entryName, rows);
          console.log(`Parsed table ${entry.entryName}: ${rows.length} rows`);
        } catch (err) {
          console.error(`Failed to parse ${entry.entryName}:`, err);
        }
      }
    }

    // Attach table data to elements that reference Excel files
    for (const element of extractedData.elements) {
      if (element.filePaths && Array.isArray(element.filePaths)) {
        for (const filePath of element.filePaths) {
          const tableRows = tableDataMap.get(filePath);
          if (tableRows) {
            // Convert string[][] to the expected Table format
            element.Table = tableRows.map(row =>
              row.map(cell => ({ Text: String(cell || "") }))
            );
            console.log(`Attached ${tableRows.length} rows to element at ${element.Path}`);
          }
        }
      }
    }

    // Cleanup ZIP file
    fs.unlinkSync(zipPath);

    return extractedData;
  } finally {
    readStream?.destroy();
  }
}
