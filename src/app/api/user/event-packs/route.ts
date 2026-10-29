import { NextResponse } from "next/server";

// Retired: cached clients and old Skills must not read or write account event storage.
function retired() {
  return NextResponse.json({ error: "用户事件云同步已取消，请在行情页导入本地事件文件。" }, { status: 410, headers: { "Cache-Control": "private, no-store" } });
}
export const GET = retired;
export const POST = retired;
