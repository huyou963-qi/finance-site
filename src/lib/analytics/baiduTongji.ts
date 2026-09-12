/** 百度统计站点 ID：tongji.baidu.com →「代码管理 / 代码获取」里 hm.js? 后面那段。 */
export const BAIDU_TONGJI_ID = "70717b1e158e3c0cedbe167596f141c6";

/** 后台与接口不计入统计 */
const EXCLUDED_PREFIXES = ["/admin", "/api"];

export function isTrackedPath(path: string): boolean {
  return !EXCLUDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
