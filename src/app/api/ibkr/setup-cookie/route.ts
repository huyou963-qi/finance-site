import { NextRequest, NextResponse } from "next/server";
import { isIbkrTwsMode } from "@/lib/data/ibkrApiConfig";
import { writeIbkrCpCookie } from "@/lib/data/ibkrCpSession";

function twsModeReject() {
  return NextResponse.json(
    {
      error:
        "当前 IBKR_API_MODE=tws，不需要 Gateway Cookie。若要使用本页，请将 .env.local 中 IBKR_API_MODE 设为 cp。",
    },
    { status: 400 },
  );
}

function setupAllowed(req: NextRequest): boolean {
  if (process.env.IBKR_CP_ALLOW_SETUP === "1") return true;
  if (process.env.NODE_ENV === "development") return true;
  const token = process.env.IBKR_CP_SETUP_TOKEN?.trim();
  if (token && req.headers.get("x-ibkr-setup-token") === token) return true;
  return false;
}

function deny() {
  return NextResponse.json({ error: "Not allowed" }, { status: 404 });
}

/**
 * 将浏览器里复制的 Gateway Cookie 写入本地文件，供服务端拉 K 线使用（无需改 .env.local）。
 *
 * - 开发：`NODE_ENV=development` 时可用。
 * - 生产：设 `IBKR_CP_ALLOW_SETUP=1`，或配置 `IBKR_CP_SETUP_TOKEN` 并在请求头带 `X-IBKR-Setup-Token`。
 *
 * POST：body 为纯文本 Cookie，或 JSON `{ "cookie": "..." }`。
 * GET：返回简单表单页（仅允许时）。
 */
export async function GET(req: NextRequest) {
  if (isIbkrTwsMode()) return twsModeReject();
  if (!setupAllowed(req)) return deny();
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><title>IBKR Gateway Cookie</title>
<style>body{font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;background:#ffffff;color:#37352f}
label{display:block;margin:.5rem 0 .25rem;color:#6b6b6b;font-size:14px}textarea{width:100%;min-height:6rem;background:#f7f7f5;border:1px solid #e9e9e7;color:#37352f;padding:.5rem;font-size:12px}
button{margin-top:1rem;padding:.5rem 1rem;background:#2383e2;color:#fff;border:none;border-radius:6px;cursor:pointer}
p{font-size:13px;color:#6b6b6b;line-height:1.5}</style></head><body>
<h1>更新 IB Gateway 会话</h1>
<p>在已登录的 Gateway 页面按 F12 → Network → 点任意 <code>/v1/api/</code> 请求 → Request Headers 里复制整段 <strong>Cookie</strong>，粘贴到下方并提交。会写入 <code>.data/ibkr-cp-cookie.txt</code>（无需重启 dev）。</p>
<form method="post"><label for="c">Cookie</label><textarea id="c" name="cookie" required placeholder="paste=...; session=..."></textarea><br/><button type="submit">保存</button></form>
</body></html>`;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function POST(req: NextRequest) {
  if (isIbkrTwsMode()) return twsModeReject();
  if (!setupAllowed(req)) return deny();

  let cookie = "";
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = (await req.json().catch(() => null)) as { cookie?: string } | null;
    cookie = typeof j?.cookie === "string" ? j.cookie : "";
  } else if (ct.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    cookie = String(form.get("cookie") ?? "");
  } else {
    cookie = (await req.text()).trim();
  }

  cookie = cookie.trim();
  if (!cookie) {
    return NextResponse.json(
      { error: "空 Cookie：请粘贴 Request Headers 中的 Cookie 整段" },
      { status: 400 },
    );
  }

  writeIbkrCpCookie(cookie);
  return NextResponse.json({ ok: true, message: "已写入会话文件，可刷新行情页。" });
}
