// 公開 URL の単一の出どころ。
//
// GitHub Pages のプロジェクトページ配信では公開 URL に /<slug> のサブパスが付く
// （next.config.mjs の PAGES_BASE_PATH と同じ値）。metadata の絶対 URL とサイトマップが
// これを取り違えると、ページ自体は表示できても共有カードの画像だけ 404 になる、といった
// ズレ方をする。両者が同じ定数を見るようにして食い違いを防ぐ。
// 末尾スラッシュが混ざると SITE_URL が "...//og.png" のように二重になるため落とす。
const BASE_PATH = (process.env.PAGES_BASE_PATH || "").replace(/\/$/, "");

/** 末尾スラッシュ付きの公開 URL（例: https://ga-project.github.io/handmade-pricer/）。 */
export const SITE_URL = `https://ga-project.github.io${BASE_PATH}/`;

// このモジュールはサーバー側（metadata / sitemap）専用。
// client component から import すると process.env が空に置換され、basePath を落とした
// 誤った URL が静かに出来上がる。
//
// なお 404 ページなど「トップ以外からトップへ張るリンク」にこの値を使ってはいけない。
// 素の <a href="/"> は basePath が付かず ga-project.github.io/（404）へ出てしまうが、
// かといって basePath からリンク先を組み立てると上記の理由でクライアント側だけ "/" に
// 戻り hydration mismatch になる。リンクは next/link に任せる（basePath をクライアント
// でも解決してくれる）。トップページ自身は自己参照リンクを持たない（app/page.tsx 参照）。
