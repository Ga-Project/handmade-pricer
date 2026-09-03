// 画面に出す文言が守るべき規則。
//
// テストからも製品コードからも読めるように lib/ に置く。以前は test/faq.test.mjs が
// これらを export していたが、node --test はファイルごとに別プロセスで走るので、
// import した側のプロセスで faq.test.mjs のテストが再登録され、同じ検査が
// 何度も走って「件数だけ厚く見える」状態になっていた。規則は規則として独立させる。
//
// 守りたいのは3点:
//   - 税務・会計の助言をしない。
//   - 収益や結果を保証しない。
//   - 各販売所の手数料率を本文で断定しない（プラン・時期で変わるため公式確認へ寄せる）。
// 下の検査は「よくある踏み外しを止める」トリップワイヤであって、
// 表現の制約が機械で完全に担保されるという意味ではない（執筆時にも守ること）。

/** 断定・保証・税務助言に読める代表的な言い回し。 */
export const FORBIDDEN = [
  "節税",
  "保証",
  "必ず儲かり",
  "赤字になりません",
  "申告が正しくできます",
  "税務相談",
  "損しません",
];

// 「保証するものではありません」のような免責は書いてよい（むしろ書くべき）。
// 落としたいのは保証を"する"側の表現なので、否定形を先に取り除いてから見る。
//
// **定型句そのものだけを取り除き、その先へ食い込ませない。**
// 以前は末尾に [^。]* を付けて「次の 。まで」を落としていたが、
// この正規表現は minify 済みのクライアントバンドル（文の区切りが無く、
// 改行もファイル境界も [^。] に含まれる）にも当てる。実測で、免責句の直後が
// 。で終わらない書き方に変えただけで 355 文字ぶんが除去され、
// その窓に入った禁止語が見逃された。番人が静かに緑を返す方が、番人が無いより悪い。
export const DISCLAIMER =
  /保証(?:するものでは|しま?せん|いたしません|できません|は(?:し|いたし)ません)/g;

/**
 * 任意の入れ子（オブジェクト・配列）から文字列リーフを再帰的に集める。
 *
 * 文言の一覧を手で書き写すと、足したときに写し忘れて「検査があるのに
 * 何も見ていない」状態に戻る（実際にそうなった）。構造から導出すれば、
 * フィールドを足すだけで自動的に検査対象に入る。
 * 関数は値を持たないのでここでは拾わない（呼び出し例は別に持つ）。
 */
export function collectStrings(value, acc = []) {
  if (typeof value === "string") {
    acc.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, acc);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectStrings(v, acc);
  }
  return acc;
}

/** 入れ子から関数リーフを「パス付き」で集める（呼び出し例の網羅性検査用）。 */
export function collectFunctions(value, path = "", acc = []) {
  if (typeof value === "function") {
    acc.push({ path, fn: value });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectFunctions(v, `${path}[${i}]`, acc));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      collectFunctions(v, path ? `${path}.${k}` : k, acc);
    }
  }
  return acc;
}

/** 禁止表現を含む文字列を返す（含まなければ空配列）。 */
export function findForbidden(text) {
  const cleaned = String(text).replace(DISCLAIMER, "");
  return FORBIDDEN.filter((w) => cleaned.includes(w));
}
