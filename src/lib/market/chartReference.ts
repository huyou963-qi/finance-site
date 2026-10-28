import { z } from "zod";

export const referenceCodeSchema = z.object({ referenceId: z.string().uuid() }).strict();
export function chartReferenceId(text: string): string | null {
  try { return referenceCodeSchema.parse(JSON.parse(text)).referenceId; } catch { return null; }
}
export function chartReferenceMarkdown(id: string) {
  return `\n\n\`\`\`gekko-chart\n${JSON.stringify({ referenceId: referenceCodeSchema.shape.referenceId.parse(id) })}\n\`\`\`\n\n`;
}
// Insert only after an actual Markdown heading, ignoring fenced code blocks.
export function insertChartReference(body: string, block: string, placement: { type: "end" } | { type: "after_heading"; heading: string }) {
  if (placement.type === "end") return body.trimEnd() + block;
  const lines = body.split("\n");
  let fence: { marker: string; length: number } | null = null;
  const matches: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(lines[i]!);
    if (f) { if (!fence) fence = { marker: f[1]![0]!, length: f[1]!.length }; else if (f[1]![0] === fence.marker && f[1]!.length >= fence.length && /^\s{0,3}(`+|~+)\s*$/.test(lines[i]!)) fence = null; continue; }
    const heading = !fence ? /^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(lines[i]!) : null;
    if (heading?.[1] === placement.heading) matches.push(i);
  }
  if (matches.length !== 1) throw new Error(matches.length ? "标题重复，无法唯一定位；请修改标题或选择 end" : "未找到指定 Markdown 标题");
  lines.splice(matches[0]! + 1, 0, block);
  return lines.join("\n");
}
