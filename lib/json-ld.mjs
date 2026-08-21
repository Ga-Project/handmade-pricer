// 構造化データ(JSON-LD)を <script> の中身として安全に書き出す。
//
// JSON.stringify は "<" をエスケープしない。本文に "</script>" が1つ入るだけで
// script 要素がそこで閉じ、以降が HTML として解釈される（＝任意マークアップの注入口）。
// JSON 文字列としては < が "<" と等価なので、置換しても構造化データの意味は変わらない。
export function toJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}
