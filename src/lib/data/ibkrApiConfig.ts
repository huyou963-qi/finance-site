/**
 * IBKR 数据通道开关（.env.local）。
 *
 * - `cp`（默认）：全部 IB 功能走 Client Portal Web API（Gateway HTTPS + Cookie）
 * - `tws`：全部 IB 功能走 TWS / IB Gateway Socket API
 *
 * 二选一，勿混用；切换后需重启 `npm run dev`。
 */
export type IbkrApiMode = "cp" | "tws";

export function getIbkrApiMode(): IbkrApiMode {
  const raw = (process.env.IBKR_API_MODE ?? "cp").trim().toLowerCase();
  if (raw === "tws") return "tws";
  return "cp";
}

export function isIbkrTwsMode(): boolean {
  return getIbkrApiMode() === "tws";
}

export function isIbkrCpMode(): boolean {
  return getIbkrApiMode() === "cp";
}

export function getIbkrTwsConnectionOptions(): {
  host: string;
  port: number;
  clientId: number;
} {
  const host = process.env.IBKR_TWS_HOST?.trim() || "127.0.0.1";
  const port = Number(process.env.IBKR_TWS_PORT ?? "7496");
  const clientId = Number(process.env.IBKR_TWS_CLIENT_ID ?? "1");
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 7496,
    clientId: Number.isFinite(clientId) && clientId >= 0 ? clientId : 1,
  };
}

export function isIbkrTwsConfigured(): boolean {
  return Boolean(process.env.IBKR_TWS_HOST?.trim() || process.env.IBKR_TWS_PORT);
}
