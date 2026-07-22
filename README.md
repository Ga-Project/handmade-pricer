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
pnpm test                  # node --test（標準ランナー）
```

- `test/pricing.test.mjs` … 価格逆算ロジックのユニットテスト
- `test/smoke.test.mjs` … 販売所プリセットの健全性

## 構成

```
handmade-pricer/
├─ app/
│  ├─ page.tsx        # 価格計算 UI（下げ札に逆算・販売所くらべ）
│  ├─ layout.tsx      # SEO/OGP メタ・アクセス解析タグ
│  ├─ not-found.tsx   # 404（out/404.html を生成）
│  └─ globals.css     # 独自デザイン（手仕事の値札工房）・light/dark・a11y
├─ lib/
│  ├─ pricing.mjs     # 価格逆算の純関数（UIから独立してテスト可能）
│  └─ marketplaces.mjs# 販売所の手数料プリセット（参考値）
├─ test/              # node:test のユニット/スモークテスト
├─ next.config.mjs    # output: "export"
└─ scripts/public-gate.sh
```

## デザイン

デザインはこの製品専用にゼロから作成（世界観「手仕事の値札工房」＝作業台に材料と手間を置くと
下げ札に値段が仕立て上がる）。プレーン CSS＋CSS 変数のみ。light/dark 両対応・コントラスト AA・
`:focus-visible`・`prefers-reduced-motion`・44px タッチ・skip-link を備える。

## アクセス解析

`app/layout.tsx` に Cookie を使わない計測タグを有効化済み。公開タグは秘密ではない。
