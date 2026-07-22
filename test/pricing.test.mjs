// ねだんの工房 — 価格逆算ロジックのユニットテスト（node:test 標準ランナー）。
// 実行: pnpm test (= node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampNonNegative,
  roundUpTo,
  computeCostBasis,
  computeResult,
  compareMarketplaces,
  formatYen,
  formatPercent,
} from "../lib/pricing.mjs";
import { MARKETPLACES, makeCustomMarketplace } from "../lib/marketplaces.mjs";

const baseInputs = {
  materialCost: 500,
  workMinutes: 60,
  hourlyWage: 1000,
  shipping: 300,
  includeShipping: true,
  profitRate: 0.2,
};

test("clampNonNegative: 負値・NaN・非数を 0 に丸める", () => {
  assert.equal(clampNonNegative(120), 120);
  assert.equal(clampNonNegative(-5), 0);
  assert.equal(clampNonNegative(NaN), 0);
  assert.equal(clampNonNegative("x"), 0);
  assert.equal(clampNonNegative(Infinity), 0);
});

test("roundUpTo: 単位への切り上げ", () => {
  assert.equal(roundUpTo(1234, 10), 1240);
  assert.equal(roundUpTo(1200, 10), 1200);
  assert.equal(roundUpTo(1201, 100), 1300);
  assert.equal(roundUpTo(1234, 0), 1234); // unit<=0 は整数切り上げのみ
});

test("computeCostBasis: 原価と目標手取り", () => {
  const b = computeCostBasis(baseInputs);
  assert.equal(b.labor, 1000); // 60分 × 1000円/時
  assert.equal(b.shipping, 300); // 送料込み
  assert.equal(b.cost, 1800); // 500 + 1000 + 300
  assert.equal(b.targetTakeHome, 2160); // 1800 × 1.2
});

test("computeCostBasis: 送料別なら送料は原価に入らない", () => {
  const b = computeCostBasis({ ...baseInputs, includeShipping: false });
  assert.equal(b.shipping, 0);
  assert.equal(b.cost, 1500);
});

test("computeResult(minne): 逆算価格で手取りが目標以上", () => {
  const minne = MARKETPLACES.find((m) => m.id === "minne");
  const r = computeResult(baseInputs, minne, 10);
  assert.equal(r.feasible, true);
  assert.equal(r.price % 10, 0); // 10円単位に切り上げ
  assert.ok(r.takeHome >= r.targetTakeHome); // 手取りが目標に届く
  assert.ok(r.price >= r.exactPrice); // 切り上げ後は理論価格以上
  assert.equal(r.loss, false); // 目標利益率 20% なので赤字ではない
  assert.ok(Math.abs(r.fee - (r.price * minne.feeRate + minne.fixedFee)) < 1e-6);
});

test("computeResult(BASE): 固定手数料が価格に反映される", () => {
  const base = MARKETPLACES.find((m) => m.id === "base");
  const r = computeResult(baseInputs, base, 10);
  assert.equal(r.feasible, true);
  assert.ok(r.takeHome >= r.targetTakeHome);
  // 固定手数料込みで手数料を計算している
  assert.ok(r.fee >= base.fixedFee);
});

test("computeResult: 手数料率100%以上は実現不能として扱う", () => {
  const broken = { id: "x", name: "x", feeRate: 1, fixedFee: 0 };
  const r = computeResult(baseInputs, broken, 10);
  assert.equal(r.feasible, false);
  assert.equal(r.price, 0);
});

test("computeResult: 入力ゼロでも例外を投げない", () => {
  const zero = {
    materialCost: 0,
    workMinutes: 0,
    hourlyWage: 0,
    shipping: 0,
    includeShipping: true,
    profitRate: 0,
  };
  const minne = MARKETPLACES.find((m) => m.id === "minne");
  const r = computeResult(zero, minne, 10);
  assert.equal(r.cost, 0);
  assert.equal(r.price, 0);
  assert.equal(r.profitRateActual, 0);
});

test("手数料が高い販売所ほど推奨価格は高くなる", () => {
  const rows = compareMarketplaces(baseInputs, MARKETPLACES, 10);
  const minne = rows.find((x) => x.marketplace.id === "minne").result;
  const stores = rows.find((x) => x.marketplace.id === "stores").result; // 5%
  assert.ok(minne.price > stores.price); // 10.56% > 5%
});

test("makeCustomMarketplace: %入力を率に変換", () => {
  const m = makeCustomMarketplace(8, 30);
  assert.ok(Math.abs(m.feeRate - 0.08) < 1e-9);
  assert.equal(m.fixedFee, 30);
  const r = computeResult(baseInputs, m, 10);
  assert.ok(r.takeHome >= r.targetTakeHome);
});

test("computeResult: 内訳（材料+工賃+送料+利益+手数料）が販売価格に一致する", () => {
  for (const m of MARKETPLACES) {
    const r = computeResult(baseInputs, m, 10);
    const sum = r.materialCost + r.labor + r.shipping + r.profit + r.fee;
    assert.ok(Math.abs(sum - r.price) < 1e-6, `内訳合計=価格: ${m.name}`);
  }
});

test("computeResult: 送料別なら逆算価格にも送料が乗らない", () => {
  const minne = MARKETPLACES.find((m) => m.id === "minne");
  const withShip = computeResult(baseInputs, minne, 10);
  const noShip = computeResult({ ...baseInputs, includeShipping: false }, minne, 10);
  assert.equal(noShip.shipping, 0);
  assert.ok(noShip.price < withShip.price); // 送料の分だけ安くなる
  assert.ok(noShip.takeHome >= noShip.targetTakeHome);
});

test("formatYen / formatPercent", () => {
  assert.equal(formatYen(1280), "¥1,280");
  assert.equal(formatYen(-500), "−¥500"); // 符号は ¥ の前
  assert.equal(formatPercent(0.1056, 1), "10.6%");
  assert.equal(formatPercent(0.05, 0), "5%");
});
