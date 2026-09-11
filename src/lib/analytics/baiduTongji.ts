/**
 * 百度统计站点 ID（hm.js?<32 位 hex>）。NEXT_PUBLIC_ 变量在 next build 时内联，改动后需重新 build。
 * 未配置或格式不对时返回 null，整站不加载百度统计。
 */
export function baiduTongjiId(): string | null {
  const id = process.env.NEXT_PUBLIC_BAIDU_TONGJI_ID?.trim();
  return id && /^[a-f0-9]{32}$/i.test(id) ? id : null;
}
