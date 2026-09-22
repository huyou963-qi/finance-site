import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import {
  loadBuiltinTemplateOverrides,
  loadMacroChartPrefsForUser,
  loadSystemMacroChartPrefs,
  saveBuiltinTemplateOverrides,
  saveMacroChartPrefsForUser,
  saveSystemMacroChartPrefs,
  type BuiltinTemplateOverride,
  type SystemMacroChartPrefsPayload,
} from "@/lib/data/macroChartPrefs";

/**
 * 系统模板（admin 在 HK 库里维护的唯一一份）对所有人可读，未登录访客也返回；
 * 个人工作区/模板仍需登录。写入见 PUT：系统部分仅 admin。
 * 以前未登录直接 401，访客只能看到代码里的默认模板，与登录用户看到的库内版本不一致。
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUserByRequest(req);
    const [prefs, systemMacroChartPrefs] = await Promise.all([
      user ? loadMacroChartPrefsForUser(user.id) : Promise.resolve(null),
      loadSystemMacroChartPrefs(),
    ]);
    return NextResponse.json({
      prefs,
      builtinTemplateOverrides: systemMacroChartPrefs.builtinTemplateOverrides,
      customBuiltinTemplates: systemMacroChartPrefs.customBuiltinTemplates ?? [],
      builtinTemplateFolders: systemMacroChartPrefs.builtinTemplateFolders ?? [],
      builtinTemplateFolderIds: systemMacroChartPrefs.builtinTemplateFolderIds ?? {},
      hiddenBuiltinTemplateIds: systemMacroChartPrefs.hiddenBuiltinTemplateIds ?? [],
      user: user ? { username: user.username, role: user.role } : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = (await req.json()) as {
      prefs?: unknown;
      builtinTemplateOverrides?: Record<string, BuiltinTemplateOverride> | SystemMacroChartPrefsPayload;
      systemMacroChartPrefs?: Partial<SystemMacroChartPrefsPayload>;
    };

    let systemMacroChartPrefs = await loadSystemMacroChartPrefs();

    if (user.role === "admin" || String(user.role).trim().toLowerCase() === "admin") {
      if (body.systemMacroChartPrefs !== undefined) {
        systemMacroChartPrefs = await saveSystemMacroChartPrefs(body.systemMacroChartPrefs);
      } else if (body.builtinTemplateOverrides !== undefined) {
        const payload =
          body.builtinTemplateOverrides &&
          typeof body.builtinTemplateOverrides === "object" &&
          "builtinTemplateOverrides" in body.builtinTemplateOverrides
            ? body.builtinTemplateOverrides
            : { version: 1 as const, builtinTemplateOverrides: body.builtinTemplateOverrides };
        systemMacroChartPrefs = await saveSystemMacroChartPrefs(payload);
      }
    } else if (body.systemMacroChartPrefs !== undefined || body.builtinTemplateOverrides !== undefined) {
      return NextResponse.json({ error: "仅管理员可修改系统模板配置" }, { status: 403 });
    }

    const prefs =
      body.prefs !== undefined
        ? await saveMacroChartPrefsForUser(user.id, body.prefs)
        : await loadMacroChartPrefsForUser(user.id);

    return NextResponse.json({
      prefs,
      builtinTemplateOverrides: systemMacroChartPrefs.builtinTemplateOverrides,
      customBuiltinTemplates: systemMacroChartPrefs.customBuiltinTemplates ?? [],
      builtinTemplateFolders: systemMacroChartPrefs.builtinTemplateFolders ?? [],
      builtinTemplateFolderIds: systemMacroChartPrefs.builtinTemplateFolderIds ?? {},
      hiddenBuiltinTemplateIds: systemMacroChartPrefs.hiddenBuiltinTemplateIds ?? [],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
