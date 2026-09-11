import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JP_ESRI_GDP_TABLES } from "./catalog";
import { discoverEsriCsv, discoverEsriRelease } from "./client";
import { parseEsriGdpCsv } from "./parser";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const csv = (name: string) => new TextDecoder("shift_jis", { fatal: true }).decode(fixture(`${name}.csv`));
const asOf = new Date("2026-09-09T00:00:00Z");

test("official full-history CSV: quarter starts, SAAR units, GDP growth and contribution units", () => {
  const expected = { "gaku-mk": [11, 130, 689219.1], "gaku-jk": [11, 130, 598950.5], "def-qk": [8, 130, 115.1], "kiyo-jk": [11, 129, 0.4] };
  for (const table of JP_ESRI_GDP_TABLES) {
    const parsed = parseEsriGdpCsv(csv(table), table, asOf);
    const [count, length, latest] = expected[table];
    assert.equal(Object.keys(parsed.series).length, count);
    for (const points of Object.values(parsed.series)) {
      assert.equal(points.length, length);
      assert.equal(points[0].obsDate.toISOString().slice(0, 10), table === "kiyo-jk" ? "1994-04-01" : "1994-01-01");
      assert.equal(points.at(-1)!.obsDate.toISOString().slice(0, 10), "2026-04-01");
    }
    assert.equal(Object.values(parsed.series)[0].at(-1)!.value, latest);
  }
});

test("release and CSV discovery rejects absent, foreign-origin and ambiguous links", () => {
  const release = discoverEsriRelease(fixture("menu.html").toString("utf8"));
  const html = fixture("release.html").toString("utf8");
  for (const table of JP_ESRI_GDP_TABLES) assert.match(discoverEsriCsv(html, release, table), new RegExp(`${table}\\d{4}\\.csv$`));
  assert.throws(() => discoverEsriRelease("<html/>"), /missing/);
  assert.throws(() => discoverEsriCsv('<a href="https://other.example/gaku-mk2622.csv">file</a>', release, "gaku-mk"), /missing/);
  assert.throws(() => discoverEsriCsv(html + html, release, "gaku-mk"), /ambiguous/);
});

test("fail closed for changed units/base, missing header, invalid values and dates", () => {
  const nominal = csv("gaku-mk");
  assert.throws(() => parseEsriGdpCsv(nominal.replaceAll("GDP(Expenditure Approach)", "changed"), "gaku-mk", asOf), /header/);
  assert.throws(() => parseEsriGdpCsv(nominal.replaceAll("年率で表示", "changed"), "gaku-mk", asOf), /annualised/);
  assert.throws(() => parseEsriGdpCsv(csv("gaku-jk").replaceAll("2020", "2025"), "gaku-jk", asOf), /base-year/);
  assert.throws(() => parseEsriGdpCsv(nominal.replace("689,219.1", "not-a-number"), "gaku-mk", asOf), /invalid value/);
  assert.throws(() => parseEsriGdpCsv(nominal.replace("1994/", "1995/"), "gaku-mk", asOf), /full-history/);
  assert.throws(() => parseEsriGdpCsv(nominal, "gaku-mk", new Date("2026-06-15")), /incomplete/);
});
