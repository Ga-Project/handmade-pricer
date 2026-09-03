// 「材料ごと」入力の文言についての不変量。
//
// この UI は itemized の既定が false なので書き出した out/index.html に現れず、
// guards.test.mjs の可視テキスト検査は届かない。文言をモジュールに出したことで、
// レンダリングされるかどうかと関係なく中身を直接検査できる。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LEAD,
  EMPTY_NOTICE,
  UNIT_PICKER,
  ITEMIZED_COPY_STRINGS,
} from "../lib/itemized-copy.mjs";
import { UNIT_PRESETS } from "../lib/materials.mjs";
import { FORBIDDEN, DISCLAIMER } from "./faq.test.mjs";

test("材料ごと入力の文言に断定的・助言的な禁止表現が含まれない", () => {
  for (const s of ITEMIZED_COPY_STRINGS) {
    const text = String(s).replace(DISCLAIMER, "");
    for (const word of FORBIDDEN) {
      assert.ok(!text.includes(word), `禁止表現「${word}」が含まれる: ${s}`);
    }
  }
});

test("検査対象の一覧が実際の文言をすべて拾っている", () => {
  // 文言を足したのに ITEMIZED_COPY_STRINGS へ入れ忘れると、
  // 「検査があるのに何も見ていない」状態に戻る。定数側から数えて突き合わせる。
  const fromConstants = [
    LEAD.head,
    LEAD.emphasis,
    LEAD.tail,
    LEAD.example,
    LEAD.unitNote.head,
    LEAD.unitNote.emphasis,
    LEAD.unitNote.tail,
    EMPTY_NOTICE.title,
    EMPTY_NOTICE.body,
    EMPTY_NOTICE.back,
  ];
  for (const s of fromConstants) {
    assert.ok(
      ITEMIZED_COPY_STRINGS.includes(s),
      `ITEMIZED_COPY_STRINGS に入っていない文言がある: ${s}`,
    );
  }
});

test("文言はどれも空でない", () => {
  for (const s of ITEMIZED_COPY_STRINGS) {
    assert.ok(String(s).trim().length > 0, "空の文言がある");
  }
});

// --- 単位チップ ------------------------------------------------------------
// チップは「候補があることに気づけない」を直すためのものなので、
// 候補の一覧（materials.mjs の UNIT_PRESETS）と読み上げ名が食い違わないことを見る。

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
  // 「なぜ売値が下がったか」だけ書いて「戻せる」を書かないと、
  // 切り替えたことを後悔した人が元の金額を取り戻す道を見失う。
  assert.match(EMPTY_NOTICE.title, /材料費/);
  assert.match(EMPTY_NOTICE.body, /買った値段|買った量|使う量/);
  assert.match(EMPTY_NOTICE.back, /まとめて/);
});
