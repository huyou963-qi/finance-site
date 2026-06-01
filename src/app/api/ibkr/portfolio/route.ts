import { NextResponse } from "next/server";
import { fetchIbkrPortfolio } from "@/lib/data/ibkrPortfolio";

export async function GET() {
  try {
    const data = await fetchIbkrPortfolio();
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "加载组合失败";
    return NextResponse.json({
      gatewayBaseUrl: "",
      accounts: [],
      watchlists: [],
      error: message,
    });
  }
}
