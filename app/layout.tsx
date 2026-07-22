import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const TITLE = "ねだんの工房｜ハンドメイド価格メーカー";
const DESC =
  "材料費・作業時間・送料・目標利益から、minne / Creema / BASE などの手数料込みで「いくらで売れば手取りが残るか」を逆算する、ハンドメイド作家のための価格計算ツール。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
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
  },
  twitter: { card: "summary", title: TITLE, description: DESC },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
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
