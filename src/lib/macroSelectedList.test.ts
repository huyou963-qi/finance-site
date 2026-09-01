import assert from "node:assert/strict";
import test from "node:test";
import {
  membershipSignatureFromListItems,
  reorderListItems,
  type MacroSelectedListItem,
} from "@/lib/macroSelectedList";

test("成员签名忽略指标和分割线的展示顺序", () => {
  const items: MacroSelectedListItem[] = [
    { type: "series", key: "fred:A" },
    { type: "divider", id: "group-1", label: "分组" },
    { type: "series", key: "fred:B" },
  ];
  const reordered = reorderListItems(items, 0, 2);

  assert.notDeepEqual(reordered, items);
  assert.equal(
    membershipSignatureFromListItems(reordered),
    membershipSignatureFromListItems(items),
  );
});

test("成员签名在指标增删时变化", () => {
  const before: MacroSelectedListItem[] = [{ type: "series", key: "fred:A" }];
  const after: MacroSelectedListItem[] = [
    ...before,
    { type: "series", key: "fred:B" },
  ];

  assert.notEqual(
    membershipSignatureFromListItems(before),
    membershipSignatureFromListItems(after),
  );
});
