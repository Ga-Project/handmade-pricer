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
// 文言モジュールを作っただけでは「中身は検査したが、画面から使われているかは
// 誰も見ていない」状態になる（定数を残したまま JSX を消しても緑のままだった）。
// 書き出したクライアントチャンクに文字列が実在するかで、経路に依存せず判定する。
test("材料ごとUIの文言が配信されるクライアントチャンクに含まれる", () => {
  requireBuild();
  const scripts = outFiles(/\.js$/, join(OUT, "_next"));
  assert.ok(scripts.length > 0, "out/_next にクライアントスクリプトがありません");
  // minifier は非 ASCII を \xNN / \uNNNN のエスケープで書き出すことがある
  // （実際 ¥ は \xa5 になる）。素の文字列と突き合わせるため先に戻す。
  const unescapeJs = (src) =>
    src
      .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const bundle = scripts
    .map((f) => unescapeJs(readFileSync(f, "utf8")))
    .join("\n");
  const missing = collectStrings(COPY_OBJECTS).filter(
    (s) => !bundle.includes(s),
  );
  assert.deepEqual(
    missing,
    [],
    "文言モジュールにあるが画面から使われていない（配信物に無い）文字列があります",
  );
});

// --- 44px タッチ目標の宣言が守られていること -------------------------------
// このスタイルシートは冒頭（:7）と .seg（:1011 付近）で 44px を明文の土台として
// 宣言している。守られているかは目視でしか確かめられておらず、実際に一度割った
// （.matunit-chip の 32px）。宣言を機械が見張る形にする。
// 見た目を小さくしたい部品は ::before で当たりだけ広げる作法（.matdel / .matunit-chip）。
test("操作部品の min-height が 44px の宣言を割っていない", () => {
  const css = read("app/globals.css");
  // 当たり判定を別に確保している部品は、その旨をセレクタで示している。
  const hitAreaSelectors = /\.(matdel|matunit-chip)::before/;
  assert.ok(hitAreaSelectors.test(css), "当たり判定の拡張が見当たりません");

  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const offenders = [];
  for (const [, selector, body] of blocks) {
    const m = body.match(/min-height:\s*(\d+(?:\.\d+)?)px/);
    if (!m) continue;
    const px = parseFloat(m[1]);
    if (px >= 44) continue;
    const sel = selector.trim();
    // 当たり判定を ::before で 44px 確保している部品は、見た目が小さくてよい。
    const base = sel.replace(/:.*$/, "").trim();
    const hasHitArea = new RegExp(
      `${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}::before\\s*\\{[^}]*height:\\s*44px`,
      "s",
    ).test(css);
    if (!hasHitArea) offenders.push(`${sel} → ${px}px`);
  }
  assert.deepEqual(
    offenders,
    [],
    "44px 未満の操作部品があります（見た目を小さくしたいなら ::before で当たりを 44px 確保してください）",
  );
});
