/**
 * 从 Wikipedia GICS 页生成 data/gics/*.json（离线可重复运行）。
 * Usage: npx tsx scripts/equity/build-gics-data.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const OUT_DIR = join(process.cwd(), "data", "gics");

type SubRow = {
  sectorCode: string;
  sector: string;
  industryGroupCode: string;
  industryGroup: string;
  industryCode: string;
  industry: string;
  subIndustryCode: string;
  subIndustry: string;
};

function stripTags(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchGicsHtml(): Promise<string> {
  const url =
    "https://en.wikipedia.org/w/api.php?action=parse&page=Global_Industry_Classification_Standard&prop=text&format=json";
  const res = await fetch(url, {
    headers: { "User-Agent": "finance-site/1.0 (gics build)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const data = (await res.json()) as { parse?: { text?: { "*": string } } };
  return data?.parse?.text?.["*"] ?? "";
}

function parseGicsTable(html: string): SubRow[] {
  const entries: SubRow[] = [];
  let curSectorCode = "";
  let curSector = "";
  let curGroupCode = "";
  let curGroup = "";
  let curIndustryCode = "";
  let curIndustry = "";

  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(html)) !== null) {
    const cells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      stripTags(c[1]),
    );
    if (cells.length < 2) continue;
    if (cells[0] === "Sector" || cells.join("").includes("Industry Group")) continue;

    while (cells.length < 8) cells.push("");

    if (/^\d+$/.test(cells[0]) && cells[1]) {
      curSectorCode = cells[0];
      curSector = cells[1];
    }
    if (/^\d+$/.test(cells[2]) && cells[3]) {
      curGroupCode = cells[2];
      curGroup = cells[3];
    }
    if (/^\d+$/.test(cells[4]) && cells[5]) {
      curIndustryCode = cells[4];
      curIndustry = cells[5];
    }
    if (/^\d+$/.test(cells[6]) && cells[7] && curSector && curIndustry) {
      entries.push({
        sectorCode: curSectorCode,
        sector: curSector,
        industryGroupCode: curGroupCode,
        industryGroup: curGroup,
        industryCode: curIndustryCode,
        industry: curIndustry,
        subIndustryCode: cells[6],
        subIndustry: cells[7],
      });
    }
  }
  return entries;
}

function normKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Excel 旧名 → 2023+ GICS Industry 规范名 */
const INDUSTRY_RENAME: Record<string, string> = {
  airlines: "passengerairlines",
  marine: "marinetransportation",
  roadandrail: "groundtransportation",
  foodstaplesretail: "consumerstaplesdistributionretail",
  internetdirectmarketingretail: "broadlineretail",
  equityreits: "diversifiedreits",
  independentpowerrenewables: "independentpowerandrenewableelectricityproducers",
  techhardwarestorageperipherals: "technologyhardwarestorageperipherals",
  pharmaceuticalsbiotechlifesciences: "pharmaceuticalsbiotechnologylifesciences",
  healthcareequipmentandservices: "healthcareequipmentservices",
};

/** 2023 新增 Industry：继承原父级风格 */
const NEW_INDUSTRY_STYLES: Record<string, "cyclical" | "defensive" | "both"> = {
  broadlineretail: "cyclical",
  passengerairlines: "cyclical",
  marinetransportation: "cyclical",
  groundtransportation: "cyclical",
  consumerstaplesdistributionretail: "defensive",
  transactionpaymentprocessingservices: "cyclical",
  diversifiedreits: "cyclical",
  industrialreits: "cyclical",
  hotelresortreits: "cyclical",
  officereits: "cyclical",
  healthcarereits: "cyclical",
  residentialreits: "cyclical",
  retailreits: "cyclical",
  specializedreits: "cyclical",
  realestateoperatingcompanies: "cyclical",
  realestatedevelopment: "cyclical",
  realestateservices: "cyclical",
  diversifiedrealestateactivities: "cyclical",
};

