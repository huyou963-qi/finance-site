import fs from "node:fs";
import * as XLSX from "xlsx";
import { fetchChinaOfficial } from "../chinaOfficialProxy";

export type NfraBankingDataset =
  | "bank_assets_monthly"
  | "commercial_bank_main_quarterly";

export type NfraWorkbookSource = {
  docId: number;
  title: string;
  publishDate: string | null;
  attachmentUrl: string;
  workbook: XLSX.WorkBook;
};

const ORIGIN = "https://www.nfra.gov.cn";
const CURRENT_LIST_URLS = [1, 2, 3].map(
  (pageIndex) =>
    `${ORIGIN}/cn/static/data/DocInfo/SelectDocByItemIdAndChild/` +
    `data_itemId=954,pageIndex=${pageIndex},pageSize=18.json`,
);

// 历史文件是官网“统计信息”栏目逐年归档的公开 Excel。当前年度仍通过栏目发现，
// 因而换年或附件文件名变化不需要改代码；这些固定项只负责一次性历史回填。
const ARCHIVE_DOCS: Record<
  NfraBankingDataset,
  readonly { docId: number; year: number; attachmentPath: string }[]
> = {
  bank_assets_monthly: [
    {
      docId: 1156406,
      year: 2024,
      attachmentPath: "/chinese/docfile/2025/5aa96d01774747b789a39107dd4697de.xls",
    },
    {
      docId: 1247354,
      year: 2025,
      attachmentPath: "/chinese/docfile/2026/82d076627d384fe3b00cc1770003a4dd.xls",
    },
  ],
  commercial_bank_main_quarterly: [
    {
      docId: 1018523,
      year: 2021,
      attachmentPath: "/chinese/docfile/2022/e9318b6827574280ad7295178823abf4.xlsx",
    },
    {
      docId: 1054675,
      year: 2022,
      attachmentPath: "/chinese/docfile/2023/93517e92dd4f480184a102c76cd1cac1.xlsx",
    },
    {
      docId: 1109305,
      year: 2023,
      attachmentPath: "/chinese/docfile/2024/8a79d02632374a57a7f91c56a69c5527.xlsx",
    },
    {
      docId: 1164263,
      year: 2024,
      attachmentPath: "/chinese/docfile/2025/19c05ee018b748708a7ae6e67311eba8.xls",
    },
    {
      docId: 1208453,
      year: 2025,
      attachmentPath: "/chinese/docfile/2026/9a20b3d34d24444bbdd77a210675a95c.xls",
    },
  ],
};

type NfraListRow = {
  docId?: number;
  docSubtitle?: string;
  publishDate?: string;
};

type NfraDetail = {
  rptCode?: number;
  data?: {
    docId?: number;
    docTitle?: string;
    publishDate?: string;
    attachmentInfoVOList?: { title?: string; urlOtherName?: string }[];
  };
};

const cache = new Map<
  NfraBankingDataset,
  { at: number; includeHistory: boolean; values: NfraWorkbookSource[] }
>();
const CACHE_TTL_MS = 60_000;

