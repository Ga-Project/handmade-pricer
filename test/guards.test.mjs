// 静かに壊れる種類の失敗を、書き出した out/ で捕まえる。
//
// ソースを grep する検査では、書き方（クォート・エイリアス・動的 import・中間モジュール経由）を
// 変えるだけで素通りしてしまう。ここでは実際に配信されるファイルを見るので、
// 書き方に関係なく結果だけで判定できる。
//
// **先に `pnpm build` を実行しておくこと。** out/ が無ければこのファイルは失敗する
// （「ビルドしていないから緑」になると、検査が存在しないのと同じになるため）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { FAQ } from "../lib/faq.mjs";
import { FORBIDDEN, DISCLAIMER, collectStrings } from "../lib/copy-rules.mjs";
import { COPY_OBJECTS } from "../lib/itemized-copy.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "out");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

function requireBuild() {
  assert.ok(
    existsSync(join(OUT, "index.html")),
    "out/index.html がありません。先に `pnpm build` を実行してください。",
  );
  // 存在だけを見ると、**古い out/ に対して緑になる**。実際に、ソースを直した直後に
  // ビルドし忘れたまま検査が通る窓が生まれ、その状態で判断しかけたことがある。
  // existsSync は新しい out/ と古い out/ を区別しないので、鮮度も見る。
  // CI は build → test の順なので、これはローカル実行を守るための検査。
  // ビルド結果を左右するものはすべて含める。app/ と lib/ だけを見ていると、
  // next.config.mjs（basePath 等）を直してビルドし忘れても緑になる。
  const configFiles = ["next.config.mjs", "package.json"]
    .map((f) => join(ROOT, f))
    .filter((f) => existsSync(f));
  const newestSource = [
    ...["app", "lib", "public"]
      .filter((d) => existsSync(join(ROOT, d)))
      .flatMap((d) => outFiles(/\.(tsx?|mjs|css|png|svg|ico|txt)$/, join(ROOT, d))),
    ...configFiles,
  ].reduce((max, f) => Math.max(max, statSync(f).mtimeMs), 0);
  const built = statSync(join(OUT, "index.html")).mtimeMs;
  assert.ok(
    built >= newestSource,
    `out/ がソースより古いです（ビルドし直してください）。out/index.html=${new Date(built).toISOString()} / 最新ソース=${new Date(newestSource).toISOString()}`,
  );
}

/** out/ 配下の該当拡張子のファイルを再帰的に集める。 */
function outFiles(re, dir = OUT) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) found.push(...outFiles(re, abs));
    else if (re.test(name)) found.push(abs);
  }
  return found;
}

/** React が出力したエスケープを戻す（比較用・最低限）。 */
function unescapeHtml(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** HTML から JSON-LD ブロックだけを取り出す。 */
function jsonLdBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) =>
    JSON.parse(m[1]),
  );
}

/**
 * markup の className から「1要素ぶんの class 名の集合」を取り出す。
 *
 * 扱う書き方は3つ。いずれも「1要素に付きうる class 名の集合」として同じに扱う
 * （機能的に同じものを片方だけ見ると、書き方を変えただけで検査が嘘の結果を出す。
 *  実際に、直値だけを見ていたため className={`btn btn-ghost matadd`} への
 *  書き換えで「.btn と併用していない」と真実と逆の主張をして落ちた）。
 *
 *   1. className="a b"
 *   2. className={`a b`}          … 補間を含まないテンプレートリテラル
 *   3. className={cond ? "a" : "b"} … バッククォートを含まない式の中のリテラル
 *
 * **補間を含むテンプレート（`hangtag${…}`）は対象外**。クラス名が実行時に決まり、
 * 静的には確定できない。`hangtag` は `${` の直後に接しているので、
 * 結果が `hangtag` なのか `hangtagX` なのかもソースからは分からない。
 * 断片を拾いにいくと誤検出になる（実際 `? "" : " empty"` から ":" を拾って誤爆した）。
 * 除外は `[^`$]*` が `$` を跨げないことによる構造的なもので、
 * 補間には必ず `${` が要るため、断片が漏れ出る経路は存在しない。
 * この射程を広げるには JSX を構文として読む必要がある（別チケット）。
 */
