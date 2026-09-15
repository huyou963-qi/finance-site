import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { decodeJpMofReservesCsv } from "./client";
import { parseJpMofReservesCsv } from "./parser";

const fixture = readFileSync(path.join(__dirname, "fixtures", "historical.csv"));

test("parses the official MOF international-reserves history and component identities", () => {
  const parsed = parseJpMofReservesCsv(decodeJpMofReservesCsv(fixture));
  assert.equal(Object.keys(parsed).length, 6);
  assert.equal(parsed.mof_jp_reserves_total.length, 317);
  assert.equal(parsed.mof_jp_reserves_total[0].obsDate.toISOString().slice(0, 10), "2000-04-01");
  assert.equal(parsed.mof_jp_reserves_total.at(-1)?.obsDate.toISOString().slice(0, 10), "2026-08-01");
  assert.equal(parsed.mof_jp_reserves_total.at(-1)?.value, 1_207_524);
  assert.equal(parsed.mof_jp_reserves_foreign_currency.at(-1)?.value, 994_976);
  assert.equal(parsed.mof_jp_reserves_securities.at(-1)?.value, 839_559);
  assert.equal(parsed.mof_jp_reserves_deposits.at(-1)?.value, 155_417);
  assert.equal(parsed.mof_jp_reserves_gold_value.at(-1)?.value, 124_103);
  assert.equal(parsed.mof_jp_reserves_gold_volume.at(-1)?.value, 27.2);
});

test("fails closed when the selected official header column moves", () => {
  const text = decodeJpMofReservesCsv(fixture).replace(
    ",A. Official reserve assets,",
    ",A. Official reserve assets changed,",
  );
  assert.throws(() => parseJpMofReservesCsv(text), /selected column layout changed/);
});

test("fails closed on a gap after a component begins", () => {
  const text = decodeJpMofReservesCsv(fixture).replace(
    ",August,1207524,994976,839559,,155417,",
    ",August,1207524,994976,839559,,,",
  );
  assert.throws(() => parseJpMofReservesCsv(text), /gap after start/);
});
