#!/usr/bin/env bash
# 共有カード（og:image）を scripts/og-card.html から public/og.png へ書き出す。
#
#   ./scripts/og-card.sh
#
# og-card.html を直したら必ずこれを流し、書き出した public/og.png も一緒にコミットする
# （画像は静的に配信するため、コミットされた PNG がそのまま公開物になる）。
# 書き出し後は必ず目視で確認する（文字の見切れ・重なりはビルドでは検出できない）。
set -euo pipefail

cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
if [ ! -x "$CHROME" ]; then
  echo "Chrome が見つかりません: $CHROME" >&2
  echo "CHROME=/path/to/chrome ./scripts/og-card.sh のように指定してください。" >&2
  exit 1
fi

# 先にレイアウトを検査する（はみ出し＋主要ブロックの重なり）。寸法やファイルサイズでは
# 拾えず、目視でも実際に取りこぼした種類の破綻なので、書き出しの前段で機械的に落とす。
# 検査は書き出しと同じビューポートで行う（違うと検査と本番でレイアウトがズレる）。
# --dump-dom には検査スクリプト自身のソースも含まれるので、結果は必ず
# div#overflow-report の中身だけを取り出す（ソース中の文字列を拾わないため）。
report=$("$CHROME" --headless=new --disable-gpu --virtual-time-budget=3000 \
  --window-size=1200,630 --dump-dom scripts/og-card.html 2>/dev/null \
  | sed -n 's/.*id="overflow-report"[^>]*>\([^<]*\)<.*/\1/p' | head -1)

if [ -z "$report" ]; then
  echo "レイアウト検査の結果を取得できませんでした（og-card.html の検査スクリプトを確認してください）。" >&2
  exit 1
fi
case "$report" in
  LAYOUT_OK) ;;
  *) # &gt; などの HTML エスケープを戻してから表示する。
     echo "レイアウトが壊れています: $(printf '%s' "${report#LAYOUT_FAIL:}" \
       | sed -e 's/&gt;/>/g' -e 's/&lt;/</g' -e 's/&amp;/\&/g')" >&2
     echo "ラベルを短くする・容器の幅や余白を調整する等で解消してください（文字サイズは 28px を下回らせないこと）。" >&2
     exit 1 ;;
esac

# 古い PNG が残ったまま検査を通過しないよう、書き出し前に消す。
rm -f public/og.png

"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1200,630 \
  --screenshot=public/og.png \
  scripts/og-card.html

# Chrome は白紙や描画途中でも終了コード 0 を返しうるので、書き出したものを検査する。
# 目視の前段として、寸法とファイルサイズという機械で見える壊れ方だけ先に落とす。
width=$(sips -g pixelWidth public/og.png | awk '/pixelWidth/{print $2}')
height=$(sips -g pixelHeight public/og.png | awk '/pixelHeight/{print $2}')
bytes=$(wc -c < public/og.png | tr -d ' ')

if [ "$width" != "1200" ] || [ "$height" != "630" ]; then
  echo "寸法が違います: ${width}x${height}（期待 1200x630）。og-card.html の html/body のサイズを確認してください。" >&2
  exit 1
fi
# 白紙・ほぼ単色だと極端に小さくなる。実物は 30万バイト前後。
if [ "$bytes" -lt 50000 ]; then
  echo "ファイルが小さすぎます: ${bytes} bytes。白紙で書き出された可能性があります。" >&2
  exit 1
fi

echo "書き出しました: public/og.png (${width}x${height}, ${bytes} bytes)"
echo "※ 拡大して目視で確認してください:"
echo "   - 麻ひもが穴を通っているか（端がクラフト地の上に出ていないか）"
echo "   - 「材料と手間」の3つの金額の右端が揃っているか"
echo "   - パネルの下端と最下行の文字の隙間（下端固定なので、どちらかを動かすと必ずもう一方が変わる）"
