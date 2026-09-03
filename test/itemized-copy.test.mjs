// 「材料ごと」入力の文言についての不変量。
//
// この UI は itemized の既定が false なので書き出した out/index.html に現れず、
// guards.test.mjs の可視テキスト検査は届かない。文言をモジュールに出したことで、
// レンダリングされるかどうかと関係なく中身を直接検査できる。
//
// 一覧は構造から導出する（手書きの一覧を持たない）。以前は「手書きの一覧を
// もう一方の手書きの一覧と突き合わせる」形だったため、守れるのは文言を"外す"方向だけで、
// 実務で起きる"足す"方向は素通りしていた（禁止語を含む文言を新設しても全件緑だった）。

import { test } from "node:test";
import assert from "node:assert/strict";

import * as COPY from "../lib/itemized-copy.mjs";
import {
  LEAD,
  EMPTY_NOTICE,
  ROW,
  UNDO,
  FOOT,
  UNIT_PICKER,
  ROW_LABELS,
  COPY_OBJECTS,
  COPY_TEMPLATES,
  ROW_LABEL_TEMPLATES,
} from "../lib/itemized-copy.mjs";
import { UNIT_PRESETS } from "../lib/materials.mjs";
import {
  collectStrings,
  collectFunctions,
  findForbidden,
} from "../lib/copy-rules.mjs";

/** 画面に出る静的な文言（構造から導出）。 */
// ROW_LABELS も対象に含める。関数だけのつもりでも文字列フィールドを足されうるので、
// 「関数だから collectStrings では拾えない」を前提にしない。
const STATIC_STRINGS = [
  ...collectStrings(COPY_OBJECTS),
  ...collectStrings(ROW_LABELS),
];

/** 関数で組み立てる文言を、登録された呼び出し例で実体化したもの。 */
const TEMPLATED_STRINGS = [
  ...collectFunctions(COPY_OBJECTS).flatMap(({ path, fn }) =>
    (COPY_TEMPLATES[path] ?? []).map((args) => fn(...args)),
  ),
  ...Object.entries(ROW_LABELS).flatMap(([key, fn]) =>
    (ROW_LABEL_TEMPLATES[key] ?? []).map((args) => fn(...args)),
  ),
];

test("材料ごと入力の文言に断定的・助言的な禁止表現が含まれない", () => {
  for (const s of [...STATIC_STRINGS, ...TEMPLATED_STRINGS]) {
    const hits = findForbidden(s);
    assert.deepEqual(hits, [], `禁止表現 ${hits.join("・")} が含まれる: ${s}`);
  }
});

test("文言はどれも空でない", () => {
  for (const s of [...STATIC_STRINGS, ...TEMPLATED_STRINGS]) {
    assert.ok(String(s).trim().length > 0, "空の文言がある");
  }
});

// --- 一覧の導出が本当に構造から来ていること -------------------------------
// 「検査があるのに何も見ていない」状態へ戻らないための番人。

test("文字列は定数から構造的に集めている（手書き一覧に依存しない）", () => {
  // 代表を数点、明示的に含まれることで導出経路が生きていることを確認する。
  for (const s of [
    LEAD.example,
    EMPTY_NOTICE.title,
    EMPTY_NOTICE.back,
    ROW.overUseWarn,
    UNDO.action,
    FOOT.total,
    UNIT_PICKER.label,
  ]) {
    assert.ok(STATIC_STRINGS.includes(s), `導出から漏れている: ${s}`);
  }
  // 入れ子（LEAD.unitNote）まで潜っていること。
  assert.ok(STATIC_STRINGS.includes(LEAD.unitNote.tail));
});

