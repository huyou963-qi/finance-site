#!/usr/bin/env python3
"""Generate data/gics/*.json offline from embedded March 2023 GICS mapping."""
from __future__ import annotations

import csv
import io
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "data" / "gics"
EXCEL_PATH = Path(r"c:\Users\Administrator\Desktop\GICS Breakdown.xlsx")
GICS_CSV = ROOT / "scripts" / "equity" / "fixtures" / "gics-march-2023.csv"

INDUSTRY_RENAME: dict[str, str] = {
    "airlines": "passengerairlines",
    "marine": "marinetransportation",
    "roadandrail": "groundtransportation",
    "foodstaplesretail": "consumerstaplesdistributionretail",
    "internetdirectmarketingretail": "broadlineretail",
    "multilineretail": "broadlineretail",
    "equityreits": "diversifiedreits",
    "independentpowerrenewables": "independentpowerandrenewableelectricityproducers",
    "techhardwarestorageperipherals": "technologyhardwarestorageperipherals",
    "pharmaceuticalsbiotechlifesciences": "pharmaceuticalsbiotechnologylifesciences",
    "healthcareequipmentandservices": "healthcareequipmentservices",
    "healthcareequipmentandsupplies": "healthcareequipmentsupplies",
    "healthcareprovidersservices": "healthcareprovidersservices",
    "thriftsandmortgagefinance": "banks",
    "diversifiedfinancialservices": "financialservices",
    "realestatemanagementdevelopment": "realestatemanagementdevelopment",
    "mortgagereits": "mortgagerealestateinvestmenttrustsreits",
    "consumerfinance": "consumerfinance",
    "personalproducts": "personalcareproducts",
    "textilesapparelluxurygoods": "textilesapparelluxurygoods",
    "lifesciencestoolsandservices": "lifesciencestoolservices",
    "semiconductorssemiconductorequipment": "semiconductorssemiconductorequipment",
    "autocomponents": "automobilecomponents",
}

NEW_INDUSTRY_STYLES: dict[str, str] = {
    "broadlineretail": "cyclical",
    "passengerairlines": "cyclical",
    "marinetransportation": "cyclical",
    "groundtransportation": "defensive",
    "consumerstaplesdistributionretail": "defensive",
    "transactionpaymentprocessingservices": "cyclical",
    "diversifiedreits": "cyclical",
    "industrialreits": "cyclical",
    "hotelresortreits": "cyclical",
    "officereits": "cyclical",
    "healthcarereits": "cyclical",
    "residentialreits": "cyclical",
    "retailreits": "cyclical",
    "specializedreits": "cyclical",
    "realestateoperatingcompanies": "cyclical",
    "realestatedevelopment": "cyclical",
    "realestateservices": "cyclical",
    "diversifiedrealestateactivities": "cyclical",
    "realestatemanagementdevelopment": "cyclical",
    "financialservices": "cyclical",
    "mortgagerealestateinvestmenttrustsreits": "cyclical",
    "automobilecomponents": "cyclical",
    "specialtyretail": "cyclical",
}


def norm_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def clean_name(value: str) -> str:
    return value.strip().rstrip("*").strip()


def load_gics_rows() -> list[dict[str, str]]:
    csv_text = GICS_CSV.read_text(encoding="utf-8")
    rows: list[dict[str, str]] = []
    reader = csv.reader(io.StringIO(csv_text))
    header = next(reader)
    expected = [
        "Sub-Industry Code",
        "Sub-Industry",
        "Definition",
        "Industry Code",
        "Industry",
        "Industry Group Code",
        "Industry Group",
        "Sector Code",
        "Sector",
    ]
    if header != expected:
        raise ValueError(f"Unexpected CSV header: {header}")

    for parts in reader:
        if len(parts) < 9:
            continue
        sub_code, sub_name, _, ind_code, ind_name, ig_code, ig_name, sector_code, sector = parts[:9]
        rows.append(
            {
                "sectorCode": sector_code.strip(),
                "sector": clean_name(sector),
                "industryGroupCode": ig_code.strip(),
                "industryGroup": clean_name(ig_name),
                "industryCode": ind_code.strip(),
                "industry": clean_name(ind_name),
                "subIndustryCode": sub_code.strip(),
                "subIndustry": clean_name(sub_name),
            }
        )
    return rows


