# ねだんの工房（handmade-pricer）

ハンドメイド作家向けの価格計算ツール。材料費・作業時間・送料・目標利益から、
minne / Creema / BASE などの手数料込みで「いくらで売れば手取りが残るか」を逆算する。
Next.js 14（App Router）の static export（`out/` に静的書き出し）でサーバランタイム不要。

## セットアップ & 開発

```bash
./setup.sh                 # pnpm install
pnpm dev                   # http://localhost:3000（ホットリロード）
```

## ビルド（static export）

```bash
pnpm build                 # next build → out/ に静的 HTML/CSS/JS を生成
./run.sh serve             # out/ をビルドしてローカル配信
```

`out/` がそのまま配信物。

## テスト

```bash
pnpm build && pnpm test    # ← この順で実行する
```

`test/guards.test.mjs` は書き出した `out/` を検査するので、**先に `pnpm build` が要る**
（`out/` が無ければ「ビルドしていないから緑」にならないよう、明示的に失敗する）。
CI も `typecheck → lint → build → test` の順で通し、どれかが落ちれば公開へ進まない。

`out/` は存在だけでなく**鮮度**も見る。古い `out/` に対して緑になると、
ソースを直したのに前のビルドを検査していることになるため。

> **7件が「out/ がソースより古いです」で落ちたときは、壊れたのではなくビルドし直せば直る。**
> `git checkout` / `git stash` / `rsync` などはファイルの中身が同じでも mtime を進めるので、
> ブランチを切り替えた直後にこれが出る。`pnpm build` を実行すれば戻る。

- `test/pricing.test.mjs` … 価格逆算ロジックのユニットテスト
- `test/smoke.test.mjs` … 販売所プリセットの健全性
- `test/share.test.mjs` … 計算条件の URL 符号化・復元
- `test/faq.test.mjs` … よくある質問の中身の不変量（件数・重複・表現の制約）
- `test/guards.test.mjs` … 静かに壊れる失敗を `out/` で検出する
  （クライアントバンドルへの公開 URL 漏れ／画面と構造化データの不一致／404 への
  FAQPage 混入／共有カード原版と書き出しのズレ）

## 構成

```
handmade-pricer/
├─ app/
│  ├─ page.tsx        # 価格計算 UI（下げ札に逆算・販売所くらべ）
│  ├─ layout.tsx      # SEO/OGP メタ・構造化データ・アクセス解析タグ
│  ├─ not-found.tsx   # 404（out/404.html を生成）
│  ├─ site.ts         # 公開 URL の単一の出どころ（サーバー側専用）
│  ├─ sitemap.ts      # out/sitemap.xml を生成
│  └─ globals.css     # 独自デザイン（手仕事の値札工房）・light/dark・a11y
├─ lib/
│  ├─ pricing.mjs     # 価格逆算の純関数（UIから独立してテスト可能）
│  ├─ marketplaces.mjs# 販売所の手数料プリセット（参考値）
│  ├─ share.mjs       # 計算条件の URL 符号化・復元
│  ├─ faq.mjs         # よくある質問の単一ソース（画面表示と FAQPage 構造化データが共有）
│  └─ json-ld.mjs     # 構造化データを <script> へ安全に書き出す
├─ public/og.png      # 共有カード（書き出し結果・コミットしたものが公開される）
├─ scripts/
│  ├─ og-card.html    # 共有カードの原版
│  ├─ og-card.html.sha256 # 上の原版のハッシュ（書き出し忘れの検出用・下記）
│  └─ og-card.sh      # og-card.html → public/og.png の書き出し
├─ test/              # node:test のユニット/スモークテスト
└─ next.config.mjs    # output: "export"
```

## デザイン

デザインはこの製品専用にゼロから作成（世界観「手仕事の値札工房」＝作業台に材料と手間を置くと
下げ札に値段が仕立て上がる）。プレーン CSS＋CSS 変数のみ。light/dark 両対応・コントラスト AA・
`:focus-visible`・`prefers-reduced-motion`・44px タッチ・skip-link を備える。

