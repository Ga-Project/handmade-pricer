/**
 * 単一選択の群（radiogroup）のキー操作と roving tabindex を決める純関数。
 *
 * 排他選択を aria-pressed のトグルで名乗ると、支援技術には「押した状態」と伝わる
 * のに、もう一度押しても解除されない（同じ値が入り直すだけ）。排他選択は radio が
 * 正しい役で、radio ならタブ位置が群ぜんぶで1つになる（roving tabindex）。
 *
 * ── 選択はフォーカスに追随させない（重要な設計判断） ──
 * WAI-ARIA APG の radiogroup の既定は「矢印で移ると同時に選ばれる」だが、
 * APG は**選ぶこと自体に副作用がある場合**に限り、矢印はフォーカスだけ動かし
 * 確定を Space / Enter に委ねる方式を明示的に認めている。この製品はそれに当たる:
 *
 *   - 単位は一覧に無いものを自由入力できる（「束」など）。その状態ではどのチップも
 *     選ばれていないので先頭チップがタブを受けるが、そこで矢印を押すと
 *     「束」が「m」に置き換わる。ArrowDown はページスクロールも奪うので、
 *     **スクロールのつもりの ArrowDown が入力を消す**経路になる。
 *   - 行は永続化されないので、消えた文字列は戻せない。
 *   - しかもその「束」は、群自身が「ほかの単位は上の欄に直接書けます」と案内して
 *     入力させた値である。案内した入力を案内した群が消すことになる。
 *
 * よってこのモジュールは**移動先だけ**を返す。選択は呼び出し側が Space / Enter
 * （button の既定動作 → onClick）で行う。
 *
 * ここを純関数に切り出しているのは、この製品のテストが lib/*.mjs しか import して
 * いないため。React に触れる部分（focus() の呼び出し）を最小にして、
 * 「どのキーでどこへ動くか」「どれが Tab で止まるか」は CI で回る側に置く。
 */

/** 群の中を移動するキー。これ以外は群が横取りしない（Tab・Space・文字入力は素通し）。 */
const NEXT_KEYS = ["ArrowRight", "ArrowDown"];
const PREV_KEYS = ["ArrowLeft", "ArrowUp"];

/**
 * キー入力から**フォーカスの**移動先を返す。移動しないキーなら null。
 * 選択は動かさない（モジュール冒頭の設計判断を参照）。
 *
 * 端では巻き戻す（APG の radiogroup に従う）。巻き戻さないと、端のチップで
 * 矢印を押しても何も起きず「壊れている」ように見える。
 *
 * @param {string} key KeyboardEvent.key
 * @param {number} current いま focus のある番号
 * @param {number} count 群の要素数
 * @param {{alt?: boolean, ctrl?: boolean, meta?: boolean, shift?: boolean}} [mods] 修飾キー
 * @returns {number|null}
 */
export function nextIndex(key, current, count, mods) {
  // 修飾キー付きはブラウザ/OS の割り当て（Alt+← や Cmd+← の「戻る」、
  // Ctrl+↑ のスクロール等）なので群が奪ってはいけない。奪うと preventDefault で
  // 「戻る」が効かなくなる。
  if (mods && (mods.alt || mods.ctrl || mods.meta || mods.shift)) return null;
  if (!Number.isInteger(count) || count <= 0) return null;
  if (!Number.isInteger(current) || current < 0 || current >= count) return null;
  if (NEXT_KEYS.includes(key)) return (current + 1) % count;
  if (PREV_KEYS.includes(key)) return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/**
 * 群のうち Tab で止まる1つを返す（roving tabindex）。
 *
 * 選ばれているものがあればそれ。無ければ先頭。
 * 「無ければどれも止まらない」にすると、キーボードだけの利用者が群に入れなくなる。
 *
 * 単位は自由入力でも書けるので、一覧に無い単位（例「束」）が入っている状態＝
 * どのチップも選ばれていない、は正常に起こる。その時も先頭で受ける。
 *
 * @param {string[]} options 選択肢
 * @param {string} selected いま選ばれている値（空文字・一覧外もありうる）
 * @returns {number} 0 以上 options.length 未満
 */
export function tabbableIndex(options, selected) {
  if (!Array.isArray(options) || options.length === 0) return 0;
  const i = options.indexOf(selected);
  return i >= 0 ? i : 0;
}

/**
 * その番号が Tab で止まるか。JSX 側で tabIndex に渡す値をそのまま返す。
 * @returns {0|-1}
 */
export function rovingTabIndex(options, selected, index) {
  return tabbableIndex(options, selected) === index ? 0 : -1;
}
