import { promises as fs } from "node:fs";
import { rateLimitLogFile } from "../config/paths";
import type { SourceId } from "../library/types";

/** Platform rate limits (requests per hour). */
export const PLATFORM_LIMITS: Record<string, number> = {
  youtube: 100, // ~100 requests/hour
  soundcloud: 200, // ~200-300 requests/hour (conservative)
  spotify: 100, // Uses YouTube's limit (downloads via YouTube matching)
  link: 100, // No platform limit, use conservative default
  local: 100, // No platform limit, use conservative default
};

/** Safety margin: only use 80% of platform limit to avoid hitting it. */
const SAFETY_MARGIN = 0.8;

/** Rolling window size in milliseconds (60 minutes). */
const WINDOW_MS = 60 * 60 * 1000;

interface DownloadLog {
  version: 1;
  /** Map of source ID to array of download timestamps (ms). */
  logs: Record<string, number[]>;
}

/**
 * Get the effective rate limit for a source (with safety margin).
 * Spotify uses YouTube's limit since it downloads via YouTube matching.
 */
export function getEffectiveLimit(source: SourceId): number {
  const effectiveSource = source === "spotify" ? "youtube" : source;
  const platformLimit = PLATFORM_LIMITS[effectiveSource] ?? 100;
  return Math.floor(platformLimit * SAFETY_MARGIN);
}

/**
 * Load the download log from disk.
 */
export async function loadDownloadLog(): Promise<Map<SourceId, number[]>> {
  try {
    const raw = await fs.readFile(rateLimitLogFile, "utf8");
    const parsed = JSON.parse(raw) as DownloadLog;
    if (parsed && parsed.version === 1 && parsed.logs) {
      const map = new Map<SourceId, number[]>();
      for (const [source, timestamps] of Object.entries(parsed.logs)) {
        // Clean up old timestamps outside the 60-minute window
        const now = Date.now();
        const valid = (timestamps as number[]).filter((ts) => now - ts < WINDOW_MS);
        if (valid.length > 0) {
          map.set(source as SourceId, valid);
        }
      }
      return map;
    }
  } catch {
    // missing or invalid: start fresh
  }
  return new Map();
}

/**
 * Save the download log to disk.
 */
export async function saveDownloadLog(log: Map<SourceId, number[]>): Promise<void> {
  const snapshot: DownloadLog = {
    version: 1,
    logs: Object.fromEntries(log),
  };
  const dir = rateLimitLogFile.substring(0, rateLimitLogFile.lastIndexOf("/"));
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${rateLimitLogFile}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), "utf8");
  await fs.rename(tmp, rateLimitLogFile);
}

/**
 * Check if a source is rate-limited based on download history.
 * Returns the cooldown time in milliseconds if rate-limited, or 0 if not.
 */
export function checkRateLimit(
  source: SourceId,
  log: Map<SourceId, number[]>,
): { rateLimited: boolean; cooldownMs: number; currentCount: number } {
  const timestamps = log.get(source) ?? [];
  const now = Date.now();
  
  // Filter to downloads within the 60-minute window
  const recent = timestamps.filter((ts) => now - ts < WINDOW_MS);
  const limit = getEffectiveLimit(source);
  
  if (recent.length >= limit) {
    // Rate limited: calculate cooldown until oldest download falls out of window
    const oldest = recent[0]!;
    const cooldownMs = oldest + WINDOW_MS - now;
    return { rateLimited: true, cooldownMs, currentCount: recent.length };
  }
  
  return { rateLimited: false, cooldownMs: 0, currentCount: recent.length };
}

/**
 * Record a successful download for a source.
 */
export function recordDownload(source: SourceId, log: Map<SourceId, number[]>): void {
  const timestamps = log.get(source) ?? [];
  const now = Date.now();
  
  // Add new timestamp
  timestamps.push(now);
  
  // Clean up old timestamps outside the window
  const recent = timestamps.filter((ts) => now - ts < WINDOW_MS);
  log.set(source, recent);
}

/**
 * Clear download history for a source (e.g., after a long pause or manual reset).
 */
export function clearSourceLog(source: SourceId, log: Map<SourceId, number[]>): void {
  log.delete(source);
}
