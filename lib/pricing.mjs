// ねだんの工房 — 価格の逆算ロジック（純関数・UIから独立してテスト可能）。
//
// 逆算の考え方:
//   作り手が受け取りたい額（＝原価＋利益）を先に決め、そこへ販売所の手数料を
//   上乗せして「いくらで並べれば手取りが目標に届くか」を解く。
//   手取り = 販売価格 − (販売価格 × 手数料率 + 固定手数料)
//   目標手取り = 販売価格 × (1 − 手数料率) − 固定手数料
//   ⇒ 販売価格 = (目標手取り + 固定手数料) / (1 − 手数料率)

/**
 * @typedef {Object} PricingInputs
 * @property {number} materialCost  材料費（円）
 * @property {number} workMinutes   作業時間（分）
 * @property {number} hourlyWage    希望時給（円/時）
 * @property {number} shipping      梱包・送料（円）
 * @property {boolean} includeShipping 送料を販売価格に含める（送料込み販売）か
 * @property {number} profitRate    目標利益率（原価に対する割合・例 0.2 = 20%）
 */

/**
 * @typedef {Object} Marketplace
 * @property {string} id
 * @property {string} name
 * @property {number} feeRate   販売にかかる手数料率（0〜1）
 * @property {number} fixedFee  1件あたりの固定手数料（円）
 * @property {string} [note]
 */

/**
 * @typedef {Object} Breakdown
 * @property {number} materialCost 材料費
 * @property {number} labor        工賃（作業時間 × 時給）
 * @property {number} shipping     価格に含めた送料（含めない場合は 0）
 * @property {number} cost         原価合計
 * @property {number} targetTakeHome 目標手取り（原価 ＋ 目標利益）
 * @property {number} exactPrice   端数処理前の理論価格
 * @property {number} price        推奨販売価格（切り上げ後）
 * @property {number} fee          販売手数料（価格 × 率 ＋ 固定）
 * @property {number} takeHome     手取り（価格 − 手数料）
 * @property {number} profit       利益（手取り − 原価）
 * @property {number} profitRateActual 実利益率（利益 / 原価）
 * @property {number} takeHomeRate 手取り率（手取り / 価格）
 * @property {boolean} feasible    実現可能か（手数料率が 100% 未満か）
 * @property {boolean} loss        この価格で手取りが原価を下回る（赤字）か
 */

/** 数値を最小 0 の有限数に丸める（NaN や負値の混入を吸収する）。 */
export function clampNonNegative(n) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v < 0 ? 0 : v;
}

/** value を unit の倍数へ切り上げる（unit<=0 のときは切り上げない）。 */
export function roundUpTo(value, unit) {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(unit) || unit <= 0) return Math.max(0, Math.ceil(value));
  return Math.ceil(value / unit) * unit;
}

/**
 * 原価（材料費＋工賃＋含めた送料）と目標手取りを求める。
 * @param {PricingInputs} inputs
 * @returns {{ materialCost:number, labor:number, shipping:number, cost:number, targetTakeHome:number }}
 */
export function computeCostBasis(inputs) {
  const materialCost = clampNonNegative(inputs.materialCost);
  const workMinutes = clampNonNegative(inputs.workMinutes);
  const hourlyWage = clampNonNegative(inputs.hourlyWage);
  const shippingInput = clampNonNegative(inputs.shipping);
  const profitRate = clampNonNegative(inputs.profitRate);

  const labor = (workMinutes / 60) * hourlyWage;
  const shipping = inputs.includeShipping ? shippingInput : 0;
  const cost = materialCost + labor + shipping;
  const targetTakeHome = cost * (1 + profitRate);

  return { materialCost, labor, shipping, cost, targetTakeHome };
}

/**
 * 目標手取りに届く販売価格を、指定販売所の手数料から逆算する。
 * @param {PricingInputs} inputs
 * @param {Marketplace} marketplace
 * @param {number} [roundUnit=10] 価格の切り上げ単位（円）
 * @returns {Breakdown}
 */
export function computeResult(inputs, marketplace, roundUnit = 10) {
  const basis = computeCostBasis(inputs);
  const feeRate = clampNonNegative(marketplace.feeRate);
  const fixedFee = clampNonNegative(marketplace.fixedFee);
  const feasible = feeRate < 1;

  let exactPrice = 0;
  if (feasible) {
    exactPrice = (basis.targetTakeHome + fixedFee) / (1 - feeRate);
  }
  const price = feasible ? roundUpTo(exactPrice, roundUnit) : 0;
  const fee = feasible ? price * feeRate + fixedFee : 0;
  const takeHome = feasible ? price - fee : 0;
  const profit = takeHome - basis.cost;
  const profitRateActual = basis.cost > 0 ? profit / basis.cost : 0;
  const takeHomeRate = price > 0 ? takeHome / price : 0;

  return {
    materialCost: basis.materialCost,
    labor: basis.labor,
    shipping: basis.shipping,
    cost: basis.cost,
    targetTakeHome: basis.targetTakeHome,
    exactPrice,
    price,
    fee,
    takeHome,
    profit,
    profitRateActual,
    takeHomeRate,
    feasible,
    // 手取りが原価を下回る（赤字）。浮動小数点の誤差で偽陽性にならないよう許容差を持たせる。
    loss: feasible && takeHome < basis.cost - 1e-6,
  };
}

/**
 * 同じ条件を複数の販売所で並べて比較する。
 * @param {PricingInputs} inputs
 * @param {Marketplace[]} marketplaces
 * @param {number} [roundUnit=10]
 * @returns {Array<{ marketplace: Marketplace, result: Breakdown }>}
 */
export function compareMarketplaces(inputs, marketplaces, roundUnit = 10) {
  return marketplaces.map((marketplace) => ({
    marketplace,
    result: computeResult(inputs, marketplace, roundUnit),
  }));
}

/** 円の整数表示（¥1,280 形式）。負値は「−¥1,280」と符号を前に出す。 */
export function formatYen(n) {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  const sign = v < 0 ? "−" : "";
  return `${sign}¥${Math.abs(v).toLocaleString("ja-JP")}`;
}

/** 割合の表示（0.1056 → "10.6%"）。桁は digits で調整。 */
export function formatPercent(rate, digits = 1) {
  const v = Number.isFinite(rate) ? rate * 100 : 0;
  return `${v.toFixed(digits)}%`;
}
