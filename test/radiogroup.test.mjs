// 単位の早押しチップを radiogroup として動かすための不変量。
//
// 直したのは「切れないトグル」だった。aria-pressed は押し直せば解除できる約束だが、
// 選ばれているチップを押しても同じ単位が入り直すだけで解除されない。排他選択は radio が
// 正しい役で、radio にすると群ぜんぶで Tab 位置が1つになる（roving tabindex）。
//
// ここで守るのは3つ:
//  1. 移動先が必ず範囲内であること（呼び出し側は返り値でフォーカス先の要素を引くので、
//     範囲外を返すと focus が当たらないまま preventDefault だけが効く）
//  2. 群を横取りしすぎないこと（Tab や文字キーまで奪うと群から出られなくなる）
//  3. 一覧に無い単位（自由入力の「束」など）でも必ずどこかで Tab を受けること

import { test } from "node:test";
import assert from "node:assert/strict";

import { nextIndex, rovingTabIndex, tabbableIndex } from "../lib/radiogroup.mjs";
import { UNIT_PRESETS } from "../lib/materials.mjs";

const N = UNIT_PRESETS.length;
const MOVE_KEYS = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];

test("矢印は隣へ動き、端では巻き戻す", () => {
  assert.equal(nextIndex("ArrowRight", 0, N), 1);
  assert.equal(nextIndex("ArrowDown", 0, N), 1);
  assert.equal(nextIndex("ArrowLeft", 1, N), 0);
  assert.equal(nextIndex("ArrowUp", 1, N), 0);
  // 端で止まると「壊れている」ように見えるので巻き戻す（APG の radiogroup）。
  assert.equal(nextIndex("ArrowRight", N - 1, N), 0);
  assert.equal(nextIndex("ArrowLeft", 0, N), N - 1);
});

test("Home / End は両端へ飛ぶ", () => {
  assert.equal(nextIndex("Home", 3, N), 0);
  assert.equal(nextIndex("End", 0, N), N - 1);
});

test("移動先はどのキー・どの位置からでも必ず範囲内", () => {
  // 呼び出し側は返り値で兄弟 radio を引いて focus を当てる。範囲外だと
  // focus が当たらないまま preventDefault だけ効き、矢印が無反応に見える。
  for (const key of MOVE_KEYS) {
    for (let i = 0; i < N; i++) {
      const to = nextIndex(key, i, N);
      assert.equal(typeof to, "number", `${key} from ${i}`);
      assert.ok(Number.isInteger(to) && to >= 0 && to < N, `${key} from ${i} -> ${to}`);
      assert.equal(typeof UNIT_PRESETS[to], "string", `${key} from ${i} は実在の単位を指す`);
    }
  }
});

test("群が横取りしないキーは null（Tab で群から出られる・Space/Enter は確定に使う）", () => {
  // 矢印は focus だけ動かす設計なので、確定の Space / Enter を奪ってはいけない。
  // 奪うと、一覧外の単位を入れた状態からチップを選ぶ手段が無くなる。
  for (const key of ["Tab", "Enter", " ", "a", "Escape", "PageDown", "ArrowRightX"]) {
    assert.equal(nextIndex(key, 0, N), null, key);
  }
});

test("修飾キー付きの矢印は群が奪わない（ブラウザの「戻る」を壊さない）", () => {
  // Alt+← / Cmd+← は「戻る」、Ctrl+↑ 等も OS/ブラウザの割り当て。
  // ここで移動先を返すと呼び出し側が preventDefault し、戻れなくなる。
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]) {
    for (const mod of ["alt", "ctrl", "meta", "shift"]) {
      assert.equal(nextIndex(key, 1, N, { [mod]: true }), null, `${mod}+${key}`);
    }
  }
  // 修飾なし（全 false）は通常どおり動く
  assert.equal(
    nextIndex("ArrowRight", 0, N, { alt: false, ctrl: false, meta: false, shift: false }),
    1,
  );
  // mods 省略も従来どおり動く（呼び出し側が渡さなくても壊れない）
  assert.equal(nextIndex("ArrowRight", 0, N), 1);
});

test("壊れた入力では動かさない（例外にせず null）", () => {
  assert.equal(nextIndex("ArrowRight", 0, 0), null);
  assert.equal(nextIndex("ArrowRight", -1, N), null);
  assert.equal(nextIndex("ArrowRight", N, N), null);
  assert.equal(nextIndex("ArrowRight", 1.5, N), null);
});

test("Tab で止まるのは選ばれている1つだけ", () => {
  for (let i = 0; i < N; i++) {
    const selected = UNIT_PRESETS[i];
    assert.equal(tabbableIndex(UNIT_PRESETS, selected), i);
    const stops = UNIT_PRESETS.map((_, j) => rovingTabIndex(UNIT_PRESETS, selected, j));
    assert.equal(
      stops.filter((t) => t === 0).length,
      1,
      `「${selected}」選択時に Tab で止まる位置は1つ`
    );
    assert.equal(stops[i], 0);
  }
});

test("一覧に無い単位でも先頭が Tab を受ける（キーボードで群に入れる）", () => {
  // 単位は自由入力でも書ける。「束」のような一覧外や空欄は正常に起こる状態で、
  // ここで「どれも止まらない」にするとキーボードだけの利用者が群へ到達できない。
  for (const selected of ["", "束", "ダース", undefined]) {
    assert.equal(tabbableIndex(UNIT_PRESETS, selected), 0, JSON.stringify(selected));
    const stops = UNIT_PRESETS.map((_, j) => rovingTabIndex(UNIT_PRESETS, selected, j));
    assert.equal(stops.filter((t) => t === 0).length, 1);
    assert.equal(stops[0], 0);
  }
});

test("選択肢が空でも例外にしない", () => {
  assert.equal(tabbableIndex([], "cm"), 0);
  assert.equal(tabbableIndex(null, "cm"), 0);
});