test("関数で作る文言はすべて呼び出し例を持つ（足して忘れたら落ちる）", () => {
  for (const { path } of collectFunctions(COPY_OBJECTS)) {
    const samples = COPY_TEMPLATES[path];
    assert.ok(
      Array.isArray(samples) && samples.length > 0,
      `COPY_TEMPLATES に呼び出し例が無い: ${path}`,
    );
  }
  for (const key of Object.keys(ROW_LABELS)) {
    const samples = ROW_LABEL_TEMPLATES[key];
    assert.ok(
      Array.isArray(samples) && samples.length > 0,
      `ROW_LABEL_TEMPLATES に呼び出し例が無い: ${key}`,
    );
  }
});

// --- 単位チップ ------------------------------------------------------------

test("単位チップの読み上げ名に単位そのものが入る", () => {
  for (const u of UNIT_PRESETS) {
    const label = UNIT_PICKER.optionLabel(2, u);
    assert.ok(label.includes(u), `単位 ${u} が読み上げ名に入っていない: ${label}`);
    assert.ok(label.includes("2"), `材料の番号が読み上げ名に入っていない: ${label}`);
  }
});

test("単位チップの群名は材料ごとに区別できる", () => {
  assert.notEqual(UNIT_PICKER.groupLabel(1), UNIT_PICKER.groupLabel(2));
});

// --- 空状態の案内 ----------------------------------------------------------

test("材料費 ¥0 の案内は、下がった理由と戻し方の両方を含む", () => {
  assert.match(EMPTY_NOTICE.title, /材料費/);
  assert.match(EMPTY_NOTICE.body, /行/);
  assert.match(EMPTY_NOTICE.back, /まとめて/);
});

test("案内は利用者の入力履歴を主張しない", () => {
  // 初回利用者は「まとめて」に一度も入力していない（初期値が入っているだけ）し、
  // 共有URLの受け手は明細だけを受け取っていることがある。
  // 「さきほど入れた合計に戻る」はその2者にとって嘘になる。
  const text = Object.values(EMPTY_NOTICE).join("");
  for (const w of ["さきほど", "先ほど", "入れていた合計", "元の合計"]) {
    assert.ok(!text.includes(w), `履歴を主張する表現「${w}」が含まれる`);
  }
});

test("案内は行の存在を前提にしない", () => {
  // 行はすべて消せる（removeLine に下限が無い）ので、
  // 「下の行に」と書くと行が1つも無い画面と矛盾する。
  const text = Object.values(EMPTY_NOTICE).join("");
  for (const w of ["下の行", "上の行"]) {
    assert.ok(!text.includes(w), `行の存在を前提にする表現「${w}」が含まれる`);
  }
});

// --- 唯一残る手書き一覧（COPY_OBJECTS）に登録漏れが無いこと -----------------
// 文字列は COPY_OBJECTS から構造的に導出するので、フィールドを足す分には安全。
// ただし COPY_OBJECTS そのものは手書きの登録リストで、
// 「新しい定数を export して page.tsx で使い、登録を忘れる」経路だけが残る。
// この増分自身が ROW / UNDO / FOOT という新定数を3つ足しているので、
// 起きやすさは実証済み。モジュール全体を走査して閉じる。

test("文言を持つ export はすべて検査対象に登録されている", () => {
  // 一覧そのものとテンプレート定義は、登録対象ではなく仕組みの側。
  const META = new Set([
    "COPY_OBJECTS",
    "COPY_TEMPLATES",
    "ROW_LABEL_TEMPLATES",
  ]);
  // 登録済みとみなす実体（参照で比較する）。
  const registered = new Set([...Object.values(COPY_OBJECTS), ROW_LABELS]);

  const unregistered = [];
  for (const [name, value] of Object.entries(COPY)) {
    if (META.has(name)) continue;
    // 文字列も関数も持たない export（数値・真偽値など）は検査の対象外。
    const hasCopy =
      collectStrings(value).length > 0 || collectFunctions(value).length > 0;
    if (!hasCopy) continue;
    if (!registered.has(value)) unregistered.push(name);
  }
  assert.deepEqual(
    unregistered.sort(),
    [],
    "COPY_OBJECTS（または ROW_LABELS）に登録されていない文言 export があります",
  );
});
