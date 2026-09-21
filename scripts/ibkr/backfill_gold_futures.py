"""
盈透（IBKR）一次性回填：COMEX 黄金期货逐合约日线（含已到期合约）+ XAUUSD 现货日线。

为什么需要盈透：Yahoo 只保留**当前挂牌**合约，已到期合约的历史拿不到或不可信；免费源里
CME 403 且需授权、Stooq 反爬、Nasdaq CHRIS 已停止免费提供。盈透 TWS API 支持
`includeExpired=True` 查询已到期期货，但**只保留到期后约两年**的数据。

另外盈透的 XAUUSD 日线收盘在纽约 17:00，与 COMEX 期货收盘时点基本同步，可以消掉
WGC（LBMA 伦敦 15:00 定盘）与 COMEX 收盘之间约 0.3–0.4% 的时点错配噪音。

这是**只读**脚本：以 readonly=True 连接，没有任何下单能力。
它**不写数据库**，只输出 CSV（你本机 .env.local 指向的是本地开发库，不是生产库）；
CSV 之后用 `npm run futures:import-csv -- <文件>` 在服务器上导入 mds.futures_contract_bar。

────────────────────────────────────────────────────────────────────────
使用前（这几步只能你本人操作，脚本不接触、也不保存你的账户密码）：
  1. pip install ib_async
  2. 启动 TWS（或 IB Gateway）并用你的账户登录（含二次验证）
  3. TWS → 配置 → API → 设置：勾选「启用 ActiveX 和 Socket 客户端」，
     记下端口（实盘 TWS 默认 7496、模拟盘 7497；IB Gateway 实盘 4001、模拟盘 4002），
     建议勾选「只读 API」
  4. 历史期货行情需要 COMEX 行情订阅；没有会报错误 162「No market data permissions」

用法：
  python scripts/ibkr/backfill_gold_futures.py --port 7496 --check     # 先自检：连通 + 列合约 + 试拉一个
  python scripts/ibkr/backfill_gold_futures.py --port 7496             # 全量回填，输出到 ./ibkr_out/
────────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import sys
import time
from pathlib import Path

try:
    from ib_async import IB, Contract, Future, util  # noqa: F401
except ImportError:
    sys.exit("缺少 ib_async：请先运行  pip install ib_async")

ROOT = "GC"
EXCHANGE = "COMEX"
# 盈透历史数据限流：10 分钟内不超过 60 次请求，且 15 秒内不得重复相同请求。
# 每次请求后等 11 秒，稳稳落在限额内。
PACING_SECONDS = 11

errors: list[tuple[int, int, str]] = []


def on_error(req_id, code, msg, contract):  # noqa: ANN001
    # 2104/2106/2158 等是「行情农场连接正常」的通知，不是错误
    if code in (2104, 2106, 2107, 2108, 2119, 2158):
        return
    errors.append((req_id, code, msg))
    print(f"    [IBKR {code}] {msg}")


def list_contracts(ib: IB):
    details = ib.reqContractDetails(
        Future(symbol=ROOT, exchange=EXCHANGE, currency="USD", includeExpired=True)
    )
    # contractMonth（如 202612）才是交割月；lastTradeDateOrContractMonth 是最后交易日
    details.sort(key=lambda d: d.contractMonth or d.contract.lastTradeDateOrContractMonth)
    return details


def fetch_contract(ib: IB, cd, duration: str):
    c = cd.contract
    c.includeExpired = True
    last = c.lastTradeDateOrContractMonth  # YYYYMMDD
    expired = last and dt.datetime.strptime(last[:8], "%Y%m%d").date() < dt.date.today()
    # 已到期合约把截止时间设在最后交易日，避免请求落在合约存续期之外
    end = f"{last[:8]} 23:59:59 US/Eastern" if expired else ""
    return ib.reqHistoricalData(
        c, endDateTime=end, durationStr=duration, barSizeSetting="1 day",
        whatToShow="TRADES", useRTH=False, formatDate=1, timeout=90,
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=7496, help="实盘 TWS 7496 / 模拟 7497 / 网关 4001·4002")
    ap.add_argument("--client-id", type=int, default=91)
    ap.add_argument("--check", action="store_true", help="只做自检：连通、列合约、试拉一个合约")
    ap.add_argument("--duration", default="2 Y", help="每个合约回看时长（盈透到期合约约保留两年）")
    ap.add_argument("--out", default="ibkr_out")
    args = ap.parse_args()

    ib = IB()
    ib.errorEvent += on_error
    print(f"连接 TWS {args.host}:{args.port}（只读）…")
    try:
        ib.connect(args.host, args.port, clientId=args.client_id, readonly=True, timeout=15)
    except Exception as e:  # noqa: BLE001
        sys.exit(f"连不上 TWS：{e}\n请确认 TWS 已登录、API 已启用、端口正确。")

    try:
        details = list_contracts(ib)
        print(f"找到 {ROOT} 合约 {len(details)} 个（含已到期）：")
        for cd in details:
            c = cd.contract
            print(f"  {c.localSymbol:<8} 交割月 {cd.contractMonth}  最后交易日 {c.lastTradeDateOrContractMonth}")
        if not details:
            sys.exit("没有列出任何合约：检查账户是否有期货交易权限。")

        if args.check:
            probe = details[len(details) // 2]
            print(f"\n试拉 {probe.contract.localSymbol} 最近 1 个月日线…")
            bars = fetch_contract(ib, probe, "1 M")
            if bars:
                print(f"  ✓ 取到 {len(bars)} 根，最新 {bars[-1].date} 收 {bars[-1].close}")
                print("自检通过，可以去掉 --check 做全量回填。")
            else:
                print("  ✗ 没取到数据。若上面出现 IBKR 162，说明缺少 COMEX 行情订阅。")
            return

        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        fut_path = out / "gold_futures_ibkr.csv"
        n_rows = 0
        with fut_path.open("w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["root", "exchange", "delivery_month", "symbol", "date",
                        "open", "high", "low", "close", "volume", "source"])
            for i, cd in enumerate(details, 1):
                c = cd.contract
                ym = cd.contractMonth
                dm = f"{ym[:4]}-{ym[4:6]}"
                print(f"[{i}/{len(details)}] {c.localSymbol} {dm} …", end=" ", flush=True)
                try:
                    bars = fetch_contract(ib, cd, args.duration)
                except Exception as e:  # noqa: BLE001
                    print(f"失败：{e}")
                    bars = []
                for b in bars or []:
                    d = b.date if isinstance(b.date, dt.date) else dt.date.fromisoformat(str(b.date)[:10])
                    w.writerow([ROOT, EXCHANGE, dm, c.localSymbol, d.isoformat(),
                                b.open, b.high, b.low, b.close, b.volume, "ibkr"])
                    n_rows += 1
                print(f"{len(bars or [])} 根")
                time.sleep(PACING_SECONDS)

        # 现货 XAUUSD：日线收盘在纽约 17:00，与 COMEX 收盘时点同步
        print("\nXAUUSD 现货日线 …", end=" ", flush=True)
        spot = Contract(secType="CMDTY", symbol="XAUUSD", exchange="SMART", currency="USD")
        ib.qualifyContracts(spot)
        spot_bars = ib.reqHistoricalData(
            spot, endDateTime="", durationStr="10 Y", barSizeSetting="1 day",
            whatToShow="MIDPOINT", useRTH=False, formatDate=1, timeout=120,
        )
        spot_path = out / "xauusd_ibkr.csv"
        with spot_path.open("w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["date", "open", "high", "low", "close"])
            for b in spot_bars or []:
                w.writerow([str(b.date)[:10], b.open, b.high, b.low, b.close])
        print(f"{len(spot_bars or [])} 根")

        print(f"\n完成：期货 {n_rows} 行 → {fut_path}")
        print(f"      现货 {len(spot_bars or [])} 行 → {spot_path}")
        if errors:
            print(f"期间 IBKR 报错 {len(errors)} 次（见上方 [IBKR ...] 行）。")
    finally:
        ib.disconnect()


if __name__ == "__main__":
    main()
