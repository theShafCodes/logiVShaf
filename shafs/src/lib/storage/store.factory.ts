/**
 * Resolves the active ObjectStore from config. Returns a live R2 store only when
 * storage is enabled AND fully configured; otherwise a NoopObjectStore, so the
 * app runs unchanged with no R2 credentials (safe default). Missing-but-enabled
 * config is logged once and degrades to noop rather than throwing at request time.
 */
import { getConfig } from "@/config/env";
import { createLogger } from "@/lib/logger/logger";
import { NoopObjectStore, type ObjectStore } from "@/lib/storage/object-store";
import { R2ObjectStore } from "@/lib/storage/r2.store";

const logger = createLogger("storage.factory");

let cached: ObjectStore | null = null;

export function getObjectStore(): ObjectStore {
  if (cached) return cached;

  const s = getConfig().storage;
  if (!s.enabled) {
    cached = new NoopObjectStore();
    return cached;
  }

  const missing = (["accountId", "accessKeyId", "secretAccessKey", "bucket"] as const).filter(
    (k) => s[k] === "",
  );
  if (missing.length > 0) {
    logger.warn("R2 storage enabled but config incomplete — falling back to noop", { missing });
    cached = new NoopObjectStore();
    return cached;
  }

  cached = new R2ObjectStore({
    accountId: s.accountId,
    accessKeyId: s.accessKeyId,
    secretAccessKey: s.secretAccessKey,
    bucket: s.bucket,
  });
  logger.info("R2 storage active", { bucket: s.bucket });
  return cached;
}
