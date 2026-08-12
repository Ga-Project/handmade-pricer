import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SITE_URL } from "./site";

const TITLE = "ねだんの工房｜ハンドメイド価格メーカー";
const DESC =
  "材料費・作業時間・送料・目標利益から、minne / Creema / BASE などの手数料込みで「いくらで売れば手取りが残るか」を逆算する、ハンドメイド作家のための価格計算ツール。";

// 共有カード（1200×630）。原版は scripts/og-card.html、書き出し先が public/og.png。
const OG_IMAGE = `${SITE_URL}og.png`;
const OG_ALT =
  "ねだんの工房 — 材料費と作業時間から、販売所の手数料込みで売価と手取りを逆算するツール";

// 検索エンジンに「何をするページか」を機械可読で渡す。値段を扱うツールなので、
// 無料であること（offers ¥0）まで含めて明示する。
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "ねだんの工房",
  alternateName: TITLE,
  url: SITE_URL,
  image: OG_IMAGE,
  description: DESC,
  inLanguage: "ja",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web browser",
  browserRequirements: "JavaScript が有効なモダンブラウザ",
  offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
};

export const metadata: Metadata = {
  // 相対 URL を絶対 URL に解決する基準。これが無いと og:image が相対のまま出て
  // SNS 側で解決できない。
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESC,
  alternates: { canonical: SITE_URL },
  keywords: [
    "ハンドメイド",
    "価格",
    "値付け",
    "手数料",
    "minne",
    "Creema",
    "BASE",
    "手取り",
    "原価計算",
  ],
  openGraph: {
    title: TITLE,
    description: DESC,
    type: "website",
    locale: "ja_JP",
    siteName: "ねだんの工房",
    url: SITE_URL,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: OG_ALT,
      },
    ],
  },
  // 画像付きの大きなカードで出す（summary だと画像が出ず、共有しても中身が伝わらない）。
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [{ url: OG_IMAGE, alt: OG_ALT }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {/* 構造化データ。<head> を自前で書くと Next の metadata 注入と競合しうるので、
            body 内に置く（検索エンジンは body 内の ld+json も読む）。
            描画するのは上の静的オブジェクトだけで、外部入力は混ぜない。 */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        {/* アクセス解析（cookieless・秘密キー不要）。全プロダクト共通の単一 GoatCounter
            サイトに集約し、製品ごとの数値は path で区別される。公開タグは秘密ではない。 */}
        <script
          data-goatcounter="https://ga-project.goatcounter.com/count"
          async
          src="https://gc.zgo.at/count.js"
        />
        {children}
      </body>
    </html>
  );
}