## 検索エンジンへの登録（sitemap の扱い）

ビルドすると `out/sitemap.xml` が出る。ただし **robots.txt は置いていない**。robots.txt は
オリジン単位でしか読まれず、この製品が置ける `/<slug>/robots.txt` はクローラに取得されない
（唯一有効な `https://ga-project.github.io/robots.txt` は当社の管理外・実測 404）。
置いても読まれないファイルが増えるだけなので出力していない。

そのため **sitemap の到達経路は Search Console への手動送信ひとつだけ**になる。

- 送信先: Search Console に `https://ga-project.github.io/handmade-pricer/` を登録し、
  サイトマップとして `https://ga-project.github.io/handmade-pricer/sitemap.xml` を送る
- 送信しない場合でも、会社サイトからの被リンクがあるためページ自体はクロールされる。
  1ページ構成なので sitemap の有無で索引可否が決まるわけではない（送れば通知が早くなる、という位置づけ）

## 共有カード（og:image）

SNS やチャットに URL を貼ったときに出る 1200×630 の画像。原版は `scripts/og-card.html`。

```bash
./scripts/og-card.sh       # scripts/og-card.html → public/og.png
```

書き出しの際に原版のハッシュを `scripts/og-card.html.sha256` へ併置する。原版だけ直して
書き出しを忘れると（＝古い PNG が公開され続けると）`test/guards.test.mjs` がそのズレで落ちる。
macOS のフォントに依存するため CI で PNG を再生成して比較することはできず、原版側を
固定することで代替している（PNG だけ差し替えた場合は検出できない）。

原版を直したら必ず書き出し、`public/og.png` も一緒にコミットする（コミットされた PNG が
そのまま公開物になる）。書き出したら**拡大して目視で確認する**こと。

- 麻ひもが穴を通っているか（端がクラフト地の上に露出していないか）
- 「材料と手間」の3つの金額の右端が揃っているか
- パネルの下端と最下行の隙間。`.foot` は下端固定なので、**片方を動かすと必ずもう片方が変わる**

スクリプトが機械で検査して落とすのは次の3つ。目視はそれ以外（見た目の座りや読みやすさ）に使う。

- 寸法（1200×630）とファイルサイズ（白紙検出）
- **はみ出し**: 全要素の `scrollWidth / scrollHeight > clientWidth / clientHeight`
- **重なり**: `.head` `.inputs` `.arrow` `.tag` `.foot` の矩形が互いに交差していないか

はみ出しと重なりは別のクラスで、片方の検査でもう片方は拾えない（余白を詰めて下の行に
食い込む類は「重なり」側でしか出ない）。どちらも実際に取りこぼした経緯があるため両方見る。

書き出しは **macOS のフォント（Hiragino 系）を前提**にしている。原版が先頭に Hiragino を
指定しているため、別 OS で焼くと別の字面の絵になる。CI（Linux）でのビルド時生成をしていない
のはこのため。差し替えるときは同じ macOS 環境で焼き直すこと。

カード上の数字は `lib/pricing.mjs` の既定入力そのままの出力なので、実物のツールを開けば
同じ画面が出る。手数料プリセットや既定値を変えたらカードの数字も更新する。

    材料費 500 ＋ 工賃 1,000（60分 × ¥1,000/時）＋ 送料 300 ＝ 原価 1,800
    目標利益 20% ／ minne（手数料 10.56%）／ 10円切り上げ
    → 売価 ¥2,420 ／ 手数料 ¥256 ／ 手取り ¥2,164

なお目標利益 20% はカード上には出していない（28px 以上で収まる場所が無いため）。

## アクセス解析

`app/layout.tsx` に Cookie を使わない計測タグを有効化済み。公開タグは秘密ではない。
