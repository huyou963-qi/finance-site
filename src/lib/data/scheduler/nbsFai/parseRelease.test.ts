import assert from "node:assert/strict";
import test from "node:test";
import { parseFaiInfrastructureRelease } from "./parseRelease";

test("parses the 2025 infrastructure definition excluding utilities", () => {
  const parsed = parseFaiInfrastructureRelease(`
    <h1>2025年全国固定资产投资（不含农户）基本情况</h1>
    <p>基础设施投资（不含电力、热力、燃气及水生产和供应业）比上年下降2.2%。</p>
  `);
  assert.equal(parsed.point.obsDate.toISOString().slice(0, 10), "2025-12-01");
  assert.equal(parsed.point.value, -2.2);
  assert.equal(parsed.definition, "excludes_utilities");
});

test("parses the 2026 definition including utilities", () => {
  const parsed = parseFaiInfrastructureRelease(`
    <h1>2026年1—6月份全国固定资产投资基本情况</h1>
    <p>基础设施投资同比下降2.4%。</p>
    <p>基础设施投资包括水利管理业、生态保护和环境治理业、公共设施管理业、道路运输业、铁路运输业、航空运输业、管道运输业、多式联运和运输代理业、装卸搬运业、邮政业、电信广播电视和卫星传输服务业、互联网和相关服务业、水上运输业以及电力、热力、燃气及水生产和供应业。</p>
  `);
  assert.equal(parsed.point.obsDate.toISOString().slice(0, 10), "2026-06-01");
  assert.equal(parsed.point.value, -2.4);
  assert.equal(parsed.definition, "includes_utilities");
});
