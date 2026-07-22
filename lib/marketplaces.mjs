// ねだんの工房 — 販売所の手数料プリセット。
//
// 手数料率は各サービスが公表している一般的な区分をもとにした「参考値」です。
// プランや時期で変わるため、実際の値は各サービスの公式ページでご確認ください。
// 正確な数字を使いたいときは「じぶんで入力」で率と固定手数料を直接指定できます。

/** @typedef {import("./pricing.mjs").Marketplace} Marketplace */

/** @type {Marketplace[]} */
export const MARKETPLACES = [
  {
    id: "minne",
    name: "minne",
    feeRate: 0.1056,
    fixedFee: 0,
    note: "販売手数料 10.56%（税込）",
  },
  {
    id: "creema",
    name: "Creema",
    feeRate: 0.11,
    fixedFee: 0,
    note: "販売手数料 11%（税込）",
  },
  {
    id: "mercari",
    name: "メルカリ",
    feeRate: 0.1,
    fixedFee: 0,
    note: "販売手数料 10%",
  },
  {
    id: "base",
    name: "BASE（スタンダード）",
    feeRate: 0.066,
    fixedFee: 40,
    note: "サービス利用料 3% ＋ 決済手数料 3.6%＋40円/件",
  },
  {
    id: "stores",
    name: "STORES（フリー）",
    feeRate: 0.05,
    fixedFee: 0,
    note: "決済手数料 5%（フリープラン）",
  },
];

/** 「じぶんで入力」用のひな型。UI 側で率・固定手数料を書き換えて使う。 */
export const CUSTOM_MARKETPLACE_ID = "custom";

/** @returns {Marketplace} */
export function makeCustomMarketplace(feeRatePercent = 10, fixedFee = 0) {
  const rate = Number.isFinite(feeRatePercent) ? feeRatePercent : 0;
  return {
    id: CUSTOM_MARKETPLACE_ID,
    name: "じぶんで入力",
    feeRate: Math.max(0, rate) / 100,
    fixedFee: Math.max(0, Number.isFinite(fixedFee) ? fixedFee : 0),
    note: "手数料率と固定手数料を自分で指定",
  };
}
