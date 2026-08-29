// 材料の「使う分だけ」計算と、その共有URL符号化の検証。
import test from "node:test";
import assert from "node:assert/strict";
import {
  UNIT_PRESETS,
  toAmount,
  makeLine,
  lineCost,
  totalMaterialCost,
  isLineComplete,
  encodeMaterials,
  decodeMaterials,
  restoreMaterials,
  isLineFilled,
  MAX_MATERIAL_LINES,
} from "../lib/materials.mjs";
import { encodeShareParams, decodeShareParams } from "../lib/share.mjs";

const line = (patch) => makeLine(1, patch);

test("toAmount は空欄・不正値・負値を 0 に潰す", () => {
  assert.equal(toAmount("800"), 800);
  assert.equal(toAmount(800), 800);
  assert.equal(toAmount("12.5"), 12.5);
  assert.equal(toAmount(""), 0);
  assert.equal(toAmount("  "), 0);
  assert.equal(toAmount("abc"), 0);
  assert.equal(toAmount("-5"), 0);
  assert.equal(toAmount(null), 0);
  assert.equal(toAmount(undefined), 0);
  assert.equal(toAmount(NaN), 0);
  assert.equal(toAmount(Infinity), 0);
});

test("買った値段 ÷ 買った量 × 使う量 を返す", () => {
  // 10m(=1000cm) ¥800 のリボンを 30cm 使う → ¥24
  assert.equal(lineCost(line({ price: "800", bought: "1000", used: "30" })), 24);
  // 50個 ¥480 のビーズを 6個 使う → ¥57.6（二進小数の誤差を許容差で見る）
  assert.ok(
    Math.abs(lineCost(line({ price: "480", bought: "50", used: "6" })) - 57.6) <
      1e-9,
  );
});

test("行ごとに丸めない（端数の切り上げが積み重ならない）", () => {
  // ¥0.4 の行が 10 本。行ごとに切り上げると ¥10 になってしまう。
  // 合計は二進小数の誤差を含む（0.4 の 10 回加算 = 3.9999999999999996）ので許容差で見る。
  // 表示は formatYen が、販売価格は pricing.mjs の切り上げが丸めるため実害は無い。
  const lines = Array.from({ length: 10 }, (_, i) =>
    makeLine(i, { price: "4", bought: "10", used: "1" }),
  );
  assert.ok(Math.abs(totalMaterialCost(lines) - 4) < 1e-9);
  assert.equal(Math.round(totalMaterialCost(lines)), 4);
});

test("買った量が 0・空欄なら 0（Infinity や NaN を値段へ流さない）", () => {
  const zero = lineCost(line({ price: "800", bought: "0", used: "30" }));
  assert.equal(zero, 0);
  assert.ok(Number.isFinite(zero));
  const blank = lineCost(line({ price: "800", bought: "", used: "30" }));
  assert.equal(blank, 0);
  assert.ok(Number.isFinite(blank));
});

test("値の欠けた行・壊れた入力でも有限数を返す", () => {
  assert.equal(lineCost(line({})), 0);
  assert.equal(lineCost(null), 0);
  assert.equal(lineCost(undefined), 0);
  assert.equal(totalMaterialCost(null), 0);
  assert.equal(totalMaterialCost([]), 0);
  assert.equal(totalMaterialCost([null, undefined]), 0);
});

test("使う量が買った量を超えてもよい（複数袋を使う作品）", () => {
  assert.equal(lineCost(line({ price: "100", bought: "10", used: "25" })), 250);
});

test("合計は各行の積み上げ", () => {
  const lines = [
    makeLine(1, { price: "800", bought: "1000", used: "30" }), // 24
    makeLine(2, { price: "480", bought: "50", used: "6" }), // 57.6
    makeLine(3, {}), // 未入力 = 0
  ];
  assert.ok(Math.abs(totalMaterialCost(lines) - 81.6) < 1e-9);
});

test("isLineComplete は費用の出る行だけ真", () => {
  assert.equal(isLineComplete(line({ price: "800", bought: "1000", used: "30" })), true);
  assert.equal(isLineComplete(line({ price: "800", bought: "1000", used: "" })), false);
  assert.equal(isLineComplete(line({})), false);
});

test("makeLine は既定値を持ち、patch で上書きできる", () => {
  const l = makeLine(7);
  assert.equal(l.id, "7");
  assert.equal(l.unit, "cm");
  assert.equal(l.name, "");
  assert.equal(makeLine(8, { unit: "g" }).unit, "g");
  assert.ok(UNIT_PRESETS.includes("cm"));
});

