"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  computeResult,
  compareMarketplaces,
  formatYen,
  formatPercent,
} from "../lib/pricing.mjs";
import {
  MARKETPLACES,
  CUSTOM_MARKETPLACE_ID,
  makeCustomMarketplace,
} from "../lib/marketplaces.mjs";
import { encodeShareParams, decodeShareParams } from "../lib/share.mjs";

/** 文字列入力を非負の数値に変換（空欄・不正値は 0）。 */
function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const FAQ = [
  {
    q: "手数料の数字は最新ですか？",
    a: "各サービスが公表している一般的な区分をもとにした参考値です。プランや時期で変わるため、正確な金額は各サービスの公式ページでご確認ください。ぴったり合わせたいときは「じぶんで入力」で率と固定手数料を直接指定できます。",
  },
  {
    q: "計算のしくみは？",
    a: "受け取りたい額（材料費＋工賃＋送料＝原価に、目標の利益をのせた金額）を先に決め、そこへ販売所の手数料を上乗せして「いくらで並べれば手取りが目標に届くか」を逆算しています。",
  },
  {
    q: "確定申告や帳簿づけにも使えますか？",
    a: "このツールは値付けの計算を助けるもので、税務や会計の助言ではありません。複数の商品をまとめて保存したり、費目を分けて書き出す機能は、別のツールとして準備しています。",
  },
];

