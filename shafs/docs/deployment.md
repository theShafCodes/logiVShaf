# Deployment Guide

How to run the app in production. All configuration is driven by environment
variables — no code changes needed between environments.

---

## Prerequisites

- Node.js ≥ 18 (uses native `fetch`, `crypto.randomUUID`, `ReadableStream`)
- npm ≥ 9
- A Mistral API key (OCR — Stage 1)
- A Google Maps API key (Routes API v2 — Stage 5)

---

## Local development

```bash
cd shafs
cp .env.example .env        # fill in your API keys
npm install
npm run dev                 # starts on http://localhost:3000
```

Config knobs in `.env` — see `.env.example` for all keys with comments.

---

## Environment variables (production)

All variables have safe defaults. Only the API keys **must** be set in
production.

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `MISTRAL_API_KEY` | Yes (Stage 1) | `""` | OCR API key |
| `GOOGLE_MAPS_API_KEY` | Yes (Stage 5) | `""` | Routes API v2 key |
| `OCR_PROVIDER` | No | `mistral` | `mistral` or `tesseract` |
| `LOG_LEVEL` | No | `info` | `debug\|info\|warn\|error` |
| `LOG_PRETTY` | No | `true` | `false` → JSON lines (better for log aggregators) |
| `FRAGILITY_SURCHARGE_PER_ITEM` | No | `5` | £ per fragile item |
| `PACKING_TOLERANCE_MM` | No | `5` | Clearance slack (mm) |
| `PACKING_MAX_VANS` | No | `50` | Max fleet vans to evaluate |
| `QUOTE_HISTORY_PATH` | No | `data/quote-history.json` | Where history is written |
| `OCR_CACHE_ENABLED` | No | `true` | Reuse prior OCR results |
| `OCR_CACHE_DIR` | No | `.ocr-cache` | Cache directory |
| `R2_STORAGE_ENABLED` | No | `false` | Enable Cloudflare R2 archiving |

---

## Production build

```bash
npm run build    # next build — outputs to .next/
npm run start    # next start — serves the built app
```

The app is a standard Next.js app with `runtime: "nodejs"` on all API routes.
It can deploy to any platform that supports Node.js servers.

---

## Vercel (recommended)

1. Push the `shafs/` directory as a Vercel project root.
2. In **Settings → Environment Variables**, add:
   - `MISTRAL_API_KEY`
   - `GOOGLE_MAPS_API_KEY`
3. Deploy.

The `data/quote-history.json` file writes to disk. On Vercel (ephemeral
filesystem), history resets on each deploy. To persist history across deploys,
set `QUOTE_HISTORY_PATH` to a path in `/tmp` or switch to a database-backed
store.

---

## Cloudflare R2 (optional PDF archiving)

To archive source PDFs and structured documents to R2, enable object storage:

```
R2_STORAGE_ENABLED=true
R2_ACCOUNT_ID=<your-account-id>
R2_ACCESS_KEY_ID=<r2-access-key>
R2_SECRET_ACCESS_KEY=<r2-secret>
R2_BUCKET=<bucket-name>
```

Uploads are content-addressed (SHA-256), so re-uploading the same PDF is
idempotent. R2 uses the S3-compatible API; credentials come from the R2
dashboard → Manage API tokens.

---

## Google Maps API key scope

The Routes API v2 endpoint called by the packer:
```
https://routes.googleapis.com/directions/v2:computeRoutes
```

Minimum required API: **Routes API** (not the older Directions API).
Restrict the key to **Routes API** and **server IP** for production.
Never expose the key client-side — it is server-only, never prefixed
`NEXT_PUBLIC_`.

---

## Config files (fleet / stackability / column map)

The three JSON config files in `config/` are read at runtime, not baked into
the build. Editing them does not require a redeploy — they are read fresh on
each server restart. On serverless platforms (Vercel), config changes require
a redeploy because each cold-start reads from the deployed bundle.

| File | Purpose |
|------|---------|
| `config/vans.json` | Van fleet — dimensions, payload, per-mile rates |
| `config/stackability.json` | Stacking rules — densities, crush limits, fragility |
| `config/column-map.json` | PDF table column mapping — indices, category patterns |
| `config/fragility-rules.json` | Keyword rules for fragility classification |

---

## Health check

No dedicated `/api/health` endpoint yet. A quick sanity check:

```bash
curl http://localhost:3000/api/vans   # should return { vans: [...] }
```