test("符号化 → 復号で値が保たれる", () => {
  const lines = [
    makeLine(1, { name: "リボン", unit: "cm", price: "800", bought: "1000", used: "30" }),
    makeLine(2, { name: "ビーズ", unit: "個", price: "480", bought: "50", used: "6" }),
  ];
  const back = decodeMaterials(encodeMaterials(lines));
  assert.equal(back.length, 2);
  assert.equal(back[0].name, "リボン");
  assert.equal(back[1].unit, "個");
  assert.equal(totalMaterialCost(back), totalMaterialCost(lines));
});

test("区切り文字・エスケープ文字を含む材料名でも行が割れない", () => {
  // 区切り("*" "_")とエスケープ("-")が名前に混ざっても、行や項目が割れてはいけない。
  for (const name of [
    "リボン~!&= 100%",
    "a*b",
    "c_d",
    "e-f",
    "g--h",
    "---",
    "*_-",
    "麻ひも（3-ply）",
    "e&f=g",
    "半角 スペース",
    "＃タグ",
  ]) {
    const enc = encodeMaterials([
      makeLine(1, { name, price: "100", bought: "10", used: "1" }),
    ]);
    const back = decodeMaterials(enc);
    assert.equal(back.length, 1, `行が割れた: ${name}`);
    assert.equal(back[0].name, name);
    assert.equal(lineCost(back[0]), 10);
  }
});

test("空の行だけ落とし、書きかけの行は共有で消さない", () => {
  // 共有＝このアプリ唯一の「保存」で、押すと replaceState でアドレスバーも書き換わる。
  // 費用の出る行だけ載せると、入力途中で共有した人の書きかけが取り返せなくなる。
  const enc = encodeMaterials([
    makeLine(1, { name: "リボン", price: "800", bought: "1000", used: "30" }),
    makeLine(2, {}), // 完全に空 = 落とす
    makeLine(3, { name: "書きかけ", price: "100" }), // 書きかけ = 残す
  ]);
  const back = decodeMaterials(enc);
  assert.equal(back.length, 2);
  assert.equal(back[1].name, "書きかけ");
  assert.equal(back[1].price, "100");
  assert.equal(encodeMaterials([]), "");
  assert.equal(encodeMaterials(null), "");
});

test("isLineFilled は何か書かれた行だけ真", () => {
  assert.equal(isLineFilled(makeLine(1, {})), false);
  assert.equal(isLineFilled(makeLine(1, { name: "  " })), false);
  assert.equal(isLineFilled(makeLine(1, { name: "リボン" })), true);
  assert.equal(isLineFilled(makeLine(1, { price: "100" })), true);
  assert.equal(isLineFilled(null), false);
});

test("切り詰められた共有URLは明細を採用せず mc へ退避する", () => {
  // メッセージアプリの折り返しや手作業のコピー漏れで ml の末尾が欠けると、
  // 行が減った分だけ材料費が下がるのに画面は「材料が揃った状態」に見える。
  // 同じURLに載っている mc と突き合わせて、合わなければ明細を使わない。
  const lines = [
    makeLine(1, { name: "リネン生地", unit: "cm", price: "1800", bought: "200", used: "45" }),
    makeLine(2, { name: "木製ボタン", unit: "個", price: "480", bought: "20", used: "3" }),
    makeLine(3, { name: "刺しゅう糸", unit: "m", price: "320", bought: "8", used: "1.5" }),
  ];
  const enc = encodeMaterials(lines);
  const mc = String(Math.round(totalMaterialCost(lines))); // 537

  const ok = restoreMaterials(enc, mc);
  assert.equal(ok.intact, true);
  assert.equal(ok.lines.length, 3);

  for (const cut of [12, 30, 55]) {
    const r = restoreMaterials(enc.slice(0, enc.length - cut), mc);
    assert.equal(r.intact, false, `末尾${cut}文字の欠落を検出できていない`);
  }
});

test("照合材料（mc）が無い共有URLは明細をそのまま信じる", () => {
  const enc = encodeMaterials([
    makeLine(1, { name: "リボン", price: "800", bought: "1000", used: "30" }),
  ]);
  assert.equal(restoreMaterials(enc, undefined).intact, true);
  assert.equal(restoreMaterials(enc, "").intact, true);
  assert.equal(restoreMaterials(enc, "abc").intact, true);
  // 行が1つも無ければ明細モードにしない
  assert.equal(restoreMaterials("", "500").intact, false);
  assert.equal(restoreMaterials("@@@@", "500").intact, false);
});