function classNameGroups(markup) {
  const groups = [];
  for (const m of markup.matchAll(/className="([^"{}]+)"/g)) {
    groups.push(m[1].split(/\s+/).filter(Boolean));
  }
  for (const m of markup.matchAll(/className=\{`([^`$]*)`\}/g)) {
    groups.push(m[1].split(/\s+/).filter(Boolean));
  }
  for (const m of markup.matchAll(/className=\{([^`}]*?)\}/g)) {
    for (const lit of m[1].matchAll(/"([^"]+)"|'([^']+)'/g)) {
      groups.push((lit[1] ?? lit[2]).split(/\s+/).filter(Boolean));
    }
  }
  return groups;
}

/**
 * 配信されるクライアントスクリプトを1つの文字列として読む。
 * minifier は非 ASCII を \xNN / \uNNNN のエスケープで書き出すことがある
 * （実際 ¥ は \xa5 になる）ので、素の文字列と突き合わせられるよう先に戻す。
 */
function clientBundleText() {
  const scripts = outFiles(/\.js$/, join(OUT, "_next"));
  assert.ok(scripts.length > 0, "out/_next にクライアントスクリプトがありません");
  const unescapeJs = (src) =>
    src
      .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return scripts.map((f) => unescapeJs(readFileSync(f, "utf8"))).join("\n");
}

// --- サーバー専用モジュールがクライアントへ漏れていないこと ---------------
// app/site.ts は公開 URL を process.env から組む。client component から（間接的にでも）
// 読まれるとクライアントバンドルに入り、basePath を落とした URL が静かに出来上がる。
// 「クライアント JS に公開 URL が焼かれていないか」で見れば、経路に依存せず判定できる。
test("クライアントバンドルに公開 URL が焼き込まれていない", () => {
  requireBuild();
  const scripts = outFiles(/\.js$/, join(OUT, "_next"));
  assert.ok(scripts.length > 0, "out/_next にクライアントスクリプトがありません");
  const leaked = scripts.filter((f) => readFileSync(f, "utf8").includes("ga-project.github.io"));
  assert.deepEqual(
    leaked.map((f) => f.slice(OUT.length + 1)),
    [],
    "app/site.ts がクライアント側へ回り込んでいます（client component から import していないか確認）",
  );
});

// --- 画面と構造化データが同じ Q&A であること -------------------------------
// 「画面に無い内容をマークアップしない」というのが守りたい性質なので、
// import の有無ではなく、書き出した HTML の中で両者が一致することを直接見る。
test("トップページの FAQPage が画面の Q&A と一致する", () => {
  requireBuild();
  const html = read("out/index.html");
  const faqLd = jsonLdBlocks(html).find((b) => b["@type"] === "FAQPage");
  assert.ok(faqLd, "out/index.html に FAQPage 構造化データがありません");

  assert.equal(faqLd.mainEntity.length, FAQ.length, "構造化データと FAQ の件数が違う");
  faqLd.mainEntity.forEach((q, i) => {
    assert.equal(q.name, FAQ[i].q);
    assert.equal(q.acceptedAnswer.text, FAQ[i].a);
  });

  // JSON-LD を取り除いた残り（＝人が読む側）にも同じ Q&A が出ていること。
  // React が &, <, > をエスケープして出すので、比較前に戻す。
  const visible = unescapeHtml(html.replace(/<script[^>]*>.*?<\/script>/gs, ""));
  for (const f of FAQ) {
    assert.ok(visible.includes(f.q), `画面に出ていない質問が構造化データにある: ${f.q}`);
    assert.ok(visible.includes(f.a), `画面に出ていない回答が構造化データにある: ${f.q}`);
  }
});

// 断定・保証・税務助言に読める表現は、FAQ だけでなくページに出る文言すべてで避ける。
// 書き出した可視テキストと meta description を対象にする（FAQ 配列だけを守っても、
// 画面の他の場所に同じ表現が出れば意味がない）。
test("公開ページの文言に禁止表現が含まれない", () => {
  requireBuild();
  const html = read("out/index.html");
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
  assert.ok(desc.length > 0, "meta description を取り出せていない");
  const visible = unescapeHtml(html.replace(/<script[^>]*>.*?<\/script>/gs, "").replace(/<[^>]+>/g, " "));
  const target = `${visible} ${unescapeHtml(desc)}`.replace(DISCLAIMER, "");
  for (const word of FORBIDDEN) {
    assert.ok(!target.includes(word), `公開ページに禁止表現「${word}」がある`);
  }
});

test("404 ページに FAQPage を出力していない", () => {
  requireBuild();
  const ld = jsonLdBlocks(read("out/404.html"));
  // 取り出せていないのに「0件だから緑」になるのを防ぐ（正規表現が空振りしても気づけるように）。
  assert.ok(ld.length > 0, "out/404.html から JSON-LD を1件も取り出せていない");
  assert.equal(
    ld.filter((b) => b["@type"] === "FAQPage").length,
    0,
    "404 には Q&A が表示されないので、FAQPage を載せてはいけない",
  );
});