function parseExcelStyles(): Map<string, "cyclical" | "defensive" | "both"> {
  const xlsxPath = "c:\\Users\\Administrator\\Desktop\\GICS Breakdown.xlsx";
  // Fallback: use pre-exported JSON if xlsx missing
  try {
    const { execSync } = require("child_process") as typeof import("child_process");
    const py = `
import zipfile, xml.etree.ElementTree as ET, json, re, sys
path = r'${xlsxPath.replace(/\\/g, "\\\\")}'
with zipfile.ZipFile(path) as z:
    shared = []
    root = ET.fromstring(z.read('xl/sharedStrings.xml'))
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    for si in root.findall('.//m:si', ns):
        texts = [t.text or '' for t in si.findall('.//m:t', ns)]
        shared.append(''.join(texts))
    sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    rows = []
    for row in sheet.findall('.//m:sheetData/m:row', ns):
        vals = []
        for c in row.findall('m:c', ns):
            t = c.get('t')
            v = c.find('m:v', ns)
            if v is None: vals.append('')
            elif t == 's': vals.append(shared[int(v.text)])
            else: vals.append(v.text)
        rows.append(vals)
out = {}
for r in rows[2:]:
    while len(r) < 6: r.append('')
    ind = r[2].strip()
    if not ind or ind.isdigit(): continue
    both = r[5].strip() == '1'
    cycl = r[3].strip() == '1'
    defn = r[4].strip() == '1'
    if both: tag = 'both'
    elif cycl and defn: tag = 'both'
    elif cycl: tag = 'cyclical'
    elif defn: tag = 'defensive'
    else: tag = 'cyclical'
    key = re.sub(r'[^a-z0-9]+', '', ind.lower())
    out[key] = tag
print(json.dumps(out))
`;
    const raw = execSync(`python -c "${py.replace(/"/g, '\\"').replace(/\n/g, ";")}"`, {
      encoding: "utf-8",
    });
    const parsed = JSON.parse(raw.trim()) as Record<string, string>;
    return new Map(
      Object.entries(parsed).map(([k, v]) => [k, v as "cyclical" | "defensive" | "both"]),
    );
  } catch {
    const fallback = join(OUT_DIR, "industry-style-tags.json");
    const data = JSON.parse(readFileSync(fallback, "utf-8")) as Record<
      string,
      "cyclical" | "defensive" | "both"
    >;
    return new Map(Object.entries(data));
  }
}

function resolveStyle(
  industryName: string,
  excelStyles: Map<string, "cyclical" | "defensive" | "both">,
): "cyclical" | "defensive" | "both" {
  const key = normKey(industryName);
  if (NEW_INDUSTRY_STYLES[key]) return NEW_INDUSTRY_STYLES[key];
  const renamed = INDUSTRY_RENAME[key];
  if (renamed && excelStyles.has(renamed)) return excelStyles.get(renamed)!;
  if (excelStyles.has(key)) return excelStyles.get(key)!;
  // REIT split children
  if (key.endsWith("reits")) return "cyclical";
  if (key.includes("realestate")) return "cyclical";
  return "cyclical";
}

async function main() {
  const html = await fetchGicsHtml();
  const subIndustries = parseGicsTable(html);
  if (subIndustries.length < 150) {
    throw new Error(`GICS 解析行数过少: ${subIndustries.length}`);
  }

  const industryMap = new Map<
    string,
    {
      code: string;
      nameEn: string;
      sector: string;
      industryGroup: string;
      industryGroupCode: string;
    }
  >();
  for (const row of subIndustries) {
    industryMap.set(row.industryCode, {
      code: row.industryCode,
      nameEn: row.industry,
      sector: row.sector,
      industryGroup: row.industryGroup,
      industryGroupCode: row.industryGroupCode,
    });
  }

  const industries = [...industryMap.values()];
  if (industries.length !== 74) {
    throw new Error(`期望 74 个 Industry，实际 ${industries.length}`);
  }

  const excelStyles = parseExcelStyles();
  const styleTags: Record<string, "cyclical" | "defensive" | "both"> = {};
  for (const ind of industries) {
    styleTags[ind.code] = resolveStyle(ind.nameEn, excelStyles);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    join(OUT_DIR, "gics-structure.json"),
    JSON.stringify({ subIndustries, industries }, null, 2),
    "utf-8",
  );
  writeFileSync(join(OUT_DIR, "industry-style-tags.json"), JSON.stringify(styleTags, null, 2), "utf-8");

  const aliasEntries: Record<string, string> = {};
  for (const row of subIndustries) {
    aliasEntries[normKey(row.subIndustry)] = row.subIndustryCode;
  }

  writeFileSync(join(OUT_DIR, "sub-industry-aliases.json"), JSON.stringify(aliasEntries, null, 2), "utf-8");

  console.log(
    JSON.stringify({
      ok: true,
      subIndustries: subIndustries.length,
      industries: industries.length,
      styleTags: Object.keys(styleTags).length,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
