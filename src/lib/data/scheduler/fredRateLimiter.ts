/** FRED API 全局限流：≥ minIntervalMs 间隔，遇暂时性限流/网关错误等待后重试 */

const DEFAULT_MIN_INTERVAL_MS = 600;
const DEFAULT_MAX_RETRIES = 6;
const DEFAULT_RETRY_WAIT_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type FredRateLimiterOptions = {
  minIntervalMs?: number;
  maxRetries?: number;
  retryWaitMs?: number;
};

export class FredRateLimiter {
  private lastAt = 0;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly retryWaitMs: number;

  constructor(options: FredRateLimiterOptions = {}) {
    this.minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryWaitMs = options.retryWaitMs ?? DEFAULT_RETRY_WAIT_MS;
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastAt;
    if (elapsed < this.minIntervalMs) {
      await sleep(this.minIntervalMs - elapsed);
    }
    this.lastAt = Date.now();
  }

  /** 带间隔与暂时性 HTTP/网络错误重试的 fetch */
  async fetch(url: string, init?: RequestInit): Promise<Response> {
    let attempt = 0;
    const expectsJson = new URL(url).searchParams.get("file_type") === "json";
    while (true) {
      await this.wait();
      init?.signal?.throwIfAborted();
      try {
        const res = await fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(30_000) });
        // FRED's 502/503/504 responses are gateway-side transients, just like
        // rate limiting. Do not retry client errors or a genuine API response.
        if (res.status !== 429 && res.status !== 502 && res.status !== 503 && res.status !== 504) {
          if (res.ok && expectsJson) {
            try {
              // Preserve the original body for callers; never log gateway
              // bodies or request URLs, which may contain credentials.
              await res.clone().json();
            } catch {
              throw new Error(`FRED invalid JSON response (HTTP ${res.status})`);
            }
          }
          return res;
        }
        attempt += 1;
        if (attempt >= this.maxRetries) return res;
      } catch (error) {
        if (init?.signal?.aborted) throw error;
        attempt += 1;
        if (attempt >= this.maxRetries) throw error;
      }
      await sleep(this.retryWaitMs);
    }
  }
}

let sharedLimiter: FredRateLimiter | null = null;
let sharedIntervalMs = DEFAULT_MIN_INTERVAL_MS;

export function getFredRateLimiter(minIntervalMs = DEFAULT_MIN_INTERVAL_MS): FredRateLimiter {
  if (!sharedLimiter || sharedIntervalMs !== minIntervalMs) {
    sharedLimiter = new FredRateLimiter({ minIntervalMs });
    sharedIntervalMs = minIntervalMs;
  }
  return sharedLimiter;
}
