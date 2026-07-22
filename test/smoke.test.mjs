// ねだんの工房 — データ健全性の smoke テスト（node:test 標準ランナー・追加の依存なし）。
// 実行: pnpm test (= node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { MARKETPLACES } from "../lib/marketplaces.mjs";

test("販売所プリセットが1件以上ある", () => {
  assert.ok(Array.isArray(MARKETPLACES) && MARKETPLACES.length > 0);
});

test("各販売所の手数料率が 0〜100% の範囲に収まる", () => {
  for (const m of MARKETPLACES) {
    assert.ok(typeof m.id === "string" && m.id.length > 0, `id: ${m.id}`);
    assert.ok(typeof m.name === "string" && m.name.length > 0, `name: ${m.name}`);
    assert.ok(m.feeRate >= 0 && m.feeRate < 1, `feeRate 範囲: ${m.name}`);
    assert.ok(m.fixedFee >= 0, `fixedFee 非負: ${m.name}`);
  }
});

test("販売所の id は重複しない", () => {
  const ids = MARKETPLACES.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
});
