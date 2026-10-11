import { yahooKlineProvider } from "@/lib/data/providers/yahooKlineProvider";
import { eastmoneyKlineProvider } from "./eastmoneyKlineProvider";
import { KlineResponseCache } from "../klineResponseCache";
import { postgresKlineCacheStore, KlineCacheStorageError } from "../postgresKlineCacheStore";
import { MemoryKlineCacheStore } from "../memoryKlineCacheStore";
import { KlineLoadGate } from "../klineLoadGate";
import type {
  KlineFetchRequest,
  KlineMarketDataProvider,
  KlineProviderId,
} from "@/lib/data/providers/klineProviderTypes";
import type { KlineFetchWindowOptions, KlinePayload } from "@/lib/data/types";

const registry = new Map<KlineProviderId, KlineMarketDataProvider>([
  ["yahoo", yahooKlineProvider],
  ["eastmoney", eastmoneyKlineProvider],
]);

const responseCache = new KlineResponseCache(postgresKlineCacheStore);
const emergencyCache = new KlineResponseCache(new MemoryKlineCacheStore());
let retrySharedCacheAt = 0;
const loadGate = new KlineLoadGate();

/** 运行时注册或替换提供者（测试或接入额外数据源时可在服务端启动阶段调用） */
export function registerOrReplaceKlineProvider(
  provider: KlineMarketDataProvider,
): void {
  registry.set(provider.id, provider);
}

export function getRegisteredKlineProvider(
  id: string,
): KlineMarketDataProvider | undefined {
  return registry.get(id as KlineProviderId);
}

export function listRegisteredKlineProviderIds(): readonly KlineProviderId[] {
  return [...registry.keys()];
}

/** 校验窗口能力与提供者能力是否一致；返回错误文案，无问题则 null。 */
export function validateKlineWindowForProvider(
  provider: KlineMarketDataProvider,
  window: KlineFetchWindowOptions,
): string | null {
  const hasRange =
    window.fromTimeSec != null &&
    window.toTimeSec != null &&
    window.fromTimeSec < window.toTimeSec;
  const hasBefore = window.beforeTimeSec != null;

  if (hasBefore && hasRange) {
    return "before 与 fromSec/toSec 不能同时使用";
  }
  if (hasRange && !provider.capabilities.supportsExplicitTimeRange) {
    return `${provider.id} 不支持 fromSec/toSec；请仅用 limit + before= 分页`;
  }
  return null;
}

export async function fetchKlinesWithProvider(
  id: KlineProviderId,
  req: KlineFetchRequest,
): Promise<KlinePayload> {
  const provider = registry.get(id);
  if (!provider) {
    throw new Error(`未知 K 线数据源：${id}`);
  }
  const v = validateKlineWindowForProvider(provider, req.window);
  if (v) throw new Error(v);
  let loaded: Promise<KlinePayload> | undefined;
  const load = (normalized: KlineFetchRequest) => loaded ??= loadGate.run(() => provider.fetch(normalized));
  if (Date.now() >= retrySharedCacheAt) {
    try { return await responseCache.fetch(id, req, load); }
    catch (e) {
      if (!(e instanceof KlineCacheStorageError)) throw e;
      retrySharedCacheAt = Date.now() + 30_000;
      console.warn("[kline-cache] PostgreSQL unavailable; using bounded process cache for 30 seconds");
    }
  }
  const payload = await emergencyCache.fetch(id, req, load);
  return { ...payload, attribution: `共享缓存暂不可用，使用临时缓存 · ${payload.attribution ?? ""}` };
}
