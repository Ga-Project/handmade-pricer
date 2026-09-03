"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  UNIT_PRESETS,
  toAmount,
  makeLine,
  lineCost,
  totalMaterialCost,
  encodeMaterials,
  restoreMaterials,
} from "../lib/materials.mjs";
import {
  LEAD,
  EMPTY_NOTICE,
  ROW,
  ROW_LABELS,
  UNDO,
  FOOT,
  UNIT_PICKER,
} from "../lib/itemized-copy.mjs";
import { FAQ, FAQ_GROUPS } from "../lib/faq.mjs";
import { toJsonLd } from "../lib/json-ld.mjs";

/** 文字列入力を非負の数値に変換（空欄・不正値は 0）。 */
function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// 画面に出している Q&A をそのまま機械可読にする。表示と同じ FAQ 配列だけを使う
// （画面に無い内容をマークアップするのはガイドライン違反）。
// なお FAQ のリッチリザルト表示は権威性の高いサイトに絞られており、この製品の検索結果に
// Q&A が出ることは期待していない。ここの価値は検索以外の読み手（AI 回答エンジン等）と、
// 何より画面に載った本文そのものにある。
const FAQ_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

type MaterialLine = {
  id: string;
  name: string;
  unit: string;
  price: string;
  bought: string;
  used: string;
};

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

  // 材料費の入れ方。false=合計を1つの数で入れる / true=材料ごとに「買った量→使う量」で出す。
  const [itemized, setItemized] = useState(false);
  const [materials, setMaterials] = useState<MaterialLine[]>([]);
  // 行の key 用の連番。並べ替え・削除で index を key にすると入力欄が取り違えられるため、
  // 行ごとに不変の id を振る。
  const nextLineId = useRef(1);

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
    // 材料明細が載っている共有URLは、材料ごとの画面で開き直す。
    // ただし URL が途中で切れていると行が減り、材料費が静かに下がったまま
    // 「材料が揃った画面」に見えてしまう。同じURLの mc（共有時の合計）と
    // 突き合わせ、合わないときは明細を採用せず、まとめて入力（mc の値）で開く。
    if (s.materials !== undefined) {
      const { lines, intact } = restoreMaterials(s.materials, s.materialCost) as {
        lines: MaterialLine[];
        intact: boolean;
      };
      if (intact) {
        nextLineId.current = lines.length + 1;
        setMaterials(lines);
        setItemized(true);
      }
    }
  }, []);

  // 材料ごとの合計。まとめて入力のときは触らない（切り替えても入力が消えないよう別々に持つ）。
  const materialsTotal = useMemo(
    () => totalMaterialCost(materials),
    [materials],
  );
  const effectiveMaterialCost = itemized ? materialsTotal : num(materialCost);

  const addLine = useCallback(() => {
    setMaterials((prev) => [
      ...prev,
      makeLine(nextLineId.current++, {
        // 直前の行と同じ単位で続けることが多いので引き継ぐ。
        unit: prev[prev.length - 1]?.unit ?? "cm",
      }) as MaterialLine,
    ]);
  }, []);

  const updateLine = useCallback(
    (id: string, patch: Partial<MaterialLine>) => {
      setMaterials((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      );
    },
    [],
  );

  // 消した行を1件だけ覚えておき、すぐ戻せるようにする。
  // 触る端末には hover が無く「消す」の警告色が出ないので、誤タップは現実に起きる。
  // このアプリは行を保存しない（永続化なし）ため、消えたら本当に取り返せない。
  const [undoable, setUndoable] = useState<{
    line: MaterialLine;
    index: number;
  } | null>(null);

  const removeLine = useCallback((id: string) => {
    setMaterials((prev) => {
      const index = prev.findIndex((l) => l.id === id);
      if (index < 0) return prev;
      const line = prev[index];
      if (line) setUndoable({ line, index });
      return prev.filter((l) => l.id !== id);
    });
  }, []);

  const undoRemove = useCallback(() => {
    setUndoable((u) => {
      if (!u) return null;
      setMaterials((prev) => {
        const next = [...prev];
        next.splice(Math.min(u.index, next.length), 0, u.line);
        return next;
      });
      return null;
    });
  }, []);

  // 材料ごとへ切り替えたとき、行が1つも無いと入れる場所が無いので空の行を出しておく。
  const enableItemized = useCallback(() => {
    setItemized(true);
    setMaterials((prev) =>
      prev.length > 0
        ? prev
        : [makeLine(nextLineId.current++) as MaterialLine],
    );
  }, []);

  const inputs = useMemo(
    () => ({
      materialCost: effectiveMaterialCost,
      workMinutes: num(workMinutes),
      hourlyWage: num(hourlyWage),
      shipping: num(shipping),
      includeShipping,
      profitRate: num(profitPercent) / 100,
    }),
    [
      effectiveMaterialCost,
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
      // 材料ごとに出しているときは、その合計を材料費として載せる。
      // 明細（ml）を読めない古い共有URLの解釈でも、材料費の数字だけは一致する。
      materialCost: itemized ? String(Math.round(materialsTotal)) : materialCost,
      materials: itemized ? encodeMaterials(materials) : "",
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
    itemized,
    materials,
    materialsTotal,
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
          {/* トップ自身なのでリンクにしない。
              リンクにすると next/link のソフト遷移でクエリだけが消え、共有パラメータを
              読む useEffect は再実行されないため、アドレスバーと画面の計算が食い違う。
              その状態で「URLで共有」を押すと、相手には別の数字が出るリンクが渡ってしまう。 */}
          <div className="logo">
            <span className="logo-tag" aria-hidden="true">
              ¥
            </span>
            <span>
              <b>ねだんの工房</b>
              <span>HANDMADE PRICER</span>
            </span>
          </div>
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

              <div className="field">
                <div className="label-row">
                  <span className="label">
                    材料費 <span className="hint">生地・パーツ・箱など</span>
                  </span>
                  <div className="seg" role="group" aria-label="材料費の入れ方">
                    <button
                      type="button"
                      className="seg-btn"
                      aria-pressed={!itemized}
                      onClick={() => setItemized(false)}
                    >
                      まとめて
                    </button>
                    <button
                      type="button"
                      className="seg-btn"
                      aria-pressed={itemized}
                      onClick={enableItemized}
                    >
                      材料ごと
                    </button>
                  </div>
                </div>

                {!itemized ? (
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
                ) : (
                  <div className="matbox">
                    <p className="matlead">
                      {LEAD.head}
                      <b>{LEAD.emphasis}</b>
                      {LEAD.tail}
                      <small>{LEAD.example}</small>
                      <small className="matnote">
                        {LEAD.unitNote.head}
                        <b>{LEAD.unitNote.emphasis}</b>
                        {LEAD.unitNote.tail}
                      </small>
                    </p>


                    <datalist id="unit-presets">
                      {UNIT_PRESETS.map((u: string) => (
                        <option key={u} value={u} />
                      ))}
                    </datalist>

                    {materials.map((line, i) => {
                      const cost = lineCost(line);
                      // ¥1 未満を ¥1 と丸めて出すと、¥0.5 の行 2 本が「¥1 と ¥1 で合計 ¥1」に
                      // 見えて数字が合わなくなる。1円未満のときだけ小数で見せる。
                      // 単位の換算は利用者にお願いしているので、1000 と 10 の打ち間違いが
                      // そのまま100倍の値段になる。その誤りが表に出る唯一の痕跡が
                      // 「買った量より使う量が多い」。複数袋を使う正当な場合もあるので
                      // 止めずに注意だけ出す。
                      const overUse =
                        toAmount(line.bought) > 0 &&
                        toAmount(line.used) > toAmount(line.bought);
                      const costLabel =
                        cost > 0 && cost < 1
                          ? `¥${cost.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`
                          : formatYen(cost);
                      const unit = line.unit || "";
                      return (
                        <div className="matrow" key={line.id}>
                          <div className="matrow-head">
                            <input
                              className="matname"
                              type="text"
                              value={line.name}
                              placeholder={ROW_LABELS.namePlaceholder(i + 1)}
                              aria-label={ROW_LABELS.name(i + 1)}
                              onChange={(e) =>
                                updateLine(line.id, { name: e.target.value })
                              }
                            />
                            <input
                              className="matunit"
                              type="text"
                              list="unit-presets"
                              value={line.unit}
                              placeholder={ROW.unitPlaceholder}
                              aria-label={ROW_LABELS.unit(i + 1)}
                              onChange={(e) =>
                                updateLine(line.id, { unit: e.target.value })
                              }
                            />
                            <button
                              type="button"
                              className="matdel"
                              onClick={() => removeLine(line.id)}
                              aria-label={ROW_LABELS.del(i + 1, line.name)}
                            >
                              {ROW.del}
                            </button>
                          </div>

                          {/*
                            単位は datalist にも入れてあるが、datalist はフォーカスするまで
                            何の合図も出さず、読み上げ上もただの textbox なので、
                            候補があること自体に気づけない。常に見えるチップで出す。
                            自由入力は残すので、一覧に無い単位もそのまま書ける。
                          */}
                          <div
                            className="matunits"
                            role="group"
                            aria-label={UNIT_PICKER.groupLabel(i + 1)}
                          >
                            <span className="matunits-lab" aria-hidden="true">
                              {UNIT_PICKER.label}
                            </span>
                            {UNIT_PRESETS.map((u: string) => (
                              <button
                                key={u}
                                type="button"
                                className="matunit-chip"
                                aria-pressed={line.unit === u}
                                aria-label={UNIT_PICKER.optionLabel(i + 1, u)}
                                onClick={() =>
                                  updateLine(line.id, { unit: u })
                                }
                              >
                                {u}
                              </button>
                            ))}
                            <span className="matunits-hint" aria-hidden="true">
                              {UNIT_PICKER.hint}
                            </span>
                          </div>

                          <div className="matgrid">
                            <label className="matcell">
                              <span className="matlab">{ROW.boughtPrice}</span>
                              <span className="input-affix">
                                <span className="pre" aria-hidden="true">
                                  ¥
                                </span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  value={line.price}
                                  aria-label={ROW_LABELS.boughtPrice(i + 1)}
                                  onChange={(e) =>
                                    updateLine(line.id, {
                                      price: e.target.value,
                                    })
                                  }
                                />
                              </span>
                            </label>
                            <label className="matcell">
                              <span className="matlab">
                                {ROW.boughtAmount}
                                {unit ? `（${unit}）` : ""}
                              </span>
                              <span className="input-affix">
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  value={line.bought}
                                  aria-label={ROW_LABELS.boughtAmount(i + 1)}
                                  onChange={(e) =>
                                    updateLine(line.id, {
                                      bought: e.target.value,
                                    })
                                  }
                                />
                              </span>
                            </label>
                            <label className="matcell">
                              <span className="matlab">
                                {ROW.usedAmount}
                                {unit ? `（${unit}）` : ""}
                              </span>
                              <span className="input-affix">
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  value={line.used}
                                  aria-label={ROW_LABELS.usedAmount(i + 1)}
                                  onChange={(e) =>
                                    updateLine(line.id, { used: e.target.value })
                                  }
                                />
                              </span>
                            </label>
                          </div>

                          <p className="matcost">
                            {ROW.costPrefix} <b>{costLabel}</b>
                            {cost === 0 && (
                              <span className="matcost-hint">
                                {ROW.costHint}
                              </span>
                            )}
                            {overUse && (
                              <span className="matcost-warn">
                                {ROW.overUseWarn}
                              </span>
                            )}
                          </p>
                        </div>
                      );
                    })}

                    {undoable && (
                      <p className="matundo">
                        <span>
                          「{undoable.line.name || UNDO.unnamed}」
                          {UNDO.suffix}
                        </span>
                        <button
                          type="button"
                          className="matundo-btn"
                          onClick={undoRemove}
                        >
                          {UNDO.action}
                        </button>
                      </p>
                    )}

                    {/*
                      ライブ領域は「先に DOM に在り、あとから中身が変わる」形でないと
                      読み上げが発火しない（app/page.tsx の .share-status と同じ作法）。
                      条件マウントにすると、①告知が読まれない ②入力し終えた瞬間に
                      案内ぶんの高さが消えて入力欄が跳ねる（実測 137.7px）の2つが起きる。
                      説明対象の数字（材料費の合計）の直前に置き、入力欄より下にする。
                    */}
                    <p className="matempty" role="status" aria-live="polite">
                      {materialsTotal === 0 && (
                        <>
                          <b>{EMPTY_NOTICE.title}</b>
                          <span>{EMPTY_NOTICE.body}</span>
                          <span className="matempty-back">
                            {EMPTY_NOTICE.back}
                          </span>
                        </>
                      )}
                    </p>

                    <div className="matfoot">
                      <button
                        type="button"
                        className="btn btn-ghost matadd"
                        onClick={addLine}
                      >
                        {FOOT.add}
                      </button>
                      <p className="mattotal">
                        {FOOT.total}
                        <b>{formatYen(materialsTotal)}</b>
                      </p>
                    </div>
                  </div>
                )}
              </div>

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
              最新の値は各サービスの公式ページでご確認ください。売れ行きや収益を保証するものではありません。
            </span>
          </div>
        </section>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: toJsonLd(FAQ_LD) }}
        />
        <section className="faq wrap-narrow" aria-labelledby="faq-title">
          <h2 id="faq-title">値付けのよくある質問</h2>
          <p className="faq-lead">
            {"「原価の何倍で売る？」「工賃は時給いくら？」。作りはじめた人がつまずきやすいところを、計算のしかたと一緒にまとめました。"}
          </p>
          {/* 値付けの考え方と、このツール自体の話は別のものなので群に分ける。
              先頭の1件だけ開いておく（全部畳むと見出しの列に見えて、中身があること
              自体が伝わらない）。開いた行は値札の地色を敷いて、同じ一覧の一行だと分かるようにする。 */}
          {FAQ_GROUPS.map((group, gi) => (
            <div className="faq-group" key={group.title}>
              <h3>{group.title}</h3>
              {group.items.map((f, i) => (
                <details key={f.q} open={gi === 0 && i === 0}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
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
