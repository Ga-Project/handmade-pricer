// 「材料ごと」入力で画面に出す文言の単一ソース。
//
// なぜ別モジュールに出すか:
// この UI は `itemized` の既定が false なので、書き出した out/index.html には
// 一度も現れない。つまり test/guards.test.mjs の「可視テキストを見る」検査は
// この分岐に永久に届かず、ここに足した文言は誰の検査も通らないまま公開される
// （2026-08-30 の増分で実際にそうなっていた）。
// FAQ と同じく「文言を配列/定数で持ち、画面とテストの両方がそれを import する」形にすれば、
// レンダリングされるかどうかと関係なく中身を検査できる。
//
// 文言の制約は lib/faq.mjs と同じ:
//   - 税務・会計の助言をしない。
//   - 収益や結果を保証しない。
//   - 各販売所の手数料率を本文で断定しない。
// test/itemized-copy.test.mjs が faq.test.mjs と同じ禁止語で機械的に落とす。

/** 材料ごと入力の導入文。 */
export const LEAD = {
  head: "まとめ買いした材料から、この作品で",
  emphasis: "使う分だけ",
  tail: "を出します。",
  example: "例: ¥800 で 1000cm 買ったリボンを 30cm 使う → ¥24",
  unitNote: {
    head: "買った量と使う量は",
    emphasis: "同じ単位",
    tail: "でそろえてください（単位の換算はしません）。",
  },
};

/**
 * 材料費がまだ ¥0 のときに出す案内。
 *
 * 「まとめて」から切り替えた直後は行が空なので材料費が ¥0 になり、
 * 売値と手取りが黙って下がる。画面上は何も壊れていないように見えるため、
 * 何が起きたのかと、戻せることをここで伝える。
 * （まとめて入力の値は別に保持しているので、切り替えて戻せば元の合計に戻る）
 */
export const EMPTY_NOTICE = {
  title: "いまは材料費 ¥0 で計算しています",
  body: "下の行に「買った値段・買った量・使う量」を入れると、その分だけが材料費に足されて売値が計算し直されます。",
  back: "「まとめて」に戻すと、さきほど入れていた材料費の合計で計算します。",
};

/** 単位の早押しチップまわりの文言。 */
export const UNIT_PICKER = {
  /** チップ群の読み上げ名。材料名を差し込む。 */
  groupLabel: (index) => `材料 ${index} の単位をえらぶ`,
  /** チップ1つの読み上げ名。 */
  optionLabel: (index, unit) => `材料 ${index} の単位を ${unit} にする`,
};

/** 検査対象にする文字列を平らに集める（テストと将来の文言追加のため）。 */
export const ITEMIZED_COPY_STRINGS = [
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
  UNIT_PICKER.groupLabel(1),
  UNIT_PICKER.optionLabel(1, "cm"),
];
