import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { createBacktestWithAccess, proErrorResponse } from "@/lib/auth/requirePro";
import type { ScreenerConfig } from "@/lib/quant/screener";
import type { BacktestParams } from "@/lib/quant/backtest";
import type { RobustnessSpec } from "@/lib/quant/robustnessData";
import {
  createRun,
  executeRunInBackground,
  listRuns,
  normalizeParams,
} from "@/lib/quant/robustnessRuns";

/** 稳健性分析 run 列表（当前用户）。未登录返回空列表（UI 降级提示）。 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ runs: [], anonymous: true });
    const runs = await listRuns(user.id);
    return NextResponse.json({ runs });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 创建稳健性 run 并进程内异步执行。
 * 会员额度与回测相同。
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const body = (await req.json()) as {
      name?: unknown;
      config?: ScreenerConfig;
      params?: Partial<BacktestParams>;
      spec?: RobustnessSpec;
    };
    if (!body?.config) throw new Error("缺少策略配置 config");
    if (!body?.spec) throw new Error("缺少稳健性方案 spec");
    const name =
      typeof body.name === "string" && body.name.trim() ? body.name.trim() : "未命名稳健性分析";
    const params = normalizeParams(body.params ?? {});

    const { config, spec } = body;
    const { run: { id }, usedCredit } = await createBacktestWithAccess(user.id, (tx, userId) =>
      createRun({ name, userId, config, params, spec }, tx));
    executeRunInBackground(id);
    return NextResponse.json({ id, status: "queued", usedCredit });
  } catch (e) {
    const mapped = proErrorResponse(e);
    if (mapped.status === 401 || mapped.status === 403 || mapped.status === 429) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
