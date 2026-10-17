"""Recover frozen public-domain Quandl WIKI prices; never blend them into Yahoo symbols.

python scripts/data-worker/prepare-market-breadth-archive.py [--download]
The source ZIP is Kaggle's public version-1 mirror of WIKI, not its paid EOD product.
Original WIKI public-domain notice: https://quandl4j.org/ (example API metadata).
Quandl founder's open-data terms: https://evan597.wordpress.com/author/evanquandl/
"""
import csv
import hashlib
import io
import itertools
import json
import math
from pathlib import Path
import sys
import urllib.request
import zipfile

BASE = Path(".data/market-breadth-sources")
URL = "https://www.kaggle.com/api/v1/datasets/download/marketneutral/quandl-wiki-prices-us-equites?datasetVersionNumber=1"
BASE.mkdir(parents=True, exist_ok=True)
archive = BASE / "wiki-prices.zip"
if "--download" in sys.argv and not archive.exists():
    with urllib.request.urlopen(URL, timeout=60) as response, archive.with_suffix(".part").open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
    archive.with_suffix(".part").replace(archive)
if not archive.exists():
    raise SystemExit("缺少公开WIKI归档，请加 --download 下载")
with archive.open("rb") as source_file:
    archive_sha256 = hashlib.file_digest(source_file, "sha256").hexdigest()
if archive_sha256 != "adfd226694c6f3ec2c56b585d973764180a39a3ec516601721e90096dc1de94f":
    raise ValueError("公开归档版本1的SHA256变化，需人工核验后再更新固定版本")

history = json.loads(Path("src/lib/data/scheduler/marketInternals/sp500History.json").read_text())
universe = set(history["initial"])
for event in history["changes"]:
    if event["date"] <= "2018-03-27":
        universe.update(event["added"])
universe = {s.replace(".", "_").replace("-", "_") for s in universe}

# Source separation also preserves old issuers when a ticker was reused after delisting.
summary = []
splits = []
output_file = BASE / "wiki-recovered.csv"
with zipfile.ZipFile(archive) as z, output_file.open("w", newline="") as out:
    names = [name for name in z.namelist() if name.upper().endswith("WIKI_PRICES.CSV")]
    if len(names) != 1:
        raise ValueError("WIKI ZIP结构异常")
    writer = csv.writer(out)
    writer.writerow(["symbol", "date", "open", "high", "low", "close", "adj_close", "volume"])
    with z.open(names[0]) as f:
        reader = csv.DictReader(io.TextIOWrapper(f))
        seen = set()
        for ticker, group in itertools.groupby(reader, key=lambda row: row["ticker"]):
            if ticker in seen:
                raise ValueError("归档必须按ticker连续分组")
            seen.add(ticker)
            if ticker not in universe:
                for _ in group:
                    pass
                continue
            rows = list(group)
            dates = [r["date"] for r in rows]
            if dates != sorted(set(dates)):
                raise ValueError(f"{ticker}日期非严格递增")
            symbol = "WIKI:" + ticker
            factor = 1.0
            converted = []
            # Raw close -> split-adjusted only. adj_close already includes dividends.
            # A split on date D affects earlier dates, not D itself.
            for row in reversed(rows):
                split = float(row["split_ratio"])
                if not math.isfinite(split) or not split > 0:
                    raise ValueError(f"{ticker}拆股比例非法")
                if row["date"] >= "1993-01-01":
                    close = float(row["close"]) if row["close"] else 0
                    adjusted = float(row["adj_close"]) if row["adj_close"] else 0
                    if math.isfinite(close) and close > 0 and math.isfinite(adjusted) and adjusted > 0:
                        prices = [float(row[key]) * factor if row[key] else "" for key in ["open", "high", "low", "close"]]
                        volume = float(row["volume"]) / factor if row["volume"] else ""
                        converted.append([symbol, row["date"], *prices, adjusted, volume])
                    if split != 1:
                        splits.append({"symbol": symbol, "date": row["date"], "ratio": split})
                factor /= split
            writer.writerows(reversed(converted))
            if converted:
                summary.append({"symbol": symbol, "first": converted[-1][1], "last": converted[0][1], "rows": len(converted)})
                if len(summary) % 100 == 0:
                    print(f"converted {len(summary)} symbols", flush=True)

manifest = {"source": "Quandl WIKI public-domain frozen archive", "download": URL,
            "sha256": archive_sha256,
            "priceBasis": "split-adjusted, excluding cash dividends; no Yahoo window splicing",
            "membershipCommit": history["commit"], "symbols": summary, "splits": splits}
(BASE / "wiki-recovered.manifest.json").write_text(json.dumps(manifest, indent=2))
print(f"prepared {len(summary)} symbols, {sum(s['rows'] for s in summary)} bars: {output_file}")
