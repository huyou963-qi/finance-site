import assert from "node:assert/strict";
import test from "node:test";
import {
  displayKeysFromListItems,
  membershipSignatureFromListItems,
  reorderListItems,
  sanitizeSelectedListItems,
  syncListWithDerivedKeys,
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

test("衍生指标参与展示排序但不进入原始指标成员签名", () => {
  const items: MacroSelectedListItem[] = [
    { type: "series", key: "fred:A" },
    { type: "derived", key: "calc:d-1" },
  ];

  assert.deepEqual(displayKeysFromListItems(items), ["fred:A", "calc:d-1"]);
  assert.equal(membershipSignatureFromListItems(items), JSON.stringify(["fred:A"]));
});

test("衍生指标同步保留拖拽位置并追加新结果", () => {
  const items: MacroSelectedListItem[] = [
    { type: "derived", key: "calc:kept" },
    { type: "series", key: "fred:A" },
    { type: "derived", key: "calc:removed" },
  ];

  assert.deepEqual(syncListWithDerivedKeys(items, ["calc:kept", "calc:new"]), [
    { type: "derived", key: "calc:kept" },
    { type: "series", key: "fred:A" },
    { type: "derived", key: "calc:new" },
  ]);
});

test("持久化列表接受合法衍生指标并拒绝伪造 key", () => {
  assert.deepEqual(
    sanitizeSelectedListItems([
      { type: "derived", key: "calc:d-1" },
      { type: "derived", key: "fred:not-derived" },
    ]),
    [{ type: "derived", key: "calc:d-1" }],
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
