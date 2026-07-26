import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { requireBacktestAccess, proErrorResponse } from "@/lib/auth/requirePro";
import type { ScreenerConfig } from "@/lib/quant/screener";
import type { BacktestParams } from "@/lib/quant/backtest";
import {
  createRun,
  executeRunInBackground,
  listRuns,
  normalizeParams,
} from "@/lib/quant/backtestRuns";

/** run 列表（当前用户）。未登录返回空列表（UI 降级提示，不报错）。 */
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
 * 创建 run 并进程内异步执行。权限：Pro/试用免费；否则消耗 1 回测积分。
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireBacktestAccess(req);

    const body = (await req.json()) as {
      name?: unknown;
      config?: ScreenerConfig;
      params?: Partial<BacktestParams>;
    };
    if (!body?.config) throw new Error("缺少策略配置 config");
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "未命名回测";
    const params = normalizeParams(body.params ?? {});

    const { id } = await createRun({ name, userId: user.id, config: body.config, params });
    executeRunInBackground(id);
    return NextResponse.json({ id, status: "queued", usedCredit: user.usedCredit });
  } catch (e) {
    const mapped = proErrorResponse(e);
    if (mapped.status === 401 || mapped.status === 403) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
