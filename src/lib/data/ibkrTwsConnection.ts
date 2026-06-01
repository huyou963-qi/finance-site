import { klineDebugLog } from "@/lib/data/klineDebug";
import { getIbkrTwsConnectionOptions } from "@/lib/data/ibkrApiConfig";
import { IBApi, EventName } from "@stoqey/ib";

const GLOBAL_KEY = "__financeSiteIbkrTwsConnection";

const CONNECT_TIMEOUT_MS = 60_000;

type TwsGlobalState = {
  api: IBApi | null;
  connectPromise: Promise<IBApi> | null;
  ready: boolean;
  opChain: Promise<unknown>;
};

function globalState(): TwsGlobalState {
  const g = globalThis as unknown as Record<string, TwsGlobalState | undefined>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      api: null,
      connectPromise: null,
      ready: false,
      opChain: Promise.resolve(),
    };
  }
  return g[GLOBAL_KEY]!;
}

function createApi(): IBApi {
  const { host, port } = getIbkrTwsConnectionOptions();
  return new IBApi({ host, port });
}

function resetState(s: TwsGlobalState): void {
  s.api = null;
  s.connectPromise = null;
  s.ready = false;
}

function failConnect(
  s: TwsGlobalState,
  ib: IBApi,
  reject: (reason: Error) => void,
  message: string,
): void {
  s.connectPromise = null;
  try {
    ib.disconnect();
  } catch {
    /* ignore */
  }
  if (s.api === ib) {
    resetState(s);
  }
  reject(new Error(message));
}

function startConnect(s: TwsGlobalState): Promise<IBApi> {
  if (s.api && !s.api.isConnected) {
    try {
      s.api.disconnect();
    } catch {
      /* ignore */
    }
    resetState(s);
  }

  const ib = createApi();
  const { host, port, clientId } = getIbkrTwsConnectionOptions();

  klineDebugLog("ibkr", "tws.connect.start", { host, port, clientId });

  return new Promise<IBApi>((resolve, reject) => {
    const timeout = setTimeout(() => {
      failConnect(
        s,
        ib,
        reject,
        `连接 TWS/IB Gateway 超时（${host}:${port} clientId=${clientId}，${CONNECT_TIMEOUT_MS / 1000}s）。持仓能加载而 K 线失败时，请重启 TWS 与 dev 服务，或把 IBKR_TWS_CLIENT_ID 改为 2。`,
      );
    }, CONNECT_TIMEOUT_MS);

    ib.once(EventName.nextValidId, () => {
      clearTimeout(timeout);
      s.api = ib;
      s.ready = true;
      klineDebugLog("ibkr", "tws.connect.ready", { clientId });
      resolve(ib);
    });

    ib.on(EventName.error, (err, code, reqId) => {
      if (reqId !== -1) return;
      clearTimeout(timeout);
      failConnect(
        s,
        ib,
        reject,
        `TWS API 错误 ${code}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    ib.on(EventName.disconnected, () => {
      klineDebugLog("ibkr", "tws.disconnected", {});
      resetState(s);
    });

    ib.connect(clientId);
  });
}

async function getIbkrTwsApiInner(): Promise<IBApi> {
  const s = globalState();

  if (s.api?.isConnected && s.ready) {
    klineDebugLog("ibkr", "tws.connect.reuse", {});
    return s.api;
  }

  if (!s.connectPromise) {
    s.connectPromise = startConnect(s);
  }

  return s.connectPromise;
}

/**
 * 复用全局单例 TWS 连接（跨 API 路由、避免 dev 热重载丢连接）。
 * 业务调用请优先用 {@link withIbkrTwsApi} 串行排队，减轻并发抢连。
 */
export async function getIbkrTwsApi(): Promise<IBApi> {
  return getIbkrTwsApiInner();
}

/** 在已就绪的 TWS 连接上串行执行（持仓、K 线、联想等共用） */
export async function withIbkrTwsApi<T>(fn: (ib: IBApi) => Promise<T>): Promise<T> {
  const s = globalState();
  const run = s.opChain.then(async () => fn(await getIbkrTwsApiInner()));
  s.opChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function resetIbkrTwsConnectionForTests(): void {
  const s = globalState();
  s.api?.disconnect();
  resetState(s);
  s.opChain = Promise.resolve();
}
