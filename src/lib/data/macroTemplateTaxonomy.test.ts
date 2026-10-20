import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_US_OIL_DIESEL_TEMPLATE } from "./oilDieselAnalysisLayout";
import {
  countTemplatesByDimension,
  getTemplatesForDimension,
  resolveTemplatePlacement,
} from "./macroTemplateTaxonomy";

test("exposes the oil template through the shared desktop/mobile global topic entry", () => {
  const templates = [BUILTIN_US_OIL_DIESEL_TEMPLATE];
  assert.deepEqual(resolveTemplatePlacement(BUILTIN_US_OIL_DIESEL_TEMPLATE), {
    scope: "global",
    dimensionId: "topic",
  });
  assert.equal(countTemplatesByDimension(templates, "global", "US").topic, 1);
  assert.deepEqual(
    getTemplatesForDimension(templates, "global", "US", "topic").map(
      (template) => template.id,
    ),
    ["builtin-us-oil-diesel-monitor"],
  );
});

test("does not duplicate the global oil template into country entries", () => {
  const templates = [BUILTIN_US_OIL_DIESEL_TEMPLATE];
  assert.equal(countTemplatesByDimension(templates, "country", "US").topic, 0);
  assert.equal(countTemplatesByDimension(templates, "country", "CN").topic, 0);
});