// --- 共有カードの原版と書き出しのズレ ---------------------------------------
// og-card.html を直したのに書き出しを忘れると、古い PNG が公開され続ける。
// macOS のフォント依存で CI では PNG を再生成できないため、原版側を固定して検出する。
// （PNG だけ差し替えた場合は検出できない。原版→書き出しの取りこぼしだけを見ている）
test("共有カードの原版と scripts/og-card.html.sha256 が一致する", () => {
  const expected = read("scripts/og-card.html.sha256").trim();
  const actual = createHash("sha256")
    .update(readFileSync(join(ROOT, "scripts/og-card.html")))
    .digest("hex");
  assert.equal(
    actual,
    expected,
    "scripts/og-card.html を変更したら ./scripts/og-card.sh を実行して public/og.png を書き出し直してください",
  );
});

test("開発用の不変量ファイルを公開物に混ぜていない", () => {
  requireBuild();
  // 名前を決め打ちすると別名で置かれたときに素通りするので、拡張子で広く見る。
  const hashes = outFiles(/\.sha256$/).map((f) => f.slice(OUT.length + 1));
  assert.deepEqual(hashes, [], "ハッシュファイルは scripts/ に置く（public/ に置くと配信される）");
});

// --- 材料ごとUIの文言が、実際に配信物へ届いていること ----------------------
// itemized の既定は false なので、この分岐は out/index.html に現れない。
// つまり上の「可視テキスト」系の検査はここに永久に届かず、
// 文言モジュールを作っただけでは「中身は検査したが、配信物に載っているかは
// 誰も見ていない」状態になる（定数を残したまま JSX を消しても緑のままだった）。
//
// **粒度の正直な説明**: これが見ているのは「文字列がクライアントチャンクに実在するか」
// であって「その文字列が画面に描かれるか」ではない。page.tsx は名前付きオブジェクトを
// import するので、オブジェクトが1つでも使われていればフィールド単位の未使用は
// tree-shake されず素通りする。また同じ値を持つ2つの定数
// （ROW.unitPlaceholder と UNIT_PICKER.label はどちらも "単位"）は互いを隠す。
// 捕まえられるのは「定数の集まりごと画面から消えた」規模の失敗まで。
test("材料ごとUIの文言が配信されるクライアントチャンクに含まれる", () => {
  requireBuild();
  const scripts = outFiles(/\.js$/, join(OUT, "_next"));
  assert.ok(scripts.length > 0, "out/_next にクライアントスクリプトがありません");
  const bundle = clientBundleText();
  const missing = collectStrings(COPY_OBJECTS).filter(
    (s) => !bundle.includes(s),
  );
  assert.deepEqual(
    missing,
    [],
    "文言モジュールにあるが画面から使われていない（配信物に無い）文字列があります",
  );
});

// --- 配信物そのものに禁止表現が載っていないこと（逆方向・経路非依存） -------
// ここまでの禁止語検査はどれも「決められた入れ物の中身」を見る片方向の検査で、
// 入れ物の外（COPY_OBJECTS 未登録の export・JSX への直書き）を通れば素通りする。
// 実測で、禁止語を含む文字列を画面に出したまま 75/75 緑・typecheck 緑・lint 緑に
// できることが確認された。配信されるチャンクを直接見れば、入れ物に登録したか
// JSX に直書きしたかに関わらず、同じ1本で止まる。
//
// **担保できる範囲**: 見ているのは「配信される JS に禁止語の文字列が現れるか」。
// 実行時に文字を組み立てる書き方（分割した文字列の連結・コード値からの生成）は
// 見えない。免責の定型句は取り除いてから見るが、取り除くのは句そのものだけで、
// その先の文へは食い込ませない（食い込ませると、その窓に入った禁止語を見逃す）。
test("配信されるクライアントチャンクに禁止表現が載っていない", () => {
  requireBuild();
  const bundle = clientBundleText();
  // 「保証するものではありません」のような免責は書いてよいので先に取り除く。
  const cleaned = bundle.replace(DISCLAIMER, "");
  const hits = FORBIDDEN.filter((w) => cleaned.includes(w));
  assert.deepEqual(
    hits,
    [],
    "配信されるスクリプトに断定的・助言的な表現が含まれています（どの経路で入ったかに関わらず公開してはいけません）",
  );
});

