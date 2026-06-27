import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Logi — PDF Ingestion",
  description: "Stage 1: visual PDF ingestion and table conversion via Mistral OCR",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body
        style={{
          margin: 0,
          fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
          background: "var(--color-page-bg)",
          color: "var(--color-text)",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
          lineHeight: 1.5,
        }}
      >
        {children}
      </body>
    </html>
  );
}
