import { prisma } from "@/lib/prisma";

const DEFAULT_ID = "default";
const MAX_TITLE_LENGTH = 80;
const MAX_CONTENT_LENGTH = 4_000;

export type SiteAnnouncementConfig = {
  enabled: boolean;
  title: string;
  content: string;
  startsAt: string;
  endsAt: string;
  revision: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type ActiveSiteAnnouncement = Pick<
  SiteAnnouncementConfig,
  "title" | "content" | "startsAt" | "endsAt" | "revision"
> & { id: string; updatedAt: string };

type AnnouncementRow = {
  id: string;
  enabled: boolean;
  title: string;
  content: string;
  startsAt: Date;
  endsAt: Date;
  revision: number;
  updatedAt: Date;
  updatedBy: string | null;
};

export function defaultSiteAnnouncementConfig(now = new Date()): SiteAnnouncementConfig {
  const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);
  return {
    enabled: false,
    title: "网站公告",
    content: "",
    startsAt: now.toISOString(),
    endsAt: endsAt.toISOString(),
    revision: 0,
    updatedAt: null,
    updatedBy: null,
  };
}

function rowToConfig(row: AnnouncementRow): SiteAnnouncementConfig {
  return {
    enabled: row.enabled,
    title: row.title,
    content: row.content,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}不能为空`);
  const result = value.trim();
  if (result.length > maxLength) throw new Error(`${label}不能超过 ${maxLength} 个字符`);
  return result;
}

function requiredDate(value: unknown, label: string): Date {
  if (typeof value !== "string" || !value.trim()) throw new Error(`请选择${label}`);
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new Error(`${label}格式无效`);
  return result;
}

export function parseSiteAnnouncementInput(raw: unknown): {
  enabled: boolean;
  title: string;
  content: string;
  startsAt: Date;
  endsAt: Date;
} {
  if (!raw || typeof raw !== "object") throw new Error("公告配置格式无效");
  const input = raw as Record<string, unknown>;
  if (typeof input.enabled !== "boolean") throw new Error("公告开关格式无效");
  const startsAt = requiredDate(input.startsAt, "生效时间");
  const endsAt = requiredDate(input.endsAt, "结束时间");
  if (endsAt.getTime() <= startsAt.getTime()) throw new Error("结束时间必须晚于生效时间");
  return {
    enabled: input.enabled,
    title: requiredText(input.title, "公告标题", MAX_TITLE_LENGTH),
    content: requiredText(input.content, "公告内容", MAX_CONTENT_LENGTH),
    startsAt,
    endsAt,
  };
}

export function isAnnouncementActive(
  config: Pick<SiteAnnouncementConfig, "enabled" | "startsAt" | "endsAt">,
  now = new Date(),
): boolean {
  const startsAt = new Date(config.startsAt).getTime();
  const endsAt = new Date(config.endsAt).getTime();
  return (
    config.enabled &&
    Number.isFinite(startsAt) &&
    Number.isFinite(endsAt) &&
    startsAt <= now.getTime() &&
    now.getTime() < endsAt
  );
}

export async function loadSiteAnnouncementConfig(): Promise<SiteAnnouncementConfig> {
  const row = await prisma.siteAnnouncement.findUnique({ where: { id: DEFAULT_ID } });
  return row ? rowToConfig(row) : defaultSiteAnnouncementConfig();
}

export async function saveSiteAnnouncementConfig(
  raw: unknown,
  updatedBy?: string | null,
): Promise<SiteAnnouncementConfig> {
  const input = parseSiteAnnouncementInput(raw);
  const row = await prisma.siteAnnouncement.upsert({
    where: { id: DEFAULT_ID },
    create: { id: DEFAULT_ID, ...input, revision: 1, updatedBy: updatedBy ?? null },
    update: { ...input, revision: { increment: 1 }, updatedBy: updatedBy ?? null },
  });
  return rowToConfig(row);
}

/** 公共首页读取失败时静默隐藏公告，避免公告表故障影响首页。 */
export async function loadActiveSiteAnnouncement(
  now = new Date(),
): Promise<ActiveSiteAnnouncement | null> {
  try {
    const row = await prisma.siteAnnouncement.findUnique({ where: { id: DEFAULT_ID } });
    if (!row) return null;
    const config = rowToConfig(row);
    if (!isAnnouncementActive(config, now)) return null;
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      startsAt: config.startsAt,
      endsAt: config.endsAt,
      revision: row.revision,
      updatedAt: config.updatedAt ?? row.updatedAt.toISOString(),
    };
  } catch (error) {
    console.error("首页公告读取失败", error);
    return null;
  }
}
