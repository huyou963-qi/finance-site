import { createHash, randomBytes } from "node:crypto";
import { parseMilestoneIngestJson } from "@/lib/equity/companyMilestones";
import { prepareEventPackImport, resolveEventPackFileMetadata, type LocalEventPack } from "@/lib/equity/localEventPacks";

export class DeliveryError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const deliveryHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const newDeliveryToken = () => `evt_${randomBytes(32).toString("base64url")}`;
export function parsePackId(raw: unknown) {
  if (typeof raw !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(raw)) throw new DeliveryError("包 ID 须为 1–128 位字母、数字或 . _ : -");
  return raw;
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function validateLinks(value: unknown, depth = 0) {
  if (depth > 24) throw new DeliveryError("事件数据嵌套过深");
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(url|sourceUrl)$/i.test(key) && child !== null && child !== undefined && child !== "") {
      if (typeof child !== "string") throw new DeliveryError("来源链接必须是 HTTP(S) URL");
      let url; try { url = new URL(child); } catch { throw new DeliveryError("来源链接必须是 HTTP(S) URL"); }
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new DeliveryError("来源链接必须是无账号密码的 HTTP(S) URL");
    }
    validateLinks(child, depth + 1);
  }
}
export function parseDelivery(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new DeliveryError("投递内容必须是对象");
  const body = raw as Record<string, unknown>;
  if (body.userId !== undefined) throw new DeliveryError("账号由投递凭证确定，不接受 userId");
  const deliveryId = parsePackId(body.deliveryId);
  if (!Number.isSafeInteger(body.baseRevision) || Number(body.baseRevision) < 0) throw new DeliveryError("baseRevision 必须是非负整数");
  const doc = body.document as Record<string, unknown>;
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new DeliveryError("缺少事件包 document");
  const packId = parsePackId((doc.pack as Record<string, unknown> | undefined)?.id);
  if (!Array.isArray(doc.events) || !doc.events.length || doc.events.length > 1000) throw new DeliveryError("每次须投递 1–1000 条事件");
  validateLinks(body);
  const parsed = parseMilestoneIngestJson(doc);
  if (parsed.errors.length) throw new DeliveryError(parsed.errors.slice(0, 5).join("；"));
  let resolved: ReturnType<typeof resolveEventPackFileMetadata>;
  try { resolved = resolveEventPackFileMetadata(doc, packId, parsed.importTarget, parsed.symbol, "file"); }
  catch (e) { throw new DeliveryError(e instanceof Error ? e.message : "事件包元数据无效"); }
  const { target, metadata } = resolved;
  if (target === "symbol" && !metadata.symbols?.length) throw new DeliveryError("须指定 pack.symbols 或 query.symbol");
  if ((metadata.symbols?.length ?? 0) > 100 || metadata.symbols?.some(s => !/^[\w^=./:-]{1,32}$/.test(s))) throw new DeliveryError("资产范围无效或超过 100 个");
  if ((metadata.name?.length ?? 0) > 200) throw new DeliveryError("包名称最多 200 字符");
  return { packId, deliveryId, baseRevision: Number(body.baseRevision), items: parsed.milestones, target, metadata, hash: deliveryHash(stableJson(body)) };
}
export function planPrivateDelivery(input: ReturnType<typeof parseDelivery>, existing?: { pack: LocalEventPack; revision: number; deliveryId: string; deliveryHash: string; receipt: unknown }) {
  if (existing?.deliveryId === input.deliveryId) {
    if (existing.deliveryHash !== input.hash) throw new DeliveryError("同一 deliveryId 的内容已改变，请使用新的投递 ID", 409);
    return { duplicate: true as const, receipt: existing.receipt };
  }
  if ((existing?.revision ?? 0) !== input.baseRevision) throw new DeliveryError("包版本已变化，请读取最新回执或在网页查看版本后再合并重投", 409);
  const plan = prepareEventPackImport(existing ? [existing.pack] : [], input.items, input.target, input.metadata.symbols?.[0] || "", input.metadata);
  if (Buffer.byteLength(JSON.stringify(plan.pack), "utf8") > 2000000) throw new DeliveryError("单包累计内容不能超过 2 MB", 413);
  if (plan.pack.events.length > 2000) throw new DeliveryError("单包最多保存 2000 条事件");
  const r = plan.receipt;
  return { duplicate: false as const, pack: plan.pack, receipt: {
    packId: r.packId, packName: r.packName, externalIds: r.externalIds, importedAt: r.importedAt,
    added: r.added, updated: r.updated, unchanged: r.unchanged, retained: r.retained,
    revision: input.baseRevision + 1, deliveryId: input.deliveryId, saved: true,
  } };
}
