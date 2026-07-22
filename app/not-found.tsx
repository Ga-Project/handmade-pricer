// ねだんの工房 — 404 ページ。static export では out/404.html に書き出される。
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ページが見つかりません — ねだんの工房",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <>
      <a className="skip-link" href="#main">
        本文へスキップ
      </a>

      <header className="masthead">
        <div className="wrap">
          <a className="logo" href="/">
            <span className="logo-tag" aria-hidden="true">
              ¥
            </span>
            <span>
              <b>ねだんの工房</b>
              <span>HANDMADE PRICER</span>
            </span>
          </a>
        </div>
      </header>

      <main id="main" tabIndex={-1} style={{ outline: "none" }}>
        <section className="intro wrap-narrow">
          <span className="eyebrow">404</span>
          <h1>この下げ札は見あたりません。</h1>
          <p>
            お探しのページは移動または削除されたようです。URL
            をご確認のうえ、工房のトップからやり直してください。
          </p>
          <p style={{ marginTop: "var(--sp-5)" }}>
            <a className="btn btn-accent" href="/">
              工房へもどる
            </a>
          </p>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap">
          <p>© ねだんの工房</p>
        </div>
      </footer>
    </>
  );
}
