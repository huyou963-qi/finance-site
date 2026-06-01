import type { IBApi } from "@stoqey/ib";
import { EventName } from "@stoqey/ib";
import { withIbkrTwsApi } from "@/lib/data/ibkrTwsConnection";

let nextTwsReqId = 8000;

export function allocIbkrTwsReqId(): number {
  nextTwsReqId += 1;
  return nextTwsReqId;
}

/** TWS ExecutionFilter.time：yyyymmdd hh:mm:ss */
export function formatTwsFilterTime(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}${mo}${day} ${h}:${mi}:${s}`;
}

export function twsManagedAccountsOn(ib: IBApi): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("TWS reqManagedAccts 超时（30s）"));
    }, 30_000);

    const onAccounts = (list: string): void => {
      cleanup();
      resolve(
        list
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
    };

    const onError = (err: Error, code: number, reqId: number): void => {
      if (reqId !== -1) return;
      cleanup();
      reject(new Error(`TWS 账户列表错误 ${code}: ${err.message}`));
    };

    const cleanup = (): void => {
      clearTimeout(timeout);
      ib.off(EventName.managedAccounts, onAccounts);
      ib.off(EventName.error, onError);
    };

    ib.on(EventName.managedAccounts, onAccounts);
    ib.on(EventName.error, onError);
    ib.reqManagedAccts();
  });
}

export async function twsManagedAccounts(): Promise<string[]> {
  return withIbkrTwsApi((ib) => twsManagedAccountsOn(ib));
}
