/** 网关在部署或短暂故障时可能返回 HTML；不要将其当 JSON 展示给用户。 */
export async function readIndustryFinancialResponse<T>(response: Response): Promise<T> {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`行业财务服务暂时不可用，请稍后重试（${response.status}）`);
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error("行业财务响应异常，请稍后重试"); }
  if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "行业财务加载失败，请稍后重试");
  return payload as T;
}
