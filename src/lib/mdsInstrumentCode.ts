import crypto from "node:crypto";

/**
 * 宏观序列键（与 legacy `Ind_Info.wd_id` / 宽表列名一致）→ 本系统 `Instrument.code`
 * 规则：`m_` + md5(键)，与迁移回填一致。
 */
export function instrumentCodeFromSeriesKey(seriesKey: string): string {
  return `m_${crypto.createHash("md5").update(seriesKey).digest("hex")}`;
}
