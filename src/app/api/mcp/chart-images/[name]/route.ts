import { readStockChartArtifact } from "@/lib/researchMcp/stockChartArtifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(req: Request, context: { params: Promise<{ name: string }> }) {
  try {
    const image = await readStockChartArtifact((await context.params).name);
    if (!image) return Response.json({ error: "图像不存在或链接已过期" }, { status: 404, headers });
    const disposition = image.mimeType === "application/json" || new URL(req.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        ...headers,
        "Content-Type": image.mimeType,
        "Content-Length": String(image.bytes.byteLength),
        "Content-Disposition": `${disposition}; filename="${image.filename}"`,
      },
    });
  } catch (error) {
    console.error("[research-mcp] chart image read failed", error);
    return Response.json({ error: "图像暂不可用" }, { status: 503, headers });
  }
}
