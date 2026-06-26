"use client";

import { useState, useRef } from "react";

interface RawTable {
  index: number;
  path: string;
  rows: string[][];
}

interface RawResponse {
  success: boolean;
  raw_tables?: RawTable[];
  error?: string;
  details?: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [tables, setTables] = useState<RawTable[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === "application/pdf") {
      setFile(selectedFile);
      setError(null);
    } else {
      setError("Please select a valid PDF file");
      setFile(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setTables([]);

    try {
      const formData = new FormData();
      formData.append("pdf", file);

      // Use raw endpoint - no parsing
      const response = await fetch("/api/extract-raw", {
        method: "POST",
        body: formData,
      });

      const data: RawResponse = await response.json();

      if (data.success && data.raw_tables) {
        setTables(data.raw_tables);
      } else {
        setError(data.error || "Extraction failed");
      }
    } catch (err) {
      setError("Network error. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setTables([]);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-full mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Raw Table Extractor</h1>
          <p className="text-gray-600 text-sm">Shows exact tables from PDF - no parsing</p>
        </header>

        {/* Upload */}
        <div className="bg-white rounded-lg border p-4 mb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleUpload}
              disabled={!file || loading}
              className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400"
            >
              {loading ? "Extracting..." : "Extract Tables"}
            </button>
            {(file || tables.length > 0) && (
              <button
                onClick={handleReset}
                className="px-4 py-2 border rounded"
              >
                Reset
              </button>
            )}
          </div>
          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        </div>

        {/* Raw Tables */}
        {tables.map((table) => (
          <div key={table.index} className="bg-white rounded-lg border p-4 mb-4">
            <h3 className="font-mono text-sm text-gray-500 mb-2">
              Table {table.index} - {table.path}
            </h3>
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse">
                <tbody>
                  {table.rows.map((row, rowIdx) => (
                    <tr key={rowIdx} className={rowIdx === 0 ? "bg-gray-100" : ""}>
                      {row.map((cell, cellIdx) => (
                        <td
                          key={cellIdx}
                          className="border border-gray-300 px-2 py-1 whitespace-pre-wrap max-w-xs"
                        >
                          {cell || <span className="text-gray-300">-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {tables.length > 0 && (
          <p className="text-sm text-gray-500">
            Found {tables.length} tables in PDF
          </p>
        )}
      </div>
    </main>
  );
}
