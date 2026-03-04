// ============================================================================
// In-Memory Rate Limiter — src/lib/rate-limit.ts
// ============================================================================
// Simple sliding-window rate limiter using a Map.
// Suitable for single-instance deployments (Vercel serverless functions).
// Each cold start gets a fresh Map, so limits are per-instance best-effort.
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Periodic cleanup of expired entries
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, 60_000);
  // Unref so it doesn't keep the process alive in Node
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    (cleanupTimer as NodeJS.Timeout).unref();
  }
}

export interface RateLimitConfig {
  /** Unique prefix for this limiter (e.g., 'mentor', 'signup') */
  prefix: string;
  /** Maximum number of requests in the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check and consume a rate limit token for the given key.
 * Returns whether the request is allowed.
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  ensureCleanup();
  const fullKey = `${config.prefix}:${key}`;
  const now = Date.now();
  const entry = store.get(fullKey);

  if (!entry || now > entry.resetAt) {
    // Fresh window
    const resetAt = now + config.windowSeconds * 1000;
    store.set(fullKey, { count: 1, resetAt });
    return { allowed: true, remaining: config.limit - 1, resetAt };
  }

  if (entry.count >= config.limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: config.limit - entry.count, resetAt: entry.resetAt };
}

/** Extract client IP from request headers (works behind proxies like Vercel). */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || '127.0.0.1';
}
