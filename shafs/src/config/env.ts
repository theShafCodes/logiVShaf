/**
 * Single source of truth for all runtime configuration.
 *
 * Rule: no other module reads `process.env` directly. Every tunable lives here,
 * is typed, coerced, and validated once at first import. Defaults are explicit
 * and centralised — never scattered as magic literals across the codebase.
 */

type RawEnv = Record<string, string | undefined>;

class ConfigError extends Error {
  constructor(message: string) {
    super(`[config] ${message}`);
    this.name = "ConfigError";
  }
}

function readString(raw: RawEnv, key: string, fallback?: string): string {
  const value = raw[key]?.trim();
  if (value === undefined || value === "") {
    if (fallback !== undefined) return fallback;
    throw new ConfigError(`Missing required env var: ${key}`);
  }
  return value;
}

function readInt(raw: RawEnv, key: string, fallback: number): number {
  const value = raw[key]?.trim();
  if (value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ConfigError(`Env var ${key} must be a non-negative integer, got "${value}"`);
  }
  return parsed;
}

function readFloat(raw: RawEnv, key: string, fallback: number): number {
  const value = raw[key]?.trim();
  if (value === undefined || value === "") return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ConfigError(`Env var ${key} must be a non-negative number, got "${value}"`);
  }
  return parsed;
}

function readBool(raw: RawEnv, key: string, fallback: boolean): boolean {
  const value = raw[key]?.trim().toLowerCase();
  if (value === undefined || value === "") return fallback;
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  throw new ConfigError(`Env var ${key} must be a boolean, got "${value}"`);
}

function readCsv(raw: RawEnv, key: string, fallback: string[]): string[] {
  const value = raw[key]?.trim();
  if (value === undefined || value === "") return fallback;
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

function readLogLevel(raw: RawEnv, key: string, fallback: LogLevel): LogLevel {
  const value = raw[key]?.trim().toLowerCase() as LogLevel | undefined;
  if (!value) return fallback;
  if (!LOG_LEVELS.includes(value)) {
    throw new ConfigError(`Env var ${key} must be one of ${LOG_LEVELS.join("|")}, got "${value}"`);
  }
  return value;
}

export interface AppConfig {
  readonly ocr: {
    readonly provider: string;
    readonly apiKey: string;
    readonly model: string;
    readonly timeoutMs: number;
    readonly maxRetries: number;
    readonly retryBaseDelayMs: number;
    readonly includeImages: boolean;
    readonly cache: {
      /** Reuse a prior OCR result for an identical PDF instead of re-billing the provider. */
      readonly enabled: boolean;
      /** Directory holding cached OCR results (one JSON per content hash + provider). */
      readonly dir: string;
    };
    readonly tesseract: {
      readonly lang: string;
      readonly scale: number;
      /** Drop OCR words below this confidence (0–100) before reconstructing tables. */
      readonly minConfidence: number;
      /** New row when vertical gap exceeds this × median word height. */
      readonly rowGapFactor: number;
      /** New column when horizontal gap exceeds this × median word height. */
      readonly colGapFactor: number;
      /** A row needs at least this many words to count as tabular. */
      readonly minColumns: number;
      /** A segment needs at least this many rows to be emitted as a table. */
      readonly minTableRows: number;
    };
  };
  readonly ingest: {
    readonly maxFileBytes: number;
    readonly allowedMimeTypes: string[];
  };
  readonly classification: {
    readonly provider: string;
    readonly rulesPath: string;
  };
  readonly packing: {
    /** Stacking matrix file (category → stack rules + fallback density). */
    readonly stackabilityPath: string;
    /** Column-map file (table column indices + category code patterns). */
    readonly columnMapPath: string;
    /** Van fleet presets file. */
    readonly vansPath: string;
    /** Clearance slack (mm) allowed when fitting a box into the interior / gaps. */
    readonly toleranceMm: number;
    /** Cap on how many fleet vans the ranking fallback will evaluate. */
    readonly maxVansToConsider: number;
  };
  readonly observability: {
    readonly logLevel: LogLevel;
    readonly logPretty: boolean;
    readonly perfEnabled: boolean;
  };
}

function buildConfig(raw: RawEnv): AppConfig {
  return {
    ocr: {
      provider: readString(raw, "OCR_PROVIDER", "mistral"),
      apiKey: readString(raw, "MISTRAL_API_KEY"),
      model: readString(raw, "MISTRAL_OCR_MODEL", "mistral-ocr-latest"),
      timeoutMs: readInt(raw, "OCR_TIMEOUT_MS", 120_000),
      maxRetries: readInt(raw, "OCR_MAX_RETRIES", 2),
      retryBaseDelayMs: readInt(raw, "OCR_RETRY_BASE_DELAY_MS", 500),
      includeImages: readBool(raw, "OCR_INCLUDE_IMAGES", false),
      cache: {
        enabled: readBool(raw, "OCR_CACHE_ENABLED", true),
        dir: readString(raw, "OCR_CACHE_DIR", ".ocr-cache"),
      },
      tesseract: {
        lang: readString(raw, "TESSERACT_LANG", "eng"),
        scale: readInt(raw, "TESSERACT_SCALE", 2),
        minConfidence: readFloat(raw, "TESSERACT_MIN_CONFIDENCE", 40),
        rowGapFactor: readFloat(raw, "TESSERACT_ROW_GAP_FACTOR", 0.6),
        colGapFactor: readFloat(raw, "TESSERACT_COL_GAP_FACTOR", 1.2),
        minColumns: readInt(raw, "TESSERACT_MIN_COLUMNS", 2),
        minTableRows: readInt(raw, "TESSERACT_MIN_TABLE_ROWS", 2),
      },
    },
    ingest: {
      maxFileBytes: readInt(raw, "INGEST_MAX_FILE_BYTES", 26_214_400),
      allowedMimeTypes: readCsv(raw, "INGEST_ALLOWED_MIME", ["application/pdf"]),
    },
    classification: {
      provider: readString(raw, "CLASSIFIER_PROVIDER", "rule"),
      rulesPath: readString(raw, "FRAGILITY_RULES_PATH", "config/fragility-rules.json"),
    },
    packing: {
      stackabilityPath: readString(raw, "PACKING_STACKABILITY_PATH", "config/stackability.json"),
      columnMapPath: readString(raw, "PACKING_COLUMN_MAP_PATH", "config/column-map.json"),
      vansPath: readString(raw, "PACKING_VANS_PATH", "config/vans.json"),
      toleranceMm: readFloat(raw, "PACKING_TOLERANCE_MM", 5),
      maxVansToConsider: readInt(raw, "PACKING_MAX_VANS", 10),
    },
    observability: {
      logLevel: readLogLevel(raw, "LOG_LEVEL", "info"),
      logPretty: readBool(raw, "LOG_PRETTY", true),
      perfEnabled: readBool(raw, "PERF_ENABLED", true),
    },
  };
}

let cached: AppConfig | null = null;

/** Lazily builds and caches config. Throws ConfigError on first invalid/missing var. */
export function getConfig(): AppConfig {
  if (cached === null) cached = buildConfig(process.env);
  return cached;
}

/** Test/CLI hook — build config from an explicit source without touching the cache. */
export function buildConfigFrom(raw: RawEnv): AppConfig {
  return buildConfig(raw);
}