function matchesDataset(title: string, dataset: NfraBankingDataset): boolean {
  const normalized = title.replace(/\s+/g, "");
  if (dataset === "bank_assets_monthly") {
    return /银行业(?:金融机构)?总资产、总负债（月度）/.test(normalized);
  }
  return /商业银行主要监管指标情况表(?:（季度）|\(季度\))?$/.test(normalized);
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetchChinaOfficial(url, {
    headers: {
      "User-Agent":
        process.env.NFRA_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0",
      Accept: "application/json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`金融监管总局抓取 HTTP ${response.status}: ${url}`);
  const value = Buffer.from(await response.arrayBuffer());
  // 当前数据集是月/季频；真实网络请求串行并留出间隔，避免历史回填时连续打源站。
  await new Promise((resolve) => setTimeout(resolve, 300));
  return value;
}

async function fetchJson<T>(url: string): Promise<T> {
  const buffer = await fetchBuffer(url);
  return JSON.parse(buffer.toString("utf8")) as T;
}

async function discoverCurrentDocument(
  dataset: NfraBankingDataset,
): Promise<{ docId: number; title: string; publishDate: string | null }> {
  const rows: NfraListRow[] = [];
  for (const url of CURRENT_LIST_URLS) {
    const payload = await fetchJson<{
      rptCode?: number;
      data?: { rows?: NfraListRow[] };
    }>(url);
    if (payload.rptCode !== 200) throw new Error(`金融监管总局栏目接口失败: ${url}`);
    rows.push(...(payload.data?.rows ?? []));
  }
  const matches = rows
    .filter(
      (row): row is Required<Pick<NfraListRow, "docId" | "docSubtitle">> & NfraListRow =>
        typeof row.docId === "number" &&
        typeof row.docSubtitle === "string" &&
        matchesDataset(row.docSubtitle, dataset),
    )
    .sort((a, b) => (b.publishDate ?? "").localeCompare(a.publishDate ?? ""));
  const hit = matches[0];
  if (!hit) throw new Error(`金融监管总局栏目未找到数据集 ${dataset}`);
  return {
    docId: hit.docId,
    title: hit.docSubtitle,
    publishDate: hit.publishDate ?? null,
  };
}

async function fetchDocumentWorkbook(params: {
  docId: number;
  fallbackTitle: string;
  fallbackPublishDate?: string | null;
  attachmentPath?: string;
}): Promise<NfraWorkbookSource> {
  let title = params.fallbackTitle;
  let publishDate = params.fallbackPublishDate ?? null;
  let attachmentPath = params.attachmentPath;
  if (!attachmentPath) {
    const detailUrl = `${ORIGIN}/cn/static/data/DocInfo/SelectByDocId/data_docId=${params.docId}.json`;
    const detail = await fetchJson<NfraDetail>(detailUrl);
    if (detail.rptCode !== 200 || !detail.data) {
      throw new Error(`金融监管总局文档详情失败: docId=${params.docId}`);
    }
    title = detail.data.docTitle ?? title;
    publishDate = detail.data.publishDate ?? publishDate;
    attachmentPath = detail.data.attachmentInfoVOList?.find(
      (item) =>
        typeof item.urlOtherName === "string" && /\.xlsx?$/i.test(item.urlOtherName),
    )?.urlOtherName;
  }
  if (!attachmentPath) {
    throw new Error(`金融监管总局文档无 Excel 附件: docId=${params.docId}`);
  }
  const attachmentUrl = new URL(attachmentPath, ORIGIN).toString();
  const buffer = await fetchBuffer(attachmentUrl);
  if (buffer.length < 512) {
    throw new Error(`金融监管总局 Excel 附件过小: ${attachmentUrl}`);
  }
  return {
    docId: params.docId,
    title,
    publishDate,
    attachmentUrl,
    workbook: XLSX.read(buffer, { type: "buffer" }),
  };
}

/**
 * 获取某数据集的官方工作簿。首次全量回填包含逐年归档；正常 worker 增量只抓当前年度。
 * 同轮多个 instrument 共享 60 秒缓存，避免每条序列重复请求官网。
 */
export async function fetchNfraBankingWorkbooks(
  dataset: NfraBankingDataset,
  opts?: { includeHistory?: boolean; fixturePaths?: string[] },
): Promise<NfraWorkbookSource[]> {
  if (opts?.fixturePaths?.length) {
    return opts.fixturePaths.map((fixturePath, index) => ({
      docId: -(index + 1),
      title: fixturePath,
      publishDate: null,
      attachmentUrl: fixturePath,
      workbook: XLSX.read(fs.readFileSync(fixturePath), { type: "buffer" }),
    }));
  }

  const includeHistory = opts?.includeHistory === true;
  const cached = cache.get(dataset);
  if (
    cached &&
    Date.now() - cached.at < CACHE_TTL_MS &&
    (cached.includeHistory || !includeHistory)
  ) {
    return cached.values;
  }

  const current = await discoverCurrentDocument(dataset);
  const docs = includeHistory
    ? [
        ...ARCHIVE_DOCS[dataset].map((row) => ({
          docId: row.docId,
          fallbackTitle: `${row.year} ${dataset}`,
          attachmentPath: row.attachmentPath,
        })),
        {
          docId: current.docId,
          fallbackTitle: current.title,
          fallbackPublishDate: current.publishDate,
        },
      ]
    : [
        {
          docId: current.docId,
          fallbackTitle: current.title,
          fallbackPublishDate: current.publishDate,
        },
      ];

  const uniqueDocs = [...new Map(docs.map((row) => [row.docId, row])).values()];
  const values: NfraWorkbookSource[] = [];
  for (const doc of uniqueDocs) values.push(await fetchDocumentWorkbook(doc));

  cache.set(dataset, { at: Date.now(), includeHistory, values });
  return values;
}

export function clearNfraBankingCache(): void {
  cache.clear();
}

export const NFRA_BANKING_ARCHIVE_DOCS = ARCHIVE_DOCS;
