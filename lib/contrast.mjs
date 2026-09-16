/**
 * 操作できる部品の輪郭のコントラスト（WCAG 2.1 SC 1.4.11 / 3:1）を測る。
 *
 * 面を持たない・親と同色の部品では、枠線が「押せる区画」を示す唯一の視覚情報に
 * なる。トークンを1段淡くするだけで静かに 3:1 を割るが、型でも lint でもテストでも
 * 落ちない（値は正しく、見分けられないだけなので）。
 *
 * 判定の中身（何を対象にするか・しきい値・測り方）をここに置いているのは、
 * これを実行する `acceptance.e2e.mjs` が `.gitignore` 済みで、このリポジトリに
 * 含まれないため。向こうに書くとレビューにも履歴にも残らず、作業用の複製を
 * 片付けた時点で消えてしまう。実行の配線だけを向こうに置き、中身はここに置く。
 *
 * ⚠️ 測れるのは getComputedStyle が返す「CSS が解決した色」で、画面に実際に塗られた
 * ピクセルではない。背景画像・グラデーション・上に重なる半透明の層で見た目が変わっても
 * ここでは気づけない（実例: dark の body に light 用の暖色ウォッシュが乗り続け、
 * ヘッダーが洗われていた不具合はこの検査を素通りした）。合成後の見た目は
 * デザインパスのスクリーンショットで人が見る領域として残す。
 */

/** SC 1.4.11 が非テキストに要求する比。 */
export const MIN_RATIO = 3;

/**
 * 「操作できる部品」＝枠線に 3:1 が要る側。
 *
 * 飾り罫（.panel / .matbox / .matrow / .matempty / .custombox / .stack / .minitag /
 * 縫い目・点線罫）はここに入れない。この製品の世界観は控えめな紙面と縫い目なので、
 * 対象外まで濃くすると数値を満たすために意匠を壊すことになる。
 */
export const CONTROL_SELECTORS = [
  ".input-affix",
  "select.plain",
  ".seg",
  ".switch .track",
  ".btn-ghost",
  ".matname",
  ".matdel",
  ".matunit",
  ".matunit-chip",
  ".matundo-btn",
];

/**
 * ページの中で走らせる測定本体。puppeteer の page.evaluate に**関数として**渡すので、
 * 外側の変数を掴まない自己完結した形で書くこと（掴むと直列化された時点で壊れる）。
 *
 * 同じ部品でも載っている面が違えば比も違う（.btn-ghost はヘッダーの紙地にも
 * パネルの上にも出る）。先頭の1つだけ見ると別の面にある同じ部品を見逃すので、
 * 全部測って一番不利なものを代表にする。
 *
 * @param {string[]} selectors
 * @returns {{sel: string, ratio?: number|null, count?: number, noBorder?: number, missing?: true}[]}
 */
export function measureControlOutlines(selectors) {
  const srgb = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const lum = (r) => 0.2126 * srgb(r[0]) + 0.7152 * srgb(r[1]) + 0.0722 * srgb(r[2]);
  const parse = (v) => {
    const m = String(v).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  // 半透明の枠線は背景と合成してから測る（見えている色で判定する）。
  const over = (f, b) =>
    f[3] >= 1 ? f.slice(0, 3) : [0, 1, 2].map((i) => Math.round(f[i] * f[3] + b[i] * (1 - f[3])));
  const ratio = (a, b) => {
    const s = [lum(a), lum(b)].sort((x, y) => y - x);
    return (s[0] + 0.05) / (s[1] + 0.05);
  };
  const bgOf = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0) return c.slice(0, 3);
    }
    const c = parse(getComputedStyle(document.body).backgroundColor);
    return c ? c.slice(0, 3) : [255, 255, 255];
  };

  return selectors.map((sel) => {
    let els = Array.from(document.querySelectorAll(sel));
    // 選ばれている側は地色が付くので、枠線だけが頼りの未選択側で測る。
    // 「まとめて / 材料ごと」は個々のボタンが border: 0 で、輪郭は容器の .seg が
    // 持つ。だから対象は .seg であって .seg-btn ではない（.seg-btn を足すと
    // 「枠線が無い」で落ちる）。ここで除外が要るのはチップだけ。
    if (sel === ".matunit-chip") {
      els = els.filter((e) => e.getAttribute("aria-checked") !== "true");
    }
    if (els.length === 0) return { sel, missing: true };
    let worst = null;
    let noBorder = 0;
    for (const el of els) {
      const cs = getComputedStyle(el);
      const side = ["Top", "Right", "Bottom", "Left"].find(
        (x) => parseFloat(cs["border" + x + "Width"]) > 0,
      );
      if (!side) {
        noBorder++;
        continue;
      }
      const bg = bgOf(el.parentElement || el);
      const v = Math.round(ratio(over(parse(cs["border" + side + "Color"]), bg), bg) * 100) / 100;
      if (worst === null || v < worst) worst = v;
    }
    return { sel, ratio: worst, count: els.length, noBorder };
  });
}

/**
 * 測定結果から不合格の説明を組み立てる。空配列なら合格。
 * 「見つからない」を合格にしない（検査が素通りしている状態を黙って通さない）。
 *
 * @param {ReturnType<typeof measureControlOutlines>} rows
 * @returns {string[]}
 */
export function describeFailures(rows) {
  const bad = [];
  for (const r of rows) {
    if (r.missing) bad.push(`${r.sel} が見つからない（検査が素通りしている）`);
    else if (r.ratio === null) bad.push(`${r.sel} に枠線が無い（輪郭の担保が消えた）`);
    else if (r.noBorder > 0) bad.push(`${r.sel} の ${r.noBorder}/${r.count} 個に枠線が無い`);
    else if (r.ratio < MIN_RATIO) bad.push(`${r.sel} の枠線 ${r.ratio}:1 < ${MIN_RATIO}:1`);
  }
  return bad;
}
