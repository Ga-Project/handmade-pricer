// ねだんの工房 — 材料の「買った量」から「使う分だけ」の材料費を出す純関数。
//
// 作り手は材料をまとめ買いする。10m ¥800 のリボンを 30cm 使う作品の材料費は ¥24 だが、
// これを電卓で出してから入力するのは面倒で、間違えれば値段ごと狂う。
// ここでは 1 行 =1 材料として「買った値段 / 買った量 × 使う量」を積み上げ、合計を材料費に渡す。
//
// pricing.mjs と同じく DOM から独立した純関数だけを置き、node:test で直接検証する。

/**
 * @typedef {Object} MaterialLine
 * @property {string} id     行の識別子（React の key 用・計算には使わない）
 * @property {string} name   材料名（「リボン」など・表示と共有URLのみ）
 * @property {string} unit   単位（cm・g・個 など。買った量と使う量で共通）
 * @property {string} price  買った値段（円・文字列のまま保持）
 * @property {string} bought 買った量（文字列）
 * @property {string} used   この作品で使う量（文字列）
 */

/** 単位の候補。自由入力も許すので、あくまで入力を楽にするための一覧。 */
export const UNIT_PRESETS = ["cm", "m", "g", "個", "枚", "ml"];

/** 文字列・数値を非負の有限数へ。空欄や不正値は 0（NaN を先へ流さない）。 */
export function toAmount(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

/** 連番から空の材料行を作る。 */
export function makeLine(id, patch = {}) {
  return {
    id: String(id),
    name: "",
    unit: "cm",
    price: "",
    bought: "",
    used: "",
    ...patch,
  };
}

/**
 * 1 行分の材料費 = 買った値段 ÷ 買った量 × 使う量。
 * 「買った量」が空・0 のときは割れないので 0 を返す（Infinity や NaN を値段へ流さない）。
 * 端数はここでは丸めない。行ごとに丸めると ¥0.4 の材料 10 行が ¥10 に化けるため、
 * 丸めるのは表示と最終的な販売価格（pricing.mjs の切り上げ）だけにする。
 * @param {MaterialLine} line
 * @returns {number}
 */
export function lineCost(line) {
  if (!line) return 0;
  const price = toAmount(line.price);
  const bought = toAmount(line.bought);
  const used = toAmount(line.used);
  if (bought <= 0) return 0;
  const cost = (price / bought) * used;
  // 極端な値（price=1e308 / bought=1e-300 など）では積が Infinity になりうる。
  // 下流（pricing.mjs の clampNonNegative）でも吸収されるが、
  // 「NaN や Infinity を値段へ流さない」という約束はこの関数自身で守る。
  return Number.isFinite(cost) ? cost : 0;
}

/**
 * 材料行の合計（＝材料費）。
 * @param {MaterialLine[]} lines
 * @returns {number}
 */
export function totalMaterialCost(lines) {
  if (!Array.isArray(lines)) return 0;
  return lines.reduce((sum, line) => sum + lineCost(line), 0);
}

/** その行が計算に効いているか（値段・量が揃って費用が出るか）。 */
export function isLineComplete(line) {
  return lineCost(line) > 0;
}

/**
 * その行に利用者が何か書いたか。
 * 共有＝このアプリで唯一の「保存」なので、書きかけの行も残す判断に使う
 * （費用が出る行だけ載せると、入力途中で共有を押した人の書きかけが黙って消える）。
 */
export function isLineFilled(line) {
  if (!line) return false;
  return (
    String(line.name ?? "").trim() !== "" ||
    toAmount(line.price) > 0 ||
    toAmount(line.bought) > 0 ||
    toAmount(line.used) > 0
  );
}

// ── 共有URL用の符号化 ──────────────────────────────────────────────
// 既存の共有パラメータ（share.mjs）は 1 キー 1 値の平坦な形なので、可変長の材料明細は
// 1 つのキーへ畳んで載せる。
//
// 区切りには URLSearchParams が素通しする文字だけを使う（"*" と "_"）。
// "~" や "!" は素通しされそうに見えて application/x-www-form-urlencoded では %7E / %21 へ
// 展開されるため、区切りに選ぶと URL が無駄に伸びる。
// 同じ理由で名前を encodeURIComponent しない —— URLSearchParams が後段で必ず符号化するので、
// ここで符号化すると "%" がさらに "%25" へ二重符号化され、日本語の材料名で URL が 1.6 倍に膨らむ。
// 名前について自前で面倒を見るのは「区切り文字と衝突しないこと」だけでよい。
const ROW_SEP = "_";
const FIELD_SEP = "*";
const ESC = "-";

// 復元する行数の上限。URL は数万文字まで持てるので、上限が無いと細工した共有URLで
// 何千行も描画させて画面を固められる。作品ひとつ分の材料としては十分に大きい値を置く。
export const MAX_MATERIAL_LINES = 200;

/** 区切り文字と衝突しないよう、その3文字だけを短い規則へ逃がす。 */
function escapeField(v) {
  let out = "";
  for (const ch of String(v ?? "")) {
    if (ch === ESC) out += ESC + ESC;
    else if (ch === FIELD_SEP) out += ESC + "a";
    else if (ch === ROW_SEP) out += ESC + "u";
    else out += ch;
  }
  return out;
}

/** escapeField の逆。未知のエスケープ列は元の2文字として読み、行ごと捨てない。 */
function unescapeField(v) {
  const src = String(v ?? "");
  let out = "";
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== ESC) {
      out += src[i];
      continue;
    }
    const next = src[i + 1];
    if (next === ESC) out += ESC;
    else if (next === "a") out += FIELD_SEP;
    else if (next === "u") out += ROW_SEP;
    else {
      out += ESC;
      continue; // 未知の並びは "-" をそのまま残し、次の文字は普通に読む
    }
    i++;
  }
  return out;
}

