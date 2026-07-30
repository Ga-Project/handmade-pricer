// ねだんの工房 — URL 保存・共有の符号化/復元テスト（node:test 標準ランナー）。
// 実行: pnpm test (= node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeShareParams,
  decodeShareParams,
  hasShareParams,
} from "../lib/share.mjs";

const fullState = {
  materialCost: "800",
  workMinutes: "90",
  hourlyWage: "1200",
  shipping: "250",
  includeShipping: true,
  profitPercent: "30",
  marketId: "creema",
  customFee: "10",
  customFixed: "0",
  roundUnit: "50",
};

test("encode→decode で全フィールドが元に戻る（往復）", () => {
  const decoded = decodeShareParams(encodeShareParams(fullState));
  assert.equal(decoded.materialCost, "800");
  assert.equal(decoded.workMinutes, "90");
  assert.equal(decoded.hourlyWage, "1200");
  assert.equal(decoded.shipping, "250");
  assert.equal(decoded.includeShipping, true);
  assert.equal(decoded.profitPercent, "30");
  assert.equal(decoded.marketId, "creema");
  assert.equal(decoded.roundUnit, "50");
  assert.equal(decoded.customFee, "10");
  assert.equal(decoded.customFixed, "0");
});

test("じぶんで入力（custom）の率・固定費も往復する", () => {
  const decoded = decodeShareParams(
    encodeShareParams({
      ...fullState,
      marketId: "custom",
      customFee: "7.5",
      customFixed: "55",
    }),
  );
  assert.equal(decoded.marketId, "custom");
  assert.equal(decoded.customFee, "7.5");
  assert.equal(decoded.customFixed, "55");
});

test("includeShipping=false が 0 として往復する", () => {
  const decoded = decodeShareParams(
    encodeShareParams({ ...fullState, includeShipping: false }),
  );
  assert.equal(decoded.includeShipping, false);
});

test("先頭の ? が付いていても復元できる", () => {
  const qs = encodeShareParams(fullState);
  const decoded = decodeShareParams("?" + qs);
  assert.equal(decoded.materialCost, "800");
});

test("URLSearchParams を直接渡しても復元できる", () => {
  const decoded = decodeShareParams(
    new URLSearchParams(encodeShareParams(fullState)),
  );
  assert.equal(decoded.marketId, "creema");
});

test("未知の marketId は無視する（プリセット外へ飛ばさない）", () => {
  const decoded = decodeShareParams("mk=evil-market&mc=500");
  assert.equal(decoded.marketId, undefined);
  assert.equal(decoded.materialCost, "500");
});

test("数値フィールドの不正値（負値・非数）は無視する", () => {
  const decoded = decodeShareParams("mc=-100&wm=abc&hw=1000");
  assert.equal(decoded.materialCost, undefined);
  assert.equal(decoded.workMinutes, undefined);
  assert.equal(decoded.hourlyWage, "1000");
});

test("空文字・空クエリでは何も復元しない", () => {
  assert.deepEqual(decodeShareParams(""), {});
  assert.equal(hasShareParams(""), false);
});

test("空値のフィールドは URL に含めない（inc は常に含む）", () => {
  const qs = encodeShareParams({ ...fullState, materialCost: "" });
  const params = new URLSearchParams(qs);
  assert.equal(params.has("mc"), false);
  assert.equal(params.get("inc"), "1");
});

test("hasShareParams は共有パラメータの有無を判定する", () => {
  assert.equal(hasShareParams(encodeShareParams(fullState)), true);
  assert.equal(hasShareParams("foo=bar"), false);
});
