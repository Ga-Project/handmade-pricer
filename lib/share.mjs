// ねだんの工房 — 計算条件を URL に保存・共有するための純関数（UI・DOM から独立）。
//
// 入力した材料費や販売所などの条件を短いクエリ文字列にまとめ、URL として控えておけば
// 後日そのまま開き直したり、共同制作者に渡したりできる。値はすべてブラウザ内で扱い、
// URL 生成もクライアント側で完結する（サーバーへ送信しない）。
//
// 逆算ロジック（pricing.mjs）と同じく、ここは純関数だけにして node:test で直接検証する。

import { MARKETPLACES, CUSTOM_MARKETPLACE_ID } from "./marketplaces.mjs";

/**
 * @typedef {Object} ShareState
 * @property {string} materialCost   材料費（円・文字列のまま保持）
 * @property {string} workMinutes    作業時間（分）
 * @property {string} hourlyWage     希望時給（円/時）
 * @property {string} shipping       梱包・送料（円）
 * @property {boolean} includeShipping 送料込みで売るか
 * @property {string} profitPercent  目標利益率（%）
 * @property {string} marketId       売る場所（販売所 id）
 * @property {string} customFee      じぶんで入力の手数料率（%）
 * @property {string} customFixed    じぶんで入力の固定手数料（円）
 * @property {string} roundUnit      値段の丸め単位（円）
 * @property {string} materials     材料明細（materials.mjs で畳んだ文字列・空なら載せない）
 */

// 短く安定した URL パラメータ名 ↔ 状態フィールドの対応表。
// 一度公開した URL が後日も開けるよう、キー名は変更しない。
const STRING_KEYS = /** @type {const} */ ([
  ["mc", "materialCost"],
  ["wm", "workMinutes"],
  ["hw", "hourlyWage"],
  ["sh", "shipping"],
  ["pr", "profitPercent"],
  ["mk", "marketId"],
  ["cf", "customFee"],
  ["cx", "customFixed"],
  ["ru", "roundUnit"],
  ["ml", "materials"],
]);
const BOOL_PARAM = "inc"; // includeShipping を "1" / "0" で表す

// 数値系フィールドとして受け入れるパラメータ（復元時に数値らしさを検証する）。
const NUMERIC_FIELDS = new Set([
  "materialCost",
  "workMinutes",
  "hourlyWage",
  "shipping",
  "profitPercent",
  "customFee",
  "customFixed",
  "roundUnit",
]);

// 復元時に許可する marketId。プリセット定義（marketplaces.mjs）から導出して、
// 販売所を追加したときにこちらの更新漏れ（＝その販売所の共有URLだけ復元されない）を防ぐ。
const KNOWN_MARKET_IDS = new Set([
  ...MARKETPLACES.map((m) => m.id),
  CUSTOM_MARKETPLACE_ID,
]);

/** 数値文字列として妥当か（非負の有限数のみ受け入れる）。 */
function isNonNegativeNumberString(v) {
  if (typeof v !== "string" || v.trim() === "") return false;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0;
}

/**
 * 状態を URL クエリ文字列（"mc=500&wm=60&..." 形式・先頭に "?" は付けない）へ符号化する。
 * @param {ShareState} state
 * @returns {string}
 */
export function encodeShareParams(state) {
  const params = new URLSearchParams();
  const s = state || {};
  for (const [key, field] of STRING_KEYS) {
    const value = s[field];
    if (value !== undefined && value !== null && String(value) !== "") {
      params.set(key, String(value));
    }
  }
  params.set(BOOL_PARAM, s.includeShipping ? "1" : "0");
  return params.toString();
}

/**
 * URL クエリ（文字列 or URLSearchParams）から、useState を上書きできる部分状態を取り出す。
 * 未知・不正な値は黙って無視し、含まれるものだけ返す（壊れた URL でも安全に部分復元する）。
 * @param {string | URLSearchParams} search
 * @returns {Partial<ShareState>}
 */
export function decodeShareParams(search) {
  let params;
  try {
    params =
      search instanceof URLSearchParams
        ? search
        : new URLSearchParams(
            typeof search === "string" ? search.replace(/^\?/, "") : "",
          );
  } catch {
    return {};
  }

  /** @type {Partial<ShareState>} */
  const out = {};
  for (const [key, field] of STRING_KEYS) {
    if (!params.has(key)) continue;
    const raw = params.get(key);
    if (raw === null) continue;
    if (field === "marketId") {
      if (KNOWN_MARKET_IDS.has(raw)) out.marketId = raw;
      continue;
    }
    if (NUMERIC_FIELDS.has(field)) {
      if (isNonNegativeNumberString(raw)) out[field] = raw;
      continue;
    }
    out[field] = raw;
  }
  if (params.has(BOOL_PARAM)) {
    out.includeShipping = params.get(BOOL_PARAM) === "1";
  }
  return out;
}

/** 復元すべき共有パラメータが URL に含まれているか（含まれなければ既定値のまま起動する）。 */
export function hasShareParams(search) {
  const decoded = decodeShareParams(search);
  return Object.keys(decoded).length > 0;
}