export default function Home() {
  const [materialCost, setMaterialCost] = useState("500");
  const [workMinutes, setWorkMinutes] = useState("60");
  const [hourlyWage, setHourlyWage] = useState("1000");
  const [shipping, setShipping] = useState("300");
  const [includeShipping, setIncludeShipping] = useState(true);
  const [profitPercent, setProfitPercent] = useState("20");
  const [marketId, setMarketId] = useState("minne");
  const [customFee, setCustomFee] = useState("10");
  const [customFixed, setCustomFixed] = useState("0");
  const [roundUnit, setRoundUnit] = useState("10");

  // 共有ボタンの一時的な結果表示。"copied"=コピー成功 / "error"=クリップボード不可。
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  // URL に共有パラメータが載っていれば、その条件で起動する。
  // static export では初期描画は既定値のため、ハイドレーション後に useEffect で反映して
  // サーバー／クライアントの描画差異（hydration mismatch）を避ける。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const s = decodeShareParams(window.location.search);
    if (s.materialCost !== undefined) setMaterialCost(s.materialCost);
    if (s.workMinutes !== undefined) setWorkMinutes(s.workMinutes);
    if (s.hourlyWage !== undefined) setHourlyWage(s.hourlyWage);
    if (s.shipping !== undefined) setShipping(s.shipping);
    if (s.includeShipping !== undefined) setIncludeShipping(s.includeShipping);
    if (s.profitPercent !== undefined) setProfitPercent(s.profitPercent);
    if (s.marketId !== undefined) setMarketId(s.marketId);
    if (s.customFee !== undefined) setCustomFee(s.customFee);
    if (s.customFixed !== undefined) setCustomFixed(s.customFixed);
    if (s.roundUnit !== undefined) setRoundUnit(s.roundUnit);
  }, []);

  const inputs = useMemo(
    () => ({
      materialCost: num(materialCost),
      workMinutes: num(workMinutes),
      hourlyWage: num(hourlyWage),
      shipping: num(shipping),
      includeShipping,
      profitRate: num(profitPercent) / 100,
    }),
    [
      materialCost,
      workMinutes,
      hourlyWage,
      shipping,
      includeShipping,
      profitPercent,
    ],
  );

  const round = num(roundUnit) || 1;

  const allMarkets = useMemo(() => {
    const custom = makeCustomMarketplace(num(customFee), num(customFixed));
    return [...MARKETPLACES, custom];
  }, [customFee, customFixed]);

  const selected = useMemo(
    () =>
      allMarkets.find((m) => m.id === marketId) ??
      MARKETPLACES[0] ??
      makeCustomMarketplace(num(customFee), num(customFixed)),
    [allMarkets, marketId, customFee, customFixed],
  );

  const result = useMemo(
    () => computeResult(inputs, selected, round),
    [inputs, selected, round],
  );

  const comparison = useMemo(
    () => compareMarketplaces(inputs, allMarkets, round),
    [inputs, allMarkets, round],
  );

  const hasInput =
    inputs.materialCost > 0 || inputs.hourlyWage > 0 || inputs.shipping > 0;

  // いまの入力条件を URL にまとめ、アドレスバーへ反映しつつクリップボードへコピーする。
  // すべてブラウザ内で完結し、値をサーバーへ送らない。
  const handleShare = useCallback(async () => {
    if (typeof window === "undefined") return;
    const query = encodeShareParams({
      materialCost,
      workMinutes,
      hourlyWage,
      shipping,
      includeShipping,
      profitPercent,
      marketId,
      customFee,
      customFixed,
      roundUnit,
    });
    const url = `${window.location.origin}${window.location.pathname}?${query}`;
    // 開き直したときに条件が復元されるよう、アドレスバーの URL も更新する。
    window.history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
      window.setTimeout(() => setShareStatus("idle"), 2500);
    } catch {
      // クリップボードが使えない環境（権限拒否など）では URL の更新だけ行い、
      // アドレスバーから手動でコピーしてもらう旨を伝える。
      setShareStatus("error");
      window.setTimeout(() => setShareStatus("idle"), 4000);
    }
  }, [
    materialCost,
    workMinutes,
    hourlyWage,
    shipping,
    includeShipping,
    profitPercent,
    marketId,
    customFee,
    customFixed,
    roundUnit,
  ]);

  // 積み上げバー（販売価格の内訳）。
  const p = result.price || 1;
  const seg = {
    mat: (result.materialCost / p) * 100,
    labor: (result.labor / p) * 100,
    ship: (result.shipping / p) * 100,
    profit: (Math.max(0, result.profit) / p) * 100,
    toll: (result.fee / p) * 100,
  };

  // くらべの中で最も安く並べられる（手数料負担が軽い）販売所。
  const cheapest = comparison
    .filter((c) => c.result.feasible && c.result.price > 0)
    .sort((a, b) => a.result.price - b.result.price)[0];

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
          <a className="btn btn-ghost" href="#compare">
            販売所くらべ
          </a>
        </div>
      </header>

      <main id="main" tabIndex={-1} style={{ outline: "none" }}>
        <section className="intro">
          <div className="wrap">
            <span className="eyebrow">ハンドメイド作家の値付け</span>
            <h1>
              手間と材料から、
              <br />
              手取りの残る「ねだん」を仕立てる。
            </h1>
            <p>
              材料費と作業時間を置くと、minne・Creema・BASE
              などの手数料を差し引いても目標の手取りが残る販売価格を、下げ札に逆算します。
              登録なしでそのまま使えます。
            </p>
          </div>
        </section>

        <div className="wrap">
          <div className="bench">
            {/* 左: 材料と手間 */}
            <form
              className="panel"
              aria-labelledby="bench-title"
              onSubmit={(e) => e.preventDefault()}
            >
              <div className="panel-title" id="bench-title">
                材料と手間 <small>作品ひとつ分</small>
              </div>

              <label className="field">
                <span className="label">
                  材料費 <span className="hint">生地・パーツ・箱など</span>
                </span>
                <span className="input-affix">
                  <span className="pre" aria-hidden="true">
                    ¥
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={materialCost}
                    onChange={(e) => setMaterialCost(e.target.value)}
                    aria-label="材料費（円）"
                  />
                </span>
              </label>

              <div className="row2">
                <label className="field">
                  <span className="label">作業時間</span>
                  <span className="input-affix">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={workMinutes}
                      onChange={(e) => setWorkMinutes(e.target.value)}
                      aria-label="作業時間（分）"
                    />
                    <span className="suf">分</span>
                  </span>
                </label>
                <label className="field">
                  <span className="label">希望時給</span>
                  <span className="input-affix">
                    <span className="pre" aria-hidden="true">
                      ¥
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={hourlyWage}
                      onChange={(e) => setHourlyWage(e.target.value)}
                      aria-label="希望時給（円/時）"
                    />
                  </span>
                </label>
              </div>

              <label className="field">
                <span className="label">
                  梱包・送料 <span className="hint">1件あたり</span>
                </span>
                <span className="input-affix">
                  <span className="pre" aria-hidden="true">
                    ¥
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={shipping}
                    onChange={(e) => setShipping(e.target.value)}
                    aria-label="梱包・送料（円）"
                  />
                </span>
              </label>

              <label className="switch">
                <input
                  type="checkbox"
                  checked={includeShipping}
                  onChange={(e) => setIncludeShipping(e.target.checked)}
                />
                <span className="track" aria-hidden="true" />
                <span className="txt">
                  送料込みで売る
                  <small>
                    {includeShipping
                      ? "送料を価格に含めて計算"
                      : "送料は別（価格に含めない）"}
                  </small>
                </span>
              </label>

              <div className="row2" style={{ marginTop: "var(--sp-4)" }}>
                <label className="field" style={{ marginBottom: 0 }}>
                  <span className="label">目標利益率</span>
                  <span className="input-affix">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={profitPercent}
                      onChange={(e) => setProfitPercent(e.target.value)}
                      aria-label="目標利益率（%）"
                    />
                    <span className="suf">%</span>
                  </span>
                </label>
                <label className="field" style={{ marginBottom: 0 }}>
                  <span className="label">値段の丸め</span>
                  <select
                    className="plain"
                    value={roundUnit}
                    onChange={(e) => setRoundUnit(e.target.value)}
                    aria-label="値段の丸め単位"
                  >
                    <option value="1">1円単位</option>
                    <option value="10">10円単位</option>
                    <option value="50">50円単位</option>
                    <option value="100">100円単位</option>
                  </select>
                </label>
              </div>

              <label
                className="field"
                style={{ marginTop: "var(--sp-4)", marginBottom: 0 }}
              >
                <span className="label">売る場所</span>
                <select
                  className="plain"
                  value={marketId}
                  onChange={(e) => setMarketId(e.target.value)}
                  aria-label="売る場所（販売所）"
                >
                  {MARKETPLACES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}（{+(m.feeRate * 100).toFixed(2)}%
                      {m.fixedFee ? ` +¥${m.fixedFee}` : ""}）
                    </option>
                  ))}
                  <option value={CUSTOM_MARKETPLACE_ID}>じぶんで入力</option>
                </select>
              </label>

              {marketId === CUSTOM_MARKETPLACE_ID && (
                <div className="custombox">
                  <div className="panel-title">手数料をじぶんで入力</div>
                  <div className="row2">
                    <label className="field" style={{ marginBottom: 0 }}>
                      <span className="label">手数料率</span>
                      <span className="input-affix">
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          value={customFee}
                          onChange={(e) => setCustomFee(e.target.value)}
                          aria-label="手数料率（%）"
                        />
                        <span className="suf">%</span>
                      </span>
                    </label>
                    <label className="field" style={{ marginBottom: 0 }}>
                      <span className="label">固定手数料</span>
                      <span className="input-affix">
                        <span className="pre" aria-hidden="true">
                          ¥
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          value={customFixed}
                          onChange={(e) => setCustomFixed(e.target.value)}
                          aria-label="固定手数料（円/件）"
                        />
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </form>

            {/* 右: 下げ札（結果） */}
            <div className="tagcol">
              <div
                className={`hangtag${hasInput && result.feasible ? "" : " empty"}`}
                aria-live="polite"
              >
                <span className="stitch" aria-hidden="true" />
                <div className="tag-label">
                  {selected.name} でのおすすめ価格
                </div>

                {!hasInput ? (
                  <>
                    <div className="price">— — —</div>
                    <div className="subline">
                      左に材料費や作業時間を入れると、値札ができあがります。
                    </div>
                  </>
                ) : !result.feasible ? (
                  <>
                    <div className="price" style={{ fontSize: "var(--fs-lg)" }}>
                      計算できません
                    </div>
                    <div className="subline">
                      手数料 {formatPercent(selected.feeRate)}{" "}
                      では手数料が売上を上回るため、価格を決められません。手数料率を見直してください。
                    </div>
                  </>
                ) : (
                  <>
                    <div className="price">
                      <span className="yen">¥</span>
                      {result.price.toLocaleString("ja-JP")}
                    </div>
                    <div className="subline">
                      手取り <b>{formatYen(result.takeHome)}</b>（うち利益{" "}
                      {formatYen(result.profit)}・利益率{" "}
                      {formatPercent(result.profitRateActual, 0)}）
                    </div>
                    <span className="tollnote">
                      {selected.name} の手数料 {formatYen(result.fee)}{" "}
                      を差し引き済み
                    </span>
                  </>
                )}
              </div>

              {hasInput && result.feasible && result.price > 0 && (
                <div className="panel" aria-label="販売価格の内訳">
                  <div
                    className="panel-title"
                    style={{ fontSize: "var(--fs-sm)" }}
                  >
                    ¥{result.price.toLocaleString("ja-JP")} の内訳
                  </div>
                  <div
                    className="stack"
                    role="img"
                    aria-label={`販売価格のうち 手取り ${formatYen(result.takeHome)}、手数料 ${formatYen(result.fee)}`}
                  >
                    <span className="s-mat" style={{ width: `${seg.mat}%` }} />
                    <span
                      className="s-labor"
                      style={{ width: `${seg.labor}%` }}
                    />
                    <span
                      className="s-ship"
                      style={{ width: `${seg.ship}%` }}
                    />
                    <span
                      className="s-profit"
                      style={{ width: `${seg.profit}%` }}
                    />
                    <span
                      className="s-toll"
                      style={{ width: `${seg.toll}%` }}
                    />
                  </div>
                  <ul className="legend">
                    <li>
                      <span className="name">
                        <span
                          className="dot"
                          style={{ background: "hsl(344 40% 62%)" }}
                        />
                        材料費
                      </span>
                      <span className="val">
                        {formatYen(result.materialCost)}
                      </span>
                    </li>
                    <li>
                      <span className="name">
                        <span
                          className="dot"
                          style={{ background: "hsl(344 30% 76%)" }}
                        />
                        工賃（{num(workMinutes)}分）
                      </span>
                      <span className="val">{formatYen(result.labor)}</span>
                    </li>
                    {result.shipping > 0 && (
                      <li>
                        <span className="name">
                          <span
                            className="dot"
                            style={{ background: "var(--twine)" }}
                          />
                          送料
                        </span>
                        <span className="val">
                          {formatYen(result.shipping)}
                        </span>
                      </li>
                    )}
                    <li>
                      <span className="name">
                        <span
                          className="dot"
                          style={{ background: "var(--take)" }}
                        />
                        利益
                      </span>
                      <span className="val take">
                        {formatYen(result.profit)}
                      </span>
                    </li>
                    <li>
                      <span className="name">
                        <span
                          className="dot"
                          style={{ background: "var(--toll)" }}
                        />
                        販売手数料
                      </span>
                      <span className="val toll">−{formatYen(result.fee)}</span>
                    </li>
                  </ul>
                </div>
              )}

              {hasInput && result.feasible && result.price > 0 && (
                <div className="sharebox">
                  <button
                    type="button"
                    className="btn btn-ghost share-btn"
                    onClick={handleShare}
                    aria-describedby="share-desc"
                  >
                    <span aria-hidden="true">
                      {shareStatus === "copied" ? "✓" : "🔗"}
                    </span>
                    {shareStatus === "copied"
                      ? "リンクをコピーしました"
                      : "この計算をURLで保存・共有"}
                  </button>
                  <p id="share-desc" className="share-hint">
                    いまの条件をリンクにして控えられます。開き直すと同じ計算が復元されます。入力した金額もリンクに含まれるので、共有すると相手にも見えます。
                  </p>
                  <p className="share-status" role="status" aria-live="polite">
                    {shareStatus === "copied"
                      ? "リンクをコピーしました。ブックマークや共有に使えます。"
                      : shareStatus === "error"
                        ? "アドレスバーのURLをコピーしてお使いください。"
                        : ""}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 販売所くらべ */}
        <section
          className="compare wrap"
          id="compare"
          aria-labelledby="compare-title"
        >
          <h2 id="compare-title">販売所くらべ</h2>
          <p className="lead">
            同じ手取りをねらうと、手数料の重い場所ほど値札は高くなります。
            {cheapest && hasInput ? (
              <>
                {" "}
                いま一番安く並べられるのは <b>{cheapest.marketplace.name}</b>（
                {formatYen(cheapest.result.price)}）です。
              </>
            ) : null}
          </p>
          <div className="minitags">
            {comparison.map(({ marketplace, result: r }) => {
              const isBest =
                hasInput &&
                cheapest &&
                marketplace.id === cheapest.marketplace.id;
              return (
                <div
                  className={`minitag${isBest ? " best" : ""}`}
                  key={marketplace.id}
                >
                  {isBest && <span className="flag">やすい</span>}
                  <div className="mp">
                    {marketplace.name}
                    <small>
                      手数料 {+(marketplace.feeRate * 100).toFixed(2)}%
                      {marketplace.fixedFee
                        ? ` ＋¥${marketplace.fixedFee}`
                        : ""}
                    </small>
                  </div>
                  <div className="mp-price">
                    {hasInput && r.feasible ? formatYen(r.price) : "—"}
                  </div>
                  <div className="mp-take">
                    {hasInput && r.feasible
                      ? `手取り ${formatYen(r.takeHome)}`
                      : "　"}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="notice">
            <span className="ic" aria-hidden="true">
              ※
            </span>
            <span>
              表示金額は入力と参考手数料をもとにした目安です。手数料率はプランや時期で変わるため、
              最新の値は各サービスの公式ページでご確認ください。断定的な収益を保証するものではありません。
            </span>
          </div>
        </section>

        <section className="faq wrap-narrow" aria-labelledby="faq-title">
          <h2 id="faq-title">よくある質問</h2>
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </section>
      </main>

      <footer className="foot">
        <div className="wrap">
          <p>
            ねだんの工房は、ハンドメイド作家の値付けを助ける計算ツールです。税務・会計の助言ではありません。
            アクセス解析には Cookie を使わない計測を用いています。
          </p>
          <p>© ねだんの工房</p>
        </div>
      </footer>
    </>
  );
}
