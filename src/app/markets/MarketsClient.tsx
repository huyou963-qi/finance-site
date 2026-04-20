"use client";

import { useState } from "react";
import { CandlestickPanel } from "@/components/CandlestickPanel";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;
const INTERVALS = ["1d", "4h", "1h"] as const;

export function MarketsClient() {
  const [symbol, setSymbol] = useState<(typeof SYMBOLS)[number]>("BTCUSDT");
  const [interval, setInterval] = useState<(typeof INTERVALS)[number]>("1d");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-50">K 线（现货）</h1>
        <p className="mt-1 text-sm text-slate-400">
          经服务端转发请求 Binance 公开 REST（无需密钥）。若网络不可达则回退随机演示数据；生产环境请评估合规与供应商条款。
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-slate-400">
          交易对
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value as (typeof SYMBOLS)[number])}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
          >
            {SYMBOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-slate-400">
          周期
          <select
            value={interval}
            onChange={(e) =>
              setInterval(e.target.value as (typeof INTERVALS)[number])
            }
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
          >
            {INTERVALS.map((iv) => (
              <option key={iv} value={iv}>
                {iv}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
        <CandlestickPanel key={`${symbol}-${interval}`} symbol={symbol} interval={interval} />
      </div>
    </div>
  );
}
