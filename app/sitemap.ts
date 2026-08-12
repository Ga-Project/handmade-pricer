import type { MetadataRoute } from "next";

import { SITE_URL } from "./site";

// サイトマップ。static export では build 時に out/sitemap.xml として書き出される。
// robots.txt は置かない: robots.txt はオリジン単位でしか読まれず、この製品が置ける
// /<slug>/robots.txt はクローラに取得されない（唯一有効な
// https://ga-project.github.io/robots.txt は当社の管理外・実測404）。
// sitemap は Search Console に直接送信できるためサブパスでも有効。
// URL は layout の metadataBase と同じ絶対 URL（basePath 込み）に揃える。
// 単一ページのツールなので、トップ 1 URL を自己参照する。
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      // Google が実際に見るのは lastModified。ビルド時刻を入れる。
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
