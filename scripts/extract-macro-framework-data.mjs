import fs from "fs";

const src = fs.readFileSync("canvases/us-macro-framework-preview.canvas.tsx", "utf8");
const typeStart = src.indexOf("type IndicatorTiming");
const typeEnd = src.indexOf("// ─── Mock Data");
const types = src
  .slice(typeStart, typeEnd)
  .replace(/^type /gm, "export type ")
  .replace(/^interface /gm, "export interface ");

const dataStart = src.indexOf("const INDICATORS");
const dataEnd = src.indexOf("// ─── Helpers");
const data = src.slice(dataStart, dataEnd).replace(/^const /gm, "export const ");

const extract = (name) => {
  const re = new RegExp(`const ${name}[\\s\\S]*?};`);
  return src.match(re)[0].replace("const ", "export const ");
};

const labels =
  extract("SECTOR_LABEL") +
  "\n" +
  extract("TIMING_LABEL") +
  "\n" +
  extract("CHANNEL_LABEL") +
  "\n" +
  extract("CYCLE_LABEL") +
  "\n" +
  extract("NODE_TO_INDICATOR") +
  "\nexport const IND_BY_ID = Object.fromEntries(INDICATORS.map((i) => [i.id, i]));\n";

fs.mkdirSync("src/lib/macro-framework", { recursive: true });
fs.writeFileSync("src/lib/macro-framework/types.ts", types);
fs.writeFileSync("src/lib/macro-framework/data.ts", data + labels);
console.log("extracted");