def parse_excel_styles() -> dict[str, str]:
    if not EXCEL_PATH.exists():
        raise FileNotFoundError(f"Excel not found: {EXCEL_PATH}")

    with zipfile.ZipFile(EXCEL_PATH) as zf:
        shared: list[str] = []
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
        ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        for si in root.findall(".//m:si", ns):
            texts = [t.text or "" for t in si.findall(".//m:t", ns)]
            shared.append("".join(texts))
        sheet = ET.fromstring(zf.read("xl/worksheets/sheet1.xml"))
        rows: list[list[str]] = []
        for row in sheet.findall(".//m:sheetData/m:row", ns):
            vals: list[str] = []
            for cell in row.findall("m:c", ns):
                cell_type = cell.get("t")
                value = cell.find("m:v", ns)
                if value is None:
                    vals.append("")
                elif cell_type == "s":
                    vals.append(shared[int(value.text or "0")])
                else:
                    vals.append(value.text or "")
            rows.append(vals)

    styles: dict[str, str] = {}
    for row in rows[2:]:
        while len(row) < 6:
            row.append("")
        industry = row[2].strip().rstrip(".")
        if not industry or industry.isdigit():
            continue
        both = row[5].strip() == "1"
        cyclical = row[3].strip() == "1"
        defensive = row[4].strip() == "1"
        if both:
            tag = "both"
        elif cyclical and defensive:
            tag = "both"
        elif cyclical:
            tag = "cyclical"
        elif defensive:
            tag = "defensive"
        else:
            tag = "cyclical"
        styles[norm_key(industry)] = tag
    return styles


def resolve_style(industry_name: str, excel_styles: dict[str, str]) -> str:
    key = norm_key(industry_name)
    if key in NEW_INDUSTRY_STYLES:
        return NEW_INDUSTRY_STYLES[key]
    renamed = INDUSTRY_RENAME.get(key)
    if renamed and renamed in excel_styles:
        return excel_styles[renamed]
    if renamed and renamed in NEW_INDUSTRY_STYLES:
        return NEW_INDUSTRY_STYLES[renamed]
    if key in excel_styles:
        return excel_styles[key]
    if key.endswith("reits"):
        return "cyclical"
    if "realestate" in key:
        return "cyclical"
    return "cyclical"


def build_structure(rows: list[dict[str, str]]) -> tuple[list[dict], list[dict]]:
    sub_industries = rows
    industry_map: dict[str, dict] = {}
    for row in rows:
        industry_map[row["industryCode"]] = {
            "code": row["industryCode"],
            "nameEn": row["industry"],
            "sector": row["sector"],
            "industryGroup": row["industryGroup"],
            "industryGroupCode": row["industryGroupCode"],
        }
    industries = sorted(industry_map.values(), key=lambda x: x["code"])
    return industries, sub_industries


def main() -> None:
    rows = load_gics_rows()
    industries, sub_industries = build_structure(rows)

    if len(sub_industries) != 163:
        raise SystemExit(f"Expected 163 sub-industries, got {len(sub_industries)}")
    if len(industries) != 74:
        raise SystemExit(f"Expected 74 industries, got {len(industries)}")

    excel_styles = parse_excel_styles()
    style_tags = {ind["code"]: resolve_style(ind["nameEn"], excel_styles) for ind in industries}
    if len(style_tags) != 74:
        raise SystemExit(f"Expected 74 style tags, got {len(style_tags)}")

    aliases: dict[str, str] = {}
    for row in sub_industries:
        aliases[norm_key(row["subIndustry"])] = row["subIndustryCode"]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "gics-structure.json").write_text(
        json.dumps({"industries": industries, "subIndustries": sub_industries}, indent=2, ensure_ascii=False)
        + "\n",
        encoding="utf-8",
    )
    (OUT_DIR / "industry-style-tags.json").write_text(
        json.dumps(style_tags, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (OUT_DIR / "sub-industry-aliases.json").write_text(
        json.dumps(aliases, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "ok": True,
                "industries": len(industries),
                "subIndustries": len(sub_industries),
                "styleTags": len(style_tags),
                "aliases": len(aliases),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
