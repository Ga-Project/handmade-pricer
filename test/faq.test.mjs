// よくある質問の中身についての不変量。
// 構造的なガード（サーバー専用モジュールの混入・共有カードのズレ・書き出し結果の照合）は
// test/guards.test.mjs にある。

import { test } from "node:test";
import assert from "node:assert/strict";

import { FAQ } from "../lib/faq.mjs";

test("FAQ は十分な数の項目を持つ", () => {
  assert.ok(FAQ.length >= 6, `FAQ が ${FAQ.length} 件しかない`);
});

test("FAQ の質問文は重複しない", () => {
  const qs = FAQ.map((f) => f.q);
  assert.equal(new Set(qs).size, qs.length);
});

test("FAQ の各回答は中身のある長さを持つ", () => {
  for (const f of FAQ) {
    assert.ok(f.q.length > 0, "質問が空");
    assert.ok(f.a.length >= 60, `回答が短すぎる（${f.a.length}文字）: ${f.q}`);
  }
});

// 断定・保証・税務助言に読める代表的な言い回しを落とすトリップワイヤ。
// 言い換えは無数にあるので、これは「よくある踏み外しを止める」ものであって、
// 表現の制約が機械で完全に担保されているという意味ではない（執筆時にも守ること）。
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
export const DISCLAIMER = /保証(?:するものでは|しま?せん|いたしません|できません|は(?:し|いたし)ません)[^。]*/g;

test("FAQ に断定的・助言的な禁止表現が含まれない", () => {
  for (const f of FAQ) {
    const text = `${f.q}${f.a}`.replace(DISCLAIMER, "");
    for (const word of FORBIDDEN) {
      assert.ok(!text.includes(word), `禁止表現「${word}」が含まれる: ${f.q}`);
    }
  }
});

test("免責の言い回しは禁止語検査に落とされない（検査自体の回帰）", () => {
  const text = "断定的な収益を保証するものではありません。".replace(DISCLAIMER, "");
  assert.ok(!text.includes("保証"), "免責表現が禁止語として誤検出される");
});

// 手数料率はプラン・時期で変わるので、販売所名の近くに率を書かない（公式確認へ寄せる）。
// 「利益率が何％になるか」のように販売所名を伴わない％は対象外。
const PLACE = "minne|Creema|メルカリ|BASE|STORES";
const FEE_NEAR_PLACE = new RegExp(
  `(?:${PLACE})[^。]{0,24}[0-9０-９.]+\\s*[%％]|[0-9０-９.]+\\s*[%％][^。]{0,24}(?:${PLACE})`,
);

test("FAQ が販売所名と手数料率をセットで断定していない", () => {
  for (const f of FAQ) {
    const hit = `${f.q}${f.a}`.match(FEE_NEAR_PLACE);
    assert.equal(hit, null, `販売所名の近くに手数料率が書かれている: ${hit?.[0]}（${f.q}）`);
  }
});

// JSON-LD は <script> の中身として書き出される。"<" が入ると要素が途中で閉じうる。
// lib/json-ld.mjs でエスケープしているが、そもそも本文に持ち込まないほうが安全。
test("FAQ の本文に < を含まない", () => {
  for (const f of FAQ) {
    assert.ok(!`${f.q}${f.a}`.includes("<"), `"<" が含まれる: ${f.q}`);
  }
});