// --- 44px タッチ目標の宣言が守られていること -------------------------------
// このスタイルシートは冒頭（:7）と .seg（:1011 付近）で 44px を明文の土台として
// 宣言している。守られているかは目視でしか確かめられておらず、実際に一度割った
// （.matunit-chip の 32px）。宣言を機械が見張る形にする。
//
// 見るのは2方向:
//   (a) min-height を宣言している操作部品が 44px を割っていないか
//   (b) 操作部品として列挙したセレクタが、44px を得る手段を実際に持っているか
// (b) が要るのは、宣言ごと消える回帰を (a) が見られないため。
// なお .matadd は常に className="btn btn-ghost matadd" で描画されるので、
// 自前の min-height は冗長であり、併用先の .btn を見るのが意味的に正しい
// （消えても実害が無かったのはそのため）。
// 44px の得かたは2通り: 自分で min-height を宣言する / ::before で当たりを広げる /
// 44px を宣言している他のクラスと併用する（例 .matadd は .btn と併用）。
// 自分では 44px を宣言せず、44px を持つ共有クラスと併用して満たす部品。
// 併用先が壊れたら (b) が落ちるので、ここに入れても検査から外れるわけではない。
const COMBINED_TOUCH = new Set([".matadd"]);

const TOUCH_TARGETS = [
  { sel: ".matdel", via: "self" },
  { sel: ".matunit", via: "self" },
  { sel: ".seg-btn", via: "self" },
  { sel: ".matunit-chip", via: "before" },
  { sel: ".matadd", via: "btn" },
];

test("操作部品の min-height が 44px の宣言を割っていない", () => {
  const css = read("app/globals.css");
  const markup = ["app/page.tsx", "app/not-found.tsx", "app/layout.tsx"]
    .filter((f) => existsSync(join(ROOT, f)))
    .map((f) => read(f))
    .join("\n");
  // セレクタの捕捉は直前の } 以降すべてを含むので、コメントが混ざると
  // セレクタ名の一致比較が成立しない（実際 .matunit / .btn を取り逃した）。
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)];

  /** そのセレクタ自身が宣言している min-height（px）。無ければ null。 */
  const declaredMinHeight = (selector) => {
    for (const [, sel, body] of blocks) {
      const name = sel.trim().split("\n").pop().trim();
      if (name !== selector) continue;
      const m = body.match(/min-height:\s*(\d+(?:\.\d+)?)px/);
      if (m) return parseFloat(m[1]);
    }
    return null;
  };

  // (a) 44px 未満を宣言している操作部品が無いこと。
  //     ::before で当たりを別に確保している部品は、見た目が小さくてよい。
  const tooSmall = [];
  for (const [, selector, body] of blocks) {
    const m = body.match(/min-height:\s*(\d+(?:\.\d+)?)px/);
    if (!m) continue;
    const px = parseFloat(m[1]);
    if (px >= 44) continue;
    const sel = selector.trim();
    const base = sel.replace(/:.*$/, "").trim();
    const hasHitArea = new RegExp(
      `${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}::before\\s*\\{[^}]*height:\\s*44px`,
      "s",
    ).test(bare);
    if (!hasHitArea) tooSmall.push(`${sel} → ${px}px`);
  }
  assert.deepEqual(
    tooSmall,
    [],
    "44px 未満の操作部品があります（見た目を小さくしたいなら ::before で当たりを 44px 確保してください）",
  );

  // (a2) 高さについて何も言っていない操作部品。(a) は min-height を宣言している
  //      ブロックしか見ないので、新規の押せる部品に高さを書き忘れる失敗
  //      （既定の高さは行送り相当で 44px に満たない）を素通りさせていた。
  //      押せることを cursor: pointer で名乗るブロックは、44px を得る手段を
  //      自分の中で示していること。手段は3通りある:
  //        - min-height / height に 44px
  //        - padding で確保（details summary は padding-block: calc((44px - …)/2)）
  //        - ::before で当たりだけ広げる（.matunit-chip）
  //      いずれも本文中に 44px という数字が現れるので、それを手掛かりにする。
  //      **この検査は結果の高さを計算していない**。「44px に言及しているか」しか
  //      見ないので、44px を書いたうえで別の指定で潰す書き方は捕まえられない。
  const noHeight = [];
  for (const [, selector, body] of blocks) {
    if (!/cursor:\s*pointer/.test(body)) continue;
    const sel = selector.trim().split("\n").pop().trim();
    if (/::|:hover|:focus|:active|:disabled/.test(sel)) continue;
    if (/44px/.test(body)) continue;
    const base = sel.replace(/:.*$/, "").trim();
    const esc = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // ::before で当たりを広げている、または他所で 44px を宣言している。
    if (new RegExp(`${esc}(::before)?\\s*\\{[^}]*44px`, "s").test(bare)) continue;
    // 44px を宣言しているクラスと併用する部品（例 .matadd は .btn と併用）。
    if (COMBINED_TOUCH.has(base)) continue;
    noHeight.push(sel);
  }
  assert.deepEqual(
    noHeight,
    [],
    "押せる部品が 44px のタッチ目標に言及していません（min-height / padding / ::before のどれかで確保してください）",
  );

  // (b) 列挙した操作部品が 44px を得る手段を実際に持っていること。
  //     宣言ごと消える回帰は (a) では見えない。
  const lost = [];
  for (const { sel, via } of TOUCH_TARGETS) {
    if (via === "self") {
      if (declaredMinHeight(sel) !== 44) lost.push(`${sel}（自身の min-height:44px が無い）`);
    } else if (via === "before") {
      const ok = new RegExp(
        `${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}::before\\s*\\{[^}]*height:\\s*44px`,
        "s",
      ).test(bare);
      if (!ok) lost.push(`${sel}（::before の当たり 44px が無い）`);
    } else if (via === "btn") {
      // .btn と併用して 44px を得る部品。併用先が生きていることに加え、
      // **markup が本当に併用しているか**も見る。ここを見ないと、
      // className から btn を外した瞬間に高さの供給元が消えるのに緑のままになる。
      if (declaredMinHeight(".btn") !== 44) {
        lost.push(`${sel}（併用する .btn の 44px が無い）`);
      }
      const cls = sel.replace(/^\./, "");
      // 正しい不変条件は「その class を持つ**すべての**要素が btn を併用している」。
      // some() だと、1つでも併用している要素があれば、併用していない別の要素が
      // 44px を失っていても緑になる。
      const groups = classNameGroups(markup).filter((names) => names.includes(cls));
      if (groups.length === 0) {
        lost.push(`${sel}（markup に現れない＝この項目が古い）`);
      } else if (!groups.every((names) => names.includes("btn"))) {
        lost.push(`${sel}（markup が .btn と併用していない）`);
      }
    }
  }
  assert.deepEqual(lost, [], "44px を得る手段を失った操作部品があります");
});