/**
 * 材料行を 1 本の文字列へ畳む。費用の出ない行（未入力・書きかけ）は載せない。
 * @param {MaterialLine[]} lines
 * @returns {string} 空なら ""（share.mjs 側でキーごと省かれる）
 */
export function encodeMaterials(lines) {
  if (!Array.isArray(lines)) return "";
  return lines
    .filter(isLineFilled)
    .map((l) =>
      [
        escapeField(l.name),
        escapeField(l.unit),
        toAmount(l.price),
        toAmount(l.bought),
        toAmount(l.used),
      ].join(FIELD_SEP),
    )
    .join(ROW_SEP);
}

/**
 * 共有URLの文字列から材料行へ戻す。壊れた行は黙って飛ばす
 * （share.mjs の「壊れた URL でも安全に部分復元する」方針に合わせる）。
 * @param {string} raw
 * @returns {MaterialLine[]}
 */
export function decodeMaterials(raw) {
  if (typeof raw !== "string" || raw === "") return [];
  const out = [];
  for (const row of raw.split(ROW_SEP)) {
    if (out.length >= MAX_MATERIAL_LINES) break;
    if (row === "") continue;
    const parts = row.split(FIELD_SEP);
    // 将来 6 項目目を足したとき、古いクライアントが全行を捨てないよう
    // 「足りない行だけ捨て、余った項目は無視」にしておく。
    if (parts.length < 5) continue;
    const [name, unit, price, bought, used] = parts;
    const line = makeLine(out.length + 1, {
      name: unescapeField(name),
      // 単位を意図的に空にした入力を "cm" へ戻さない。
      unit: unescapeField(unit),
      price: String(toAmount(price) || ""),
      bought: String(toAmount(bought) || ""),
      used: String(toAmount(used) || ""),
    });
    // 何も書かれていない行だけ落とす（書きかけは共有先でも残す）。
    if (isLineFilled(line)) out.push(line);
  }
  return out;
}

/**
 * 共有URLからの明細復元。**同じURLに載っている材料費合計（mc）と突き合わせる。**
 *
 * 明細は可変長なので、URL が途中で切り詰められる（メッセージアプリの折り返し、
 * 手作業のコピー漏れ）と一部の行だけが生き残る。行が減った分そのまま材料費が下がるが、
 * 画面は「材料が揃った完全な状態」に見えるため、利用者は安いほうの値段を正しいものとして
 * 受け取ってしまう。スカラー項目と違い、欠けても既定値へ退避しないのが配列の危ないところ。
 *
 * 共有時に必ず mc（丸めた合計）も書いているので、それを照合材料に使う。
 * 合わなければ明細を採用せず、まとめて入力（mc の値）へ退避する。
 *
 * @param {string} raw 共有URLの ml
 * @param {string|number|undefined} declaredTotal 共有URLの mc
 * @returns {{ lines: MaterialLine[], intact: boolean }} intact=false なら明細を使わない
 */
export function restoreMaterials(raw, declaredTotal) {
  const lines = decodeMaterials(raw);
  if (lines.length === 0) return { lines: [], intact: false };
  // 照合材料が無い（mc 無し・空・数値でない）ときは明細をそのまま信じる。
  // Number("") は NaN ではなく 0 を返すので、空文字を「合計0の申告」と取り違えないよう
  // 数値へ変換する前に空かどうかを見る。
  const rawDeclared =
    typeof declaredTotal === "number" ? declaredTotal : String(declaredTotal ?? "").trim();
  if (rawDeclared === "") return { lines, intact: true };
  const declared = Number(rawDeclared);
  if (!Number.isFinite(declared)) return { lines, intact: true };
  return {
    lines,
    intact: Math.round(totalMaterialCost(lines)) === Math.round(declared),
  };
}