test("lineCost は極端な値でも有限を返す", () => {
  // type="number" は指数表記を受け付けるので共有URL以外からも到達しうる。
  const inf = lineCost(makeLine(1, { price: "1e308", bought: "1e-300", used: "1e308" }));
  assert.ok(Number.isFinite(inf), "Infinity が値段へ流れている");
  assert.equal(inf, 0);
  assert.ok(Number.isFinite(lineCost(makeLine(1, { price: "1", bought: "1e-320", used: "1" }))));
});

test("項目が増えた将来の共有URLでも既存の行を捨てない", () => {
  // 6項目目を足したとき、古いクライアントが全行を捨てて材料費0にならないようにする。
  const back = decodeMaterials("リボン*cm*800*1000*30*これから足す項目");
  assert.equal(back.length, 1);
  assert.equal(back[0].name, "リボン");
  assert.equal(lineCost(back[0]), 24);
  // 項目が足りない行は従来どおり捨てる
  assert.equal(decodeMaterials("リボン*cm*800").length, 0);
});

test("単位を空にした入力を cm へ戻さない", () => {
  const enc = encodeMaterials([
    makeLine(1, { name: "ひも", unit: "", price: "100", bought: "10", used: "1" }),
  ]);
  assert.equal(decodeMaterials(enc)[0].unit, "");
});

test("壊れた明細は黙って飛ばす（部分復元）", () => {
  assert.deepEqual(decodeMaterials(""), []);
  assert.deepEqual(decodeMaterials(null), []);
  assert.deepEqual(decodeMaterials("こわれている"), []);
  // 項目数が足りない行は捨て、揃っている行だけ返す
  const mixed = decodeMaterials("a*cm*800_x*cm*480*50*6");
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0].name, "x");
  // 未知のエスケープ列（"-z"）でも行ごと落とさない
  const broken = decodeMaterials("-z*cm*100*10*1");
  assert.equal(broken.length, 1);
  assert.equal(lineCost(broken[0]), 10);
});

test("共有文字列を二重に％符号化しない（URLが無駄に伸びない）", () => {
  // URLSearchParams が後段で必ず符号化するので、ここで encodeURIComponent すると
  // "%" が "%25" へ二重符号化され、日本語の材料名で URL が大きく膨らむ。
  const ml = encodeMaterials([
    makeLine(1, { name: "リネン生地", unit: "cm", price: "1800", bought: "200", used: "45" }),
  ]);
  assert.ok(!ml.includes("%"), `畳んだ文字列に％符号化が混ざっている: ${ml}`);
  assert.ok(ml.includes("リネン生地"), "名前は素のまま保持する");
  const query = encodeShareParams({ materials: ml, includeShipping: true });
  assert.ok(!query.includes("%25"), `URL が二重符号化されている: ${query}`);
  // 往復は保たれる
  assert.equal(decodeShareParams(query).materials, ml);
});

test("区切りに使う文字は URLSearchParams が素通しする", () => {
  // "~" や "!" を区切りに選ぶと %7E / %21 へ展開されて URL が伸びる。
  for (const sep of ["*", "_", "-"]) {
    const p = new URLSearchParams();
    p.set("k", sep);
    assert.equal(p.toString(), `k=${sep}`, `${sep} が符号化されている`);
  }
});

test("復元した行には重複しない id が振られる", () => {
  const back = decodeMaterials("a*cm*100*10*1_b*cm*200*10*1_c*cm*300*10*1");
  assert.equal(new Set(back.map((l) => l.id)).size, 3);
});

test("材料明細は共有パラメータに載り、往復する", () => {
  const ml = encodeMaterials([
    makeLine(1, { name: "リボン", price: "800", bought: "1000", used: "30" }),
  ]);
  const query = encodeShareParams({
    materialCost: "24",
    materials: ml,
    workMinutes: "60",
    includeShipping: true,
  });
  const back = decodeShareParams(query);
  assert.equal(back.materials, ml);
  assert.equal(totalMaterialCost(decodeMaterials(back.materials)), 24);
});

test("明細を持たない従来の共有URLはそのまま開ける", () => {
  const back = decodeShareParams("mc=500&wm=60&hw=1000&sh=300&mk=minne&inc=1");
  assert.equal(back.materialCost, "500");
  assert.equal(back.marketId, "minne");
  assert.equal(back.materials, undefined);
});

test("細工された巨大な共有URLでも復元する行数を打ち切る", () => {
  // 上限が無いと、URL に何千行も詰めて画面を固められる。
  const huge = Array.from({ length: MAX_MATERIAL_LINES + 50 }, () => "x*cm*100*10*1").join("_");
  const back = decodeMaterials(huge);
  assert.equal(back.length, MAX_MATERIAL_LINES);
  assert.ok(Number.isFinite(totalMaterialCost(back)));
});