// --- markup が使う class が CSS に定義されていること ------------------------
// app/globals.css の一部を編集したとき、隣接するブロックを巻き込んで消しても
// 型でも lint でも build でも落ちず、テストも緑のまま通る。実際に一度、
// .matcost / .matcost b / .matcost-hint / .matfoot / .matadd / .mattotal /
// .mattotal b / .matlead .matnote / .matlead .matnote b の **9ブロック**を
// 失ったビルドが「実ブラウザで全項目 ok」と判定された
// （見ていたのは新設要素だけで、既存部分の視覚回帰を見ていなかった）。
// className と CSS の対応を見れば、この種の事故は機械的に落ちる。
test("画面が使っている class がスタイルシートに定義されている", () => {
  // コメントを剥がしてから照合する。生の CSS を見ると、規則を消しても
  // その class に言及するコメントが残っていれば緑になる（実測: markup が使う
  // 90 class のうち 16 class がコメント内で名指しされており、
  // .matrow / .matdel / .matunit / .matlead など事故が起きた領域を含む）。
  const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const sources = ["app/page.tsx", "app/not-found.tsx", "app/layout.tsx"]
    .filter((f) => existsSync(join(ROOT, f)))
    .map((f) => read(f))
    .join("\n");

  // 抽出は 44px の併用検査と同じ classNameGroups を使う。
  // 別々の抽出器を持つと、片方だけ射程が広がって食い違う（実際に食い違っていた）。
  // 補間を含むテンプレート（`hangtag${…}`）が対象外である点も共通
  // ＝ hangtag / minitag / empty / best は**この検査でも見ていない**。
  const used = new Set(classNameGroups(sources).flat());
  assert.ok(used.size > 10, `class を拾えていません（${used.size} 件）`);

  // 複合セレクタ（.matlead .matnote）でも定義とみなすので、
  // クラス名がセレクタとして現れるかだけを見る。
  const undefinedClasses = [...used].filter(
    (c) =>
      !new RegExp(`\\.${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(css),
  );
  assert.deepEqual(
    undefinedClasses.sort(),
    [],
    "markup が使っているのに CSS に定義が無い class があります",
  );
});
