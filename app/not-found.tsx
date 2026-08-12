// ねだんの工房 — 404 ページ。static export では out/404.html に書き出される。
import type { Metadata } from "next";

import Link from "next/link";

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
          <Link className="logo" href="/">
            <span className="logo-tag" aria-hidden="true">
              ¥
            </span>
            <span>
              <b>ねだんの工房</b>
              <span>HANDMADE PRICER</span>
            </span>
          </Link>
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
            <Link className="btn btn-accent" href="/">
              工房へもどる
            </Link>
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
