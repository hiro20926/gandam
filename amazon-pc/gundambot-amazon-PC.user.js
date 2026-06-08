// ==UserScript==
// @name         G.U.N.D.A.M. Bot - Amazon購入 [PC版]
// @namespace    gundam-bot.amazon.pc
// @version      1.0.1
// @description  Amazon.co.jp 直販オンリーの自動購入【PC版 / Chrome + Tampermonkey】複数商品の巡回購入対応。iOS v0.3.9.0 ベース
// @author       HIRO
// @match        https://www.amazon.co.jp/*
// @match        https://*.amazon.co.jp/*
// @updateURL    https://raw.githubusercontent.com/hiro20926/gandam/main/amazon-pc/gundambot-amazon-PC.user.js
// @downloadURL  https://raw.githubusercontent.com/hiro20926/gandam/main/amazon-pc/gundambot-amazon-PC.user.js
// @run-at       document-start
// @grant        none
// ==/UserScript==
//
// ============================================================
//  ★ PC版 (Chrome + Tampermonkey 専用) ★
//  - iOS版(@namespace gundam-bot.amazon / iPhone)とは完全別管理
//  - PC版独自バージョン: PC-1.0.0 〜 (iOS の 0.3.9.x とは別系列)
//  - PC版固有機能: 複数商品の巡回購入 (🔄巡回購入)
//  - 更新: デスクトップの gundambot-amazon-PC.user.js を上書き
//          → Tampermonkey「最終更新を確認」で1クリック反映
// ============================================================

// ==================================================================
// Build:    2026-06-07 (JST)
// Version:  v0.3.9.0 (CSV に buynow_url 復活 = PC版TRANS-AMとの双方向データ連携)
//
// v0.3.9.0 (2026-06-07 PC版TRANS-AM連携):
//   CSV書き出し/取込に buynow_url 列を復活(列: asin,product_name,buynow_url,saved_at,address_id)。
//   - 書き出し: 保存済み B方式URL(LB_AM_BUYNOW_URL_<asin>)があれば出力
//   - 取込: buynow_url があれば LB_AM_BUYNOW_URL_<asin> に復元(TRANS-AM可として)、無ければ ASIN_ONLY
//   → PC版(amazon_transam)とCSVで双方向にやり取り可能。PCが吐いたCSVもiOSで取り込める
//     (watch 等の余分な列はヘッダ名ベース解析なので無視される)。
//
// v0.3.8.99 (購入ロジック不整合修正: 注文成功検出を qty_stop の外=最優先へ)
//
// v0.3.8.99 (2026-06-07 HIRO 指摘「確定前で止まる」の根本=購入ロジック不整合):
//   不整合: 「直近 click + 数量更新 = 注文成功」の検出が if(getEffectiveQtyStop()) の
//           中にしか無く、qty_stop=OFF だと素通り → 確定成功後もループ継続。
//           = ①「確定前で止まる」誤解 ②二重購入リスク(実害は Amazon 側ガードで低)。
//   修正: 成功検出(wasRecentClick → 完全停止)を qty_stop 分岐の外・最優先に移動(2箇所:
//         handleStockOutBuyNow 同期チェック / OTHER 同期チェック)。
//   効果: 確定成功で qty_stop ON/OFF どちらでも確実に停止。
//         確定前の在庫チラつきは qty_stop=OFF なら従来どおり粘る(2段階リリース維持)。
//
// v0.3.8.98 (2026-06-07 HIRO 報告 3点):
//
// v0.3.8.98 (2026-06-07 HIRO 報告 3点):
//   ① ⚙設定ボタンが無反応 → 修正:
//      v0.3.8.96 の ⚙ ダイアログが escHtml() を参照していたが、escHtml は
//      商品データパネル内のローカル定義でこのスコープに存在せず、ReferenceError →
//      try/catch に飲まれてダイアログが出ず「ボタンが死んでる」状態だった。
//      → ⚙ ハンドラ専用の esc() を定義して解決。Discord webhook 設定が開けるように。
//   ② 🛒新規開始で商品データに登録されない → 修正:
//      新規開始した時点で ASIN を LB_AM_ASIN_ONLY_<ASIN> で候補登録。
//      TRANS-AM URL 未取得でも「📦商品データ」に「🔒 URL未取得」として残る。
//      後で URL が取れれば自動で「⚡TRANS-AM 可」に昇格。
//   ③ 確定前で止まるパターン増加 → 解析のみ(購入ロジックは未変更):
//      ログ上、itemselect/Chewbacca 画面で「数量更新」(在庫が瞬間枯渇)を検出 →
//      qty_stop=OFF のためループ継続 = 確定に至らず。在庫争奪が主因。
//      対処方針は HIRO と相談の上で別途(購入ロジックは慎重に扱う)。
//
// v0.3.8.97 (2026-06-07 リポジトリ整理):
//
// v0.3.8.97 (2026-06-07 リポジトリ整理):
//   gandam リポジトリ(全bot統合)で Amazon を直下 → amazon/ サブフォルダに移動。
//   pb-cart/ londo-bell-mobile/ と構成を揃える。
//   @updateURL/@downloadURL を amazon/gundambot-amazon.user.js に変更(URL変更・要再インストール)。
//   機能・ロジックは v0.3.8.96 から無変更(配置と更新URLのみ)。
//
// v0.3.8.96 (2026-06-07 設定アーキテクチャ整理・GitHub自己完結化):
//
// v0.3.8.96 (2026-06-07 設定アーキテクチャ整理・GitHub自己完結化):
//   URLパラメータ + Netlify注入を廃止し、設定をアプリ内に集約 (購入bot/amazon/ で管理)。
//   ① Discord webhook → 端末ローカル(localStorage KEY_DISCORD_WEBHOOK)に保存
//      - getDiscordWebhook()/setDiscordWebhook() 新設、公開ファイルには秘密ゼロ
//      - sendToDiscordRaw / notifyDiscord / sendLogsToDiscord / 起動ログ を getter 参照に
//   ② ⚙設定ボタン → 内蔵ダイアログ(webhook 入力/クリア)に変更 (Netlify設定ページ廃止)
//   ③ 設定値の確定 (HIRO 棚卸し決定):
//      - skip_confirm = 常に true (確認ダイアログ廃止)
//      - verbose_aod_debug = false 固定 / timer = 廃止 / interval=500・max=0 内部固定
//      - qty_stop = パネルトグルのみ (既存)
//   ④ 配布 = 自己完結1ファイル (gundambot-amazon.user.js) を GitHub raw へ。生成時に
//      __INJECT__ をリテラル化 (skip_confirm=true / webhook="" 等)。Netlify完全不要。
//   購入ロジック(TRANS-AM/attemptPurchase/handleStockOutBuyNow/#gta/画像取得)は無変更。
//
// v0.3.8.95 (2026-06-07 GitHub 配信へ移行):
//
// v0.3.8.95 (2026-06-07 Netlify 凍結対策で GitHub 配信へ移行):
//   配信先を Netlify → GitHub (hiro19830815/amazonbot) に変更。
//   - @updateURL / @downloadURL を GitHub raw に設定 → Userscripts が自動更新を検知
//   - Discord webhook(秘密)は公開ファイルに含めない(空)。通知不要 or 端末ローカル設定で対応。
//   - 機能・ロジックは v0.3.8.94 から無変更 (ホスティング移行のみ)。
//
// v0.3.8.94 (2026-06-06 HIRO 指摘「すでに誤って拾った分はどうする?」):
//
// v0.3.8.94 (2026-06-06 HIRO 指摘「すでに誤って拾った分はどうする?」):
//   v0.3.8.93 で抽出ロジックは修正したが、既に保存済みの誤画像(バンダイロゴ)は
//   🏠 ダイアログが優先表示するため直らなかった。
//   → 起動時に LB_AM_PRODUCT_IMG_* を 1 回だけ全クリア (LB_AM_MIG_IMG_V93 フラグ)。
//     次に 🏠 / 商品ページ訪問で修正済みロジックが正画像を取り直す。
//     画像は飾り用データのみ・再取得軽量なので全消去で安全。
//
// v0.3.8.93 (2026-06-06 HIRO 報告「画像自動取得が青いバンダイのアイコンしか拾わない」):
//
// v0.3.8.93 (2026-06-06 HIRO 報告「画像自動取得が青いバンダイのアイコンしか拾わない」):
//   原因: 背景 fetch したHTMLは og:image が空。v0.3.8.91 は失敗時に
//         「最初の /images/I/ 画像」を拾うフォールバック → それがブランドロゴ
//         (青いバンダイのアイコン) だった。
//   実HTML検証で判明: 商品メイン画像は data-a-dynamic-image 属性内
//     ({"https://m.media-amazon.com/images/I/61Mk+XIPdmL._AC_SS288_.jpg":[288,288],...})
//   修正:
//     ・pickLargestDynamicImage(): data-a-dynamic-image から最大解像度URLを抽出
//     ・upscaleAmazonImg(): サイズトークンを ._AC_SL600_ に書換え高解像度化
//     ・fetchProductMeta / extractProductImage 共に data-a-dynamic-image を最優先に
//     ・「最初の /images/I/」フォールバックを撤去 (ロゴ誤取得の元凶)
//     ・商品名も og:title→productTitle→画像alt→<title> の多段フォールバックに強化
//
// v0.3.8.92 (2026-06-06 HIRO 指示「TRANS-AM 優先、条件が無ければ新規開始」):
//
// v0.3.8.92 (2026-06-06 HIRO 指示「TRANS-AM 優先、条件が無ければ新規開始」):
//   #gta 自動発火の分岐を変更 (mode=STOPPED 前提):
//     ・保存 TRANS-AM URL あり → startPurchaseTransAm() (⚡最速・優先)
//     ・保存 URL なし          → startPurchase() (通常購入=新規開始にフォールバック)
//   旧: URL 未記録なら発火せずトースト案内のみ → 新: 新規開始で必ず動く。
//   付随: 🏠 アイコン用URL ボタンを全商品で表示 (不可商品でもアイコンが作れる)。
//   利点: 可商品は最速、不可商品でもアイコンタップで通常購入が走る。
//        可商品でも万一 URL が無効化されていれば新規開始に自動退避(堅牢性UP)。
//   mode≠STOPPED の時だけ横取り防止でスキップ、は据え置き。
//
// v0.3.8.91 (2026-06-06 HIRO 要望「商品ページを開かなくても 🏠 で画像を表示したい」):
//
// v0.3.8.91 (2026-06-06 HIRO 要望「商品ページを開かなくても 🏠 で画像を表示したい」):
//   - fetchProductMeta(asin): 商品ページHTMLを背景 fetch(同一オリジン=CORSなし、画面遷移なし)
//     → og:image / og:title を正規表現抽出 → 画像URL・商品名を取得
//   - 🏠 ダイアログ: 保存済みがあれば即表示、無ければ「取得中…」→ fetch完了で差し替え + 保存
//     → 商品ページを一度も開いていない商品でも、🏠 を押すだけで画像・名前が出る
//   - 商品名コピーボタンは常時表示(名前が後から fetch で入るケースに対応)
//   タップ→自動 TRANS-AM 本体・#gta・Amazon直URL は無変更。
//
// v0.3.8.90 (2026-06-06 HIRO 指摘):
//
// v0.3.8.90 (2026-06-06 HIRO 指摘):
//   ① 「ドラッグ選択コピーはミスのもと → コピーボタンを作って」
//      → 🏠 ダイアログに「📋 ① URLをコピー」「📋 ② 商品名をコピー」ワンタップボタンを追加。
//        textarea ドラッグ選択を廃止。押すと「✅コピー完了」表示 (2秒で戻る)。
//   ② 「アイコンを URL に埋め込めないか」
//      → iOS 仕様上 不可。ショートカットのアイコンは Photos/ファイルから手動選択。
//        ダイアログにその旨明記。商品画像は長押しで写真保存できるよう表示。
//   #gta=1 / Amazon 直 URL / 自動発火ロジックは無変更。
//
// v0.3.8.89 (2026-06-06 HIRO 指摘 2点で方式確定):
//
// v0.3.8.89 (2026-06-06 HIRO 指摘 2点で方式確定):
//   ① 「Netlify 経由(ta.html)だとアカウント変更で全部壊れる」
//   ② 「アドレスバーからコピーしても #gta=1 は入らない=手作業になる」
//
//   確定方式 (二転三転の収束点):
//     ホームアイコン = iOS ショートカット「URLを開く」+ Amazon 直 #gta URL
//       https://www.amazon.co.jp/dp/<ASIN>?m=AN1VRQENFRJN5#gta=1
//     - amazon.co.jp しか参照しない → Netlify アカウント/サイト変更でも壊れない
//     - ショートカット「URLを開く」は本物の Safari を起動 → 拡張注入される(枠なし問題回避)
//     - Web 版「ホーム画面に追加」は HIRO 端末でスタンドアロン化し拡張不発 = 不採用確定
//
//   🏠 ボタン改修 (ta.html ランチャー方式 v0.3.8.88 を撤回):
//     - #gta=1 込みの Amazon 直 URL を丸ごとクリップボードにコピー (手作業の #gta 入力ゼロ)
//     - 商品画像 (extractProductImage / LB_AM_PRODUCT_IMG_<ASIN>) を表示 → 長押しで写真保存
//     - 商品名を表示 → ショートカットのアイコン名に
//     - ショートカット作成手順をダイアログ表示
//   ※ ta.html はサーバーに残すが未使用 (Netlify 依存を運用フローから排除)
//
//   #gta=1 自動発火ロジック (v0.3.8.87) は無変更。本体「タップ→全自動」は既に動作する。
//
// v0.3.8.88 (2026-06-06 HIRO 報告「Amazon直接ホーム追加は枠なしで開く(❌)」):
//
// v0.3.8.88 (2026-06-06 HIRO 報告「Amazon直接ホーム追加は枠なしで開く(❌)」):
//   原因: Amazon の HTML がスタンドアロン宣言を持ち、iOS がそれを掴む
//         → アイコンが Safari 枠なしで開く → Userscripts 拡張が注入されない → 不発
//   ※ JS から「ホーム画面に追加」画面を出す API は iOS に存在しない (Apple 制約)。
//     最後の「共有→ホーム画面に追加」だけはどの方式でも手動 (不可避)。
//
//   解決: 自前ランチャーページ ta.html を新設 (サイト直下に配置)
//     ① ta.html はスタンドアロン宣言を一切持たない → 通常 Safari タブで開く
//     ② 万一スタンドアロンで開いても、別ドメイン amazon.co.jp へ転送する瞬間に
//        iOS が Safari に弾き出す = 二重保険で必ず拡張が動く
//     ③ ?setup=1 で開くと history.replaceState でアドレスバーをクリーン URL に書換
//        → その状態で「ホーム画面に追加」すると iOS はクリーン URL を取り込む
//        → アイコンタップ時は setup なし = #gta=1 付き Amazon へ自動転送
//     ④ 転送先は dp/<検証済み10桁ASIN> 固定 (オープンリダイレクト防止)
//     ⑤ apple-touch-icon に CB ロゴ (ta-icon.png) → アイコン画像付き
//
//   商品データ 🏠 ボタン: ショートカット手順表示 → ランチャーセットアップへ navigate に変更。
//   HIRO 手作業は「🏠押す → セットアップ開く → 共有→ホーム画面に追加」のみ。ショートカット App 不要。
//
//   #gta=1 検知・自動発火ロジック (v0.3.8.87) は無変更。ランチャーはその入口を作るだけ。
//
// v0.3.8.87 (2026-06-06 HIRO 構想「TRANS-AM 進化型: アイコンタップで即TRANS-AM」):
//
// v0.3.8.87 (2026-06-06 HIRO 構想「TRANS-AM 進化型: アイコンタップで即TRANS-AM」):
//   iOS ショートカット App「URLを開く」アクションでホーム画面アイコン化し、
//   タップ一発で対象商品の TRANS-AM を自動起動する仕組み。
//   実機検証済: ショートカット経由で Safari 起動 → Userscripts 拡張が注入される。
//
//   ① #gta=1 ハッシュフラグ:
//      - ホームアイコン URL = amazon.co.jp/dp/<ASIN>?m=AN1VRQENFRJN5#gta=1
//      - document-start (IIFE 冒頭) で location.hash を即捕捉 → window.__gbot_gta_requested__
//        (Amazon の history.replaceState で hash が消える前に退避)
//      - hash は server に送られない = 検知シグナルにならない
//
//   ② main() で自動発火 (全条件を満たす時のみ、安全側):
//      - #gta あり / 商品ページ / mode=STOPPED / 保存 TRANS-AM URL あり / 未発火
//      → startPurchaseTransAm() を自動呼び出し (= ⚡ボタンと完全同一経路)
//      - 即発動 (HIRO 確定仕様、キャンセル猶予なし、誤タップは🛑で停止)
//      - mode≠STOPPED なら横取りせずスキップ / 保存 URL なしなら案内のみ
//
//   ③ 商品データに「🏠 アイコン用URL」ボタン (TRANS-AM 可の商品のみ):
//      - #gta=1 付き URL を生成 → クリップボードコピー + 全文表示
//      - ショートカット作成手順をダイアログ表示 (HIRO が URL を覚える必要なし)
//
//   TRANS-AM コア (startPurchaseTransAm / tryInstantBuyTransAm) には一切触れていない。
//   #gta 検知 → 既存の⚡ボタン経路を叩くだけの純粋な追加機能。
//
// v0.3.8.86 (2026-05-30 HIRO 報告 「エラーでたよ どういうこと?」):
//
// v0.3.8.86 (2026-05-30 HIRO 報告 「エラーでたよ どういうこと?」):
//   v0.3.8.85 の in-memory cache は 同一タブ + 同一ページ では効くが、
//   TRANS-AM navigate (location.href = ...) でページが変わると失われる。
//   ログ解析で navigate 越境後に mode=RUNNING, session=null になり完全停止を確認。
//
//   ① 根本原因 (確定):
//      - LOG_MAX_AM=5000 で LOG_KEY_AM が 1.4-1.5 MB に膨張
//      - iOS Safari + Userscripts 拡張の localStorage 実効容量を圧迫
//      - setMode (7 bytes) は成功するが setItem(KEY_V2_SESSION, ~200 bytes) が silent fail
//        (QuotaExceededError を投げずに無視する iOS Safari quirk)
//      - 結果: navigate 後にも session が復元されず完全停止
//
//   ② 修正 A: sessionStorage バックアップ (主救済)
//      - startNewSession / updateSession で localStorage + sessionStorage 両方書き
//      - getSession で localStorage 空 → sessionStorage 復元 (session-recovery warn ログ)
//      - sessionStorage は same-tab navigation 越境で persist する仕様
//      - localStorage が quota fail しても sessionStorage が救済
//      - clearSession / opFullStop で両方削除
//
//   ③ 修正 B: LOG_MAX_AM 5000 → 2000 (quota 根本対策)
//      - 1 件 ~400 bytes × 2000 = 800 KB に削減
//      - CRITICAL バッファ (1000 件) は維持 → 重要イベントは保護される
//      - HIRO 「1000-2000 でいい」発言に沿う方向
//
//   ④ 診断ログ強化:
//      - 新規セッション開始 ログに ssStorageOk フラグ追加 (sessionStorage 成否)
//      - getSession で localStorage→sessionStorage 復元時に warn ログ
//
// v0.3.8.85 (2026-05-29 HIRO 報告 「トランザムうまくうごかなくなったぞ?壊したろ?」):
//   ① 原因:
//      - 23:25:18 に v0.3.8.80 が amazon.co.jp/ で並行起動 (古いタブ残置)
//      - 23:25:19.241 v0.3.8.84 で startPurchaseTransAm → session 書き込み (mode=RUNNING も成功)
//      - 23:25:19.243 (2ms 後) handleProductPage で session=null → 完全停止
//      - 同期 setItem 直後の同期 getItem で値が消えるのは iOS Safari 既知の
//        マルチタブ + 大容量 LOG_KEY_AM (1.4MB) によるクォータ競合の可能性
//
//   ② 修正 A: in-memory session キャッシュ追加
//      - getSession()    : _sessionCache 優先、null なら localStorage 読み
//      - startNewSession : 書き込み + キャッシュ同期 (storageOk フラグもログ)
//      - updateSession   : 書き込み + キャッシュ同期
//      - clearSession    : 削除 + キャッシュ null
//      → localStorage 書き込みが失敗しても同一タブ内では session 維持
//      → ナビゲーション越境は localStorage で従来通り
//
//   ③ 修正 B: _writeJSON 失敗時に storage-fail カテゴリで診断ログ
//      - 旧: silent return false (QuotaExceededError を黙殺)
//      - 新: console.warn + logAm (再帰防止フラグあり) で warn 出力
//      → 今後同種エラー発生時に原因即特定可能
//
//   v0.3.8.84 startPurchaseTransAm は 1 行も変更してない (HIRO「壊したろ?」の濡れ衣晴らし用に明記)
//
// v0.3.8.84 (2026-05-28 HIRO 報告):
//   ① 🛒 新規開始ボタンが商品ページ以外でも押せてしまうバグ:
//      旧: S.opStart(location.href) で先にセッション作成 → screen チェック → toast + return
//          → セッションが残り、意図しない URL (cart/検索結果等) が productUrl に
//      新: screen チェックを先に → 非商品ページなら toast + return (セッション作らず)
//
//   ② 「元の商品 URL が不明 → 停止」エラー時に詳細 dump:
//      旧: error 'SESSION に productUrl がない → 完全停止' (詳細なし)
//      新: + 現在 URL / session 中身 / mode / 経過時間 / 停止フラグ 等を全部 dump
//          → 次回エラー発火時に原因を即特定可能
//
//   両方とも handleStockOutBuyNow と handleAmazonError の両方に適用。
//
// v0.3.8.83 (2026-05-27 HIRO 指示):
//   v0.3.8.82 の実測サイクル 1.4 秒は人間限界 (1.5 秒) を超えていたため中間 ~1.8 秒に調整。
//   検知シグナルは出ていないが、HIRO さんの方針「人間最速ペース ~2 秒」を尊重。
//
//   修正: handleStockOutBuyNow の readingDelayMs を 300-700ms → 900-1300ms に拡大
//        (navigate 所要 ~750ms と合算で 1.65-2.05 秒、平均 1.85 秒のサイクル)
//
//   試算:
//     旧 (v0.3.8.82): 300-700ms 読み + 750ms navigate = 1.05-1.45 秒 (avg 1.25)
//     新 (v0.3.8.83): 900-1300ms 読み + 750ms navigate = 1.65-2.05 秒 (avg 1.85) ★
//
// v0.3.8.82 (2026-05-26 HIRO 指示):
//   「人が真剣にやってできる最速レベル + 検知回避」が運用目標。
//   過去ログ実測:
//     ・5/25 の成功購入時のサイクル時間: ~2 秒/サイクル (実績ベンチ)
//     ・人間の F5 連打集中時の限界: 1.5-2 秒/refresh
//     ・oos 検出から navigate まで 14ms = 人間絶対無理な速度 (検知材料)
//     ・連投ガード 3000ms 完全固定 = 機械的パターン
//     ・oos → 商品ページ戻し → リロード × 2 → 再 TRANS-AM = 1 サイクル 4 navigate (無駄)
//
//   修正:
//   ① oos 検出→navigate を 14ms → 300-700ms ランダム化
//      → 人間が「在庫切れ画面を読む時間」を演出、最大の検知シグナル除去
//   ② oos 後の商品ページ戻し撤廃、TRANS-AM URL 直接 navigate
//      → 1 サイクル 4 navigate → 2 navigate (50% 削減)
//      → 商品ページ無駄リロード消滅、画面ちらつき解消
//   ③ 連投ガード 3000ms 固定 → 1700-2300ms ランダム化
//      → 機械的同一間隔の検知パターン消滅
//      → 平均 2 秒で過去成功実績と一致
//   ④ 10% の確率で「偽装サイクル」: oos → 商品ページ戻し → TRANS-AM
//      → 人間が「戻る」ボタン押す挙動を模倣
//
//   期待効果:
//     ・1 サイクル: 3.4 秒 → 平均 2.0 秒 (±0.3 秒) ← 過去成功時と一致
//     ・1 サイクル navigate 回数: 4 → 2 (50% 削減)
//     ・oos 読み時間: 14ms → 300-700ms (人間レベル)
//     ・タイミング均一性: 完全固定 → ランダム化 (機械パターン消滅)
//     ・在庫到達時の確定 click 速度: 維持 (1.5 秒)
//
// v0.3.8.81 (2026-05-26 HIRO 報告):
//   GP02 (B09Q6GH9HN) リストックで「変なゲージが出て待たされる + トラフィック表記」画面に
//   弾かれた。ログには /checkout/entry/waiting の URL しか残らず、ページ内容は不明。
//
//   原因:
//     screen=OTHER 画面は「main 起動」だけログするが、画面本文を記録していない
//     → 後から原因究明できない
//
//   修正:
//   ① WAITING_ROOM screen 新設
//     detectScreen で /checkout/entry/waiting を 'WAITING_ROOM' として認識。
//     handleWaitingRoom: bot は手を出さず Amazon の自動進行を待つ。
//       ・60 秒間 URL 変化を polling
//       ・進んだら通常処理に復帰
//       ・進まなければ商品ページに戻る
//     toast: 「🕐 Amazon 混雑待機室、順番待ち中…」
//
//   ② OTHER 画面の自動内容ダンプ
//     未知の URL に着地したら body テキスト先頭 500 文字をログ。
//     キーワード自動検出: トラフィック / 混雑 / お待ち / ロボット / captcha / 不測
//     → 次回同じ現象が再発したら何が原因か即特定可能
//
// v0.3.8.80 (2026-05-23 HIRO 指摘):
//   20:43:30 ログで「⛔ place-order POST が HTML 以外を返した → ダウンロードポップアップの原因」
//   が error レベルで残るが、購入は問題なく /thankyou/ 到達済。
//
//   分析結果:
//     ・form.requestSubmit() は top-frame submit (XHR ではない)
//     ・observePlaceOrderResponse の hook は XHR/fetch 経路しか見えない
//     ・つまり observer が捕捉した XHR は「本物の注文 POST」ではない
//     ・実体は Amazon のテレメトリ / 副次的な XHR (空 body + 200 OK は ping の正常応答)
//     ・v0.3.8.73 の observer 設計が naive で、無関係な XHR を「ダウンロード popup の原因」と誤判定
//     ・v0.3.8.78 の submitter 修正で popup の真の原因は解消済
//
//   修正:
//     ・place-order-non-html-response / place-order-response-body の level を
//       error → info に格下げ (実害なしの観察情報)
//     ・メッセージも「⛔ 危険」→「📋 副次 XHR 観測 (購入は別経路で完結)」に変更
//     ・observer 機能自体は残す (将来の Amazon 仕様変更時の調査用、ノイズだけ削除)
//
//   効果:
//     ・成功購入のログから「⛔ error 足跡」が完全消滅
//     ・「ログに error/warn = 何かあった」のシンプル判定が成立
//     ・購入動作には一切影響なし (observer は読み取り専用、フラグ等も追加しない)
//
// v0.3.8.79 (2026-05-23 HIRO 報告):
//   現象: AOD カート追加 API 200 OK (サーバー側ではカート追加成功) なのに、
//        /gp/cart/view.html を開くと「カートは空です」表示 → bot が「失敗」と
//        誤判定して完全停止 → ループ続行できず買えない
//
//   ログ抜粋 (19:24:40-41):
//     40.613 AOD 走査: found=true ¥1,540 (Amazon.co.jp 直販)
//     40.745 AOD click 投入 (カートに追加)
//     40.748 ✅ TRANS-AM URL 保存 (offerListingId 抽出成功)
//     41.154 xhr POST /cart/carts/retail/items → 200 ← カート追加成功
//     41.201 sessionID/customerId 取得失敗 → cart 画面経由 (API 経路) ← 問題
//     41.506 main screen=CART at /gp/cart/view.html
//     41.678 error cart カートが空 → カート追加失敗の可能性、停止
//     41.678 mode RUNNING → STOPPED + STOPPED → PAUSED
//
//   真の原因:
//     ① iOS Safari の session-id / x-main cookie は HttpOnly → JS から読めない
//     ② buildDirectCheckoutUrl() は cookie 必須 → null を返す
//     ③ fallback で /gp/cart/view.html を開く
//     ④ ところがその cart 画面で「空」表示される (Chewbacca anti-bot session で
//        別カートが見えてる可能性 / iOS Safari のセッション同期問題)
//     ⑤ handleClassicCart の「空カート」safety check が発動 → 停止
//
//   bot 検知の故意ではなく、iOS Safari の cookie 仕様と bot の fallback の組み合わせ。
//
//   修正:
//     ① clickAodAmazonOffer の API 200 bypass で、buildDirectCheckoutUrl=null 時に
//        **保存済 TRANS-AM URL** を fallback として優先使用
//        (TRANS-AM URL = /checkout/entry/buynow?asin.1=...&offerListing.1=...&addressID=...)
//     ② DOM 検出経路 (viewCartBtn visible) の同 fallback も同様に改修
//     ③ 両方無ければ最終 fallback で /gp/cart/view.html (旧動作維持)
//
//   期待効果:
//     ・/gp/cart/view.html を経由しない → カート空問題が回避される
//     ・TRANS-AM URL は直接 Express Checkout に向かう (auto-purchase 経路と同じ)
//     ・bot の停止が消え、ループが正常に継続
//
// v0.3.8.78 (2026-05-23 HIRO ログ精査結果):
//   v0.3.8.77 で取れた完全なログ (14:41:54-14:42:03) から原因特定:
//
//   ログから読み取れた事実:
//     14:41:56.026 order-confirm click 投入 fired=["form.requestSubmit()"]
//                  ← submitter 引数なし!
//                  ← placeBtn は tag=FORM (id=place-order-form)
//     14:41:59.037 click 投入後 3秒観察 urlChanged=false buttonStillVisible=true
//                  ← Safari ダウンロード popup 表示
//     14:42:02.643 reload → /checkout/p/.../itemselect?pipelineType=Chewbacca
//                  ← Amazon anti-bot レビュー画面へ強制ルーティング
//     14:42:03.443 「数量更新」検出 → qty_stop=ON で完全停止
//                  ← 注文は確定済 (Amazon 重複防止メッセージ = 成功証拠)
//
//   原因:
//     ① findPlaceOrderButton が tag=FORM を返した (内部 submit input は visibility:false
//        だったので resolveToSubmitButton が form 自体を返した)
//     ② aggressiveClickBtn のパス2 (FORM 直接) は `form.requestSubmit()` を引数なしで実行
//     ③ 引数なし requestSubmit は POST に submitter 情報 (placeYourOrder1=...) を載せない
//     ④ Amazon は「submitter 無し POST」を「不審な submission」と判定 → 応答形式変則
//        + 後続を Chewbacca anti-bot パイプラインへ強制ルーティング
//     ⑤ Safari は変則応答 (おそらく non-HTML content-type) を file 扱い → download popup
//     ⑥ 注文自体は Amazon サーバー側で確定 (POST data 自体は valid)
//
//   修正 A (主修正): aggressiveClickBtn パス2 で submitter を必ず注入
//     placeBtn が FORM の場合、内部の submit input/button を visibility 無視で探し、
//     submitter として requestSubmit に渡す。
//     検索順:
//       input[type="submit"][name*="placeYourOrder"]  (Amazon 正規 submitter)
//       button[type="submit"][name*="placeYourOrder"]
//       input[type="submit"][name]
//       button[type="submit"][name]
//       input[type="submit"]
//       button[type="submit"]
//     どれも無ければ最終 fallback で引数なし submit (現状動作維持)
//
//   修正 A は handleInIframe 内の同一パス (iframe context) にも適用。
//
//   修正 B: click 投入後の観察を 3 秒 → 5 秒に延長
//     Safari の download popup が表示中は JS 実行が一時停止する可能性。
//     3 秒で判定すると「空発火」と早合点 → 商品ページに戻ってループ。
//     5 秒待てば popup を dismiss する余裕も生まれ、urlChanged の検出機会も増える。
//
//   修正 C: 「空発火後 60 秒以内に qty_update 検出」を成功扱いに昇格
//     ログから判明: 数量更新メッセージは "もう買えてる" の証拠。
//     直前に order-confirm click を撃ってる場合、qty_update は重複防止メッセージ。
//     「✅ 1回目の注文成功確認 (重複防止経由判定)」と表示。
//
//   期待効果:
//     ・submitter 付き正規 POST → Safari が正常 HTML 応答を受け取る → /thankyou 自動遷移
//     ・ダウンロード popup 消滅
//     ・Chewbacca への強制ルーティング消滅
//     ・bot 検知の主要シグナルが 1 個消える
//     ・連続購入が正常に成立する可能性大幅向上
//
// v0.3.8.77 (2026-05-23 HIRO 指示):
//   「ログを 300 件しか残さないのは少なすぎる。1000, 2000 と増やすべき。
//     重要なところだけでなく、細かいところも把握できるように」
//
//   修正:
//     ① LOG_MAX_AM: 2000 → 5000 件
//        (全イベント保持、bot 検知などの細かい挙動も追跡可能に)
//     ② LOG_MAX_AM_CRITICAL: 500 → 1000 件
//        (5000 件溢れに対する保険、長時間連続稼働対策)
//     ③ saveLogAm を 500ms throttle に変更
//        大バッファで logAm() が毎回 JSON.stringify + setItem すると遅くなる
//        (5000件×500B=2.5MB を毎ログ書き込みは数十ms かかる)
//        → メモリには即追加、localStorage には 500ms 遅延書き込み
//        ページ unload/navigate 直前の保存漏れを防ぐため beforeunload で flush
//
//   容量試算:
//     1件 平均 ~500 bytes (JSON 含む)
//     5000件 × 500B = 2.5 MB
//     localStorage 上限 (iOS Safari): 約 5-10 MB → 余裕あり
//
// v0.3.8.76 (2026-05-23 HIRO 報告):
//   症状: ①「数量更新で停止」が機能していない (qty メッセージ出てもループ継続)
//        ②「8:09 / 9:39 の自動購入は成功」しているのに order-confirm 等のログが
//          1件も残っていない (bot 検知の原因究明ができない)
//
//   原因分析:
//   ① Promise.race の順序問題
//     handleStockOutBuyNow の Promise.race で stockOutText が qtyUpdateText より
//     先に登録されており、数量更新画面で「商品を更新する」(Amazon の項目編集ボタン)
//     のテキストが両方マッチ → waitForText は initial check() で synchronous resolve
//     → microtask キュー順で先勝ち → qty 分岐に入らずストック切れ扱いでループ
//
//   ② 「商品を更新する」誤検出
//     /checkout/p/.../itemselect?pipelineType=Chewbacca (Amazon の正規 SPC レビュー画面)
//     に「商品を更新する」(項目編集 UI) が出る → 在庫切れと誤判定 → 商品ページに戻り
//     ループ。HIRO さんが画面を見守っているケースのみ手動補助で成功するが、本来は
//     bot が自動で「注文を確定」まで進めるべき。
//
//   ③ LOG_MAX_AM = 300 件は少なすぎる
//     各 main 起動で 10-20 ログ → 数十秒で 300 件溢れ → 重要イベント (order-confirm,
//     click 投入, thankyou) が shift() で消失。8:09 / 9:39 の購入確定ログが見えない
//     のはこれが原因。bot 検知の原因究明にも支障。
//
//   修正:
//   修正 A (qty_stop 機能不全):
//     handleStockOutBuyNow の冒頭で qty メッセージを **同期 pre-check** で最優先判定。
//     Promise.race に頼らないので順序問題が解消する。検出時は qty_stop に従って即
//     完全停止 or 警告継続。getEffectiveQtyStop() で localStorage override 反映。
//
//   修正 B (「商品を更新する」誤検出):
//     stockOutText パターン /在庫切れ|お取り扱いできません|取り扱いできません|商品を更新する/
//     から `商品を更新する` を削除。OTHER スクリーン再判定 (Line 13146) も同様に修正。
//     これで Chewbacca SPC レビュー画面が在庫切れ扱いされなくなり、自動 confirm まで
//     進めるはず。
//
//   修正 C (ログ消失):
//     LOG_MAX_AM 300 → 2000 に拡大。加えて重要タグ
//     (order-confirm / order-confirm-debug / order-confirm-recovery / iframe-postmsg /
//      qty-update / amazon-error / signin / handler / completed) は別バッファに永続保持。
//
// v0.3.8.75 (2026-05-23 HIRO 指示):
//   amazon.html のチェックは「インストール時の初期値」のみで、運用中に切り替える
//   にはインストールし直しが必要だった。HIRO 要望でリストック初日 (2 段階リリース)
//   と通常運用を即時切替できるよう、右下パネルにトグルボタンを追加。
//
//   実装:
//     - 新ボタン #lb-am-btn-qty-stop (📦商品データの直前に挿入)
//     - localStorage 'LB_AM_QTY_STOP_OVERRIDE' で永続化 ('1' / '0' / null=default)
//     - getEffectiveQtyStop() ヘルパで CONFIG.qtyStop と override を合成
//     - ボタン表示は現在状態で変化:
//         ON  : 🛑 数量更新:停止 (赤系)
//         OFF : 🚫 数量更新:無視 (橙系、リストック初日向け)
//     - performOrderConfirm / handleStockOutBuyNow の qtyStop 参照を全置換
//
// v0.3.8.74 (2026-05-23 HIRO 指示):
//   背景: v0.3.8.70-73 で速度を上げすぎて Amazon の bot 検知が反応した可能性
//        (404「ページが見つかりません」/「不測のトラフィック」/ CAPTCHA / ダウンロード popup)
//
//   修正①: 案C 速度復元 (人間到達可能領域に減速)
//     - aggressiveClickBtn パス1 + handleInIframe パス1: sleep(100) → sleep(300)
//       hidden input 動的注入の完了をより確実に待つ。300ms は人間反応速度の上限。
//     - 確定 click 後のリカバリパス (D-1 dispatchEvent / D-2 click 直接) を撤去。
//       v0.3.8.65 と同じく form.requestSubmit(submitter) 単発のみ、失敗時は
//       D-3 (商品ページに戻ってループ継続) に直行。多重発火による submit data
//       破壊リスクを排除。
//     - attemptPurchase Buy Box waitForVisible タイムアウト 1500ms → 2000ms。
//       商品名 (~500ms) + 300ms より長く待つことで「Buy Box 遅延ロード商品」
//       を取りこぼさない。
//
//   修正②: 数量更新メッセージ検出 (qty_stop パラメータ制御)
//     検出文言: 「リクエストされた数量は入手できなくなりました」
//              「入手可能な最大数に数量を更新しました」
//     - CONFIG.qtyStop=true (画面チェック ON): opFullStop + Discord 通知
//     - CONFIG.qtyStop=false (画面チェック OFF): 警告ログのみ、ループ継続
//     ※リストック初日は Amazon が 2 段階リリースを行うので OFF が必要なケースあり
//     - amazon.html に qty_stop チェックボックス追加
//     - amazon_userscript.js (Netlify Function) に true 注入
//
//   修正③: 犬画面 (404 ページ) 検出 → ループ継続
//     検出: kailey-kitty 画像 / 「ページが見つかりません」+「何かお探しですか?」
//     リストック前 (商品が live になる前) の暫定 404 として扱い、商品ページに戻る。
//     bot 検知ではないので opFullStop はしない。
//
// v0.3.8.73 (2026-05-22 HIRO 緊急報告):
//   症状: TRANS-AM の確定ボタン押下時にダウンロードポップアップが出て固まる
//        注文確認画面(¥XXX、注文を確定するボタン)で発生、複数回再現
//
//   原因仮説: Amazon サーバが確定 POST に対して HTML 以外 (JSON/バイナリ) を
//            返して Safari がファイル扱いしている
//
//   修正 (A+B+C 同時実装):
//
//   案A: aggressiveClickBtn パス1 + パス2 に sleep(100) 復活
//     v0.3.8.70 で sleep 完全削除 → hidden input 動的注入前に submit が原因の可能性
//     100ms 待ちで hidden input セット完了を待つ(即押し感は維持、人間反応速度内)
//     - performOrderConfirm 経由 (Line 11391 周辺)
//     - handleStockOutBuyNow → handleCheckout 経由 (Line 12253 周辺)
//
//   案B: click 投入直前 form 詳細ダンプ (order-confirm-debug タグ)
//     formId / formAction / formActionResolved / formTarget / inIframe /
//     btnId / btnName / btnValue / hiddenInputCount / hiddenInputNames
//     → 次回ログから「不正な form data」原因を完全特定可能
//
//   案C: observePlaceOrderResponse 関数新設
//     fetch + xhr hook、POST /spc/place-order のレスポンスを 10 秒間観測
//     Content-Type が HTML 以外なら place-order-non-html-response ERROR ログ
//     body 先頭 2000 文字を place-order-response-body ログに記録
//     → Amazon サーバの異常応答を完全捕捉、ダウンロード原因を直接特定
//     - performOrderConfirm の click 直前に起動
//     - handleInIframe (iframe 内) の click 直前にも起動 (iframe fetch は別 context)
//
// v0.3.8.72 (2026-05-19 HIRO ログ精査):
//   HIRO 質問「カート投下→確定までの時間」実測:
//     0ms:    AOD click 投入 (カート投下)
//     325ms:  Amazon サーバ navigate 完了 (制御不可)
//     1852ms: Express Checkout モーダル検出 (★1500ms 待ちで合計 1855ms★)
//
//   handleStockOutBuyNow 内 500ms × 10 polling が 3 回目 (1500ms) でヒット
//     = 出現タイミングが 600-1500ms の間で、polling 単位 500ms の無駄あり
//
//   修正 (v0.3.8.72): 4 並列 MutationObserver + Promise.race
//     ① iframe (turbo-checkout, bottom-sheet) visible → 確定処理
//     ② #place-order-form visible → 確定処理
//     ③ 「注文を確定」テキスト → 確定処理
//     ④ 「在庫切れ」テキスト → 商品ページ戻し
//     ⑤ タイムアウト 5 秒 → 在庫切れ扱い
//
//   期待効果:
//     旧: モーダルが 600ms で出ても 1000ms 待ち、1300ms で出ても 1500ms 待ち
//     新: 出現の瞬間に即発火、約 1 秒短縮
//
//   ログタグ: stock-out [hit=modalFrame/placeOrderForm/confirmText/stockOutText/timeout] detectedAtMs
//
//   累計効果 (v0.3.8.70 → v0.3.8.72):
//     1 件購入の合計時間 24.35秒 → 12.85秒 (約 45% 高速化、11.5 秒短縮)
//
// v0.3.8.71 (2026-05-19 HIRO ログ精査 232406):
//   ログから判明: v0.3.8.70 では毎リロードで Observer タイムアウト 1500ms 待機
//     - 全 15 サイクル中、Buy Box ボタン visible ヒット 0 回
//     - 全部 observerHit=timeout (t=1510-1774ms)
//     - 合計 ~23 秒の無駄待機 → HIRO 体感「もっさり」の正体
//
//   原因: HIRO 環境では「Buy Box DOM 自体が出ない商品」が常態
//     ?m=AN1VRQENFRJN5 強制 URL + 直販無し時、Amazon は Buy Box ボタンを表示しない
//     待っても永遠に出ない、1500ms 待ち損
//
//   修正 (v0.3.8.71): 3 並列 Observer で Promise.race
//     ① ボタン visible (#buy-now-button, #add-to-cart-button) → 直販あり (現状維持)
//     ② 「おすすめ出品なし」テキスト → 直販無し (現状維持)
//     ③ ★新★ 商品名 visible (#productTitle, h1) + 300ms 追加待ち + ボタン無し → 直販無し
//        - 商品ページの本文がロード済 = Amazon は Buy Box の出し方を決定済
//        - 出さない判断なら待っても無駄 → 即諦めて AOD ナビ
//
//   期待効果 (HIRO ログ実測ベース):
//     旧 v0.3.8.70: 直販無し時 1500ms 待機 × 15 サイクル = ~23 秒のロス
//     新 v0.3.8.71: 商品名 ~500ms + 追加 300ms = ~800ms で判定 × 15 = ~12 秒
//     ★ 毎リロード ~700ms 短縮、15 サイクルで ~10 秒短縮 ★
//
//   実装の安全性:
//     - racable() ヘルパー: null/false は無視 (確定シグナルだけ Promise.race に乗せる)
//     - ④ タイムアウト 1500ms は維持 (① も ② も ③ も発火しない場合の最終 fallback)
//     - 既存の earlyExitNoOffer フラグ + isAmazonDirectUnavailable 判定は完全維持
//
// v0.3.8.70 (2026-05-19 HIRO 指示 抜本改修):
//   「ボタン全般を確認したらフラグを動かす」「リロード時間固定はBOTっぽい」
//   「ヒッカップ入れて、BOT検知止まったら意味ない」「確定だけは即押したい」
//
//   修正① MutationObserver で DOM 変化を即購読 (polling → 0ms 遅延)
//     - 共通関数 waitForVisible(selector, timeoutMs) 新設
//     - 共通関数 waitForText(regex, timeoutMs) 新設
//     - attemptPurchase Buy Box polling → waitForVisible / waitForText 並列待ち
//     - handleSmartWagon「カートに入れました」polling → waitForText
//     - handleClassicCart「レジに進む」polling → MutationObserver 出現待ち
//     - handleAddOnUpsell「レジに進む」polling → MutationObserver 出現待ち
//
//   修正② humanReactionDelay (BOT 検知対策、HIRO 採用)
//     - 90%: 中央値 200ms、σ=50ms、min 80ms、max 350ms の正規分布
//     - 10%: 800-1500ms のヒッカップ (一瞬迷う人間の模倣)
//     - 一様分布 → 正規分布 (人間反応速度の自然な分布形)
//     - 適用箇所:
//       * expandInlineAodIfPresent click 前
//       * handleClassicCart「レジに進む」click 前
//       * handleAddOnUpsell「レジに進む」click 前
//
//   修正③ 「注文を確定する」click は即押し (HIRO 指示「確定はいらない、即押したい」)
//     - performOrderConfirm の click 前 sleep(200) を ★削除★
//     - aggressiveClickBtn 内 sleep(50+random*150) を ★削除★
//     - handleStockOutBuyNow 内の order-confirm click sleep を ★削除★
//     → ボタン検出 → form.requestSubmit() を 0ms で発火
//     → カート/レジ進む段階で人間ぽさを演じているので、最後の確定だけ即押しでも OK
//
//   修正④ リロード間隔ジッター ±30% を維持 (HIRO 指示「現状フローはそのまま」)
//     - 一旦 ±50% にしたが撤回、±30% 維持
//     - BOT 検知対策は humanReactionDelay + ヒッカップで担保
//
//   結果:
//     - ボタン検出は MutationObserver で 0ms 遅延 (理論最速)
//     - 注文確定 click は ★即発火★ (HIRO の競り合い要件)
//     - それ以外の click は人間反応速度 + ヒッカップ (BOT 検知対策)
//     - リロード間隔も ±50% で不規則化
//
// v0.3.8.69 (2026-05-19 HIRO 提案):
//   「時間ではなく、Buy Box のボタン状況を確認したらすぐにリロード」
//
//   旧設計 (v0.3.8.68): 500ms × 6 = 最大 3000ms ループ
//     i=0 (0ms) 未ロード → CONTINUE
//     i=1 (500ms) 未ロード → CONTINUE
//     ...
//     i=3 (1500ms) 未ロード → BREAK
//     ★ 500ms 単位なので、200ms でロード完了しても 500ms まで待つ無駄 ★
//
//   新設計 (v0.3.8.69): 50ms × 30 = 最大 1500ms の反応式 polling
//     即 break 条件 (確定シグナル):
//       ① seller 検出 (isDirect / sellerText あり) → 即 click 経路へ
//       ② 「おすすめ出品の要件を満たす出品はありません」テキスト出現 → 即 AOD ナビ
//     タイムアウト (1500ms 経過):
//       - ボタン両方無し → 直販なし確定 → AOD ナビ
//       - 何か表示あり → seller 再走査結果に従う
//
//   効果:
//     - 200ms でロード完了するケース → 200ms 以内で検出 (旧 500ms より 60% 短縮)
//     - 「直販なし確定テキスト」即検出 → 無駄待ちゼロで AOD へ
//     - 50ms 細分化でも CPU 負担は無視できる (setTimeout 最小 16ms より十分余裕)
//
//   ログ最適化:
//     50ms × 30 = 30 ログは冗長なので、状況キーが変化した時だけ buybox-poll 出力
//     タイムアウト時は別ログで判定結果を残す
//
// v0.3.8.68 (2026-05-19 HIRO 報告 21:29 / 22:09 ログ):
//   3 つの問題を発見・修正:
//
//   【問題A】TRANS-AM 中、確定 click + リカバリ A/B 全部空振り → opPause
//     ログ Line 142-148 (21:25:12-18):
//       click → 3 秒 urlChanged=false → リカバリ A: dispatchEvent(submit) 空振り
//                                  → リカバリ B: placeBtn.click() 空振り
//                                  → 全リカバリ失敗 → opPause
//       (同セッション 3 分後 21:28:05 では別商品で成功 → 商品/タイミング依存)
//     修正:
//       opPause → 商品ページに戻ってループ継続 (v0.3.8.50 在庫切れ処理と同じ思想)
//       HIRO 運用「止まるまでループ」に合わせる
//
//   【問題B】新規開始で Buy Box を見ずに AOD 直行
//     ログ: i=0 (0ms) → i=1 (500ms) で「ボタン無し」判定 → 即 AOD ナビ
//     原因: 早期 break 条件 `i >= 1 && (!hasBuyBtn && !hasAddBtn)` が早すぎる
//           iPhone Safari の DOM ロード遅延で 500ms ではまだ Buy Box ボタン未出現
//     修正: `i >= 1` → `i >= 3` に変更 (500ms → 1500ms 待ち)
//           Buy Box が遅れて出現するケースを取りこぼさず、それでも 1.5秒で結論
//
//   【問題C】新規開始後リロードまで止まる
//     原因: 問題B と連動。Buy Box 500ms 諦め → AOD 直行 → AOD ロード待ち 10 秒
//           = HIRO 体感「リロードまで止まる」
//     修正: 問題B 修正で連動して改善
//
//   タイミング比較 (修正前後):
//     旧: Buy Box poll 500ms → AOD 直行 (Buy Box 出る前に諦め)
//     新: Buy Box poll 1500ms → AOD 直行 (Buy Box ロード待ちあり)
//     直販オファーがある商品では明らかに新の方が拾える、無い商品でも +1000ms のみ
//
// v0.3.8.67 (2026-05-19 HIRO 質問「成功と失敗の違い」「最短 click 時間」):
//   過去ログを徹底精査 → 衝撃の事実判明:
//
//   【成功例】(gundambot-amazon-log-20260519-180626.csv Line 288-296):
//     18:05:45.760 SPC「注文を確定する」検出 (Δ0ms)
//     18:05:46.562 click 投入直前              (Δ+802ms 待機: sleep(800))
//     18:05:47.714 click 後 1 秒観察           (Δ+1152ms) → urlChanged: false
//     18:05:48.792 screen=COMPLETE (thankyou)  (Δ+1078ms) ★ 注文完了 ★
//   合計: 検出 → 完了 = 3032ms
//
//   【失敗例】(同ログ Line 152-160):
//     18:00:12.636 SPC 検出
//     18:00:13.440 click 投入直前
//     18:00:14.595 click 後 1 秒観察 urlChanged: false
//     18:00:44.462 HIRO 手動停止 (30 秒経過)
//
//   ★ 重要 ★: 「click 後 1 秒」時点では 成功・失敗 とも urlChanged=false
//     → v0.3.8.66 の「1 秒判定でリカバリ起動」は成功例も壊す危険性大
//
//   修正 (v0.3.8.67):
//     ① setTimeout(1000) → setTimeout(3000) (Amazon サーバー処理 ~2.2 秒を考慮)
//        - 3 秒経っても urlChanged=false ならリカバリ起動
//        - HIRO MEMORY 警告事項 (多重発火 → submit data 壊して不正 URL) を回避
//     ② await sleep(800) → await sleep(200) (ボタン検出 → click 投入を 600ms 短縮)
//        - verify (failsafe 全 check) 既に通過済、DOM は安定
//        - bot 検知対策の最小限のみ維持
//
//   結果: 「最短 click 時間」改善
//     - ボタン検出 → click 投入: 800ms → 200ms (-600ms)
//     - 検出 → 注文完了: 3032ms → 2432ms (-600ms)
//     - リカバリ判定: 1000ms → 3000ms (+2000ms、安全性確保)
//
// v0.3.8.66 (2026-05-19 HIRO 運用テスト報告):
//   ① AOD のカートインだけでは TRANS-AM ボタンが活性化しない
//   ② TRANS-AM 中、確定ボタンまで行ったが固まった
//
//   【問題① 真の原因】
//     Amazon の新 AOD UI は offerListingId を DOM の form 内 hidden input に持たない。
//     代わりに JavaScript が data-csa-c-id 等から動的に offerListingId を生成して
//     xhr POST body にのみ含めて送信する。
//     例: POST /cart/carts/retail/items の body =
//         {"items":[{"asin":"B09XTYF4Y1","offerListingId":"QF%2FeYR..."}]}
//     私の従来の DOM 探索 (段階1〜4 + 救済) は ★ DOM に存在しないものを探していた ★
//
//   修正①: observeNetworkAfterAodClick の xhr/fetch hook で POST body から
//          asin + offerListingId を正規表現抽出 → buildBuynowUrlFromAsinAndOffer
//          → LB_AM_BUYNOW_URL_<asin> 保存
//     - 条件: POST /cart/carts/retail/items かつ body に "asin" "offerListingId" 含む
//     - findAodAmazonOffer で Amazon.co.jp 出品判定済の click 直後 5 秒以内なので
//       直販 URL として保存可能
//     - 新ログタグ: buynow-url-saved-from-xhr-body
//
//   【問題② 真の原因】
//     performOrderConfirm 内で aggressiveClickBtn → form.requestSubmit(submitter) のみ発火。
//     iOS Safari + Userscripts で requestSubmit が無視されるケースがあり、
//     URL 変化なし + buttonStillVisible=true のままだが、★リカバリ処理がなかった★
//     HIRO 報告: 30 秒放置で手動停止。
//
//   修正②: performOrderConfirm の click 1秒観察後にリカバリパス追加
//     A. urlChanged=true / iframeUrlChanged=true / buttonStillVisible=false → 成功
//     B. それ以外 (空発火) → リカバリ起動:
//        B-1. form.dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}))
//             (HIRO MEMORY 確認済み解決策: javan/form-request-submit-polyfill issue#3)
//        B-2. 1.5秒待ち、まだ URL 未変化なら placeBtn.click() 直接呼出
//        B-3. もう 1.5秒待ち、まだ URL 未変化なら手動介入 toast + opPause
//     - 新ログタグ: order-confirm-recovery
//
// v0.3.8.65 (2026-05-18 HIRO 致命的指摘 23:08):
//   「トーストのところの色って別のソースで管理していませんか?」
//
//   ★ HIRO の指摘 100% 正解 ★
//
//   v0.3.8.6 で「トーストをアラート型に分離する」目的で
//   `#lb-am-panel-toasts > div { ... !important }` を追加していた。
//   そこに color: --ta-pink-soft (ピンク) と background: 紫グラデ が
//   ハードコードされていた。
//
//   私が v0.3.8.58〜64 で修正していた CSS (Line 3388 / 3407) と、
//   この隠し定義は CSS specificity 同じ + 両方 !important。
//   CSS の「後ろのルールが勝つ」仕様で、★隠し定義が全部上書き★。
//
//   私の修正が無効化されていたから、何回 v 上げてもピンクのまま。
//
//   修正 (v0.3.8.65):
//     隠し定義 (Line 3686 周辺) も「通常時 = シアン HUD」「TA時 = マゼンタ HUD」に分離。
//     - 通常時:   color #5dd5e5 / background 紺グラデ / border シアン / text-shadow シアン光
//     - TA時:    color #ff80d8 / background 紫グラデ / border マゼンタ / text-shadow マゼンタ光
//
//   反省:
//     v0.3.8.58 から「ピンクのまま」と言われていたのに、修正箇所が
//     ★ 上書きされている事実 ★ を確認しなかった。Grep で部分検索したつもりで、
//     具体的にどの CSS が最終勝者になっているか追跡していなかった。
//     HIRO の「別のソースで管理していないか」がなければ、まだ堂々巡りしていた。
//
// v0.3.8.64 (2026-05-18 HIRO 23:02 スクショで「ピンクのまま」根本原因判明):
//   ステータスはシアン文字なのにトーストがピンク見え、不思議に思って深掘り。
//   真の原因: #lb-am-panel の BASE スタイルが全部マゼンタテーマだった!
//
//   旧:
//     background: マゼンタグラデ
//     background-color: #15071a (紫黒)
//     border: マゼンタ
//     color: --ta-celestial-white (#f8e8f5 淡ピンク白)
//   → 通常時もパネル全体がマゼンタ系 = トースト文字 #5dd5e5 でも錯視で白ピンク
//
//   新 (v0.3.8.64):
//     base: シアン/紺グラデ + 紺背景 + シアン枠 + 淡シアン文字 (HUD カラー)
//     #lb-am-panel.is-transam: マゼンタ系をオーバーライド (TA時のみ)
//   → 通常時=シアン HUD、TA時=マゼンタ HUD で完全分離
//
//   これで HIRO の主訴「通常時とTA時のトーストの色を分けてほしい」が
//   パネル全体レベルで実現される。
//
// v0.3.8.63 (2026-05-18 HIRO 指摘「あなたも不整合を見つけようと思わないんですか?」):
//   猛省して Claude が自発的にソースコード全体を検査:
//
//   発見した不整合 3 件:
//
//   【優先度A: 誤発注リスク】
//     LB_AM_VERIFIED_DIRECT (直販確認済タイムスタンプ) がセッション越境して残る
//     現象:
//       ① 商品 A (直販) で 🛒 開始 → VERIFIED_DIRECT セット
//       ② ブラウザ閉じる (注文未完了)
//       ③ 5 分以内に再起動 + 別商品 B (マケプレ混在) で 🛒 開始
//       ④ verifyCheckoutSafety で failsafe NG だが verifiedRecent=true → 「続行」判定
//       ⑤ ★前商品 A の確認結果で B を続行★ という越境エラー
//     ※ v0.3.8.49 で「マケプレ確定なら verifiedRecent 無視」修正済だが、
//       マケプレでない failsafe NG (DOM 変化等) の場合に抜け穴あり
//     修正:
//       ① opStart/opStartTransAm で必ず removeItem (新セッション = 前確認は無効)
//       ② main 冒頭の stale クリーンアップに追加:
//          - mode === STOPPED → 削除
//          - mode === PAUSED + session なし → 削除
//          - 5 分以上経過 → 削除 (タイムアウト)
//
//   【優先度C: コード健全性、害なし】
//     未使用変数 _modalPollerInterval (let で宣言だけ、setInterval/clearInterval 共に未使用)
//     → 削除
//
//   【検査済 OK 項目】
//     - timer interval (timerCheckIntervalId / timerCountdownIntervalId): 多重起動防止 OK
//     - express checkout observer: 早期 return ガード OK
//     - cart SFL observer: debounce 管理 OK
//     - session の lastStep 管理: opStart で clearSession、opResume で session なしガード OK
//     - 死キー LB_AM_AOD_ENV_SIG の removeItem: legacy 移行用、過去ユーザー対策で残置
//
// v0.3.8.62 (2026-05-18 HIRO 鋭い指摘 22:52):
//   「フラグがうまく動いてなくて、トランザムのピンクを表示させてる可能性はないの？」
//
//   → HIRO の指摘は的中。フラグ管理に脆弱性あり:
//
//   localStorage 'LB_AM_TRANS_AM_MODE' フラグの寿命:
//     - TRANS-AM 起動           → '1' セット
//     - 通常 🛒新規開始        → 削除 ✅
//     - 🛑完全停止             → 削除 ✅
//     - ⏸一時停止              → そのまま残る ⚠
//     - ▶再開                   → そのまま残る ⚠
//     - ブラウザ閉じる(停止せず)→ そのまま残る ⚠
//     - ブラウザ再起動         → localStorage 永続のため残ったまま ⚠
//
//   結果: STOPPED にもかかわらず isTransAmMode()=true で誤判定 → UI 全体がピンクに
//
//   修正 (v0.3.8.62):
//     main() 冒頭 (panel 生成前) で「mode と TRANS-AM フラグの整合性」をチェック:
//       - mode === STOPPED + フラグ '1'              → 必ず削除 (矛盾状態)
//       - mode === PAUSED + session なし + フラグ '1'  → 削除 (失効済み session)
//       - mode === RUNNING + フラグ '1'              → 維持 (正常な TA 中)
//       - mode === PAUSED + session あり + フラグ '1' → 維持 (TA 中の一時停止)
//     フラグ削除時は warn ログ 'transam-stale-cleanup' を出力 (再発検知用)
//
//   結果:
//     - 通常起動時にゴミフラグが必ず消える
//     - panel 生成時の初期 is-transam クラス付与判定も正しく動く
//     - toast 関数の状態判定も正常化
//
// v0.3.8.61 (2026-05-18 HIRO スクショ 22:41):
//   v0.3.8.60 適用後もトースト文字がピンクに見える問題:
//
//   原因 (錯視):
//     - 文字色は #b8d8e8 (淡シアン白) で技術的には正しい
//     - しかしパネル背景がマゼンタテーマ (#15071a + マゼンタグラデ)
//     - マゼンタ背景上に淡シアン白 → 補色対比でピンク錯視
//     - さらにトーストには text-shadow なし → 発色弱く錯視が強まる
//
//   修正:
//     ① 通常時トースト color: #b8d8e8 → #5dd5e5 (彩度高い純シアン)
//        ステータス文字より明るい彩度で「明確にシアン」と認識される
//     ② text-shadow を付与 (シアン光彩):
//        - 0 0 4px / 0 0 10px のソフト光 + 0 1px 2px の影
//        - ステータス文字と同じ HUD 発色感
//     ③ TA時も同様に text-shadow をマゼンタ光彩に
//        - マゼンタ背景上で TA色がより鮮明に
//
//   結果:
//     通常時 = 明確にシアン (錯視解消)
//     TA時   = 明確にマゼンタピンク (区別が一段と明確)
//
// v0.3.8.60 (2026-05-18 HIRO スクショ 22:35):
//   「⏸ 一時停止しました」 toast の文字色がピンク表示されていた問題:
//
//   原因: タイミングバグ
//     handleBtnPause での処理順:
//       ① S.opPause() → MODE_PAUSED に切替
//       ② toast('⏸ 一時停止しました...') ← この時点で panel.is-transam が古い状態のまま
//       ③ updatePanelButtons() → is-transam クラス更新 ← 遅すぎる
//     v0.3.8.58 の toast 関数は panel.classList.contains('is-transam') を見ていたので、
//     ②の時点では前状態 (RUNNING 中の is-transam クラス) が残っており、ピンクと判定。
//
//   修正:
//     ① toast 関数の判定を classList ではなく直接 mode + TRANS-AM フラグ参照に:
//        - isTa = (mode === RUNNING) && S.isTransAmMode()
//        → 呼出タイミングに関わらず正確に状態判定
//     ② updatePanelButtons の is-transam toggle 条件も RUNNING 限定に変更:
//        - PAUSED は「動作停止中」なので TRANS-AM 配色は不要 (HIRO 設計意図に一致)
//        - STOPPED と同じく通常 (シアン) HUD に戻す
//
//   結果:
//     - PAUSED 中も通常 toast 色 (シアン)
//     - 一時停止メッセージも統一感あるシアン表示
//     - TRANS-AM ピンクは RUNNING + TRANS-AM フラグ ON の時のみ
//
// v0.3.8.59 (2026-05-18 HIRO 緊急報告 21:51 ログ):
//   2 つの重大バグを発見・修正:
//
//   ===== バグ① 出てはいけないエラー =====
//   現象:
//     21:51:06.527 cart-proceed-click「レジに進む」click 投入
//       → tag:"DIV", id:"lb-am-panel"  ← スクリプトのパネル本体!
//       → text:"▾\nV0.3.8.57 ▶監視中..."
//     21:51:08.483 click 後 URL 未変化 → fallback-C 最終手段: SPC URL 直行
//
//   原因:
//     findClassicCartProceedButton 内の最後のフォールバック
//       findByText('span, div', 'レジに進む')
//     がトースト履歴メッセージ(「▶ 「レジに進む」をクリック」等)に誤マッチし、
//     スクリプトの <div id="lb-am-panel"> 自身を click 対象として返していた。
//
//   修正 (3 重防御):
//     ① findByText / findAllByText の入口で #lb-am-panel 配下を必ずスキップ
//     ② findClassicCartProceedButton: 'span, div' テキスト一致を完全削除
//        (ボタン以外を返す危険なフォールバック自体を撤去)
//     ③ findClassicCartProceedButton: 結果が #lb-am-panel 配下なら除外
//     ④ findSmartWagonProceedButton / findAddOnUpsellProceedButton も同様にパネル除外
//
//   ===== バグ② AOD TRANS-AM 登録できない =====
//   現象:
//     21:51:04.946 aod-save-skip,⚠ olid 取得失敗 (formInputCount: 0) ×2 回
//     21:51:05.382 AOD click → 21:51:05.901 API 200 (カート追加成功)
//     → URL は保存されないまま (TRANS-AM 登録不能)
//
//   原因:
//     v0.3.8.55 で段階4のみ「offer/asin input を持つ form のみ採用」修正したが、
//     段階1〜3 (btn.closest / cardEl.querySelector / ancestor) では空 form でも採用していた。
//
//   修正:
//     段階1〜3 でも hasOfferInput() で「offerListing/offering/asin input を含む form」のみ採用。
//     共通ヘルパー hasOfferInput を関数化、各段階で適用。
//     これで空 form を拾わなくなる → 真の form を引き当てる確率が大幅向上。
//
// v0.3.8.58 (2026-05-18 HIRO 再指摘):
//   「通常時のトーストの文字の色、ピンクのままだけどちゃんと修正しましたか？」
//
//   検証結果:
//     v0.3.8.56 では枠線色 (--toast-accent) を動的化したが、
//     ★文字色 (CSS color) は #d0e8f5 のまま変えていなかった★
//     → HIRO 画面では「ピンク」っぽい青白が継続表示
//
//   v0.3.8.58 完全修正 (3 重防御):
//     ① .lb-am-toast CSS の color を !important で固定:
//        - 通常時 = #b8d8e8 (#lb-am-panel-status と完全一致 = 淡シアン)
//        - TA時   = #ff80d8 (--ta-pink、ステータス TA時と完全一致)
//     ② #lb-am-panel-toasts > div 保険 CSS も同色に揃え !important
//     ③ toast 関数で div.style.color をインライン設定 (継承問題完全防止)
//
//   検証:
//     通常時 → トースト文字色 = #b8d8e8 (淡シアン)、枠線 = #5dd5e5 (シアン)
//             ステータステキスト (#b8d8e8) と完全一致 → 統一感
//     TA時   → トースト文字色 = #ff80d8 (ビビッドピンク)、枠線 = #c41e9e (マゼンタ)
//             ステータス TA時 (--ta-pink = #ff80d8) と完全一致 → 統一感
//
// v0.3.8.57 (2026-05-18 HIRO 緊急報告 21:19 ログ):
//   「レジに進むを押してくれないです」
//
//   現象 (ログ詳細):
//     - 21:19:13.669 handleClassicCart 入室
//     - 21:19:13.839 step CART_DONE → CHECKOUT (setState 実行 = proceedBtn 発見)
//     - 21:19:13.839 click() 呼ばれた (例外なし)
//     - しかし URL は /gp/cart/view.html のまま停滞
//     - 21:19:31.446 HIRO が手動停止 (17 秒後)
//
//   原因:
//     - handleClassicCart の click 後処理が A タグのみ fallback あり
//     - button タグ (input[name="proceedToRetailCheckout"]) の場合、click() 後の
//       URL 変化を確認していなかった
//     - iOS Safari + Userscripts で click が無効化されると放置状態に
//
//   修正:
//     ① click 前ログ追加 cart-proceed-click (tag/id/name/href/text を可視化)
//     ② click 後 1.5 秒間 URL 変化 polling (100ms × 15 回)
//     ③ URL 変化なしの場合、3 段階 fallback:
//        a. A タグ → href へ手動 navigate
//        b. button が form 内 → form.requestSubmit(submitter=proceedBtn)
//                              または form.dispatchEvent(submit) (iOS Safari 対策)
//        c. 全失敗時 → /gp/buy/spc/handlers/display.html SPC URL 直行
//     ④ 各段階で詳細ログ出力 (次回ログから経路特定可能)
//
//   関連教訓 (HIRO MEMORY):
//     iOS Safari + UserScript で form 発火: form.dispatchEvent(new Event('submit'))
//     が確認済み解決策 (javan/form-request-submit-polyfill issue#3)
//
// v0.3.8.56 (2026-05-18 HIRO 要望):
//   ① トースト色問題
//      「通常時ピンク、TA 時と区別したい」
//      原因: toast() のデフォルト引数 #c41e9e (マゼンタ) が常に枠線色になっていた。
//      修正: color 未指定時は panel.is-transam を判定して動的決定:
//        - 通常時 (is-transam なし): シアン #5dd5e5
//        - TRANS-AM 中 (is-transam あり): マゼンタ #c41e9e
//      明示色 (BUY_GREEN/STOP_RED 等) は引数指定で従来通り維持。
//
//   ② 「レジに進む」以降の速度を更に短縮 (HIRO「競り負けてる」対応)
//
//      AOD カートイン直前:
//        - clickAodAmazonOffer の click 前 sleep: 400ms → 120ms
//
//      AOD click 後の状態 polling:
//        - POLL_MS: 200ms → 60ms (発見が約 3 倍速)
//        - TIMEOUT_MS: 2000ms → 2400ms (40 回維持)
//
//      smart-wagon:
//        - polling 間隔: 250ms → 100ms (12 回 = 1.2 秒最大)
//        - 安定待ち: cartConfirmed=true 時 300ms → 100ms / false 時 800ms → 300ms
//
//      classic cart:
//        - 初回 sleep: 300ms → 150ms
//        - ボタン待ち polling: 200ms × 25 → 80ms × 62 (5 秒上限維持)
//        - click 前 random delay: 30-100ms → 15-45ms
//        - リンク click 後 fallback: 700ms → 350ms
//
//      他に何か必要画面 (handleAddOnUpsell):
//        - ボタン待ち polling: 500ms × 10 → 80ms × 62 (5 秒上限維持)
//        - click 前 random delay: 50-200ms → 15-45ms
//        - A タグ/button 同画面 fallback: 1500ms → 600ms
//
//   改善見込み (AOD click → 注文確定画面到達):
//     - 旧 v0.3.8.55: 平均 ~3-4 秒
//     - 新 v0.3.8.56: 平均 ~1-1.5 秒 (約 2 秒短縮)
//
//   安全策:
//     - bot 検知対策のランダム delay は維持 (短縮するが完全削除はしない)
//     - smart-wagon polling は「カートに入れました」テキスト検出のまま
//     - 全変更は sleep 値のみ、ロジック構造・条件分岐は完全維持
//
// v0.3.8.55 (2026-05-18 HIRO 報告 20:45-20:47):
//   v0.3.8.54 のログ精査結果:
//     ✅ v0.3.8.54 が正常起動 (SCRIPT_VERSION 表示OK)
//     ✅ Buy Box 経由の URL 保存 動作確認 (B07NC1BQC1 asin/olidLen=156 保存成功)
//     ✅ 危険なエラー (誤発注/ロック/データ破壊) ゼロ
//     ⚠ aod-save-skip,olid 取得失敗 (formInputCount=0) 多発
//        → v0.3.8.53 で追加した段階4「aod-container 全体から最初の form」が
//          空 form を拾っていた (AOD コンテナ内に空 form 複数存在の可能性)
//
//   修正内容:
//     段階4 の form 候補選定を強化:
//       - offerListing/offering/asin 系の hidden input を含む form のみ候補化
//       - 複数候補ある場合は本ボタンとの DOM 距離が最短な form を選択
//       - 候補ゼロなら段階4 でも form なしと判定 (cardEl 救済ルートに進む)
//
//   未解決事項 (HIRO 確認待ち):
//     - AOD ナビ直後 ~73ms で稀に opFullStop 発火 → 原因特定できず
//       (Safari/Userscripts 側のスクリプト中断の可能性、再現困難)
//     - passive-buynow-saved 系のログが未確認 → 次回ログで動作確認したい
//
// v0.3.8.54 (2026-05-18 HIRO 報告 20:35):
//   「AODカートイン後、レジに進む以降の動き、もっさりしていて出遅れている」
//
//   現状の遅延ポイント (平均ケース合計 ~4.4 秒):
//     - handleSmartWagon: sleep(3000) 固定        → カート確定 AJAX 完了待ち
//     - handleClassicCart: sleep(800)              → bodyText 読み取り前安定待ち
//     - handleClassicCart: sleep(500) × polling    → 「レジに進む」ボタン待ち
//     - handleClassicCart: sleep(50-200) ランダム   → bot 検知対策 click 前 delay
//     - handleClassicCart: sleep(1500) リンク fallback
//
//   修正 (v0.3.8.54):
//     ① handleSmartWagon: 3000ms 固定 → polling 方式 (最大 1500ms)
//        - 「カートに入れました」テキスト検出で即 navigate
//        - 検出時: 250 × N + 安定待ち 300ms = ベスト 550ms
//        - 未検出時: 1500ms + 800ms = 最悪 2300ms (それでも従来の 3000ms より短い)
//     ② handleClassicCart 初回 sleep: 800ms → 300ms (smart-wagon で安定待ち済み)
//     ③ handleClassicCart ボタン待ち polling: sleep(500)×10 → sleep(200)×25
//        最大時間は同じ 5 秒、平均発見時間 250ms → 100ms に短縮
//     ④ click 前ランダム delay: 50-200ms → 30-100ms (bot 検知対策の最小限維持)
//     ⑤ リンク click 後 navigate fallback: 1500ms → 700ms
//
//   改善見込み: 平均ケース 4.4 秒 → 1.4 秒 (約 3 秒短縮)
//
//   リスク管理:
//     - smart-wagon の AJAX 早期 navigate リスク → polling で「カートに入れました」確認
//     - bot 検知対策のランダム delay は維持 (短縮するが完全削除はしない)
//     - 全変更は sleep 値のみ、ロジック構造は無変更
//
// v0.3.8.53 (2026-05-18 HIRO 報告 20:29):
//   v0.3.8.52 ログ精査:
//     - aod-save-skip,btn.closest(form) が null 多発 → AOD form 探索失敗
//     - main 起動ログが「v0.3.8.51 起動」と表示 → SCRIPT_VERSION 定数の更新漏れ
//
//   修正:
//     ① SCRIPT_VERSION 定数を '0.3.8.53' に更新 (@version との整合)
//     ② AOD form 探索を 4 段階 + 救済ルートに拡張:
//        段階1: btn.closest('form')                  (標準)
//        段階2: cardEl.querySelector('form')         (AOD オファーカード内)
//        段階3: ancestor を遡って <form> を探索      (DOM 構造変化対応)
//        段階4: aod-container 全体から最初の form    (最終手段)
//        救済: form なしでも cardEl 内 hidden input から olid 抽出 → 保存
//     ③ form 4 段階全失敗時に aod-save-skip-formless ログを出力:
//        - ボタン tag/id/name/aria-label/onclick/data-asin/data-action
//        - cardEl tag/id/class
//        - 周辺 hidden input 全件 (name + valueLen 形式)
//        → 次のログから Amazon AOD の実 DOM 構造が判明
//
//   検証状況:
//     - 実機検証は HIRO 環境のみ可能 (Claude Code 側では検証不可)
//     - 4 段階 + 救済 + 詳細ログで「動かない or 何が原因か判明」の二択にする設計
//
// v0.3.8.52 (2026-05-18 HIRO 報告):
//   v0.3.8.51 ログ精査結果:
//     - Buy Box 経由の保存 (buynow-url-saved-from-buybox) は動いていた
//     - ただし attemptPurchase 内 (RUNNING 状態) でしか走らないため、
//       STOPPED 状態でユーザーが商品ページを訪問 → カートに入れる/AODで追加
//       しても保存されない
//
//   HIRO 真の要件:
//     「私は開始またはトランザムしか押さない、情報収集は自動化しているはず」
//     → 商品ページ訪問だけで自動的に offerListing.1 を捕捉する必要あり
//
//   修正内容:
//     ① 新関数 passiveSaveBuyBoxOlid(): Buy Box 直販判定 + form から olid 抽出 + 保存
//     ② 新関数 passiveSaveAodOlid(): findAodAmazonOffer の save 部分を再利用
//     ③ handleProductPage に setTimeout で 1500ms / 3500ms 後の 2 回呼び出し追加
//     ④ handleProductAod に setTimeout で 1800ms / 4000ms 後の 2 回呼び出し追加
//     ⑤ findAodAmazonOffer 内部の保存ロジック強化:
//        - form null / olid 未取得 / asin 未取得 / addr 未設定 をすべて warn ログ
//        - olid 検出セレクタを input[name*="offering"] まで拡張 (AOD の name 不一致対策)
//        - 例外発生時の aod-save-exception ログ追加
//
//   効果:
//     - STOPPED 状態でも商品ページ / AOD 訪問だけで自動 URL 保存
//     - 通常カート追加 → ⚡TRANS-AM⚡ 利用可能になる
//     - AOD カート追加 → ⚡TRANS-AM⚡ 利用可能になる
//     - HIRO は本当に「開始/トランザム」しか触らなくて OK
//
//   後方互換:
//     - 既存の attemptPurchase / findAodAmazonOffer 内 save も維持
//       (RUNNING 中も継続保存、冪等 = prev===url で skip)
//     - localStorage キー、UI、デプロイ手順 すべて互換
//
// v0.3.8.51 (2026-05-18 HIRO 最終確定):
//   A方式 (offerListing.1 なし) では merchantID 強制でもマケプレに切替えられる事象が
//   実機で頻発したため、B方式専用化で確実な直販限定 navigate に戻す。
//
//   核心の仕様:
//     - TRANS-AM: B方式 (offerListing.1 込み URL) で navigate
//     - offerListing.1 は「直販判定済み」のみ保存 (マケプレ URL は絶対保存しない)
//     - 保存ルート 3 つ:
//       (1) Buy Box 経由 (attemptPurchase 内、isDirect=true 時 form から抽出)
//       (2) AOD 経由 (findAodAmazonOffer 内、直販オファー検出時 form から抽出)
//       (3) xhr 観測経由 (trySaveBuynowUrlFromObserved、直販判定 OK 時のみ完成 URL 保存)
//     - SFL (あとで買う) スキャンは ASIN_ONLY 仮登録のみ (直販保証できないため)
//
//   TRANS-AM ボタン状態:
//     - 保存済み URL あり → ⚡TRANS-AM⚡ 有効
//     - 保存値なし → 🔒 TRANS-AM (要記録) [灰色] ← 🛒で自動取得を促す
//
//   HIRO 運用フロー:
//     1. 商品ページで 🛒新規開始 (1 回押すだけ)
//     2. リロードガチャ中に Buy Box / AOD で直販判定 → offerListing.1 自動保存
//     3. リストック通知時に ⚡TRANS-AM⚡ → B方式 navigate → 直販モーダル → 自動 click
//
//   商品データ画面の追加:
//     - 各商品にステータスバッジ (⚡ TRANS-AM 可 / 🔒 URL 未取得)
//     - 「⚠️ 全削除 (初期化)」ボタン (addressID は保持)
//
//   凍結 (関数定義残置、呼ばれない):
//     - buildAMethodUrl (A方式 URL 組み立て)
//     - navigateNoReferrer (A方式専用の navigate)
//
// v0.3.8.50 (マケプレ検出時 → 完全停止やめてループ継続)
//
// v0.3.8.50 (2026-05-18 HIRO 報告):
//   v0.3.8.49 ログ精査: マケプレ確定モーダル開く → 検出 → click 拒否 → 完全停止
//   は機能していたが、HIRO 視点では「マケプレモーダルが画面に固定される」=
//   「機能していない」感を生んでいた。
//
//   HIRO 真の要件: 直販のみで動く、ただし HIRO が止めるまでループ継続
//   修正: マケプレ販売元検出時の挙動を変更
//     - click 拒否 (既存、誤発注防止)
//     - 完全停止 → 商品ページに戻る + ループ継続 (新規)
//     - HIRO に「動いた」感 + 在庫が出るまでひたすら回す
//   これにより:
//     - マケプレ画面は一瞬 (~1.2秒) 出るが、商品ページに戻って TRANS-AM ループ
//     - 直販在庫が出れば自動的に注文完了
//     - bot 動作の二重防御は維持 (URL レベル + verify レベル)
//
// v0.3.8.49 (緊急: TRANS-AM 中の別商品 PAUSED + マケプレ verifiedRecent 抜け穴)
//
// v0.3.8.49 (2026-05-18 HIRO 17:02 スクショ + ログ報告):
//   2 つの致命的バグを発見・修正:
//
//   バグ 1: 別商品検出ガード (Line 8975) が TRANS-AM 中も発動
//     現象: TRANS-AM navigate 後の商品ページ復帰時、session ASIN と一致しない
//          ASIN を検出して opPause → return → v0.3.8.46 で追加した
//          「URL 書き換え継続」処理に到達しない
//     修正: 別商品検出ガードに `!S.isTransAmMode()` 条件追加 (TRANS-AM 中はスキップ)
//
//   バグ 2: マケプレ販売元検出時の verifyCheckoutSafety 抜け穴
//     現象: HIRO スクショ「販売元: Shonny's Shop」マケプレ確定モーダル
//          verify.ok=false (noNonAmazonSeller=false) でも、verifiedRecent=true
//          (5分以内に商品ページで直販確認済) で続行する設計 = 二重防御無効化
//     修正: performOrderConfirm でマケプレ販売元検出時は verifiedRecent を無視して
//          必ず停止 (isMarketplaceSeller || !verifiedRecent で停止判定)
//
// v0.3.8.48 (A方式専用化、B方式凍結、初見トランザム対応)
//
// v0.3.8.48 (2026-05-18 HIRO 設計確定):
//   B方式 (offerListing.1 込み URL) を凍結し、A方式専用化:
//
//   修正内容:
//     ① tryInstantBuyTransAm: 保存値ロジック撤去、常に A方式で URL 組み立て
//     ② updatePanelButtons: ボタン有効化条件を「商品ページ + addressID」に緩和
//        (保存値の有無を問わない、初見でも押下可)
//     ③ trySaveBuynowUrlFromObserved: 完成 URL 保存撤去、ASIN_ONLY 仮登録のみ
//     ④ collectFromCartSaveForLater (SFL): 完成 URL 保存撤去、ASIN_ONLY のみ
//     ⑤ マイグレーション: 既存 LB_AM_BUYNOW_URL_<ASIN> → LB_AM_ASIN_ONLY_<ASIN> 自動変換 (1回限り)
//     ⑥ 📦 商品データ画面: B方式/A方式バッジ撤去 (全部同じ表示)
//     ⑦ CSV: buynow_url 列を撤去、4 列 (asin/product_name/saved_at/address_id) に変更
//        - 旧 CSV (5 列) もインポート可能 (互換維持、buynow_url 列があっても無視)
//
//   凍結 (コード残置、呼ばれない):
//     - buildBuynowUrlFromAsinAndOffer (B方式 URL 組み立て)
//     - getSavedTransAmUrl / hasSavedTransAmUrl / deleteSavedTransAmUrl
//
//   結果:
//     - 初見の商品でも ⚡TRANS-AM⚡ 押下可能 (リストック通知 → 即押下)
//     - マケプレ混入は構造的に不可能 (offerListing.1 送らない)
//     - 万一マケプレが表示されても verifyCheckoutSafety で click 拒否 (二重防御)
//
// v0.3.8.47 (verify 強化: マケプレ販売元の明示的 NG 判定)
//
// v0.3.8.47 (2026-05-18 HIRO 強い指摘):
//   「現状維持(直販のみ)なのにマケプレが出てきたら問題」
//   現状の verifyCheckoutSafety は「販売元 Amazon.co.jp あるか」のみで、
//   Amazon 以外の販売元名を明示的に NG にする検出が無かった。
//   追加: checks.noNonAmazonSeller を新規追加
//     - 「販売元: Amazon 以外」を正規表現で検出 → NG (issues に追加)
//     - detectedSellerName をログに出力 (販売元名を明示記録)
//     - ok 判定に noNonAmazonSeller も AND 結合 → click 拒否
//
// v0.3.8.46 (別商品 → URL 書き換え継続)
//
// v0.3.8.46 (2026-05-18 HIRO 指摘):
//   v0.3.8.45 の「別商品検出 → 一時停止」を撤回:
//     HIRO 指示「URL を書き換えて TRANS-AM 継続」
//     → 別商品ページに来たら session.productUrl を新 URL に更新
//     → bot は新しい商品で TRANS-AM をそのまま継続
//     対象切替がスムーズになる
//   なお誤発注リスクは TRANS-AM 自体の保存値必須設計で構造的に防止済み
//   (未記録商品では押下不可、URL 強制で merchantID=AN1VRQENFRJN5 直販限定)
//
// v0.3.8.45 (緊急: 別商品クリック防止 + /oos ループ継続)
//
// v0.3.8.45 (2026-05-18 HIRO 緊急報告 2 件):
//   ① TRANS-AM 起動中に別商品ページに遷移すると、bot が新商品で
//      attempt-purchase を誤発火させて誤発注のリスクがあった (危険):
//      対策: handleProductPage の TRANS-AM 分岐で session.productUrl の
//            ASIN と現在ページの ASIN を比較、不一致なら即 opPause
//            HIRO が手動で 🛑→🛒 し直すまで bot は動かない
//   ② /checkout/entry/oos (Out Of Stock 専用ページ) を STOCK_OUT_BUYNOW
//      として検出してなかった → screen=OTHER 扱いでループが止まる問題:
//      detectScreen に oos を追加。これで TRANS-AM ループが正常継続
//
// v0.3.8.44 (整合性レビュー: LAST_AT 削除漏れ修正)
//
// v0.3.8.44 (2026-05-18 包括レビュー):
//   軽微なクリーンアップ漏れ修正: 商品削除時に LB_AM_TRANS_AM_LAST_AT_<ASIN>
//   (連投ガード用 5 秒タイムスタンプ) が残っていた → 「削除 → 即再登録」時に
//   古いタイムスタンプで連投ガード誤発動の可能性。両削除パスで除去:
//     - 個別削除ボタン (商品データ画面)
//     - deleteSavedTransAmUrl ヘルパー関数 (将来再利用用)
//   その他 11 リビジョン分のロジック整合性は全て OK (撤回箇所も完全クリーン)
//
// v0.3.8.43 (確定 click までの 1.5秒 sleep を撤去)
//
// v0.3.8.43 (2026-05-18 HIRO 要望「確定ボタン出てから押すまでが長い」):
//   ログ分析: handleStockOutBuyNow がモーダル検出 (1.5秒 polling) → handleCheckout 呼出
//             → handleCheckout 最初の "await sleep(1500)" で再度 1.5秒待っていた = 無駄
//   修正: handleCheckout({ skipInitialSleep: true }) オプション追加
//        - handleStockOutBuyNow から呼ぶ時は skip=true で 1.5秒短縮
//        - 既存の screen=CHECKOUT 経由 (SPC 直接遷移) はそのまま 1.5秒待つ (安全側)
//   効果: 確定 click までの所要時間 ~3.5秒 → ~2秒 に短縮
//
// v0.3.8.42 (モーダル検出後に handleCheckout を呼んで確定 click)
//
// v0.3.8.42 (2026-05-18 HIRO ログ報告):
//   ログ判明: v0.3.8.40 でモーダル検出は成功 (place-order-form あり、注文を確定テキストあり)
//   しかし「watcher に委ねる」だけで誰も click せず停止 = HIRO「確定が押されない」
//   修正: handleStockOutBuyNow でモーダル検出時に handleCheckout を呼ぶ
//        → findPlaceOrderButton で確定ボタンを 10秒 polling し、見つけたら performOrderConfirm 実行
//        → これで「注文を確定する」が自動 click される
//
// v0.3.8.41 (TRANS-AM URL に直販強制パラメータ追加)
//
// v0.3.8.41 (2026-05-18 HIRO 指摘):
//   問題: TRANS-AM で navigate した先で Amazon マケプレ販売元の今すぐ買うが表示された
//        = Amazon サーバが直販在庫切れ時にマケプレオファーに自動切替している
//   対策: TRANS-AM URL に &merchantID=AN1VRQENFRJN5 を追加 (Amazon 直販強制)
//        - buildBuynowUrlFromAsinAndOffer (B方式 / SFL 経由)
//        - buildAMethodUrl (A方式 / ASIN のみ)
//        → Amazon サーバが直販限定で処理、直販在庫切れなら「お取り扱いできません」、
//          直販在庫ありなら Express Checkout モーダル (販売元: Amazon.co.jp)
//
//   撤回した修正 (HIRO 指摘で誤りと判明):
//     × xhr 観測時の直販判定チェック (過剰防衛、リストック時の URL 再利用ができなくなる)
//     × SFL 経由の完成 URL 保存削除 (HIRO 運用維持のため復活)
//     × 「お取り扱いできません」検出時の URL 削除 (リストック時に同じ URL が動く可能性高い)
//
// v0.3.8.40 (handleStockOutBuyNow: モーダル描画待ち追加)
//
// v0.3.8.40 (2026-05-18 HIRO 指摘):
//   「見つかってからリロードが早すぎる」の根本対策:
//   /checkout/entry/buynow URL は「在庫あり (Express Checkout モーダル)」と
//   「在庫切れ画面」の両方で着地する。従来は URL だけで STOCK_OUT 判定 →
//   モーダル描画前 (1〜2秒以内) に商品ページへ強制リロード = モーダル消失。
//   修正: handleStockOutBuyNow の冒頭で 5 秒間 polling:
//     - Express Checkout モーダル DOM (turbo-checkout / place-order-form / 注文を確定テキスト)
//       が見つかったら → handleStockOutBuyNow 終了、modal watcher に委ねる
//     - 「在庫切れ / お取り扱いできません」テキストが見つかったら → 即座に商品ページに戻る
//     - 5 秒待っても何も見つからない → 在庫切れと仮定して商品ページに戻る (従来動作)
//
// v0.3.8.39 (sleep 1秒/3秒に修正)
//
// v0.3.8.39 (2026-05-18 HIRO 修正):
//   handleAmazonError sleep を HIRO 指定値に修正:
//     - errCount 1-3 : 1000ms (1秒、通常スピード)
//     - errCount 4+  : 3000ms (3秒、軽い減速)
//   前版 v0.3.8.38 は 3秒/5秒で誤実装。
//
// v0.3.8.38 (保存値 URL 再構築 + sleep 3秒に短縮)
//
// v0.3.8.38 (2026-05-18 HIRO ログ報告):
//   ① 重大バグ修正: B方式 navigate で localStorage の古い URL が再利用される問題
//      原因: 過去保存された buynow URL には quantity.1 が含まれていない (v0.3.8.36 修正前形式)
//      対策: navigate 直前に asin + offerListing.1 を再抽出して buildBuynowUrlFromAsinAndOffer
//            で URL を再構築 → 常に最新フォーマット (quantity.1=1 込み) を navigate
//   ② handleAmazonError sleep を HIRO 要望「最低 3 秒程度」に合わせて簡素化:
//      - errCount 1-3 : 3000ms (3秒)
//      - errCount 4+  : 5000ms (5秒、軽い減速)
//      - 完全停止しないループ継続は維持
//
// v0.3.8.37 (Amazon エラー段階的減速ループ)
//
// v0.3.8.37 (2026-05-18 HIRO 提案):
//   「連続 4 回で完全停止」をやめて、段階的減速ループに変更:
//     - errCount 1-3 : 500ms  sleep (通常速度)
//     - errCount 4-6 : 2000ms sleep (4倍減速)
//     - errCount 7-9 : 5000ms sleep (10倍減速)
//     - errCount 10+ : 10000ms sleep (20倍減速、bot 検知保護の最低速)
//   完全停止しない = HIRO が止めるまでループ継続
//   errCount は 60 秒経過でリセット (既存ロジック)
//
// v0.3.8.36 (quantity.1=1 追加 + エラー後グレーアウト撤去)
//
// v0.3.8.36 (2026-05-18 HIRO ログ報告):
//   ① 重大バグ修正: TRANS-AM 用 URL 組み立てで `quantity.1=1` が抜けていた
//      → Amazon が「数量不正」or「在庫切れ」と判定して購入画面が出ない
//      - buildBuynowUrlFromAsinAndOffer に &quantity.1=1 追加
//      - buildAMethodUrl にも &quantity.1=1 追加
//   ② TRANS-AM 後のエラーグレーアウトを撤去 (HIRO 要望「誤作動、不要」):
//      - updatePanelButtons の errCount >= 1 → 灰色化 を削除
//      - tryInstantBuyTransAm の errCount >= 1 → 完全停止 を削除
//      - handleAmazonError 内の連続 4 回判定だけは維持 (bot 検知保護)
//
// v0.3.8.35 (iframe 診断ログ + Amazon エラーもループ継続)
//
// v0.3.8.35 (2026-05-18 HIRO ログ報告):
//   ① 「注文を確定」検出失敗時の診断ログを強化:
//      - 各 iframe の src / origin / name / sandbox / 可視性 / 同一オリジン判定を全部出力
//      - cross-origin iframe で UserScript が起動していない原因の切り分けデータ
//   ② handleAmazonError を「完全停止」→「商品ページに戻ってループ継続」に変更:
//      - HIRO 要望「ご迷惑をおかけしています も止めるまでループ」
//      - 連続 4 回 で初めて完全停止 (bot 検知保護の上限)
//      - 1-3 回目は商品ページに戻る + リロード継続
//
// v0.3.8.34 (エンドレスループ高速化 + 透かし戻し + お取扱不可検出)
//
// v0.3.8.34 (2026-05-18 HIRO 検証報告):
//   ① TRANS-AM 中の透かしを TRANS_AM_HUD_DATA_URL (SVG) → TRANS_AM_BG_DATA_URL
//      (オリジナル JPEG) に戻す (HIRO 指定画像、cover で全面表示)
//   ② 「この商品は現在お取り扱いできません」のテキスト検出を STOCK_OUT_BUYNOW に
//      追加: 在庫切れと同等扱いで商品ページに戻る (ループ継続)
//   ③ handleStockOutBuyNow の sleep 1200ms → 500ms に短縮 (ループ周期高速化)
//   ④ TRANS_AM_MIN_INTERVAL_MS 5秒 → 3秒 (在庫待ちループ実用化)
//      → ループ 1 周期は約 4-5 秒で在庫が出るまで自動回転
//
// v0.3.8.33 (A方式+noreferrer / 画面パッシブ化 / 手動追加 / 並べ替え)
//
// v0.3.8.33 (2026-05-18 HIRO 追加要望 4 点):
//   ① アコーディオン自動展開 click 撤去 (Amazon 左上メニュー誤押下回避、完全パッシブ)
//   ② A方式 + noreferrer navigate: ASIN のみ仮登録の商品でも TRANS-AM 可能化
//      - buildAMethodUrl(asin, addressID): offerListing.1 なし URL 組み立て
//      - navigateNoReferrer(url): a.rel=noreferrer click で Referer を消す
//        → アドレスバー直叩きと同等条件 → 商品ページ起点でも 500 回避を狙う
//      - TRANS-AM ボタン: 完成 URL = ⚡TRANS-AM⚡ / ASIN のみ = ⚡TRANS-AM⚡ (A方式)
//      - 500 を踏んだら既存の連投ガード + 完全停止で安全側
//   ③ 商品データ画面に「➕ 候補商品 手動追加」ボタン
//      - URL or ASIN 貼り付け → ASIN 抽出 → ASIN_ONLY マーカー登録
//      - 商品名はオプション入力 (空欄でも商品ページ訪問時に自動取得される)
//   ④ 商品データ一覧 強化:
//      - 各行に 🔗 商品ページ ボタン (商品 URL に直接遷移)
//      - 各行に ⬆ ⬇ ボタン (並べ替え、LB_AM_PRODUCT_ORDER に保存)
//      - 並び順は localStorage 永続化、ページ遷移しても維持
//
// v0.3.8.32 (SFL スキャン強化 + アコーディオン展開検知 + ASIN のみ仮登録)
//
// v0.3.8.32 (2026-05-18 HIRO ログ報告):
//   v0.3.8.31 のスキャンは ASIN 10 件全部検出できたが、offerListingId が
//   全件取れなかった (モバイル版 /gp/aw/c の DOM は hidden input 形式じゃない)。
//   修正:
//     1. buildAsinToOfferIdMap(): ページ全体から ASIN→offerListingId マップを構築
//        - a タグ href の offerListingId クエリ
//        - script タグ内 JSON (asin と offerListingId が近接した出現)
//        - form 内 hidden input (PC 版互換)
//        - data-a-state 等の属性 JSON
//     2. アコーディオン展開対応:
//        - 「もっと見る」ボタンを自動クリック (sc_saved_more / a-expander-prompt 等)
//        - MutationObserver で SFL セクション変化を検知し再スキャン (デバウンス 1.2s)
//     3. ASIN のみ仮登録 (LB_AM_ASIN_ONLY_<ASIN>):
//        - offerListingId が取れなくても、商品名 + ASIN は記録する
//        - 📦 商品データ一覧で「URL 未取得」バッジ表示
//        - 商品ページに 1 回アクセスすれば xhr 観測経由で完成 URL に昇格
//
// v0.3.8.31 (カート「あとで買う」から自動収集)
//
// v0.3.8.31 (2026-05-17 HIRO 提案):
//   カート画面 /gp/cart/view.html の「あとで買う」セクションから offerListing.1 を
//   一括自動収集して、TRANS-AM 用 URL を生成・保存する。
//   実装:
//     - scanSaveForLaterItems(): DOM 走査で asin + offerListingId + 商品名 を抽出
//     - collectFromCartSaveForLater(): カート着地後 6 回ポーリングして最大検出数を確保
//     - handleClassicCart 入室直後 (STOPPED でも実行) に発動
//     - 既存保存済み ASIN は重複スキップ
//     - offerListing.1 が取れなかった item は toast で「商品ページで補完」を案内
//     - ログ: cart-sfl-scan に検出件数 / 保存件数 / 部分取得件数を出力
//
// v0.3.8.30 (パネル折りたたみ + オーバーレイ中パネル非表示)
//
// v0.3.8.30 (2026-05-17 HIRO 要望):
//   - パネル右上に折りたたみトグル「▾/▴」を追加
//   - 折りたたみ時はミニバー「📡 GUNDAMBOT ●」だけ残る (タップで展開)
//   - 状態は localStorage (LB_AM_PANEL_COLLAPSED) に保存、ページ遷移しても維持
//   - ログ/商品データ オーバーレイ表示中はパネル非表示 (body.lb-am-overlay-open)
//   - これでパネルが見づらい / 大きすぎる問題を解消
//
// v0.3.8.29 (商品名抽出をモバイル Amazon 対応に修正)
//
// v0.3.8.29 (2026-05-17 HIRO スクショ報告):
//   v0.3.8.28 で URL 保存はできたが、商品名が「(商品名未取得)」になっていた。
//   原因: モバイル Amazon (iPhone Safari) は #productTitle や h1.a-size-large が
//         存在しないことが多く、抽出セレクタが当たらない。
//   修正: extractProductTitle() ヘルパー関数化し、複数セレクタを順番に試した上で
//         最終 fallback として document.title から商品名を抽出する。
//
// v0.3.8.28 (Express Checkout xhr 観測経由の URL 自動保存)
//
// v0.3.8.28 (2026-05-17 HIRO ログ解析):
//   根本原因判明: Amazon の Express Checkout (turbo モード) は buy-now click 時、
//     /checkout/entry/buynow を xhr/fetch で呼ぶだけで location.href は商品ページの
//     まま。だから main 関数の URL 保存ロジック (location 監視) は一切発動せず、
//     HIRO の運用では今まで 1 件も保存されていなかった。
//   修正:
//     - fetch/XHR ラッパー (observeNetworkAfterBuyNowClick) で観測した URL を
//       trySaveBuynowUrlFromObserved() で localStorage に保存
//     - 商品名・addressID も DOM/URL から同時抽出
//     - これで通常の 🛒新規開始 で 1 度買おうとした商品はすべて自動保存される
//
// v0.3.8.27 (📦 商品データ CSV 書出/読込/一覧 機能追加)
//
// v0.3.8.27 (2026-05-17 HIRO 提案):
//   localStorage は iOS Safari で簡単に消えるため、保存済み商品データの
//   バックアップ機能を追加。
//   実装:
//     - パネルに「📦 商品データ」ボタン追加 (📋ログ と ⚙設定 の間)
//     - 押下でオーバーレイ表示: CSV 書出/読込/一覧/個別削除
//     - CSV 形式: asin,product_name,buynow_url,saved_at,address_id (BOM 付き UTF-8)
//     - インポート方針: 同じ ASIN は重複スキップ、新規のみ追加 (HIRO 指示)
//     - ファイル選択 + テキスト貼り付け の両対応
//     - 結果 toast: 「新規追加: N 件 / 重複スキップ: N 件 / 無効行: N 件」
//
// v0.3.8.26 (UI 全体 base = HUD シアン、is-transam 中のみマゼンタ)
//
// v0.3.8.26 (2026-05-17 HIRO 追加要望):
//   v0.3.8.25 では status エリアのみ HUD シアン化したが、ボタン群とトーストは
//   まだマゼンタのまま。今回 UI 全体を統一して HUD シアン base に揃える。
//   修正対象:
//     - 🛒新規開始 / ▶再開 ボタン (base = シアングラデ、is-transam = マゼンタ)
//     - 🔄直販URL ボタン (base = シアン outline)
//     - 📋ログ ボタン (base = シアン outline)
//     - ⚙設定 ボタン (base = シアン solid)
//     - トースト (base = 淡シアン文字 + シアン左枠、is-transam = マゼンタ文字)
//     - スクロールバー (base = シアン thumb、is-transam = マゼンタ)
//
// v0.3.8.25 (status エリア base カラーを HUD シアンに統一)
//
// v0.3.8.25 (2026-05-17 HIRO スクショ報告):
//   v0.3.8.24 でも待機中のステータスがマゼンタテキスト・マゼンタ枠だった問題を修正。
//   原因: #lb-am-panel-status の base CSS が color: var(--ta-pink) のままで、
//         is-running:not(.is-transam) でしか上書きしていなかった。STOPPED 時は base が
//         そのまま適用されてマゼンタが見えていた。
//   修正: base スタイル自体を HUD シアンカラーに置き換え、is-transam class が
//         付いた時のみマゼンタに上書きする方式に変更。
//
// v0.3.8.24 (HUD 透かしテーマ + STOPPED 時マゼンタ漏れ修正)
//
// v0.3.8.24 修正 (2026-05-17 HIRO スクショ報告):
//   v0.3.8.23 で待機中 (STOPPED) でもマゼンタ HUD が表示される問題を修正。
//   原因: localStorage.LB_AM_TRANS_AM_MODE='1' が残骸として残り、
//         STOPPED 状態でも is-transam class が付与されていた。
//   修正:
//     (1) updatePanelButtons で is-transam を付ける条件を
//         mode !== MODE_STOPPED && S.isTransAmMode() に厳格化
//     (2) main 起動時に STOPPED 状態なら LB_AM_TRANS_AM_MODE を強制クリア
//   バージョンバンプ理由: Userscripts 拡張は @version で更新判定するため、
//     v0.3.8.23 のままだと拡張キャッシュが残って修正が反映されない。
//
// v0.3.8.23 設計刷新 (2026-05-17 HIRO 提案):
//   背景:
//     v0.3.8.21 A方式は商品ページからの遷移で Amazon に bot 検知され 500 エラー。
//     v0.3.8.22 の復帰ロジックも consecutiveCount がページ遷移で消えるバグで機能せず。
//   HIRO 設計提案:
//     「過去に今すぐ買うを記録した商品のみ TRANS-AM ボタンを有効にする」
//     未記録商品では押下不可 → 500 エラーが物理的に発生不可能。
//   実装:
//     (1) tryInstantBuyTransAm を保存値必須に書き換え
//         - localStorage の LB_AM_BUYNOW_URL_<ASIN> がない商品では即完全停止
//         - 保存値があれば即 navigate (offerListing.1 込み = ボタンclick と同等)
//     (2) TRANS-AM ボタン状態管理を updatePanelButtons に追加
//         - 保存済み URL あり + 商品ページ + エラー無し → 有効化 (マゼンタ)
//         - いずれか欠ければ灰色化 + ツールチップで通知
//         - ラベルも「⚡TRANS-AM⚡」「🔒 TRANS-AM (要記録)」等で状態表示
//     (3) 商品ページで商品名を自動保存 (LB_AM_PRODUCT_NAME_<ASIN>)
//         - ツールチップに表示
//     (4) 連投ガード + 連続エラーカウンタを localStorage 永続化
//         - LB_AM_TRANS_AM_LAST_AT_<ASIN> = 最終 navigate 時刻 (5秒ガード)
//         - LB_AM_TRANS_AM_ERR_COUNT     = 連続エラー数 (60秒でリセット)
//     (5) handleAmazonError を保存値破棄+完全停止に簡素化
//         - 1 回でも /errors/500 を踏んだら保存値破棄、自動 navigate なし
//
// v0.3.8.22 緊急修正 (2026-05-17 HIRO ログ + スクショ報告):
//   症状: TRANS-AM A方式で同一 buynow URL を 17 秒以内に 2 回 navigate
//         → Amazon が /errors/500 を返した
//         → screen=OTHER で bot に復帰ハンドラがなく、リロードも止まり完全に手詰まり
//   修正:
//     (1) detectScreen() に AMAZON_ERROR 画面検出を追加
//         /errors/ 配下と /ref=cs_503_link 系を全部拾う
//     (2) handleAmazonError() 新設
//         - session.productUrl に戻る (STOCK_OUT_BUYNOW と同じ仕組み)
//         - 戻る前に 3 秒 sleep (Amazon に呼吸を与える)
//         - 連続 3 回踏んだら完全停止 (bot 検知保護)
//     (3) tryInstantBuyTransAm に連投ガード (3 秒)
//         - 同一 ASIN への navigate が前回から 3 秒以内なら skip
//     (4) 正常画面 (PRODUCT/PRODUCT_AOD/CHECKOUT/COMPLETE/STOCK_OUT_BUYNOW) 到達で
//         連続エラーカウンタをリセット
//
// v0.3.8.21 で核心の根本実装 (★HIRO 手動検証で A 方式が動作確定★)
//
//   HIRO 検証手順 (2026-05-17):
//     Safari アドレスバーに以下を貼って実行:
//       /checkout/entry/buynow?ref_=...&asin.1=B07YY9MRJZ&addressID=nmopnsqrokn&...
//       (offerListing.1 抜きの URL)
//     結果: 「この商品は在庫切れのため購入できません」表示
//     = URL 構造は **完全に有効**、Amazon が ASIN から直販オファーを自動選択して
//       在庫判定までしてくれることが確定。
//
//   v0.3.8.16〜v0.3.8.20 までの試行錯誤の総括:
//     - v0.3.8.16: Buy Box の DOM (form) から取得 → Buy Box 描画待ちが必要、HIRO 意図と逆
//     - v0.3.8.17: DOM polling 追加 → 結局 Buy Box 描画待ち
//     - v0.3.8.18: HTML テキスト正規表現抽出 → JSON 抽出パターンで誤拾いリスク発生
//     - v0.3.8.19: input hidden 形式に限定 + merchantID 必須化 → 安全だが在庫なし時 URL 作れず
//     - v0.3.8.20: 保存済み URL 優先 → 事前準備フェーズが必要、保存されてない商品で動かず
//     - v0.3.8.21: ★ASIN だけで URL 作れることが判明 → 全て不要、超シンプル化
//
//   v0.3.8.21 の動作:
//     1. ASIN を商品ページ URL から抽出 (即時)
//     2. addressID を localStorage から取得 (既定値 'nmopnsqrokn')
//     3. URL 組み立て (固定値 + ASIN + addressID、offerListing.1 なし)
//     4. location.href で navigate
//     5. Amazon サーバが判定:
//          直販在庫あり → checkout 画面 → 既存 Express Checkout 自動確定 → /thankyou/
//          直販在庫なし → 在庫切れ画面 → 既存 STOCK_OUT 検出 → 商品ページ戻り
//
//   削除した実装 (v0.3.8.16〜v0.3.8.20 で入れたが A 方式で不要になった):
//     - HTML テキスト正規表現抽出 (TRANSAM_HTML_PATTERNS、decodeHtmlEntities)
//     - HTML 100ms × 10 polling (offerListingId 取得用)
//     - merchantID 二重ガード (AN1VRQENFRJN5 確認)
//     - matchedPatternIdx / matchedIndex / extractedContext ログ
//     - offerListingMentions / firstMentionContext 診断ログ
//     - localStorage URL 保存ロジック呼出 (保存ロジック自体は維持、参照されないだけ)
//
//   触らない:
//     - ⚡TRANS-AM⚡ ボタン UI / CSS
//     - 排他性 4 重バリア
//     - addressID 自動保存 (navigate 検知時、main 関数内)
//     - CSV 保存 / 分割ログ / body 末尾ログ
//     - 通常モード (🛒新規開始) 動作
//     - Express Checkout 自動確定 / /thankyou/ 検出 / STOCK_OUT 戻り
//
//   HIRO 想定運用 (シンプル):
//     1. 在庫リストック情報受信
//     2. 商品ページに行く (`?m=AN1VRQENFRJN5` 付き or 通常)
//     3. ⚡TRANS-AM⚡ 押下
//     4. 即 navigate → Amazon が判定 → 在庫あれば checkout、なければリロード
//
// v0.3.8.20 (⚡TRANS-AM⚡ 保存済み URL 即 navigate 方式) — A 方式判明で簡素化対象
//
// v0.3.8.20 で根本再設計 (★HIRO 認識「過去 URL でも在庫あれば動く」を活用★)
//
//   v0.3.8.18/19 までの試行錯誤で判明:
//     Amazon の商品ページは offerListing.1 を JS で動的に Buy Box に挿入する。
//     初期 HTML には offerListingId=null しかない。「Buy Box 表示前」に DOM から
//     取得することは物理的に不可能。
//
//   一方、HIRO さん検証で判明 (本セッション):
//     過去取得した /checkout/entry/buynow URL は 1 日以上経過しても
//     在庫さえあれば動作する。つまり offerListing.1 は時間で無効化されない。
//
//   v0.3.8.20 の新戦略:
//     一度でも /checkout/entry/buynow に navigate 到達した時、URL を商品 ASIN
//     ごとに localStorage に永続保存。⚡TRANS-AM⚡ 押下時は保存済み URL を即
//     navigate (Buy Box 描画待ちなし、HTML パースなし)。
//
//   動作フロー (3 段階):
//
//     [A] URL 自動保存 (全モード共通、navigate 検知時)
//       /checkout/entry/buynow?asin.1=<ASIN>&offerListing.1=<ID>... に
//       到達した瞬間に URL を抽出して localStorage に保存:
//         LB_AM_BUYNOW_URL_<ASIN>     = 完全 URL
//         LB_AM_BUYNOW_URL_<ASIN>_AT  = 保存時刻 (Date.now())
//       既存 addressID 保存と同じタイミングで自動実行。
//
//     [B] TRANS-AM の優先順位
//       (1) 保存済み URL (LB_AM_BUYNOW_URL_<ASIN>) あり?
//             YES → 即 navigate (HTML パース不要、最速)
//                  ログ: source=saved-url, savedAgeHours=N
//             NO  → 下の (2) へ
//       (2) HTML 抽出 fallback (v0.3.8.19 と同じ input hidden + merchantID 確認)
//             成功 → URL 組み立て + localStorage 保存 + navigate
//             失敗 → リロード継続
//
//     [C] 在庫切れ時 → 既存 STOCK_OUT_BUYNOW 検出で商品ページ戻り → リロード
//     [D] 在庫戻り時 → checkout 画面 → 既存 Express Checkout 自動確定 → /thankyou/
//
//   触らない:
//     - 排他性 4 重バリア / merchantID 必須化 (v0.3.8.19 のまま)
//     - 通常モード (🛒新規開始) → 既存通りで動く、追加で URL 自動保存
//     - Buy Box / AOD 既存ロジック
//     - target.click() 不可侵
//
//   HIRO 想定運用:
//     1. (準備) 一度 🛒 で「今すぐ買う」を経由 → URL 自動保存
//     2. 在庫リストック情報受信
//     3. 商品ページに行って ⚡TRANS-AM⚡ 押下
//     4. 保存済み URL で即 navigate → 在庫あれば checkout → 完了
//        在庫なければリロードガチャ継続
//
// v0.3.8.19 (⚡TRANS-AM⚡ 誤発注リスク緊急修正)
//
// v0.3.8.19 で緊急修正 (★HIRO 報告「危険なにおいがする」★)
//
//   v0.3.8.18 の発見されたリスク (17:28:04 ログ):
//     B07R1LFX7P で URL 組み立て成功 → navigate された。在庫切れで止まったが、
//     その時の matchedPatternIdx: 4 = JSON / script 内の "offerListingId":"..."
//     パターンから抽出していた。
//
//     危険性:
//       Amazon の商品ページ HTML には関連商品 / おすすめ / 別出品者の
//       offerListingId も JSON データとして埋め込まれている可能性がある。
//       JSON 抽出パターンはそのどれかを誤って拾ってしまう可能性がある。
//       もし在庫があったら別商品 / マケプレ出品者の checkout に進む誤発注リスク。
//
//   v0.3.8.19 修正 (3 段階防御):
//
//     [1] JSON 抽出パターン #4, #5 を廃止
//         input hidden 形式 (#0〜#3) のみ採用。Buy Box の form 内にしか
//         存在しない確実な形式に限定。
//
//     [2] 直販 merchantID 必須化 (二重ガード)
//         HTML 中に AN1VRQENFRJN5 (Amazon 直販 merchant ID) が含まれることを
//         必須化。なければ「直販ではない可能性」と判定して navigate 中止。
//
//     [3] 抽出位置の周辺コンテキストを必ずログに記録
//         matchedIndex + extractedContext (前後 100/400 文字) を毎回出力。
//         「どこから抽出したか」が完全に追跡可能になる。診断・監査用。
//         失敗時も offerListingMentions (HTML 中の出現回数) + firstMentionContext を記録。
//
//   触らない:
//     - ⚡TRANS-AM⚡ ボタン UI / CSS
//     - 排他性 4 重バリア
//     - addressID 保存
//     - CSV 保存 / 分割ログ
//     - 通常モード (🛒新規開始)
//
// v0.3.8.18 (⚡TRANS-AM⚡ HTML 抽出方式に根本修正) — JSON 抽出パターンに誤発注リスク発見
//
// v0.3.8.18 で根本修正 (★HIRO 指摘「Buy Box 表示前に押したい」要望に正しく対応★)
//
//   v0.3.8.16〜v0.3.8.17 の致命的誤解:
//     tryInstantBuyTransAm は #buy-now-button.closest('form') の hidden input
//     から offerListing.1 を取っていた。これは Buy Box の DOM 描画後にしか
//     取れない = HIRO さんの要望「Buy Box 表示前に押したい」と完全に真逆だった。
//     v0.3.8.17 で polling を入れたが、本質的に Buy Box 描画待ちなので同様。
//
//   v0.3.8.18 修正方針 (HIRO 確認済 = 方式 A):
//     「在庫があれば購入に動く」= Amazon の HTML テキストに offerListing.1 が
//     含まれていれば直販在庫あり、含まれなければ在庫なし、で判定する。
//
//     document.documentElement.outerHTML から正規表現で offerListing.1 を
//     直接抜く。Buy Box の DOM 描画完了は **一切待たない**。HTML 受信途中の
//     可能性に備えて 100ms × 10 = 最大 1 秒の短い polling のみ。
//
//   実装:
//     - 6 種のパターン (input hidden 順序 2 通り + offerListingId 変種 2 通り
//       + JSON/script 内 2 通り) で HTML テキストを検索
//     - HTML entity (&amp; / &quot; / &#39; / &#x2F; 等) も decode
//     - 最初にマッチした offerListing.1 を採用 (?m=AN1VRQENFRJN5 強制 URL なら
//       直販のもの 1 個しかない想定)
//     - 取れなければ「直販在庫なし」と判定してリロード継続
//
//   触らない (v0.3.8.16/v0.3.8.17 のまま):
//     - ⚡TRANS-AM⚡ ボタン UI / CSS
//     - 排他性 4 重バリア
//     - addressID 保存
//     - CSV 保存 / 分割ログ / body 末尾ログ
//     - 通常モード (🛒新規開始) 動作
//
// v0.3.8.17 (⚡TRANS-AM⚡ DOM 描画待ち追加 緊急修正) — 設計誤りで v0.3.8.18 で再修正
//
// v0.3.8.17 で修正 (★HIRO 報告「TRANS-AM 押したらリロードガチャ永遠ループ」★)
//
//   症状 (HIRO 17:10〜17:13 ログ):
//     ⚡TRANS-AM⚡ 押下 → 商品ページ着地 10ms 後に判定 → DOM 未描画 →
//     allFormsCount: 1 (検索 form のみ) → 「form 未取得」 → 即リロード
//     → これを 34 回繰り返し、永遠にロード前リロードガチャ
//
//   原因:
//     v0.3.8.16 の tryInstantBuyTransAm は判定 1 回 (form 探索) で
//     「ない → リロード」。既存の通常モードは buybox-poll で 500ms × 6 =
//     最大 3 秒 DOM 描画を待つので問題ないが、TRANS-AM は待ち時間ゼロで
//     即判定 → ページが描画される時間がない。
//
//   修正 (1 関数の中身だけ、UI 等は全部維持):
//     - tryInstantBuyTransAm の form 探索を polling 化
//       (200ms × 10 = 最大 2 秒、出現次第即抜ける)
//     - 同様に offerListingId 探索も polling 化
//       (form 出現後も hidden input が遅れて挿入される可能性に対応、
//        100ms × 10 = 最大 1 秒)
//     - どちらも S.shouldHalt() で停止に即応 (緊急停止可能)
//
//   触らない:
//     - ⚡TRANS-AM⚡ ボタン HTML/CSS (v0.3.8.16 のまま)
//     - 排他性 4 重バリア (v0.3.8.16 のまま)
//     - addressID 保存ロジック (v0.3.8.16 のまま)
//     - CSV 保存 / 分割ログ / body 末尾ログ (v0.3.8.16 のまま)
//     - 通常モード (🛒新規開始) 動作 (v0.3.8.16 のまま、無変更)
//
// v0.3.8.16 (⚡TRANS-AM⚡ モード + CSV 保存 + 分割ログ)
//
// v0.3.8.16 で追加 (★HIRO 主訴: 「Buy Box/AOD 表示待たずに今すぐ買う直撃」★)
//
//   主旨:
//     v0.3.8.15 の buynow-form-dom ログから「今すぐ買う」URL のパラメータが
//     商品ページ DOM の hidden input から取得可能と判明。これを使って
//     Buy Box の描画完了を待たずに /checkout/entry/buynow?... を直接組み立てて
//     navigate するモードを新規追加。
//
//   入れた 5 件:
//
//     [A] ⚡TRANS-AM⚡ ボタン + モード実装 (新規動作)
//       新規ボタン (パネル 🛒新規開始 の下に縦並び) 押下時:
//         1. 現 URL を session.productUrl に保存 (エラー時の戻り先)
//         2. localStorage.LB_AM_TRANS_AM_MODE = '1'
//         3. mode: STOPPED → RUNNING
//         4. ステータス欄に「⚡ TRANS-AM 発動中」表示
//       handleProductPage 入口で TRANS-AM フラグ判定:
//         ON  → tryInstantBuyTransAm() 実行 (既存 attemptPurchase は走らない)
//         OFF → 既存 attemptPurchase (これまで通り)
//       tryInstantBuyTransAm 動作:
//         - ASIN を URL から抽出
//         - addressID を localStorage から取得 (なければ 'nmopnsqrokn')
//         - offerListing.1 を #buy-now-button の form 内 hidden input から
//         - 3 つ揃えば URL 組み立てて location.href で navigate
//         - 1 つでも欠ければスキップ → リロードガチャ継続
//       navigate 後は既存ロジック (Express Checkout モーダル + 確定ボタン
//       自動 click + /thankyou/ 検出) がそのまま走る。
//
//     [B] 排他性 4 重バリア:
//       (i)   UI: 動作中は 🛒も⚡も非表示、開始ボタン同時押し不可能
//       (ii)  コード: if/else + return で物理的に二重実行不可
//       (iii) 開始時クリーンアップ: opStart は TRANS-AM フラグ強制 remove、
//             opStartTransAm は前 session 強制 clearSession
//       (iv)  停止時クリーンアップ: opFullStop で TRANS-AM フラグ削除
//             /thankyou/ 到達時も同じ
//
//     [C] addressID 自動保存:
//       既存の通常ルートで /checkout/entry/buynow?addressID=... に navigate
//       した時に URL から addressID を抽出して localStorage に保存。
//       次回 TRANS-AM 起動時はこの保存値を使用 (一度通常モードで動かせば
//       次から TRANS-AM が完全動作可能になる)。
//
//     [D] ログ画面に「📥 CSV 保存」ボタン:
//       localStorage 内のログ全件を CSV ファイルとしてダウンロード
//       (UTF-8 with BOM、ファイル名 gundambot-amazon-log-YYYYMMDD-HHMMSS.csv)
//       列: timestamp / perfMs / level / tag / message / data(JSON)
//       Discord 1 通 2000 文字制限の壁を回避し、完全なログを取り出せる。
//
//     [E] buynow-form-dom を input 1 個ごとに分割ログ:
//       v0.3.8.15 で 19 個 input を 1 件ログに詰めていたが Discord で切れた。
//       v0.3.8.16 では `buynow-form-input-N` タグで 1 input = 1 ログに分割。
//       offerListing.1 の name が確実に Discord で見える化。
//
//   触らない (既存動作完全維持):
//     - 既存 attemptPurchase 本体 (Buy Box / AOD 検出 + click)
//     - 既存 clickBuyNowOrAddToCart の target.click() (絶対不可侵)
//     - 既存 clickAodAmazonOffer の AOD click 処理
//     - 既存 Express Checkout モーダル検出 + performOrderConfirm
//     - 既存の screen 判定 (STOCK_OUT_BUYNOW 戻り処理 等)
//     - 既存の状態管理 (mode/step/session) 構造
//     - 🛒新規開始ボタンを押した時の動作は 1ms も変わらない
//
// v0.3.8.15 (API ベース成功判定 + 422 body 拡張 + buynow URL 調査ログ)
//
// v0.3.8.15 で追加 (★ログ拡張 + API レベル成功検知の追加、既存動作は維持★)
//
//   背景 (v0.3.8.14 までのログから判明した 2 事象):
//     (1) 09:11:53 セッション (B0DPFH5SR3 ¥991) で AOD カート追加 POST が
//         200 を返していたのに、Bot は「カートを見る」visible 検出を
//         待っていて 2 秒タイムアウトで失敗扱い → リロード継続
//         → Amazon サーバ側ではカート追加成功している可能性が高いのに、
//           Bot が DOM 検出に固執して失敗判定してた
//     (2) 422 失敗の response body が頭 1000 文字で切れていて、
//         add-items.incomplete-add.error/v1 の中身 (失敗理由) が見えない
//
//   対応 (3 点、既存動作には触らず追加のみ):
//
//     [A] aod-click-network-error-body / buynow-click-network-error-body の
//         bodyHead を 1000 → 3000 文字に拡張。
//         422 拒否の根本原因 (entity.failedItems など) を完全に取れるように。
//
//     [B] AOD カート追加 API 200 検知ショートカット:
//         observeNetworkAfterAodClick が POST /cart/carts/retail/items の
//         200 レスポンスを検知したら、グローバル変数 _aodCartAddApiOk に
//         記録。clickAodAmazonOffer の「カートを見る」visible 待ちループ内で
//         このフラグを並列チェックし、検知時は DOM を待たずに直接 checkout
//         (buildDirectCheckoutUrl があれば直行、なければ /gp/cart/view.html)
//         に navigate して進む。
//         既存の「カートを見る」visible 検出は **そのまま残す** (壊さない、
//         追加で API 検知のショートカットを足すだけ)。AOD click 直前で
//         フラグをリセットして前回値が残らないようにする。
//         ログタグ: aod-cart-api-ok (200 検知時) /
//                   aod-api-success-bypass (DOM 待ちスキップして checkout 直行)
//
//     [C] dumpBuyNowFormDom() 新規関数:
//         「今すぐ買う」ボタン (#buy-now-button) の周辺フォーム DOM を
//         ダンプ (form action / method / 全 hidden input の name/value)。
//         attemptPurchase の Buy Box 直販ヒット時に 1 回だけログ出力。
//         目的: v0.3.8.16 で「今すぐ買う click 後の checkout URL を
//         商品ページの DOM から組み立てて直接 navigate」する実装の検証用
//         情報収集 (HIRO 要望「今すぐ買う URL をツールで組み立てる」)。
//         本バージョンでは観測のみ、動作変更なし。
//         ログタグ: buynow-form-dom
//
//   触らない:
//     - 既存の「カートを見る」visible 検出ロジック (B は追加のショートカットのみ)
//     - target.click() 呼出 (絶対不可侵)
//     - Buy Box ルートの動作ロジック (C は観測のみ)
//     - AOD ルートの click 投入箇所 (B は click 後の検出フェーズに追加)
//     - 状態管理、ハンドラ、Express Checkout
//
// v0.3.8.14 (v0.3.8.13 緊急ロールバック: fetchAodAjax 呼出削除)
//
// v0.3.8.14 で修正 (★HIRO 報告「Buy Box も AOD も悪い」緊急対応★)
//
//   症状 (HIRO 報告):
//     v0.3.8.13 配信後、Buy Box ルートも AOD ルートも両方おかしい。
//
//   原因 (本セッションで特定):
//     v0.3.8.13 で attemptPurchase の ?m= AOD ナビ分岐に追加した
//     fetchAodAjax(asin) の fire-and-forget 呼び出しが、Amazon サーバへ
//     「ユーザー操作起因ではない AJAX リクエスト」(/gp/product/ajax/aodAjaxMain)
//     を毎サイクル送信していた。
//
//     fire-and-forget でも Amazon にリクエストが届いた時点で副作用は発生する:
//       - bot 検知パターンに合致 (人間操作なしの AJAX poll)
//       - リロードガチャで毎サイクル発射 → セッション汚染
//       - 結果として Buy Box の応答も AOD の応答も両方おかしくなる
//
//   対応 (緊急ロールバック、ログ機能の一部維持):
//     - attemptPurchase 内 fetchAodAjax(asin) 呼び出しを削除
//       (関数定義そのものは将来用に残置、未使用状態)
//     - 4xx/5xx response body 取得拡張 (aod-click-network-error-body /
//       buynow-click-network-error-body) は維持 (passive 観測のみ、
//       Amazon に追加リクエストを送らないので副作用ゼロ)
//
//   結果として v0.3.8.14 は事実上 v0.3.8.12 + 4xx/5xx body 観測のみ。
//   422 原因究明は aod-click-network-error-body の bodyHead で引き続き可能。
//
// v0.3.8.13 (AOD AJAX 観測 + 4xx/5xx response body 取得版) — 緊急ロールバック対象
//
// v0.3.8.13 で追加 (★ログ追加のみ、動作中ロジック完全無変更★)
//
//   背景:
//     v0.3.8.12 ログで AOD カート追加 API の 422 連発が確認された。
//     原因究明には response body が必要。また AOD ナビの 1.5-2 秒を
//     将来短縮できるか、AOD AJAX endpoint が iPhone Safari Userscripts
//     で取得可能かを観測モードで検証する。
//
//   対応 (2 点、ログ追加のみ、動作変更ゼロ):
//
//     [A] fetchAodAjax(asin) 新規関数:
//       /gp/product/ajax/aodAjaxMain/ref=dp_aod_ALL_mbc?asin=...&pc=dp に
//       fetch(GET, credentials:include) で取得 → DOMParser でパースして
//       #aod-pinned-offer / #aod-offer-soldBy / submit.addToCart input /
//       offerCount / 全 input の name/value を 'aod-ajax-fetch' タグでログ。
//       attemptPurchase の「?m= で Buy Box 空 → AOD ナビ」分岐直前で
//       fire-and-forget 呼出 (await しない、結果は使わない、既存フロー不変)。
//
//     [B] observeNetworkAfterAodClick / observeNetworkAfterBuyNowClick の
//         4xx/5xx response body を取得:
//       - fetch hook: response.status >= 400 で response.clone().text() で
//         body を取得し 'aod-click-network-error-body' タグで body 頭 1000 文字
//       - XHR hook: xhr.status >= 400 で xhr.responseText を取得し同タグでログ
//       - BuyNow 版も同様、タグは 'buynow-click-network-error-body'
//
//   新規ログタグ:
//     - aod-ajax-fetch                  : AOD AJAX endpoint fetch 結果
//     - aod-click-network-error-body    : AOD click 後 4xx/5xx の body
//     - buynow-click-network-error-body : BuyNow click 後 4xx/5xx の body
//
//   触らない:
//     - target.click() 呼出 (絶対不可侵、HIRO 確認済み 不変)
//     - 既存 observeNetworkAfterAodClick / observeNetworkAfterBuyNowClick の
//       request 側 hook 構造 (records.push / 即時 logAm 発火) は無変更、
//       4xx/5xx body 取得を addEventListener('loadend') / .then(...) で追加
//     - Buy Box ルート / AOD ルート全体の動作ロジック
//     - 状態管理 (mode, step, session, reloadCount)
//     - Express Checkout, performOrderConfirm
//
// v0.3.8.12 (Buy Box ルートの buynow click 後通信観測版)
//
// v0.3.8.12 で追加 (★ログ追加のみ、動作中ロジック完全無変更★)
//
//   背景:
//     v0.3.8.10 で AOD click 後の通信観測 (observeNetworkAfterAodClick) を
//     即時出力方式で実装済。これと同じ仕組みで Buy Box ルートの「今すぐ買う」
//     click 後の通信も観測したい (HIRO 要望)。
//     過去ページが時間経っても買えた事実から、buynow リクエストには時間経過に
//     強いパラメータ (永続情報) が含まれているはず。それを完全観測する。
//     v0.3.9 で「商品 URL + 保存値 + 固定値」から buynow URL を組み立てて直接
//     navigate する実装の基礎情報を取得する。
//
//   対応 (ログ追加のみ、動作変更ゼロ):
//     - observeNetworkAfterBuyNowClick() 新規関数:
//       実装は AOD 版 observeNetworkAfterAodClick とほぼ同一の即時出力方式。
//       fetch/XHR 検知の瞬間に即 logAm 発火、status は readystatechange /
//       fetch.then で後追い別ログ、5 秒経過で hook 解除。
//       fetch response の responseUrl / redirected も記録 (Buy Box の navigate 解析用)。
//     - 「今すぐ買う」target.click() の直前で observeNetworkAfterBuyNowClick(5000)
//       を呼び出して hook を仕掛ける (click 投入そのものは無変更)。
//
//   新規ログタグ:
//     - buynow-click-network        : fetch/XHR 検知の瞬間 (即時)
//     - buynow-click-network-status : 各 req の status 確定時
//     - buynow-click-network-end    : 5 秒経過で hook 解除した時
//
//   触らない:
//     - target.click() 呼出そのもの (引継ぎ書 §6 で HIRO 確認済み 不変)
//     - 既存 observeNetworkAfterAodClick 関数 (完全並行動作、タグ別で混ざらない)
//     - Buy Box ルート / AOD ルート全体の動作ロジック
//     - 状態管理 (mode, step, session, reloadCount)
//     - Express Checkout, performOrderConfirm
//     - 既存ログタグ (aod-*, buybox-*, click-buynow, express-modal,
//       order-confirm, iframe-postmsg, order-complete, step, mode 等)
//
// v0.3.8.11 (AOD パネル DOM 完全観測版)
//
// v0.3.8.11 で追加 (★ログ追加のみ、動作中ロジック完全無変更★)
//
//   背景:
//     v0.3.8.10 ログで AOD カート追加 422 失敗時の offerListingId が
//     成功時と全く違う頭文字 (H vs U) で観測された。AOD パネル展開ごとに
//     別の出品オファーを掴んでいる可能性。
//
//   対応 (調査ログ追加のみ):
//     - dumpAllAodCartButtons() 新規:
//       AOD パネル内の全 cart 追加ボタンをリスト化
//       (input[name="submit.addToCart"] / data-csa-c-content-id="aod-atc-mobile"
//        / aria-label*="カートに追加" を重複排除して全部取得)
//       各ボタンの aria-label / outerHTML / 周辺 seller テキスト / 親 chain を記録
//     - dumpClickTargetFormStructure() 新規:
//       click 対象ボタン周辺 20 階層の DOM を完全観測
//       hidden input、data-* 属性、上位 5 階層の script タグ内 offerListingId を
//       全部抽出し offerListingIdCandidates 配列に集約
//     - aod-all-buttons ログ新規 (aod-direct-skip 直後):
//       パネル内の全ボタンリスト
//     - aod-click-target-dom ログ新規 (aod-direct-skip 直後):
//       click 対象周辺 20 階層 DOM の offerListingId 候補
//     - aod-click-target ログ新規 (cartButton.click() 直前):
//       click 投入直前の対象ボタン識別情報 (aria-label / outerHTML / csa-c-* 全属性)
//
//   触らない:
//     - Buy Box ルート、AOD ルート全体の動作ロジック ─ 全て無変更
//     - 状態管理 (mode, step, session, reloadCount) ─ 無変更
//     - 既存ログタグ (aod-direct-skip, aod-panel-structure, aod-click-network,
//       aod-click-network-status, aod-click-network-end, buybox-poll など) ─ 無変更
//     - cartButton.click() 呼出そのもの ─ 無変更 (直前にログを追加するだけ)
//
//   目的:
//     v0.3.9 で「正しい出品者の offerListingId を確実に選ぶ」実装のための
//     情報収集。本バージョンは観測のみで動作変更なし。
//
// v0.3.8.10 (全部常時 ON 方針の徹底適用)
//
// v0.3.8.10 で変更 (★出力方式変更 + キャッシュ廃止、動作ロジック変更ゼロ★)
//
//   背景: v0.3.8.9 ログで「常時 ON」が 2 箇所で徹底されていなかった
//     (1) aod-click-network が 5 秒バッチ蓄積 → 画面遷移で setTimeout 消失
//         → AOD カート追加成功時に cart 画面に navigate するとログが
//            1 件も出ない (records 配列が捨てられる)
//     (2) aod-env-snapshot が localStorage 'LB_AM_AOD_ENV_SIG' 永久キャッシュ
//         → HIRO さんが過去に 1 度でも実行すると、その後永遠に出ない
//
//   対応:
//     - observeNetworkAfterAodClick を即時出力方式に書き換え:
//       * fetch/XHR 検知の瞬間に即 logAm 'aod-click-network' を発火
//       * status は readystatechange / fetch.then で後追い別ログ
//         (新タグ 'aod-click-network-status')
//       * 5 秒経過で hook 解除 + 'aod-click-network-end' を 1 件出力
//       * records 配列によるバッチ蓄積を完全廃止
//     - aod-env-snapshot を localStorage キャッシュから in-memory 1 回フラグへ:
//       * モジュールスコープに `let aodEnvSnapshotLogged = false;`
//       * handleProductAod 内でフラグ参照、未出力なら出力 + フラグ ON
//       * 新セッション開始 (mode: STOPPED → RUNNING) でフラグを false にリセット
//       * 旧 localStorage キー 'LB_AM_AOD_ENV_SIG' は起動時に removeItem (任意整理)
//
//   新規ログタグ:
//     - aod-click-network-status: 各 req の status 確定時 (200 / 401 / 409 等)
//     - aod-click-network-end:    5 秒経過で hook 解除した時
//
//   維持:
//     - dumpCookieSnapshot 関数定義 (将来再利用余地)
//     - 既存ログタグ全て (aod-direct-skip, aod-panel-structure, aod-cart-fallback,
//       aod-view-cart-emergence, buybox-poll, buybox-detect, buybox-hidden-input,
//       aod-prebuy, click-buynow など)
//     - 動作中ロジック (Buy Box, Express Checkout, 状態管理, ハンドラ分岐, reload)
//     - 個人情報マスクなし方針
//
// v0.3.8.9 (AOD click 後通信の完全捕捉版)
//
// v0.3.8.9 で変更 (★ログ拡張 + ノイズ削除のみ、動作ロジック変更ゼロ★)
//
//   背景: v0.3.8.8 ログから以下が判明
//     (1) session-id / x-main は HttpOnly cookie で JavaScript からアクセス不可
//         → cookie 経路は原理的に不可能、cookie ダンプログは情報的価値ゼロ
//     (2) AOD パネル構造は #aod-atc-bottom-sheet-id (モバイル下部シート)
//     (3) AOD カート追加が連続失敗しているが、通信ログが取れていない
//         (observeNetworkAfterAodClick が起動条件で抑制されている可能性)
//
//   対応:
//     - observeNetworkAfterAodClick を確実に常時 ON 化 (v0.3.8.8 で削除済を再確認)
//     - 同関数を拡張: POST/PUT body と response status も記録
//       * fetch: init.body を string/FormData/URLSearchParams 各パターンで取得
//       * fetch: response.status を then で取得
//       * XHR: send(body) の引数 body を取得
//       * XHR: readystatechange で status を取得
//       * body と URL は頭 1000 文字で切る (可読性、隠蔽ではない)
//     - cookie ダンプ呼出 3 箇所を削除 (HttpOnly 確定でノイズ化):
//       * main 関数の cookie-snapshot-product
//       * clickAodAmazonOffer の cookie-snapshot-aod-pre
//       * clickAodAmazonOffer の cookie-snapshot-aod-post
//
//   維持:
//     - dumpCookieSnapshot() 関数定義そのものは残す (将来再利用余地)
//     - aod-panel-structure, buybox-poll, buybox-hidden-input 維持
//     - collectAodEnvSnapshot の v0.3.8.8 拡張項目 (cookie/sandbox/referrer 9 項目) 維持
//     - Buy Box ルート、Express Checkout、状態管理、ハンドラ ─ 全て無変更
//
// v0.3.8.8 (調査ログ追加版 - AOD 短縮ルートを Safari で動かすため)
//
// v0.3.8.8 で追加 (★調査ログのみ、動作ロジック変更ゼロ★)
//
//   目的:
//     AOD 短縮ルート (form 取得 + cookie 経由 checkout) が Safari で
//     100% 不発する原因を解明するための調査ログを全部入れる。
//     動作ロジックは一切変更しない。
//
//   追加関数 2 個:
//     - dumpCookieSnapshot()       : document.cookie 全件を生値でダンプ
//     - dumpAodPanelStructure()    : AOD パネル全 form + #aod-pinned-offer 構造
//
//   拡張関数 3 個:
//     - collectAodEnvSnapshot()    : cookie/sandbox/referrer 9 項目追加
//     - dumpAodButtonContext()     : 親chain 10→15 階層、outerHTML 150→200 文字
//     - observeNetworkAfterAodClick() : URL 150→300 文字
//
//   新規ログタグ 6 個:
//     - cookie-snapshot-product   (商品ページ到達時)
//     - cookie-snapshot-aod-pre   (AOD click 直前)
//     - cookie-snapshot-aod-post  (カートを見る検出時)
//     - aod-panel-structure       (AOD form not found 時)
//     - buybox-poll               (detectBuyBoxSeller 各 i)
//     - buybox-hidden-input       (Buy Box hidden input)
//
//   verbose スイッチ廃止:
//     observeNetworkAfterAodClick 起動の verbose チェック
//     を削除し、全部常時 ON 化 (v0.3.8.8 で完全削除済み)
//
//   個人情報マスクなし:
//     HIRO さん本人専用運用、検証への影響回避が最優先のため。
//     cookie 値が極端に長い場合のみ 250 文字で切る (可読性のため、隠蔽ではない)。
//
//   触らない箇所:
//     - 動作中の AOD click タイミング、buildDirectCheckoutUrl 正規表現
//     - Express Checkout 自動 click (turbo-checkout-pyo-button)
//     - 状態管理 (MODE/STEP)、ハンドラ分岐、reload 制御
//     - 既存ログタグの出力フィールド名 (追加のみ、削除/改名 NG)
//
// v0.3.8.7 (トーストはみ出し修正: パネル最大高拡張 + flex shrink 抑止)
//
// v0.3.8.7 で修正 (★HIRO 主訴「まだはみ出てる」★)
//
//   原因:
//     v0.3.8.6 でデザインを整えたが、iPhone 縦画面で:
//       panel max-height: 64vh = iPhone 14 で 540px、SE で 427px
//       status (8 行 ≈ 162px) + buttons (3 個 ≈ 215px) + padding/gap (24px)
//       = 401px の固定領域。残り 39〜139px しかトーストに割り当てられない。
//       トースト max-height: 110px・flex: 0 1 auto で shrink、min-height なし
//       → iOS Safari の flex shrink + overflow-y:auto で上部だけ表示、
//         「下部がはみ出して見える」状態に。
//
//   修正 (CSS のみ、ロジック触らず、デザイン維持):
//     1. #lb-am-panel max-height: 64vh → 78vh
//        iPhone 14 (844px): 540→658px (+118px)
//        iPhone SE (667px): 427→520px (+93px)
//        → どのデバイスでもトースト 2 件まで余裕
//     2. #lb-am-panel-toasts:
//        flex: 0 1 auto → 0 0 auto (shrink 禁止)
//        min-height: 32px 追加 (トースト 1 件分の保証)
//        → flex shrink で潰されずトーストが完全に描画される
//
//   触らない箇所:
//     - status の text-shadow / box-shadow (v0.3.8.6 で確定したデザイン)
//     - toast の sans-serif + 紫グラデ + ピンク left-border (v0.3.8.6 アラート型)
//     - buildDirectCheckoutUrl + checkout 直行 (v0.3.8.5)
//     - 観測機構 4 関数 (v0.3.8.4)
//     - tryAodFetchAndDirectCheckout 3 段階フォールバック (v0.3.8.3)
//     - _activeFetchAborters / AbortController (v0.3.8.3)
//     - 既存ボタン ID / onclick / S.* 状態管理 / 全ハンドラ
//
// v0.3.8.6 (UI 仕上げ: 文字二重描画解消 + ステータス/トースト視覚分離)
//
// v0.3.8.6 で修正 (★HIRO 主訴「ステータスに古いステータスが重なって2重に見える」★)
//
//   原因 (2 つ同時発生):
//     A. status の text-shadow に solid offset (1px 1px 0 / 2px 2px 0) があり、
//        blur=0 で「ぼやけない文字のコピー」が右下にズレて描画 → 文字が階段状に
//        3 重に見える (TRANS-AM ロゴ風のステンシル効果のつもりだったが過剰)
//     B. v0.3.8.5 の margin-top:-8px で flex gap を打ち消した結果、
//        status と toast が同じ rgba(21,7,26,0.85) 系の背景で密着 → 視覚的に
//        一体化、toast が「古いステータス」のように見える
//
//   修正 (CSS のみ、ロジック触らず):
//     1. status の text-shadow を glow 2 段 + 単一 soft drop に簡素化
//        旧: 4 段 (glow 2 + solid offset 2)
//        新: 0 0 6px / 0 0 14px / 0 2px 5px (blur あり)
//        -webkit-text-stroke: 0.3px で文字エッジを補正 (HUD 感維持)
//     2. status の box-shadow に inset 0 -2px 0 ピンク hairline 追加
//        HUD フレーム感、status の下端を明示
//     3. v0.3.8.5 の margin-top:-8px を撤回 → flex gap 8px 復活
//        navy gap は status と toast の意図的な「呼吸スペース」になる
//     4. toast を「アラート型」に再デザイン (status と明確差別化)
//        - フォント: Impact 系 → sans-serif (system stack)
//        - 文字色: ピンク (--ta-pink-soft #ffb3e8)
//        - 背景: linear-gradient 95deg 紫グラデ (rgba(46,15,54) → rgba(34,12,42))
//        - border-left: 3px ピンクアクセント
//        - box-shadow: 0 2px 6px で「浮遊感」
//        - text-transform: none (Impact 系を継承させない)
//
//   結果:
//     - status は HUD ラベル (Impact + マゼンタ + glow + hairline)
//     - toast は アラート (sans-serif + 紫 + ピンクアクセント + 浮遊感)
//     → 視覚的に完全に別物として認識される
//
//   触らない箇所:
//     - buildDirectCheckoutUrl + checkout 直行 (v0.3.8.5)
//     - 観測機構 4 関数 (v0.3.8.4)
//     - tryAodFetchAndDirectCheckout 3 段階フォールバック (v0.3.8.3)
//     - _activeFetchAborters / AbortController (v0.3.8.3)
//     - 既存ボタン ID / onclick / S.* 状態管理 / 全ハンドラ
//
// v0.3.8.5 (Safari AOD 短縮: cart→byg スキップ -2.7秒 + 白い帯修正)
//
// v0.3.8.5 で修正 (★既存ログのみで Safari 短縮機能を完成★)
//
//   主旨:
//     v0.3.8.4 観測ログ (12:36, 13:14) から AOD click 後の経路が判明:
//       「カートを見る」visible → /gp/cart/view.html → /checkout/byg/...
//        → /checkout/entry/cart?proceedToCheckout=1... → /thankyou/
//     中間 2 画面 (cart, byg) で約 2.7 秒消費。
//     「カートを見る」visible = カート追加完了の合図なので、cart 画面に行かず
//     直接 /checkout/entry/cart に navigate して短縮。
//
//   実装 (機能):
//     1. 新関数 buildDirectCheckoutUrl 追加 (clickAodAmazonOffer の直前)
//        - cookie 'session-id' から sessionID 取得 (XXX-XXXXXXX-XXXXXXX 形式)
//        - cookie 'x-main' から customerId 取得 (10 文字以上)
//        - input fallback も維持 (sessionID/customerId)
//        - どちらか取れなければ null 返却 → 従来経路 fallback
//     2. clickAodAmazonOffer 内、「カートを見る」visible 検出後の navigate を分岐
//        - 直行 URL 取得成功 → /checkout/entry/cart? に直接遷移 (約 -2.7 秒)
//        - 失敗 → 従来の /gp/cart/view.html (劣化なし)
//
//   実装 (UI 修正、白い帯):
//     v0.3.8.4 の panel-layout-snapshot で判明:
//       statusBox bottom: 405, toastsBox top: 413 → 8px 隙間に panel 背景透け
//     CSS 追加:
//       #lb-am-panel-toasts { margin-top: -8px !important; }
//       #lb-am-panel-toasts > div { background/color !important; }
//
//   ログ:
//     - aod-direct-checkout: 直行 URL 経由 (成功時)
//     - aod-cart-fallback: cookie 取得失敗で従来経路 (劣化なし)
//
//   触らない箇所:
//     - AOD ボタン click 処理本体
//     - 「カートを見る」visible 検出ロジック (aod-view-cart-emergence 含む)
//     - PC Chrome の form-base 経路 (tryAodFetchAndDirectCheckout 本体)
//     - _activeFetchAborters / AbortController
//     - 観測機構 4 関数 (collectAodEnvSnapshot, dumpAodButtonContext,
//       observeNetworkAfterAodClick, dumpPanelLayout)
//     - findAodAmazonOffer, attemptPurchase 本体
//     - パネル本体の DOM 構造, toast 関数, panel-toasts への追加処理
//
// v0.3.8.4 (観測機構の恒久実装 + UI 不具合修正)
//
// v0.3.8.4 で修正 (HIRO 指示「今後のこともあるから必要なログを取れるように実装すること」)
//
//   主旨:
//     今回限りのデバッグログではなく、観測能力そのものを恒久組み込み。
//     今後の Amazon UI 変化や環境変化を推測ゼロで取れる仕組み。
//
//   実装した観測機構 4 つ:
//     [1.1] collectAodEnvSnapshot   - AOD 環境フィンガープリント
//           UA / body class / form 数 / input 種別 / viewport / CSRF token 有無
//           localStorage 'LB_AM_AOD_ENV_SIG' キャッシュ、1 セッション 1 回のみ
//           ログタグ: aod-env-snapshot
//     [1.2] dumpAodButtonContext    - AOD ボタン DOM dump
//           tag / type / attrs / outerHTML 250 文字 / closestForm / 親 10 階層
//           tryAodFetchAndDirectCheckout の skip ログに自動添付
//     [1.3] observeNetworkAfterAodClick - ネットワーク観測 (verbose mode 限定)
//           CONFIG.verboseAodDebug=true で AOD click 後 5 秒 fetch/XHR 全記録
//           ログタグ: aod-click-network
//     [2.3] dumpPanelLayout         - パネル UI 構造診断
//           panel / status / toasts の getBoundingClientRect + toast class
//           開始ボタン押下時に 1 回ログ
//           ログタグ: panel-layout-snapshot
//
//   追加ログ (機能改修なし):
//     - aod-view-cart-emergence: 「カートを見る」visible 検出までの所要 ms
//
//   設定追加:
//     - CONFIG.verboseAodDebug (デフォルト false)
//     - amazon.html に「🔬 AOD 詳細デバッグ」チェックボックス
//     - netlify/functions/amazon_userscript.js に verbose_aod_debug=1 受付
//
//   UI 不具合修正 (スクショの「白い帯」対策):
//     - #lb-am-panel-toasts > div の保険スタイルを literal 値で全プロパティ指定
//     - .lb-am-toast class が付かないケースでも CSS が適用される
//     - 透かしの z-index 競合を防ぐため #lb-am-panel-toasts に z-index:2 維持
//
//   防御:
//     - 全観測関数を try/catch で完全防御 (失敗しても本体に影響なし)
//     - localStorage アクセスも try/catch
//     - fetch/XHR の wrap は必ず setTimeout 内で原関数を restore
//     - CONFIG.verboseAodDebug が undefined でも default false で動作
//
//   触らない箇所:
//     - tryAodFetchAndDirectCheckout の本体ロジック (今回は機能変更なし)
//     - findAodAmazonOffer, clickAodAmazonOffer, attemptPurchase の本体
//     - v0.3.8.3 の UI 修正 (透かし status::before, HUD マーカー削除, toast CSS 委譲)
//     - _activeFetchAborters / AbortController / setInterval ID clear
//     - 既存ボタン ID/onclick, S.* 状態管理, 全ハンドラ
//     - CB_LOGO_DATA_URL, TRANS_AM_BG_DATA_URL 定数
//     - cbPanelMaterialize/cbBreathing アニメ名
//     - STOP_RED, BUY_GREEN 定数
//
// v0.3.8.3 (機能: AOD 3段階フォールバック / UI: 透かし範囲縮小 + 停止即応化)
//
// v0.3.8.3 で修正 (★HIRO 主訴 5 件統合対応★)
//
//   主訴:
//     1. v0.3.8 機能が iOS Safari で 100% fallback → ASIN 逆引きで救済
//     2. toast が裏で出てカッコ悪い → CSS 委譲化、TRANS-AM 統一スタイル
//     3. 透かしはステータスのところだけ、ボタン後ろは不要 → panel::after 削除
//     4. HUD コーナーマーカー (panel::before) 不要 → 削除
//     5. 停止ボタンがすぐ発動しない → AbortController + setInterval ID 保存
//
//   修正:
//     [機能] tryAodFetchAndDirectCheckout に 3 段階フォールバック追加
//       Step 1:  closest('form') 試行 (既存)
//       Step 1b 新規: closest 失敗時に ASIN 逆引き
//                     (form.AodAddToCart 全列挙、items[0.base][asin] が ASIN 一致)
//                     実機検証 (PC Chrome 2026-05-16) で 200 OK 確認済
//       Step 1c 新規: それでも失敗時に DOM 情報を logAm に出力 (調査用)
//       Step 5:  fetch に AbortController.signal 付与 (停止ボタン即応)
//     [UI-1] toast 関数を CSS 委譲化 (.lb-am-toast class + --toast-accent 変数)
//     [UI-2] panel::after (透かし全面) 削除、#lb-am-panel-status::before に移動
//     [UI-3] panel::before (HUD コーナーマーカー) 削除
//     [UI-4] .lb-am-toast の CSS 定義追加 (TRANS-AM 統一)
//     [UI-5] startBadgeUpdater と モード変更検知 setInterval を ID 保存型に
//     [UI-6] 完全停止 click handler を即応化:
//            S.opFullStop() → _activeFetchAborters 全 abort →
//            既存 timer interval clear → _badgeUpdateIntervalId/_modeWatchIntervalId clear →
//            toast (TRANS-AM 系赤 #ff3a4e) → updatePanelButtons
//
//   実機検証 (PC Chrome MCP, 2026-05-16):
//     - form あり経路: 200 OK 337ms (PASS)
//     - ASIN 逆引き経路: 200 OK 464ms (PASS)
//     - AbortController.abort(): AbortError 発火 OK
//     - 透かしを status::before のみに: PASS
//     - panel::before 削除: PASS
//     - toast CSS 委譲: --toast-accent 経由で色付与 PASS
//     - setInterval clearInterval で完全停止 PASS
//
//   触らない箇所:
//     既存ボタン ID/onclick、updatePanelButtons の is-running toggle、
//     findAodAmazonOffer、attemptPurchase、clickAodAmazonOffer (本修正は
//     tryAodFetchAndDirectCheckout 内のみ)、S.* 状態管理、全ハンドラ、
//     AOD 走査、aod-prebuy、カート URL 直接遷移、Express Checkout 監視、
//     CB_LOGO_DATA_URL/TRANS_AM_BG_DATA_URL 定数、
//     cbPanelMaterialize/cbBreathing アニメ名、旧 --cb-* マッピング、
//     STOP_RED/BUY_GREEN 定数 (完全停止 toast 引数のみ変更)
//
// v0.3.8.2 (TRANS-AM MODE ACTIVATE: UI 全面再構築)
//
// v0.3.8.2 で修正 (TRANS-AM MODE ACTIVATE: UI 全面再構築)
//
//   HIRO 主訴 5 件 (v0.3.8.1 への「AI のデザイン力にがっかり」評価):
//     A. ステータスの文字を TRANS-AM 画像に合わせて変更
//     B. フォントも似た感じ (Impact 系 stencil)
//     C. この画像 (TRANS-AM) は透かしに使って
//     D. 設定の下の余白なくて、上とバランス悪い
//     E. アイコンの色も透かしの色に合わせて
//
//   デザインコンセプト: "TRANS-AM MODE ACTIVATE"
//     ソレスタルビーイングが GN ドライヴを限界稼働させた状態。
//     マゼンタ #c41e9e + ピンク #ff80d8 + 太字 stencil + HUD コーナーマーカー + 透かし
//
//   修正:
//     1. 全カラーを CB 紫青 → TRANS-AM マゼンタ系に総入れ替え
//        (--ta-magenta #c41e9e、--ta-pink #ff80d8、--ta-void-deep #15071a)
//        旧 --cb-* 変数も TRANS-AM 値にマッピング (既存参照を自動移行)
//     2. 新フォント変数 --font-display: Impact / Haettenschweiler / Bahnschrift
//        (TRANS-AM ロゴの stencil 風を再現)
//     3. ステータスを太字 stencil + マゼンタグロー + 黒 drop-shadow に
//     4. TRANS-AM 画像 (200x200 JPG, base64 10,712 文字) を panel::after で全面透かし
//        CSS 変数 --ta-watermark-url 経由で動的設定 (パース負荷回避)
//     5. パネル四隅に L 字 HUD マーカー (panel::before, linear-gradient で実装)
//     6. ボタン色を全マゼンタ系に
//        主アクション=マゼンタ、警告=金、停止=赤、補助=outline
//     7. CB ロゴ DOM 削除 (TRANS-AM 透かしに紋章が既に含まれる)
//        ※ CB_LOGO_DATA_URL 定数は将来予備のため残す
//     8. inner padding を上下対称に (16px / 16px、主訴 D 対応)
//     9. cbBreathing 周期 4.5s → 3.2s (TRANS-AM 起動感、より速い pulse)
//
//   触らない箇所:
//     既存ボタン ID/onclick、updatePanelButtons の is-running toggle、
//     tryAodFetchAndDirectCheckout (v0.3.8 機能)、CB_LOGO_DATA_URL 定数、
//     S.* 状態管理、全ハンドラ、AOD 走査、カート/checkout フロー、
//     cbPanelMaterialize / cbBreathing アニメ名 (中身は更新)
//
// v0.3.8.1 (UI 全面刷新: Quiet Sophistication)
//
// v0.3.8.1 で修正 (UI 全面刷新: Quiet Sophistication)
//
//   HIRO 主訴 4 件:
//     A. 開始/停止ウィンドウのステータスが見づらい (検証時に大事)
//     B. ソレスタルビーイングはロゴだけ、文字 (CELESTIAL BEING / Autonomous...) はいらない
//     C. ロゴが見えない (実は z-index 1 でボタン群 z-index 2 に覆われていた)
//     D. フォントレイアウトが固くてイマイチ、AI の凄さ見せて
//
//   デザインコンセプト: "Quiet Sophistication"
//     ソレスタルビーイングは目的を遂行するための最小限の存在感。
//     装飾を削ぎ落とし、動きで生命感を出す。
//
//   修正:
//     1. フォント全面刷新: Cinzel/Rajdhani/JetBrains Mono → OS system stack
//        (iOS=SF Pro, Win=Segoe UI, Mac=SF Pro, Android=Roboto, 日本語=Hiragino)
//        外部 web font 廃止により iOS Safari で確実に高品質レンダリング
//     2. letter-spacing 0.32em → 0.01-0.02em (日本語 UI に自然な字間)
//     3. text-transform: uppercase 廃止 (全大文字の軍隊調を解除)
//     4. 角丸 3-6px → 10-14px (柔らかさ、2020 年代の UI 言語)
//     5. shadow を多層から色付き glow に (柔らかく、深さを出す)
//     6. 背景に radial gradient 重ねて「呼吸する」質感
//     7. transition に cubic-bezier 採用 (物理感のある減衰・springy)
//     8. ボタン hover で 1px 浮き、active で素早く沈む microinteraction
//     9. CSS semantic tokens (--space-*, --radius-*, --glow-*, --ease-*) で語彙化
//    10. prefers-reduced-motion 対応 (アクセシビリティ)
//    11. ステータス視認性最大化 (font 12.5px, color 100%, background 0.7+, border GN 青)
//    12. <h2> CELESTIAL BEING と <p> Autonomous... を DOM 削除
//    13. CB ロゴを右下 absolute → 上部中央 relative、52×52、不透明、タイトル代わり
//    14. is-running 時のロゴ pulse アニメーション cbLogoPulse 追加
//
//   触らない箇所:
//     既存ボタン ID/onclick、updatePanelButtons の is-running toggle、
//     tryAodFetchAndDirectCheckout (v0.3.8 機能)、CB_LOGO_DATA_URL 定数、
//     S.* 状態管理、全ハンドラ、AOD 走査、カート/checkout フロー
//
// v0.3.8 (機能: AOD fetch + 直接 checkout navigate -2.8秒 / UI: Celestial Being テーマ刷新)
//
// v0.3.8 で修正 (★HIRO 主訴「カートに入れてから遅い、他人に取られる」への根本対応 + UI 刷新★)
//
//   ── 機能改修 (Part 1: AOD fetch + 直接 checkout navigate) ──
//
//   問題:
//     AOD で Amazon 直販を見つけた後、カート画面 → byg 画面 → checkout 画面
//     の 3 段ページロードで約 5.4 秒かかっており、その間に他の購入者に
//     在庫を取られる可能性が高い。
//
//   解決方針:
//     AOD オファーを fetch(urlencoded) でカート追加してから、
//     /checkout/entry/cart?... に直接 navigate することで、
//     Amazon サーバが内部で /checkout/p/p-{purchaseId}/spc に redirect する
//     仕組みを利用し、カート画面と byg 画面の 2 段ロードを完全スキップ。
//
//   実装:
//     新関数 tryAodFetchAndDirectCheckout を clickAodAmazonOffer の直前に追加。
//     Step 1: aodCartButton.closest('form') から AOD form 取得
//     Step 2: ページ内 input から sessionID + customerId (小文字 d, 14 文字) を取得
//             (cookie 'session-id' を fallback として使用)
//     Step 3: FormData を URLSearchParams に変換して
//             fetch(POST, urlencoded, redirect:manual, credentials:include)
//             status=200 なら成功
//     Step 4: /checkout/entry/cart?proceedToCheckout=1&sessionID=X
//             &useDefaultCart=1&oldCustomerId=Y&preInitiateCustomerId=Y
//             &partialCheckoutCart=1 に window.location.href で navigate
//     失敗時は false を返して clickAodAmazonOffer の従来 click 処理にフォールバック。
//
//   実機検証 (Chrome MCP, 2026-05-16):
//     B0DPFH5SR3 (¥991) で AOD ヒット → fetch 409ms で 200 OK →
//     /checkout/entry/cart navigate → /checkout/p/p-251-1464604-4405401/spc
//     redirect → 「注文を確定する」(#submitOrderButtonId) click →
//     /gp/buy/thankyou/handlers/display.html?purchaseId=... 到達。
//     合計 2.6 秒で注文確定完了 (-2.8 秒短縮)。
//
//   ── UI リニューアル (Part 2: Celestial Being inspired) ──
//
//   目的:
//     画面右下の開始/停止オーバーレイ UI を、ガンダム 00 のソレスタルビーイング
//     をモチーフにしたデザインに刷新。機能は変更せず、見た目だけ CB テーマに。
//
//   実装:
//     - CB テーマ CSS 一式を Userscript 冒頭で document.head に注入
//     - CB 紋章 PNG (128px, base64 埋め込み) をパネル右下に追加 (opacity 0.18 〜 0.32)
//     - 既存パネル ID/class は完全維持 (JS 参照のため)
//     - 起動時 fade-in (cbPanelMaterialize)、動作中の薄い pulse (cbBreathing)
//     - タイトルバー (CELESTIAL BEING / Autonomous Procurement System) 追加
//     - is-running class を MODE_RUNNING に応じて toggle (updatePanelButtons 内)
//     - 既存ボタン ID 名は全保持、スタイルだけ CB 系で再設計:
//       新規開始/再開 = GN 粒子 青、 一時停止 = 金、 完全停止 = 警告赤、
//       直販URL/ログ = outline、 設定 = 金 solid
//
//   配色:
//     deep-space navy (#0a1228) + GN 粒子 blue (#4a9eff) + CB gold (#d4af37)
//
//   フォント:
//     Cinzel (タイトル神殿セリフ) + Rajdhani (本文サンセリフ) +
//     JetBrains Mono (数値モノスペース、いずれも system fallback あり)
//
//   ── 触らない箇所 (HIRO 鉄則、共通) ──
//     - 既存ボタンの ID, class, name 属性 (JS 参照のため)
//     - 全ての onclick, addEventListener
//     - toast(), logAm() の関数仕様
//     - S.* 状態管理
//     - handleProductPage, handleProductAod 等の全ハンドラ
//     - AOD 走査, findAodAmazonOffer
//     - attemptPurchase 内 buybox-detect ループ (v0.1.16.11)
//     - カート URL 直接遷移 (v0.3.4.2)
//     - v0.3.5 修正 (sleep 削除, INITIAL_STABLE_MS=500)
//     - Express Checkout 監視 startExpressCheckoutWatch
//     - STOCK_OUT_BUYNOW 検出ロジック
//     - その他すべて (リロード, ord 抽出, bot 検知 delay, 完全停止確認)
//
//   v0.3.6 (Buy Box form 書き換え方式) は撤回。Amazon が /handle-buy-box/
//   への form 改ざん POST を構造的に拒否することを実機で確認したため。
//   v0.3.7 はバージョン番号スキップ (機能 + UI を v0.3.8 に統合)。
//
//   モバイル UA (iOS Safari) で sessionID/customerId が取得できるかは
//   実機検証必要。失敗時は安全にフォールバックして v0.3.5 と同じ動作になる。
//
// v0.3.6 撤回 (Buy Box form 書き換え+submit.buy-now 方式は Amazon が構造的に拒否)
// v0.3.7 スキップ (機能 + UI を v0.3.8 に統合)
//
// v0.3.5 (リロードサイクル短縮 -1.0秒: sleep 削除 + INITIAL_STABLE_MS 短縮)
//
// v0.3.5 で修正 (★HIRO 主訴「リロード回転を速くしたい」対応★):
//   症状:
//     1 サイクル(リロード → AOD 走査 → 次の reload) が約 5.0 秒。
//     直販オファーが出る瞬間を捕捉するためにはサイクル時間を短縮したい。
//
//   修正:
//     全体精査で「役割が重複している sleep」を 2 箇所特定:
//
//     1. handleProductPage の sleep(500) 削除
//        - v0.2.0 で入れた「リロード後 DOM 安定待ち」
//        - 直後の attemptPurchase 内 sleep(500) ループ (line 3107) と
//          目的が完全に重複していた (両方とも DOM 完成待ち)
//        - 片方削除しても attemptPurchase 側で機能継続
//        - 効果: -500ms
//
//     2. INITIAL_STABLE_MS を 1000 → 500 に短縮
//        - v0.3.4.1 で入れた「初期 count>0 変化なし時の上限」
//        - 走査で見つからない場合は expandAllAodOffers (展開) が救済
//        - 500ms で走査開始しても展開で再走査されるので問題ない
//        - 効果: -500ms
//
//   合計効果: 1 サイクル -1.0 秒 (5.0s → 4.0s)
//             1 分あたり監視回数 +25% (12 → 15 回)
//
//   触らない箇所:
//     - attemptPurchase 内 sleep(500) (v0.1.16.11): 維持
//     - AOD ロード待ちの STABLE_MS=500, MAX_WAIT=3000: 維持
//     - expandAllAodOffers (展開処理): 維持
//     - 状態管理, リロード, UI, 他すべて: 変更なし
//
// v0.3.4.2 (ホットフィックス: 「カートを見る」SPAN click 無効 → カート URL 直接遷移)
//
// v0.3.4.2 で修正 (★HIRO 運用ログ 2026-05-15 00:07 + Chrome MCP 実機検証★):
//   症状:
//     AOD で Amazon 直販を発見し click → 「✓追加済み」表示成功
//     → 「カートを見る」visible 検出 → 自動 click 実行
//     → でも画面が AOD パネルのまま、カート画面に遷移せず永久停止
//     HIRO スクショ IMG_0240 で「✓追加済み」表示 + AOD パネルのまま確認
//
//   根本原因 (Chrome MCP 実機検証 B09XTYF4Y1 で確定):
//     v0.3.4 設計時に「#aod-offer-view-cart-N の内部に <a> がある」と仮定したが
//     実機 DOM は:
//       <span id="aod-offer-view-cart-1" class="a-button ...">
//         <span class="a-button-inner">
//           <input class="a-button-input" type="submit" ...>
//           <span class="a-button-text"> カートを見る </span>
//         </span>
//       </span>
//     <a> タグなし。SPAN を click しても何も発火しない。
//     さらに内部 input.a-button-input は /cart/add-to-cart/ form 内なので
//     click すると add-to-cart 再 submit で二重カート追加リスク。
//
//   修正:
//     「カートを見る」を click する代わりに、カート URL に直接遷移:
//       location.href = 'https://www.amazon.co.jp/gp/cart/view.html'
//     既に「✓追加済み」でカートに商品は入っているので、URL 遷移だけで
//     handleClassicCart が起動して通常の購入フローに合流する。
//
// v0.3.4.1 (ホットフィックス: AOD カート追加失敗時の永久停止 + AOD ロード待ち早期 break 修正)
//
// v0.3.4.1 で修正 (★HIRO 運用ログ 2026-05-14 + 設計再点検★ ホットフィックス):
//   問題A: AOD カート追加失敗後に永久停止 (確定バグ、運用ログ 09:21 / 12:54)
//     原因:
//       v0.3.4 で clickAodAmazonOffer に新しい失敗パス
//       (S.setStep(STEP_IDLE); return false) を追加したが、呼び出し側
//       (handleProductAod line 2805 など) は戻り値を見ずに return。
//       v0.3.3 では失敗パスが opFullStop() しかなかったため戻り値は不要
//       だったが、v0.3.4 で「IDLE 復帰」パスを追加した際にリロード起動を
//       入れ忘れた。結果としてボットが永久停止。
//     修正:
//       clickAodAmazonOffer 内の失敗パス 2 箇所で
//       scheduleReloadForWait() を呼ぶ。
//
//   問題B: AOD ロード待ちの早期 break (潜在バグ、設計再点検で発見)
//     原因:
//       v0.3.4 の handleProductAod ロード待ちで lastChangeAt の初期値が 0。
//       初期 count > 0 で変化がない場合、waited が STABLE_MS=500ms 到達で
//       break してしまい、pinned 1 個だけで走査開始 → 問題C 再発。
//       運用では aod-prebuy の処理時間で隠れているが、ロード変動で再発の
//       リスクあり。
//     修正:
//       lastChangeAt の初期値を null に変更。
//       「変化を 1 回以上見てから STABLE_MS 安定」で break する条件に。
//       初期 count > 0 で全く変化なしの場合は INITIAL_STABLE_MS=1000ms で
//       break (既に全件ロード済みで入室したケースへの対応)。
//
// v0.3.4 (3問題統合修正: AOD-click 後 polling + ADDON_UPSELL URL 判定 + AOD count 安定検出)
//
// v0.3.4 で修正(★HIRO 運用ログ 2026-05-12/13 + Chrome MCP 実機検証★):
//   3 問題を統合修正:
//
//   問題A: AOD カート追加成功後「カートを見る」表示で停止 (IMG_0230)
//     原因: 新Amazonは AOD click 後に自動遷移しない。AOD パネル内で
//           「✓追加済み・カートを見る」表示のみ。手動 click 必要。
//     修正: clickAodAmazonOffer に click 後 polling 追加
//           - 成功: #aod-offer-view-cart-N visible → 自動 click → カート画面
//           - 失敗: #aod-offer-not-added-to-cart-N visible → IDLE 復帰
//           - 旧Amazon自動遷移ケースも URL 変化検出でカバー
//
//   問題B: 「他に何か必要ですか?」画面で screen=OTHER 誤判定 (IMG_0231)
//     原因: detectAddOnUpsellByText が 3 条件 AND (見出し+レジ+戻る)
//           バリエーションで「カートに戻る」省略/スクロール外のケースに非対応
//     修正: detectAddOnUpsellByText を URL パスベース最優先化
//           - /checkout/byg/ パスで確実に判定 (experienceType 非依存)
//           - フォールバック: 「カートに戻る」必須要件を撤廃
//           findAddOnUpsellProceedButton に ID ベース取得を最優先追加
//
//   問題C: AOD ロード待ちが pinned offer 1個で打ち切られる (HIRO 主訴)
//     現象: ボット中断→手動更新で直販が AOD に出現する事象が複数回観察
//     原因: handleProductAod の AOD ロード待ちが buttons > 0 で即 break
//           pinned offer (多くマケプレ) 1個出現の時点で走査開始
//           残り 10 オファー (Amazon直販含む可能性) は未ロード状態
//     実機検証 (Chrome MCP, B0CYFYPB77):
//       t=300〜500ms: 1個 (pinned のみ)
//       t=1000ms:     11個 (全件出揃う)
//     修正: count "安定検出" 方式に変更
//           - count 変化あれば lastChangeAt 更新 (まだロード中)
//           - 500ms 連続変化なし & count > 0 で全件ロード完了とみなす
//           - サイクル時間 +200ms 程度の代償で検出漏れを大幅減
//
// v0.3.3 (Amazon AOD UI 変更対応 - 新旧UI両対応セレクタ)
//
// v0.3.3 で修正(★HIRO ログ分析 2026-05-12 06:42 B0GJ8YSRB3 + Chrome MCP 実機検証★):
//   症状:
//     HIRO ログで AOD 走査が機能しないケース連発:
//       - finalCount=327, scanned=0  (B0GJ8YSRB3)
//       - finalCount=11,  scanned=11 nonAmazonSkipped=11 (B09XTKWYSW)
//     直販を取れない、または取れても誤判定。
//   原因(実機検証で完全確定):
//     Amazon が AOD パネルの UI を変更。商品によって新旧UIが混在。
//       旧UI: button[aria-label*="からカートに追加"] にラベル「出品者X と価格Y から…」
//       新UI: input[type="submit"][name="submit.addToCart"]、aria-label は空文字
//             販売元は親要素を遡って [id^="aod-offer-soldBy"] から取得
//     旧コードは aria-label のみ参照 → 新UI完全移行ASINで scanned=0 になる。
//     さらに countAodCartButtons の fallback [id^="aod-offer-"] が
//     オファーのサブ要素(heading/soldBy/qty 等)も拾って finalCount を異常に水増し
//     (1オファーあたり12〜15個のサブ要素 → 13オファーで 254/327件などになる)。
//   修正:
//     1. findAodAmazonOffer: 新旧UI 両対応セレクタ(Set で重複除去)
//        - 旧UI判定: aria-label から「出品者X と価格Y から」をパース
//        - 新UI判定: 親を遡って [id^="aod-offer-soldBy"] テキストの「Amazon.co.jp」検出
//     2. countAodCartButtons: 新旧UI 両対応の正確なカウント
//        - fallback [id^="aod-offer-"] を廃止(サブ要素水増しの元凶)
//     3. visible チェック追加(pinned offer 内の隠しボタンを除外)
//     4. 「両方をカートに追加する」(セット販売) を除外
//   実機検証で確定したUI分布(2026-05-12):
//     B0GJ8YSRB3: 旧UI 0個 / 新UI 13個 / Amazon直販 0件
//     B09XTKWYSW: 旧UI 12個 / 新UI 13個 / Amazon直販 0件
//     B07PXCN28N: 旧UI 12個 / 新UI 13個 / Amazon直販 2件
//
// v0.3.2 (AOD URL でも Buy Box の Amazon 直販を先にチェック)
//
// v0.3.2 で修正(★HIRO 0:37 観察 B08XWSBM49 スクショ★):
//   症状:
//     ?m= を剥がした AOD URL の画面トップに「出荷元 Amazon.co.jp /
//     販売元 Amazon.co.jp / カートに追加する」ボタンが見えている。
//     なのに bot は「AOD オファー未表示(2.5秒、11回連続0) → リロード」を 11 連発。
//     画面で見えてる Amazon 直販を空振りしている。
//   原因:
//     handleAodScreen は findAodAmazonOffer (aria-label 検索) しか走らせない。
//     一方で AOD URL でも Amazon の Buy Box が画面トップに居る場合がある。
//     Buy Box の「カートに追加する」は別 ID/aria-label なので走査対象外で取りこぼし。
//   修正:
//     handleAodScreen の冒頭に detectBuyBoxSeller を追加。
//     isDirect=true なら clickBuyNowOrAddToCart で即購入。
//     Buy Box に直販なければ従来の AOD オファー走査に進む(動作不変)。
//
// v0.3.1 (AOD navigate 時に ?m= フィルター除去)
//
// v0.3.1 で修正(★HIRO 主訴 2026-05-11 23:54〜23:56 B07R1LFX7P 58 cycle 検証★):
//   症状:
//     ?m=AN1VRQENFRJN5 URL で Buy Box 空 → インライン AOD 走査 scanned=0
//     → リロード → 58 サイクル繰り返し、AOD の中身を一切見れていない
//   原因:
//     ?m=AN1VRQENFRJN5 は Amazon が「直販オファーのみ」にフィルターする URL パラメータ。
//     Amazon が在庫切れの時、Buy Box 空 + AOD セクションも DOM ごと非表示。
//     よって商品ページ DOM をインラインで走査しても永久に 0 件確定。
//     v0.3.0 の「インライン AOD」アイデアは ?m= 下では機能しない構造的問題。
//   修正:
//     openAodPanel() を ?m= 除去対応に書き換え。
//     ?m=XXX / &m=XXX を URL から剥がしてから ?aod=1 を付与 → 全 seller 表示の
//     AOD ページに navigate → findAodAmazonOffer で Amazon 直販を発見 → click。
//     念のため事前にインライン走査(運良く DOM にあれば navigate 省略)。
//
// v0.3.0 (ADDON_UPSELL 画面対応 + AOD インライン検索)
//
// v0.3.0 で追加(★HIRO 主訴 2026-05-11★):
//
//   【1. ADDON_UPSELL 画面対応】HIRO 設計
//     症状: AOD カート追加 → 「他に何か必要ですか？」画面で停止
//     原因: detectScreen で OTHER 扱いになり、何も処理されない
//     修正:
//       - detectAddOnUpsellByText() (3 条件 AND: 見出し/レジに進む/カートに戻る)
//       - detectScreen に ADDON_UPSELL 判定追加
//       - handleAddOnUpsell ハンドラ新規実装
//         ★「レジに進む」完全一致のみ click(カート画面の長文ボタンは除外)
//         ★「カートに戻る」絶対除外
//         ★失敗時は完全停止ではなく一時停止
//
//   【2. AOD インライン検索】私の追加 → v0.3.1 で再設計
//     v0.3.0 ではインラインのみで完結させようとしたが、?m= 下で機能しないことが
//     HIRO ログで確定。v0.3.1 で「インライン → AOD ナビ(?m= 剥がし)」の 2 段構えに改修。
//
// v0.2.3 (PRODUCT_AOD URL で🛒押下しても無反応バグ修正)
//
// v0.2.3 で修正(★HIRO 報告 2026-05-11★ 「ボタン押しても反応がないものがあった」根因対応):
//   症状:
//     /dp/<ASIN>?aod=1 URL に居る状態で🛒押下 → 何も起きない
//     原因: screen=PRODUCT_AOD として handleProductAod が「自動走査せず」 toast 出して即終了
//     その後 opStart で MODE→RUNNING になっても、handler はもう実行終了済み
//     → HIRO の意図した「購入開始」が起きない
//
//   修正:
//     startPurchase 内で screen=PRODUCT_AOD なら ?aod=1 を URL から削除してリロード
//     → 通常 PRODUCT として再開、forceAmazonDirectUrl 経由で購入フロー開始
//
//   実例(HIRO ログ):
//     00:33:57 🛒 押下 (PRODUCT_AOD URL B0DPFH5SR3) → 7秒間無反応 → 諦めて 🛑停止
//     00:34:46 別経路で再試行 → 12秒で購入完了(成功)
//
// v0.2.2 (モバイル商品ページ /gp/aw/d/ 対応 + warn 誤検出根絶)
//
// v0.2.2 で修正(★HIRO 指摘 2026-05-11★ 「停止後別商品で認識しない」根因対応):
//   ★ 真のバグ: モバイル版商品ページ URL `/gp/aw/d/<ASIN>` を商品ページと認識してなかった
//     HIRO 環境(iPhone Safari、カート画像経由)で /gp/aw/d/<ASIN> URL に飛ぶ → screen=OTHER
//     → bot が「商品ページじゃない」と判断して何もしない
//
//   1. detectScreen の商品ページ判定に `/gp/aw/d/` を追加
//      - 旧: /dp/ と /gp/product/ のみ
//      - 新: /dp/ と /gp/product/ と /gp/aw/d/ (モバイル appstore-web)
//
//   2. 別商品検出ガード(handleProductPage)の ASIN 抽出パターン拡張
//      - 共通正規表現 ASIN_RE で /dp/ / /gp/product/ / /gp/aw/d/ 対応
//
//   3. express-modal warn 誤検出根絶
//      - pageAge 閾値 3000 → 5000ms に延長(stock-out 画面遷移を待つ)
//      - stock-out 検出時に watcher を強制無効化
//      → タイミング問題で出てた誤検出が消える
//
//   4. /gp/aw/c (モバイルカート) を CART として認識(オプション)
//
// v0.2.1 (AOD 検出強化 + ノイズ削減)
//
// v0.2.1 で修正(★HIRO ログ分析 2026-05-11★):
//   1. ★AOD オファー未表示の誤検出を緩和(HIRO の主訴対応)
//      - countAodCartButtons のセレクタを拡張
//      - 「button 0 が 2 回連続」を未表示判定の条件に変更(初回 0 で即諦めない)
//      - 待機時間 2000 → 2500ms に延長
//      → Amazon 遅延ロード時の取りこぼし削減
//
//   2. handleProductAod の STOPPED 時ノイズログ抑制
//      - mode=STOPPED で入室時のログを debugMode 限定に
//      → 普段使いでログがクリーンに
//
//   3. express-modal「注文を確定」検出失敗 warn の誤検出抑制
//      - 「直販 click 直後に STOCK_OUT_BUYNOW 画面に飛ぶ」ケースで warn 出てた
//      - watch 発火時に現在 screen が PRODUCT/CHECKOUT 系でないなら warn しない
//      → 真の検出失敗のみ通知
//
// v0.2.0 (構造改革: 状態管理一本化 + PAUSED モード新設)
//
// v0.2.0 の核心(★HIRO 主訴対応):
//   1. 「停止が効かない」「勝手に動く」の根治
//      旧: Cookie(STOP/STATE 5分TTL) + localStorage(WAITING) + sessionStorage 三層分散
//          → TTL 切れ自動失効・状態不整合の温床
//      新: localStorage 一本化(LB_AM_V2_*)、TTL なし
//          MODE: STOPPED / RUNNING / PAUSED の 3 値
//
//   2. PAUSED モード(ハイブリッド型停止)新設
//      ⏸停止: SESSION 維持 → ▶再開で続きから(reloadCount 維持)
//      🛑完全停止: SESSION 破棄(再開不可)
//      🛒新規開始: 既存 SESSION 破棄 + 新セッション
//
//   3. shouldHalt() ガードを await のたびに徹底
//      setTimeout 中の reload を確実に kill
//
//   4. LITE モード概念廃止(★HIRO 指摘 2026-05-10★)
//      「LITE が標準なら LITE じゃない」→ 命名と実態のズレ解消
//      現挙動を標準動作として固定化
//
//   5. AOD 経路は維持(★HIRO 指摘 2026-05-10★)
//      「AOD のほうが Amazon 在庫復活時に出るのが早い」運用知見尊重
//      v0.1.16.13 の AOD バイパス案は却下
//
//   6. 別商品ページ手動移動 → 自動 PAUSED + 通知
//      意図しない購入リスク防止
//
//   7. ログ送信ダイアログ式
//      「重要のみ / 全部 / キャンセル」を選択
//      普段は warn/error/order-complete のみ送信、HIRO さん負担軽減
//
//   8. 完全停止確認スキップオプション
//      設定画面で「⚠ 完全停止時の確認をスキップ」可能
//
//   9. 状態管理層・主要 handler は v2 に書き換え、その他既存機能は維持
//      (iframe 内 submit / CART_ADD_FAIL / earlyExitNoOffer / ジッタ / Discord 通知 等)
//
// v0.1.16.13 (「カート追加失敗」検出 → 自動停止)
//
// v0.1.16.13 で修正(★HIRO スクショ報告 2026-05-10★ 「復帰できない」問題対応):
//   症状: 直販対応商品なのに bot が AOD ループに入って復帰できない
//         スクショで Amazon の「カート追加失敗」エラーが発生してた状態
//         この時 #buy-now-button/#add-to-cart-button が消えてる
//         → v0.1.16.11 で追加した isAmazonDirectUnavailable() が true になり
//           「直販なし」と誤判定 → AOD へ → 永久ループ
//
//   ★ 修正 1: isCartAddFailed() 共通ヘルパー追加
//     - 「カート追加失敗」「Add to Cart Failed」テキストを検出
//
//   ★ 修正 2: detectScreen() に CART_ADD_FAIL を最優先で追加
//     - path に関係なく、テキストで判定 → どの画面でも同じハンドラに
//
//   ★ 修正 3: handleCartAddFail() ハンドラ追加
//     - 即停止 + error ログ + 復旧手順 toast(30秒表示)
//
//   ★ 修正 4: attemptPurchase の Buy Box 検出ループにもガード追加
//     - リロード後に「カート追加失敗」が出たケースも捕捉
//     - earlyExitNoOffer (直販なし判定) より前に評価
//
// v0.1.16.12 (iframe 内 submit 強化 + 確定検証)
//
// v0.1.16.12 で修正(★HIRO 確定 click 効かない問題対応 2026-05-10★):
//   症状: 3 回連続で「直販対応商品で注文確定 click したけど urlChanged:false / buttonStillVisible:true」
//         iframe[turbo-checkout-bottom-sheet-frame] context の場合に発生
//         iframe-loaded/iframe-fired の post message ログが 0 件 = iframe 内 UserScript が
//         走ってないか、走っても親に通知できてない
//
//   ★ 修正 1: handleInIframe を aggressive submit ロジックに統一
//     - 旧: placeBtn.click() のみ(submitter 指定なし)
//     - 新: form#place-order-form.requestSubmit(submitter=input) — 親と同じ動作確定パス
//       + click() fallback、全結果を post message で親に通知
//
//   ★ 修正 2: iframe-loaded を即時 post message
//     - 旧: findPlaceOrderButton 待ちが 30 秒、見つからないと 30 秒後に通知
//     - 新: handleInIframe 入室直後に iframe-loaded post message → 親が即座に
//       「iframe 内 UserScript 動いてる」を確認可能
//
//   ★ 修正 3: iframe 内で /gp/buy/thankyou/ 到達検知
//     - submit 成功すると iframe 内が完了画面に遷移する場合あり
//     - iframe-thankyou post message で親に通知
//     - 親側で order-complete として記録(成功証拠)
//
//   ★ 修正 4: 親フレーム側の click 後検証強化
//     - urlChanged:false 時に追加情報を取得:
//       - placeBtn.disabled / aria-disabled
//       - form 内の隠しフィールド count
//       - iframe URL 変化(同一オリジンの場合)
//     - submit 成否を判定する手がかりを増やす
//
// v0.1.16.11 (初動高速化 — モバイル UA 対応)
//
// v0.1.16.11 で修正(★HIRO 運用テスト 2026-05-10★ 「初動が遅い」報告対応):
//   ★ HIRO のログで判明: v0.1.16.10 の早期 break が iPhone Safari で発火してなかった
//     - earlyExitNoOffer:false / breakIdx:-1 / detectMs:3037ms (本来 1秒以下が目標)
//     - expand skip も同じくモバイルで発火せず、AOD 再走査までに 2.2 秒
//
//   ★ 修正 1: Buy Box 検出ループの早期 break をテキスト OR ボタン両方無しに拡張
//     - 旧: ?m= URL で「おすすめ出品の要件を満たす出品はありません」テキストのみ
//       → モバイル UA でこのテキストが出ないケースで律儀に 3 秒待つ問題
//     - 新: i >= 1 (= 1 回 500ms 待った後) で isAmazonDirectUnavailable() 全条件:
//       テキスト OR (#buy-now-button & #add-to-cart-button 両方無し)
//       → モバイルでも確実に 1 秒で break、最大 3 秒 → 最大 1 秒に短縮
//
//   ★ 修正 2: expandAllAodOffers の skip 条件をモバイル対応に拡張
//     - 旧: expectedTotal !== null && prevCount >= expectedTotal の時のみ skip
//       → モバイルで「N個のオプション」テキスト検出失敗で expectedTotal=null
//       → skip しないで通常 expand → 2.1 秒(3 iter × 700ms)消費
//     - 新: first scan 結果を引数で受け取り、scanned >= 6 かつ 全件 non-Amazon なら skip
//       → 上位 6+ 件全部マケプレなら、下位にも Amazon 直販無い確率高い
//       → モバイル/PC 共通で skip 効く、2.1 秒短縮
//
// 期待効果:
//   - HIRO 報告サイクル(B09XTKWYSW): 初動 3秒 + AOD 2.2秒 = 約 5 秒短縮
//   - 1 サイクル合計 ~5秒 → ~3秒以下に
//
// v0.1.16.10 (リロードサイクル ~10秒 → ~5秒に半減)
//
// v0.1.16.10 で修正(★HIRO ログ分析 2026-05-10★ 「AODまでの間がある」報告対応):
//   ★ 1 サイクル ~10 秒 → ~5 秒(目標)
//   ★ 修正 1: attemptPurchase の Buy Box 検出に早期 break 追加
//     - 旧: 6×500ms = 3 秒 律儀に待つ(isDirect/sellerText 空のままなら break しない)
//     - 新: ?m= 強制 URL で「おすすめ出品の要件を満たす出品はありません」テキスト
//       検出 → 即 break(Amazon が確定的に「直販なし」と返してる)
//     - 浪費 ~2.5 秒削減
//   ★ 修正 2: expandAllAodOffers のスキップ判定
//     - 旧: 全件ロード済みでも stable iter 3 回確認に 2.1 秒
//     - 新: scanned >= expectedTotal なら expand 不要(全件確定)→ 即終了
//     - 浪費 ~2 秒削減
//   ★ 修正 3: openAodPanel / forceAmazonDirectUrl の reload 待機 600 → 200ms
//     - toast を見せるための delay。短縮しても可視性十分
//   ★ 修正 4: handleAodScreen 初期 sleep 300 → 100ms
//     - DOM 待ち。aria-label 直読みは負荷低い、不要に長い
//
// v0.1.16.9 (バッチ送信化 + ノイズ警告抑制)
//
// v0.1.16.9 で修正(★HIRO ログ分析 2026-05-10★):
//   ★ Discord 自動 push を完全停止(HIRO 要望「ログはまとめて送りたい」)
//     - logAm 内の warn/error 自動 push を撤廃
//     - 全ログは localStorage バッファに蓄積のみ
//     - 📨 Discord ボタン押下時にまとめて送信(従来通り)
//     - 通知が必要なクリティカル事象は notifyDiscord を直接呼ぶ箇所だけに限定
//   ★ ノイズ警告を抑制(HIRO 環境のログ 14 件中 12 件が誤発火だった)
//     - watchExpressCheckoutModal の診断 warn は state=ST_PURCHASING の時だけ発火
//       (購入してない時に商品ページ滞在で毎回 3 秒後に warn 出てた)
//     - attempt-purchase「?m= でも Buy Box 空」「?m= で直販判定できず」を info に降格
//       (在庫切れリロード待ちの期待フロー、ノイズ警告)
//   ★ state=AOD_OPEN 居残り対策
//     - handleProductPage 入室時に screen=PRODUCT で state=ST_AOD_OPEN なら
//       ST_PURCHASING に書き戻し(状態整合性)
//   ★ 📨 ボタンに統計表示
//     - 送信前に「合計 N 件 (error E / warn W / info I)」を toast で表示
//     - HIRO が中身見る前に傾向判断できる
//
// v0.1.16.8 (詳細ログ + Discord 送信修正)
//
// v0.1.16.8 で追加・修正(★HIRO 指示 2026-05-10★):
//   ★ Discord 送信を完全に直す
//     - Content-Type: application/json (CORS preflight 必要) →
//       application/x-www-form-urlencoded + payload_json=... (preflight 不要)
//       Discord webhook は payload_json 形式を公式サポート
//       iOS Safari + Userscripts のクロスオリジン fetch 失敗を回避
//     - エラー silent swallow を撤廃: 失敗時は LOG_BUFFER_AM に error 記録 + toast 表示
//     - 1 度だけ自動リトライ(1 秒後)
//     - embed フィールド自動分割(5 フィールド/メッセージ・1 メッセージ最大 6000 char 制限回避)
//     - フィールド value 1024 char 上限保護(``` 含めて)
//   ★ logAm を全フローに展開(ツール動作の効率化分析用)
//     - main 開始: profile / screen / URL / isWaiting / version
//     - attemptPurchase: Buy Box 検出結果 + 分岐判断 + 所要 ms
//     - clickBuyNowOrAddToCart: target 種別 + click 結果
//     - forceAmazonDirectUrl: 切替 from→to URL
//     - setState: 全状態遷移(prev → next)
//     - scheduleReloadForWait: reason + count + interval
//     - handleProductPage / Aod / SmartWagon / Cart / Checkout / StockOut / Complete / Signin: 入退室
//     - watchExpressCheckoutModal: button 検出 + 場所(top/iframe)
//     - findAodAmazonOffer: scanned / used / nonAmazon 件数
//     - verifyCheckoutSafety: ok/checks/issues/total
//     - startTimer / fireTimer
//     - リロード後の自動再開判定
//   ★ ログレベル設計
//     - info  : 通常フロー(localStorage のみ)
//     - warn  : リロード継続・failsafe 一部 NG・推移異常 (local + Discord 自動 push)
//     - error : 停止・致命的失敗 (local + Discord 即時 push)
//   ★ パフォーマンス計測
//     - PERF_T0(IIFE 起動時刻)からの相対 ms を全ログ entry に保存
//     - 「もっさり」感の原因特定可能
//
// v0.1.8  (Step 9: 整合性修正 + 無限ループ対応 ★HIRO バグ報告★)
// v0.1.8 で修正:
//   - isElementVisible 緩和(width/height=0 / opacity=0 で弾かない)
//     → モバイル iOS Safari で render 直後の要素を誤判定する問題を解消
//   - clickBuyNowOrAddToCart に最大 5 秒のリトライ追加
//     → DOM 遅延ロードでボタン検出失敗 → 即停止 を回避
//   - detectBuyBoxSeller に最大 3 秒のリトライ追加
//     → ?m= リロード直後の innerText 不完全 を回避
//   - scheduleReloadForWait: max=0 で無限ループ対応(★HIRO 仕様)
//   - amazon.html / index.html / Netlify Function: デフォルト max=0
//   - AOD で Amazon直販なし → リロード待機(従来は停止)
//   - ?m= 強制 URL でも空 → リロード待機(従来は停止)
//
// v0.1.7 で追加:
//   - clickBuyNowOrAddToCart: 「今すぐ買う」「カートに入れる」両方未表示時、
//     scheduleReloadForWait で在庫復活リロード待機(従来は即停止)
//
// v0.1.6 で追加 (★最終ピース★):
//   - verifyCheckoutSafety(): failsafe 5項目検証
//     1. 「Amazon Japan G.K.から発送」/「Amazonによる発送」/「出荷元 Amazon」
//     2. 「販売元: Amazon.co.jp」
//     3. 中古/Used/コレクター商品/再生品 を含まない
//     4. 商品行が 1 件のみ(「あとで買う」混入防止)
//     5. ご請求額 ≤ CONFIG.maxPrice (maxPrice=0 なら無制限)
//   - findPlaceOrderButton(): 「注文を確定する」ボタン検出
//     ・#submitOrderButtonId / #placeYourOrder1 / name=placeYourOrder1
//     ・テキストマッチ「注文を確定する」(visible 要素のみ、最初の1個のみ click)
//   - performOrderConfirm(): failsafe 検証 → ボタン検出 → 単発 click
//     ・★単発 click のみ(駿河屋 v0.1.6 教訓:二重押下絶対禁止)
//     ・state=ST_ORDER_PLACED に進める
//   - handleCheckout(): SPC 画面ハンドラ(/checkout/p/.../spc)
//     ・「注文を確定する」が描画されるまで最大 5 秒待つ
//     ・performOrderConfirm 呼び出し
//   - watchExpressCheckoutModal + startExpressCheckoutWatch():
//     ★商品ページ上に出る Express Checkout モーダル監視★
//     ・「今すぐ買う」 click 後、URL 不変でモーダル表示される iOS Safari ケース対応
//     ・MutationObserver で「お届け先 + ご請求額 + 注文を確定する」検出 → 自動確定
//     ・expressCheckoutHandled フラグで二重処理防止
//
// v0.1.5.3 (Step 6d: 自動切替 stopped中でも動作 ★HIRO バグ報告★)
// v0.1.5.3 で修正:
//   - handleProductPage の autoForceAmazon ブロックから !isStopped() を外す
//     ・URL 切替は購入動作ではないため、停止中でも動かすべき
//     ・state や KEY_WAITING も立てない(リロード後に購入フロー再開させない)
//   - 修正前: 「停止」押下後 5分間は別商品ページでも自動切替が動かない問題
//   - 修正後: 商品ページ開いた瞬間、停止中でも自動で ?m= に切替
//
// v0.1.5.2 で追加:
// v0.1.5.2 で追加:
//   - blockAmazonAppRedirect(): @run-at document-start で即実行
//     ・<meta name="apple-itunes-app"> を削除(iOS Safari の Smart App Banner 抑制)
//     ・<meta name="apple-mobile-web-app-capable"> も削除
//     ・MutationObserver で再追加されても都度削除(Amazon 側の動的挿入対策)
//     ・amzn:// 等アプリスキームの遷移を location.assign / replace で遮断
//     ・iframe / a[href] の amzn: スキームも除去
//   - autoForceAmazon (CONFIG): デフォルト true
//     ・商品ページ到達 + ?m= 未付与 + マケプレ判定 → 自動で ?m=AN1VRQENFRJN5
//       にリダイレクト(開始ボタン押下不要)
//     ・"スクリプト ON だけで自動切替" を実現
//
// v0.1.5.1 で追加:
//   - AMAZON_SELLER_ID = 'AN1VRQENFRJN5' (Amazon.co.jp 直販の出品者ID)
// v0.1.5.1 で追加:
//   - AMAZON_SELLER_ID = 'AN1VRQENFRJN5' (Amazon.co.jp 直販の出品者ID)
//   - forceAmazonDirectUrl(): URL に ?m=AN1VRQENFRJN5 を付与してリロード
//     → Buy Box が Amazon.co.jp 直販オファーに強制切替される
//   - isUrlForcedAmazon(): 現 URL が直販強制 URL か判定
//   - isAmazonDirectUnavailable(): 直販オファー無し(Buy Box 空)判定
//     ・「おすすめ出品の要件を満たす出品はありません」テキスト
//     ・#buy-now-button と #add-to-cart-button が両方無い
//   - attemptPurchase: マケプレ判定時に AOD 探索ではなく URL 強制切替を呼ぶ
//     ・直販ヒット → 「今すぐ買う」 click
//     ・直販なし(?m= 強制 URL でも空) → 停止
//
//   ★これにより v0.1.4.x の AOD 14件制限を完全に回避★
//   AOD 経路は互換のため残存(detectScreen='PRODUCT_AOD' / handleProductAod)
//
// v0.1.5 で追加:
// v0.1.5 で追加:
//   - findSmartWagonProceedButton(): smart-wagon の「レジに進む」ボタン検出
//     (aria-label="Proceed to checkout"、name=proceedToRetailCheckout、テキスト「レジに進む」)
//   - handleSmartWagon(): /cart/smart-wagon 到達時の自動進行
//     ・state=ST_CART_DONE に立てる → ボタン検出 → state=ST_CHECKOUT → 単発 click
//     ・「カートに入れました」確認も併用
//     ・ボタンが見つからなければ停止(リトライしない:smart-wagon は「ボタン必須」前提)
//   ★単発 click(駿河屋 v0.1.6 教訓:二重押下絶対禁止)
//
// v0.1.4.1 で追加:
// v0.1.4.1 で追加(★重要修正★):
//   - expandAllAodOffers(): 「さらに表示」+ スクロール で AOD オファーを全件ロード
//     これまで初期表示の 10 件しか走査せず、Amazon.co.jp 直販オファーが
//     下位にある場合に「直販なし」と誤判定していた。
//     2026-05-08 HIRO 指摘の「ツールの弱点」を修正。
//   - countAodCartButtons(): 走査ボタンのカウント取得
//   - detectAodTotalCount(): 「N個のオプション」表示から全件数を抽出
//
// v0.1.4 で追加:
//   - clickAodAmazonOffer(): findAodAmazonOffer で見つけた「カートに追加する」を
//     単発 click(駿河屋 v0.1.6 教訓)。state=ST_PURCHASING に立てて smart-wagon を待つ。
//
// v0.1.3.1:
//   - findAodAmazonOffer() を aria-label 直読み方式に変更
//     (モバイル AOD は出荷元/販売元が折りたたまれているため、テキスト走査では失敗)
//
// v0.1.3:
// v0.1.3 で追加:
//   - openAodPanel(): URL ?aod=1 で AOD パネルを開く(state=ST_AOD_OPEN)
//   - getAodOfferContainers(): モバイル/デスクトップ汎用の AOD オファー要素取得
//   - findAodAmazonOffer(): 各オファーから Amazon 直販かつ新品のものを検出
//     ★中古は即スキップ(キャンセル不可リスク防衛)
//   - detectScreen() に PRODUCT_AOD 追加
//   - handleProductAod(): AOD 到達時のオファー走査ハンドラ
//   - attemptPurchase: マケプレ判定時に openAodPanel を呼ぶ
//
// 検出のみ実装。クリックは v0.1.4 で追加予定。
//
// v0.1.2 で追加:
//   - findBuyNowButton(): #buy-now-button + input[name="submit.buy-now"] 候補
//   - findAddToCartButton(): #add-to-cart-button + input[name="submit.add-to-cart"]
//   - clickBuyNowOrAddToCart(): CONFIG.buyNowPriority=true なら 今すぐ買う 最優先
//     ★単発 click のみ(駿河屋 v0.1.6 教訓: 二重押下絶対禁止、robustClick 不使用)
//   - attemptPurchase: 直販ヒット時に clickBuyNowOrAddToCart を呼ぶ
//   - 状態 ST_PURCHASING を立てて、smart-wagon / SPC 画面遷移を待つ
//
// v0.1.1.2 で追加:
//   - SCRIPT_VERSION 更新(バッジ表示の整合性)
//   - 「出荷元」「販売元」の別ラベルレイアウト(モバイル FBA マケプレ)対応
//
// v0.1.1.1 で追加:
//   - モバイル DOM 対応: テキストパターン抽出方式へ切替
//
// v0.1.1 で追加:
//   - detectBuyBoxSeller(): Buy Box の出荷元/販売元判定
//   - attemptPurchase(): 判定結果を toast に表示
//
// v0.1.0 で含まれていたもの:
//   - @match, バッジ, 停止/開始/設定ボタン UI
//   - ストレージキー(LB_AM_*) + state cookie(.amazon.co.jp スコープ)
//   - 別タブ暴走防止(セッションID + TTL10分)
//   - main ルーター(path 分岐の枠)
//
// 含まれないもの(後続バージョンで実装):
//   - v0.1.2: 「今すぐ買う」優先 click ロジック
//   - v0.1.3: AOD パネル展開 + Amazon直販オファー走査
//   - v0.1.4: 中古二重検証
//   - v0.1.5: smart-wagon / classic cart ハンドラ
//   - v0.1.6: SPC 注文確認画面 + failsafe
//   - v0.1.7: 注文完了 / signin ハンドラ + リロード待機
//   - v0.1.8: タイマー機能
//
// 設計仕様(HIRO 確認済 2026-05-07):
//   - testMode なし(failsafeで守る方針)
//   - reloadInterval=1000ms デフォルト(なるべく早く)
//   - 「今すぐ買う」優先(最速ルート)
//   - 単品qty=1 のみ
// ==================================================================

(function () {
    'use strict';

    // ═════════════════════════════════════════════════
    // ★v0.3.8.87: ホームアイコン自動 TRANS-AM フラグ (#gta=1) を最速で捕捉
    //   HIRO 構想: iOS ショートカット「URLを開く」でホーム画面アイコン化
    //     → タップで amazon.co.jp/dp/<ASIN>?m=...#gta=1 を Safari で開く
    //     → UserScript が #gta=1 を検知し startPurchaseTransAm() を自動発火
    //   ハッシュは server に送られない (検知回避) + TRANS-AM navigate 後は自然消滅。
    //   ただし Amazon が history.replaceState で hash を消す可能性があるため、
    //   document-start (IIFE 冒頭) で location.hash を即読み取り、in-memory に退避。
    //   main() が後でこのフラグを参照して自動発火を判定する。
    try {
        var __gbotInitialHash = '';
        try { __gbotInitialHash = String(location.hash || ''); } catch (e) {}
        // /#gta=1/ または /#gta/ 単体を許容 (将来 #gta=<ASIN> 等の拡張も視野)
        window.__gbot_gta_requested__ = /(?:^|[#&?])gta(?:=1)?(?:$|[&])/.test(__gbotInitialHash) ||
                                        /#gta\b/.test(__gbotInitialHash);
    } catch (e) {
        try { window.__gbot_gta_requested__ = false; } catch (er) {}
    }

    // ═════════════════════════════════════════════════
    // ★v0.1.16.6: panel skeleton 即時表示(関数定義より前 = 最速描画)
    //   HIRO 報告 2026-05-10: 「最初の一瞬間がある」 → IIFE 評価完了前に panel 出す
    //   このブロックは最小限。本番 panel は ensurePanel() で後から差し替え。
    // ═════════════════════════════════════════════════
    try {
        var __isInIframe = false;
        try { __isInIframe = window.top !== window.self; } catch (e) { __isInIframe = true; }
        if (!__isInIframe) {
            var __preStyle = document.createElement('style');
            __preStyle.id = 'lb-am-pre-style';
            __preStyle.textContent =
                '#lb-am-skeleton{position:fixed;right:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px));' +
                'width:210px;background:rgb(35,47,62);color:#febd69;border:1px solid rgba(255,153,0,0.4);' +
                'border-radius:12px;padding:10px 12px;font:11px monospace;z-index:2147483647;}';
            (document.head || document.documentElement).appendChild(__preStyle);
            var __skel = document.createElement('div');
            __skel.id = 'lb-am-skeleton';
            __skel.textContent = '⚡ 起動中...';
            (document.body || document.documentElement).appendChild(__skel);
        }
    } catch (e) {}

    // ═════════════════════════════════════════════════
    // 【最優先】iOS Safari の Amazon アプリへの遷移をブロック
    //   ★HIRO 指摘 2026-05-08: アプリに飛ぶと UserScript が効かなくなる
    //   @run-at document-start で IIFE 即実行されるため、
    //   Safari が <meta name="apple-itunes-app"> を解釈する前に削除する。
    // ═════════════════════════════════════════════════
    const blockAmazonAppRedirect = () => {
        try {
            // 1. Smart App Banner の meta タグを即削除(Safari 上部の「アプリで開く」バナー)
            const removeBanner = () => {
                document.querySelectorAll('meta[name="apple-itunes-app"]').forEach(m => m.remove());
                document.querySelectorAll('meta[name="apple-mobile-web-app-capable"]').forEach(m => m.remove());
            };
            removeBanner();
            // ★v0.1.16.5: MutationObserver を 10 秒で停止(CPU 負荷削減)
            //   Smart App Banner が動的追加されるのは初期ロード時のみ
            const obs = new MutationObserver(removeBanner);
            try {
                obs.observe(document.documentElement, { childList: true, subtree: true });
                setTimeout(() => { try { obs.disconnect(); } catch(e){} }, 10000);
            } catch (e) {}

            // 2. Amazon アプリ用 URL スキーム(amzn://, com.amazon.mobile.shopping://)への
            //    遷移試行をブロック
            const isAppScheme = (url) => {
                if (!url) return false;
                return /^(amzn:|com\.amazon|amazon-app:|amazonapp:)/i.test(String(url));
            };

            // window.location.href = 'amzn://...' のような遷移をブロック
            try {
                const loc = window.location;
                const origAssign = loc.assign?.bind(loc);
                const origReplace = loc.replace?.bind(loc);
                if (origAssign) {
                    loc.assign = function(url) {
                        if (isAppScheme(url)) { console.log('[GBOT-AM] block app redirect:', url); return; }
                        return origAssign(url);
                    };
                }
                if (origReplace) {
                    loc.replace = function(url) {
                        if (isAppScheme(url)) { console.log('[GBOT-AM] block app redirect:', url); return; }
                        return origReplace(url);
                    };
                }
            } catch (e) {}

            // 3. iframe で App Bridge 用の amzn://... を読み込もうとするのも遮断
            //    (DOM 監視で削除)
            const iframeObs = new MutationObserver(() => {
                document.querySelectorAll('iframe[src^="amzn:"], iframe[src*="amazon-app:"]').forEach(f => f.remove());
                document.querySelectorAll('a[href^="amzn:"], a[href*="amazon-app:"]').forEach(a => {
                    a.removeAttribute('href');
                });
            });
            try {
                iframeObs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src','href'] });
                // ★v0.1.16.5: 30 秒で停止(初期ロード後は不要)
                setTimeout(() => { try { iframeObs.disconnect(); } catch(e){} }, 30000);
            } catch (e) {}
        } catch (e) {}
    };
    // ★ 即実行(他の初期化より前に)
    blockAmazonAppRedirect();

    // ───────────────────────────────────────────────
    // CONFIG (Netlify Functions により設定ページから値が埋め込まれる)
    // ───────────────────────────────────────────────
    const CONFIG = {
        profileName:     "運用テスト",
        reloadInterval:  500,
        reloadMax:       0,
        debugMode:       false,
        timerEnabled:    false,
        timerHHMM:       "21:00",
        configPageUrl:   "",
        buyNowPriority:  true,
        maxPrice:        0,
        // ★HIRO 指摘 2026-05-08:
        //   true なら 商品ページ到達 → マケプレ判定 → 自動で ?m=直販URL に切替
        //   false なら 開始ボタン押下時のみ動作(従来挙動)
        autoForceAmazon: true,
        // ★v0.1.9.3: 注文確定の方式(A〜E のテスト用)
        confirmMethod:   "G",
        // ★v0.1.13.1: HIRO 試験用ライトモード(2026-05-09)
        //   描画/監視を最小化して「もっさり」感を改善する。
        //   通常時は false。HIRO さんが amazon.html で ON にしたら true。
        liteMode:        false,
        // ★v0.1.15.19: Discord webhook(PB-CART と同じ通知機構、ログ追跡用)
        discordWebhook:  "",
        // ★v0.2.0: 完全停止確認スキップオプション(amazon.html → URL → ここに反映)
        skipConfirm:     true,
        // ★v0.3.8.4: AOD 詳細デバッグ (ネットワーク観測 + DOM dump 強化)
        //   デフォルト false。HIRO 環境で問題発生時に amazon.html から ON にする。
        //   true 時: clickAodAmazonOffer 時に 5 秒間 fetch/XHR を観測し
        //   aod-click-network ログとして出力。
        verboseAodDebug: false,
        // ★v0.3.8.74: 数量更新メッセージ検出時に opFullStop するか
        //   true (デフォルト): 「リクエストされた数量は入手できなくなりました」
        //                       「入手可能な最大数に数量を更新しました」検出で完全停止
        //   false: 警告ログだけ出してループ継続
        //   ※リストック初日 (2 段階リリース) は OFF 推奨。最初の販売で「カート→確定」
        //     の段階で一旦数量メッセージが出ても、すぐ本格リリースが来るため止めない。
        qtyStop:         true,
    };

    const SCRIPT_VERSION = 'PC-1.0.1';

    // v0.3.8.10: aod-env-snapshot のセッション内 1 回出力フラグ
    //   localStorage 'LB_AM_AOD_ENV_SIG' 永久キャッシュ廃止の代替。
    //   新セッション開始 (mode: STOPPED → RUNNING) で false にリセットされる。
    let aodEnvSnapshotLogged = false;

    // v0.3.8.15: AOD カート追加 API 200 検知フラグ
    //   observeNetworkAfterAodClick の hook 内で POST /cart/carts/retail/items が
    //   200 を返したら true + 時刻記録。clickAodAmazonOffer の「カートを見る」
    //   visible 待ちループで並列チェックし、API 成功時は DOM 待たずに checkout 直行。
    //   AOD click 投入直前に false にリセット (前回値の汚染防止)。
    let _aodCartAddApiOk = false;
    let _aodCartAddApiOkAt = 0;

    // ★v0.2.2: 商品ページ URL から ASIN 抽出する共通正規表現
    //   対応形式:
    //     /dp/<ASIN>           ← デスクトップ
    //     /gp/product/<ASIN>   ← 旧形式
    //     /gp/aw/d/<ASIN>      ← モバイル appstore-web (HIRO 環境で多用される)
    const ASIN_RE = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/;
    const extractAsin = (urlOrPath) => {
        if (!urlOrPath) return '';
        const m = urlOrPath.match(ASIN_RE);
        return m ? m[1] : '';
    };

    // ★v0.1.16.13: 「カート追加失敗」エラー検出ヘルパー
    //   Amazon 側がカート機能を一時的に止めてる状態(レート制限等)。
    //   この時 #buy-now-button/#add-to-cart-button が消えるので、isAmazonDirectUnavailable()
    //   が true になり「直販なし」と誤判定して AOD ループに入る問題の根因。
    //   このヘルパーで検出 → 即停止 + 復旧手順案内。
    const isCartAddFailed = () => {
        try {
            const txt = (document.body && document.body.innerText) || '';
            return /カート追加失敗/.test(txt) || /Add to Cart Failed/i.test(txt);
        } catch (e) { return false; }
    };

    // ★v0.1.16.8: パフォーマンス計測用 IIFE 起動時刻
    //   全ログ entry に「起動からの ms」を含める → 「もっさり」感の原因特定
    const PERF_T0 = Date.now();
    const perfNow = () => Date.now() - PERF_T0;

    // ───────────────────────────────────────────────
    // Amazon.co.jp 直販 出品者 ID(★HIRO 指摘で導入 2026-05-08★)
    //   商品ページ URL に ?m=AN1VRQENFRJN5 を付けると、
    //   Amazon.co.jp 直販オファーが Buy Box に強制表示される。
    //   - 直販あり → Buy Box が Amazon.co.jp に切替、「今すぐ買う」/「カートに入れる」表示
    //   - 直販なし → Buy Box が空、「おすすめ出品の要件を満たす出品はありません」表示
    //
    //   これにより AOD パネル走査(初期 14 件制限)を完全にバイパスできる。
    //   v0.1.4.x の AOD ロジックは互換のため残すが、attemptPurchase は本方式を優先。
    // ───────────────────────────────────────────────
    const AMAZON_SELLER_ID = 'AN1VRQENFRJN5';

    const isUrlForcedAmazon = () => {
        return new RegExp('[?&]m=' + AMAZON_SELLER_ID + '\\b').test(location.search || '');
    };

    const forceAmazonDirectUrl = () => {
        if (isUrlForcedAmazon()) return false; // 既に直販強制 URL
        if (S.shouldHalt()) return false;

        // ★v0.2.0: SESSION が無ければ作る(autoForceAmazon 経由の自動切替時)
        //   既存セッションがあれば productUrl 更新、reloadCount は維持
        const session = S.getSession();
        if (!session) {
            S.startNewSession(location.href);
        } else {
            S.updateSession({ productUrl: location.href });
        }
        S.setStep(STEP_PURCHASING);

        const sep = location.search ? '&' : '?';
        const newUrl = location.pathname + (location.search || '') + sep + 'm=' + AMAZON_SELLER_ID + (location.hash || '');

        try {
            logAm('info', 'force-amazon-url', '?m= 切替リダイレクト', {
                fromUrl: location.href.slice(0, 200),
                toUrl: newUrl.slice(0, 200),
            });
        } catch (e) {}

        toast(`▶ Amazon.co.jp 直販URLに切替中…\n(?m=${AMAZON_SELLER_ID.slice(0,6)}…)`, '#1976d2', 3000);
        setTimeout(() => {
            if (S.shouldHalt()) return;
            location.href = newUrl;
        }, 200);
        return true;
    };

    // 強制 URL に切り替え後、Amazon直販オファー無し(=Buy Box が空)を判定
    const isAmazonDirectUnavailable = () => {
        // 「おすすめ出品の要件を満たす出品はありません」テキスト検出
        const noOfferText = (document.body.innerText || '').includes('おすすめ出品の要件を満たす出品はありません');
        // または Buy Box ボタン両方が無い
        const noBuyBtn = !document.querySelector('#buy-now-button');
        const noCartBtn = !document.querySelector('#add-to-cart-button');
        return noOfferText || (noBuyBtn && noCartBtn);
    };

    // ═════════════════════════════════════════════════
    // ★v0.2.0: 状態管理層を全面書き換え
    //   旧: Cookie(STOP/STATE 5分TTL) + localStorage(WAITING) + sessionStorage 三層分散
    //       → TTL 切れ自動失効・状態不整合の温床(HIRO「停止が効かない」根因)
    //   新: localStorage 一本化、TTL なし
    //       MODE: STOPPED / RUNNING / PAUSED
    //       SESSION: { sid, productUrl, reloadCount, lastStep, startedAt, lastUpdate }
    //       TIMER: { fired, hhmm }
    //
    //   後方互換性: 旧 isStopped/setStopped/getState/setState/clearState/isWaiting は
    //   wrapper として残す。中身は S.* を呼ぶ。callsite はほぼそのまま動く。
    // ═════════════════════════════════════════════════

    // 共通ユーティリティ
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // ★v0.3.8.70: 人間反応速度モデル (BOT 検知対策、HIRO 採用)
    //   通常 90%: 正規分布 中央値 200ms、σ=50ms、min 80ms、max 350ms
    //              95% が 100-300ms 範囲 (人間反応速度の自然な分布)
    //   ヒッカップ 10%: 800-1500ms の遅延 (「一瞬迷う人間」模倣、超ステルス)
    //   → 規則的な反応 = BOT バレ を避けるため、たまに大きく遅らせる
    //   Box-Muller 変換で正規乱数生成 (ライブラリ不要)
    const humanReactionDelay = () => {
        // ヒッカップ 10%
        if (Math.random() < 0.10) {
            return 800 + Math.random() * 700;
        }
        // 通常 90%: 正規分布
        const u1 = Math.random() || 0.0001;
        const u2 = Math.random();
        const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return Math.max(80, Math.min(350, 200 + z * 50));
    };
    // 人間反応 sleep (humanReactionDelay の値で sleep)
    const sleepHuman = async () => { await sleep(humanReactionDelay()); };

    // ★v0.3.8.70: MutationObserver で要素 visible 待ち (polling より高速 + 省電力)
    //   ボタンが出現した瞬間に DOM 変化通知に乗って即発火
    //   タイムアウト超過時は null を返す (呼び出し側で AOD ナビ等に分岐)
    //   selector: CSS セレクタ (複数なら ',' 区切り)
    //   timeoutMs: タイムアウト ms
    //   options: { earlyExitFn: () => bool } (途中で諦める条件、例: 在庫切れテキスト出現)
    const waitForVisible = (selector, timeoutMs, options) => new Promise((resolve) => {
        const opts = options || {};
        // 初回確認 (既に出てるなら即解決、最大の速さ)
        try {
            const first = document.querySelector(selector);
            if (first && isElementVisible(first)) return resolve(first);
            if (opts.earlyExitFn && opts.earlyExitFn()) return resolve(null);
        } catch (e) {}

        const root = document.body || document.documentElement;
        if (!root) return resolve(null);

        let resolved = false;
        let timer = null;
        const cleanup = () => {
            if (resolved) return;
            resolved = true;
            try { obs.disconnect(); } catch (e) {}
            if (timer) { try { clearTimeout(timer); } catch (e) {} }
        };

        const obs = new MutationObserver(() => {
            if (resolved) return;
            try {
                const el = document.querySelector(selector);
                if (el && isElementVisible(el)) {
                    cleanup();
                    return resolve(el);
                }
                if (opts.earlyExitFn && opts.earlyExitFn()) {
                    cleanup();
                    return resolve(null);
                }
            } catch (e) {}
        });
        try {
            obs.observe(root, { childList: true, subtree: true, attributes: true,
                attributeFilter: ['style', 'class', 'aria-hidden', 'hidden'] });
        } catch (e) { return resolve(null); }

        timer = setTimeout(() => {
            cleanup();
            // タイムアウト時もう一度確認 (見落とし防止)
            try {
                const el2 = document.querySelector(selector);
                resolve(el2 && isElementVisible(el2) ? el2 : null);
            } catch (e) { resolve(null); }
        }, timeoutMs);
    });

    // ★v0.3.8.70: MutationObserver でテキスト出現待ち (waitForVisible の text 版)
    //   regex に match するテキストが document.body.innerText に出現した瞬間に発火
    //   例: 「カートに入れました」「おすすめ出品の要件を満たす出品はありません」
    const waitForText = (regex, timeoutMs, options) => new Promise((resolve) => {
        const opts = options || {};
        const re = (regex instanceof RegExp) ? regex : new RegExp(regex);
        const check = () => {
            try {
                const t = (document.body && document.body.innerText) || '';
                if (re.test(t)) return true;
            } catch (e) {}
            return false;
        };
        if (check()) return resolve(true);
        if (opts.earlyExitFn && opts.earlyExitFn()) return resolve(false);

        const root = document.body || document.documentElement;
        if (!root) return resolve(false);

        let resolved = false;
        let timer = null;
        const cleanup = () => {
            if (resolved) return;
            resolved = true;
            try { obs.disconnect(); } catch (e) {}
            if (timer) { try { clearTimeout(timer); } catch (e) {} }
        };

        const obs = new MutationObserver(() => {
            if (resolved) return;
            if (check()) { cleanup(); return resolve(true); }
            if (opts.earlyExitFn && opts.earlyExitFn()) { cleanup(); return resolve(false); }
        });
        try { obs.observe(root, { childList: true, subtree: true, characterData: true }); }
        catch (e) { return resolve(false); }

        timer = setTimeout(() => { cleanup(); resolve(check()); }, timeoutMs);
    });

    // ───────────────────────────────────────────────
    // v2 状態管理 (S オブジェクト)
    // ───────────────────────────────────────────────

    // モード定数(トップレベル状態)
    const MODE_STOPPED = 'STOPPED';   // 完全停止。何があっても動かない
    const MODE_RUNNING = 'RUNNING';   // 動作中。リロード・購入処理が走る
    const MODE_PAUSED  = 'PAUSED';    // 一時停止。SESSION 維持、再開可能

    // 処理ステップ定数(RUNNING 中のサブ状態)
    const STEP_IDLE         = 'IDLE';
    const STEP_PURCHASING   = 'PURCHASING';
    const STEP_AOD_OPEN     = 'AOD_OPEN';
    const STEP_CART_DONE    = 'CART_DONE';
    const STEP_CHECKOUT     = 'CHECKOUT';
    const STEP_ORDER_PLACED = 'ORDER_PLACED';

    // localStorage キー(v2 名前空間)
    const KEY_V2_MODE       = 'LB_AM_V2_MODE';
    const KEY_V2_SESSION    = 'LB_AM_V2_SESSION';
    const KEY_V2_TIMER      = 'LB_AM_V2_TIMER';
    const KEY_V2_MIGRATED   = 'LB_AM_V2_MIGRATED';
    const KEY_V2_SKIP_CONFIRM = 'LB_AM_V2_SKIP_CONFIRM';  // 完全停止確認スキップ
    // ★v0.3.8.75: 数量更新で停止 のランタイム override (パネルボタンで切替)
    //   '1' = ON (停止), '0' = OFF (無視), null = CONFIG.qtyStop に従う
    const KEY_QTY_STOP_OVERRIDE = 'LB_AM_QTY_STOP_OVERRIDE';
    const getQtyStopOverride = () => {
        try { return localStorage.getItem(KEY_QTY_STOP_OVERRIDE); }
        catch (e) { return null; }
    };
    const setQtyStopOverride = (on) => {
        try { localStorage.setItem(KEY_QTY_STOP_OVERRIDE, on ? '1' : '0'); }
        catch (e) {}
    };
    const getEffectiveQtyStop = () => {
        const ov = getQtyStopOverride();
        if (ov === '1') return true;
        if (ov === '0') return false;
        return !!(typeof CONFIG !== 'undefined' && CONFIG.qtyStop);
    };

    // ★v0.3.8.96: Discord webhook を端末ローカル(localStorage)から読む
    //   GitHub 配信(公開ファイル)では秘密を埋め込めないため、webhook は
    //   ⚙設定ダイアログで HIRO が iPhone 上で入力 → localStorage に保存。
    //   公開ファイルには一切残らない。空なら通知 OFF。
    const KEY_DISCORD_WEBHOOK = 'LB_AM_DISCORD_WEBHOOK';
    const getDiscordWebhook = () => {
        try {
            const ov = (localStorage.getItem(KEY_DISCORD_WEBHOOK) || '').trim();
            if (ov) return ov;
        } catch (e) {}
        return ((typeof CONFIG !== 'undefined' && CONFIG.discordWebhook) || '').trim();
    };
    const setDiscordWebhook = (url) => {
        try {
            const v = (url || '').trim();
            if (v) localStorage.setItem(KEY_DISCORD_WEBHOOK, v);
            else localStorage.removeItem(KEY_DISCORD_WEBHOOK);
            return true;
        } catch (e) { return false; }
    };

    // 旧 v1 キー(マイグレーション削除用)
    const OLD_KEYS = [
        'LB_AM_PRODUCT_URL_V1', 'LB_AM_START_TS_V1', 'LB_AM_RELOAD_COUNT_V1',
        'LB_AM_WAITING_V1', 'LB_AM_TIMER_FIRED_V1',
    ];
    const OLD_COOKIES = ['LB_AM_SID', 'LB_AM_STOP', 'LB_AM_STATE'];
    const OLD_SESSION_KEY = 'LB_AM_SESSION_ID';

    // 内部 JSON ヘルパー
    const _readJSON = (key, defaultVal) => {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return defaultVal;
            return JSON.parse(raw);
        } catch (e) { return defaultVal; }
    };
    // ★v0.3.8.85: localStorage 書き込み失敗を診断可能にする
    //   旧: 失敗時 silent return false → setItem QuotaExceeded を完全黙殺
    //   新: 失敗時に console + logAm (再帰防止フラグあり) で warn 出力
    //   ★v0.3.8.84 の TRANS-AM「RUNNING だがセッションなし」の根本原因究明用
    let _writeJSONFailLogging = false;  // 再帰防止フラグ
    const _writeJSON = (key, val) => {
        try { localStorage.setItem(key, JSON.stringify(val)); return true; }
        catch (e) {
            try { console.warn('[GBOT-AM] localStorage write FAIL', key, e && e.message); } catch (er) {}
            // logAm 自身が _writeJSON を呼ぶ (LOG_KEY_AM 経由) ため、再帰を避ける
            if (!_writeJSONFailLogging) {
                _writeJSONFailLogging = true;
                try { logAm('error', 'storage-fail',
                    'localStorage 書き込み失敗 (quota 超過の可能性)', {
                        key: key, err: e && e.message, valLen: (() => {
                            try { return JSON.stringify(val).length; } catch (er) { return -1; }
                        })(),
                    }); } catch (er) {}
                _writeJSONFailLogging = false;
            }
            return false;
        }
    };
    const _genSid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

    // ★v0.3.8.85: in-memory session キャッシュ (localStorage 書き込み失敗からの保護)
    //   背景: v0.3.8.84 ログで TAB-1 (v0.3.8.84) と TAB-2 (v0.3.8.80) が並行起動時、
    //         TAB-1 の startNewSession が localStorage 書き込み直後 (2ms) に
    //         getSession() で null を返す現象を確認 (multi-tab race / quota 競合の疑い)。
    //   対策: 同一タブ内では in-memory キャッシュを最優先で参照、localStorage は
    //         ナビゲーション越境用のフォールバックとする。
    //   仕様:
    //     - getSession()    : _sessionCache が non-null なら返す、null なら localStorage 読み
    //     - startNewSession : 書き込み + キャッシュ同期
    //     - updateSession   : 書き込み + キャッシュ同期
    //     - clearSession    : 削除 + キャッシュ null
    //   タブ起動直後は _sessionCache=null なので localStorage 読みになる (前回ナビ越境 OK)。
    let _sessionCache = null;

    // S オブジェクト(v2 状態管理 API)
    const S = {
        // 定数
        MODE_STOPPED, MODE_RUNNING, MODE_PAUSED,
        STEP_IDLE, STEP_PURCHASING, STEP_AOD_OPEN, STEP_CART_DONE, STEP_CHECKOUT, STEP_ORDER_PLACED,

        // モード
        getMode() {
            try {
                const m = localStorage.getItem(KEY_V2_MODE);
                if (m === MODE_RUNNING || m === MODE_PAUSED || m === MODE_STOPPED) return m;
                return MODE_STOPPED;
            } catch (e) { return MODE_STOPPED; }
        },
        setMode(mode) {
            if (mode !== MODE_STOPPED && mode !== MODE_RUNNING && mode !== MODE_PAUSED) return false;
            try {
                const prev = S.getMode();
                localStorage.setItem(KEY_V2_MODE, mode);
                if (prev !== mode) {
                    try { logAm('info', 'mode', `${prev} → ${mode}`); } catch (e) {}
                }
                return true;
            } catch (e) { return false; }
        },
        isRunning() { return S.getMode() === MODE_RUNNING; },
        isPaused()  { return S.getMode() === MODE_PAUSED; },
        isFullyStopped() { return S.getMode() === MODE_STOPPED; },
        // ★最重要: shouldHalt() = RUNNING 以外なら動かない
        //   await のたびに呼ぶ → setTimeout 中の reload も確実に kill
        shouldHalt() { return S.getMode() !== MODE_RUNNING; },

        // セッション
        // ★v0.3.8.85: in-memory キャッシュ優先、localStorage はフォールバック
        // ★v0.3.8.86: sessionStorage バックアップ追加 (same-tab navigation 越境保護)
        //   localStorage が quota fail で session 消失しても sessionStorage が救済
        //   sessionStorage は same-tab で navigate しても persist する iOS Safari 仕様
        getSession() {
            if (_sessionCache !== null) return _sessionCache;
            // ① localStorage 試行
            let fresh = _readJSON(KEY_V2_SESSION, null);
            // ② localStorage が空 → sessionStorage フォールバック (★v0.3.8.86)
            if (!fresh) {
                try {
                    const raw = sessionStorage.getItem(KEY_V2_SESSION);
                    if (raw) {
                        fresh = JSON.parse(raw);
                        try { logAm('warn', 'session-recovery',
                            'localStorage に session なし → sessionStorage から復元 (quota fail からの救済)', {
                                sid: fresh && fresh.sid ? fresh.sid.slice(0, 6) : null,
                                productUrl: fresh && fresh.productUrl ? fresh.productUrl.slice(0, 100) : null,
                            }); } catch (e) {}
                        // 復元できたので localStorage にも書き戻し試行 (次回 navigate のため)
                        _writeJSON(KEY_V2_SESSION, fresh);
                    }
                } catch (e) {}
            }
            if (fresh) _sessionCache = fresh;
            return fresh;
        },
        startNewSession(productUrl) {
            const session = {
                sid: _genSid(),
                startedAt: Date.now(),
                productUrl: productUrl || location.href,
                reloadCount: 0,
                lastStep: STEP_IDLE,
                lastUpdate: Date.now(),
            };
            const ok = _writeJSON(KEY_V2_SESSION, session);
            // ★v0.3.8.86: sessionStorage にも書き込み (navigate 越境バックアップ)
            let ssOk = false;
            try {
                sessionStorage.setItem(KEY_V2_SESSION, JSON.stringify(session));
                ssOk = true;
            } catch (e) {
                try { console.warn('[GBOT-AM] sessionStorage write FAIL', e && e.message); } catch (er) {}
            }
            _sessionCache = session;  // ★v0.3.8.85: localStorage 失敗時もキャッシュは生存
            S.setMode(MODE_RUNNING);
            // v0.3.8.10: aod-env-snapshot を新セッションで再出力するためフラグリセット
            //   (localStorage 永久キャッシュ廃止の代替、in-memory フラグ管理)
            aodEnvSnapshotLogged = false;
            try { logAm('info', 'session', '新規セッション開始', {
                sid: session.sid.slice(0, 6),
                productUrl: session.productUrl.slice(0, 100),
                storageOk: ok,        // ★v0.3.8.85: localStorage 書き込み成功可否
                ssStorageOk: ssOk,    // ★v0.3.8.86: sessionStorage 書き込み成功可否
            }); } catch (e) {}
            return session;
        },
        updateSession(patch) {
            const cur = S.getSession();
            if (!cur) return null;
            const next = Object.assign({}, cur, patch, { lastUpdate: Date.now() });
            _writeJSON(KEY_V2_SESSION, next);
            // ★v0.3.8.86: sessionStorage も同期
            try { sessionStorage.setItem(KEY_V2_SESSION, JSON.stringify(next)); } catch (e) {}
            _sessionCache = next;  // ★v0.3.8.85: キャッシュ同期
            return next;
        },
        incrementReloadCount() {
            const cur = S.getSession();
            if (!cur) return 0;
            const newCount = (cur.reloadCount || 0) + 1;
            S.updateSession({ reloadCount: newCount });
            return newCount;
        },
        setStep(step) {
            const cur = S.getSession();
            if (!cur) return;
            if (cur.lastStep !== step) {
                try { logAm('info', 'step', `${cur.lastStep || STEP_IDLE} → ${step}`); } catch (e) {}
            }
            S.updateSession({ lastStep: step });
        },
        getStep() {
            const cur = S.getSession();
            return cur ? (cur.lastStep || STEP_IDLE) : STEP_IDLE;
        },
        clearSession() {
            try { localStorage.removeItem(KEY_V2_SESSION); } catch (e) {}
            try { sessionStorage.removeItem(KEY_V2_SESSION); } catch (e) {}  // ★v0.3.8.86: SS も削除
            _sessionCache = null;  // ★v0.3.8.85: キャッシュも同期削除
        },

        // 操作系(UI から呼ぶ)
        opStart(productUrl) {
            S.clearSession();
            // ★v0.3.8.16: TRANS-AM フラグ強制 remove (バリア 3: 排他性保証)
            //   万一前回 TRANS-AM 中に異常終了で残っていても、ここで必ず消す
            try { localStorage.removeItem('LB_AM_TRANS_AM_MODE'); } catch (e) {}
            // ★v0.3.8.63: 直販確認済タイムスタンプもセッション開始時にクリア
            //   理由: LB_AM_VERIFIED_DIRECT がブラウザ閉じても残り、5 分以内なら
            //         次セッションで verifiedRecent=true として「failsafe NG でも続行」
            //         する可能性。新セッションでは前商品の確認結果は使えないのでクリア必須。
            try { localStorage.removeItem('LB_AM_VERIFIED_DIRECT'); } catch (e) {}
            const s = S.startNewSession(productUrl);
            try { logAm('info', 'op', '🛒 開始(新規)', { sid: s.sid.slice(0, 6) }); } catch (e) {}
            return s;
        },
        // ★v0.3.8.16: ⚡TRANS-AM⚡ モード起動 (排他、既存 opStart と並列)
        //   URL 組み立て直撃モード。Buy Box / AOD 検出はスキップ。
        //   バリア 1〜4 で既存 opStart との二重起動を構造的に防止。
        opStartTransAm(productUrl) {
            S.clearSession();
            // バリア 3: 過去のフラグも一旦 remove してからセット (clean start)
            try { localStorage.removeItem('LB_AM_TRANS_AM_MODE'); } catch (e) {}
            try { localStorage.setItem('LB_AM_TRANS_AM_MODE', '1'); } catch (e) {}
            // ★v0.3.8.63: opStart と同じく直販確認済タイムスタンプもクリア
            try { localStorage.removeItem('LB_AM_VERIFIED_DIRECT'); } catch (e) {}
            const s = S.startNewSession(productUrl);
            try { logAm('info', 'op', '⚡ TRANS-AM 起動 (URL 直撃モード)', { sid: s.sid.slice(0, 6) }); } catch (e) {}
            return s;
        },
        // ★v0.3.8.16: TRANS-AM モード判定 (シンプル localStorage チェック)
        isTransAmMode() {
            try { return localStorage.getItem('LB_AM_TRANS_AM_MODE') === '1'; } catch (e) { return false; }
        },
        opPause() {
            const prev = S.getMode();
            S.setMode(MODE_PAUSED);
            try { logAm('info', 'op', '⏸ 一時停止', { from: prev, transAm: S.isTransAmMode() }); } catch (e) {}
        },
        opResume() {
            const session = S.getSession();
            if (!session) {
                try { logAm('warn', 'op', '▶ 再開失敗: セッションなし'); } catch (e) {}
                return false;
            }
            S.setMode(MODE_RUNNING);
            try { logAm('info', 'op', '▶ 再開', {
                sid: session.sid.slice(0, 6), reloadCount: session.reloadCount,
                transAm: S.isTransAmMode(),   // TRANS-AM 中なら TRANS-AM で再開
            }); } catch (e) {}
            return true;
        },
        opFullStop() {
            S.clearSession();
            S.setMode(MODE_STOPPED);
            // ★v0.3.8.16: TRANS-AM フラグも必ず削除 (バリア 4: 排他性保証)
            //   通常完全停止 / 注文完了 / 在庫切れ等、すべて opFullStop 経由なので
            //   ここで削除すればフラグが残り続けることはない。
            try { localStorage.removeItem('LB_AM_TRANS_AM_MODE'); } catch (e) {}
            // ★v0.3.8.78: 注文 click 時刻も完全停止時にクリア (新セッションでの誤判定防止)
            try { localStorage.removeItem('LB_AM_LAST_ORDER_CLICK_TS'); } catch (e) {}
            try { logAm('info', 'op', '🛑 完全停止'); } catch (e) {}
        },

        // タイマー
        isTimerFired() {
            const t = _readJSON(KEY_V2_TIMER, { fired: false });
            return t.fired === true;
        },
        markTimerFired() { _writeJSON(KEY_V2_TIMER, { fired: true, firedAt: Date.now() }); },
        clearTimerFired() { try { localStorage.removeItem(KEY_V2_TIMER); } catch (e) {} },

        // 完全停止確認スキップ設定
        getSkipConfirm() {
            try { return localStorage.getItem(KEY_V2_SKIP_CONFIRM) === '1'; }
            catch (e) { return false; }
        },
        setSkipConfirm(v) {
            try {
                if (v) localStorage.setItem(KEY_V2_SKIP_CONFIRM, '1');
                else localStorage.removeItem(KEY_V2_SKIP_CONFIRM);
            } catch (e) {}
        },

        // マイグレーション (v1 → v2)
        migrateFromV1() {
            try {
                if (localStorage.getItem(KEY_V2_MIGRATED) === '1') return false;
                // 旧 localStorage キー削除
                OLD_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
                // 旧 Cookie 削除
                OLD_COOKIES.forEach(name => {
                    try {
                        document.cookie = `${name}=; path=/; domain=.amazon.co.jp; max-age=0; SameSite=Lax`;
                    } catch (e) {}
                });
                // 旧 sessionStorage 削除
                try { sessionStorage.removeItem(OLD_SESSION_KEY); } catch (e) {}

                // クリーンスタート: STOPPED + SESSION なし
                S.setMode(MODE_STOPPED);
                S.clearSession();
                S.clearTimerFired();

                localStorage.setItem(KEY_V2_MIGRATED, '1');
                try { logAm('info', 'migrate', 'v0.1 → v0.2 マイグレーション完了'); } catch (e) {}
                return true; // マイグレーション実行されたことを示す
            } catch (e) {
                console.error('[GBOT-AM] migration error:', e);
                return false;
            }
        },
    };

    // ───────────────────────────────────────────────
    // 旧 API 後方互換 wrapper(callsite を一気に書き換えなくて済むように)
    //   ただし意味が変わる箇所:
    //     - setStopped(true) は v1 では Cookie に STOP=1(5分TTL)、v2 では PAUSED
    //     - clearState() は v1 では state 削除のみ、v2 では SESSION クリア + STOPPED
    //   呼び出し側で v2 に明示的に書き換える方が安全
    // ───────────────────────────────────────────────
    const isStopped = () => S.shouldHalt();
    const setStopped = (v) => { if (v) S.opPause(); /* false 時は何もしない、明示的に opStart/opResume を呼ぶ */ };
    const getState = () => {
        const cur = S.getSession();
        return cur ? (cur.lastStep === STEP_IDLE ? '' : cur.lastStep) : '';
    };
    const setState = (s) => { S.setStep(s); };
    const clearState = () => { S.opFullStop(); };
    const isWaiting = () => S.isRunning() && !!S.getSession();

    // 旧定数の後方互換(callsite で使われてる)
    const ST_PURCHASING   = STEP_PURCHASING;
    const ST_AOD_OPEN     = STEP_AOD_OPEN;
    const ST_CART_DONE    = STEP_CART_DONE;
    const ST_CHECKOUT     = STEP_CHECKOUT;
    const ST_ORDER_PLACED = STEP_ORDER_PLACED;

    // 旧 sessionId 関数(callsite で使われる) → v2 SESSION の sid を返す
    const getSessionId = () => {
        const s = S.getSession();
        return s ? s.sid : '';
    };
    const renewSessionId = () => {
        // opStart 経由で新セッションが作られる前提なので、ここでは何もしない
        // (旧コードの startPurchase 内で呼ばれていたが v2 では opStart が代替)
        return getSessionId();
    };
    const syncSessionIdFromCookie = () => { /* v2 では Cookie 不使用、no-op */ };

    // 旧 KEY_* 定数(一部の callsite で残ってる、no-op key として残す)
    //   実際には v2 SESSION 経由でアクセスするので、これらの key への書き込みは無効
    //   読み取りはマイグレーションで削除済みのため空文字
    const KEY_PRODUCT_URL  = '__DEPRECATED_LB_AM_PRODUCT_URL';
    const KEY_START_TS     = '__DEPRECATED_LB_AM_START_TS';
    const KEY_RELOAD_COUNT = '__DEPRECATED_LB_AM_RELOAD_COUNT';
    const KEY_WAITING      = '__DEPRECATED_LB_AM_WAITING';
    const KEY_TIMER_FIRED  = '__DEPRECATED_LB_AM_TIMER_FIRED';

    // ───────────────────────────────────────────────
    // DOM utility
    // ───────────────────────────────────────────────
    // ★v0.3.8.59: 自分のパネル (#lb-am-panel) 配下を絶対に除外
    //   HIRO 報告 (2026-05-18 21:51 ログ): findClassicCartProceedButton が
    //   findByText('span, div', 'レジに進む') でトースト履歴のテキストに誤マッチし、
    //   スクリプトのパネル本体 <div id="lb-am-panel"> を click 投入する事故が発生。
    //   対策: findByText / findAllByText 入口で #lb-am-panel 配下を必ずスキップ。
    const _isOwnPanelDescendant = (el) => {
        try {
            if (!el || !el.closest) return false;
            return !!el.closest('#lb-am-panel');
        } catch (e) { return false; }
    };

    const findByText = (selector, ...texts) => {
        const els = document.querySelectorAll(selector);
        for (const el of els) {
            if (_isOwnPanelDescendant(el)) continue;
            const t = (el.innerText || el.value || '').trim();
            for (const target of texts) {
                if (t.includes(target)) return el;
            }
        }
        return null;
    };

    const findAllByText = (selector, ...texts) => {
        const matches = [];
        const els = document.querySelectorAll(selector);
        for (const el of els) {
            if (_isOwnPanelDescendant(el)) continue;
            const t = (el.innerText || el.value || '').trim();
            for (const target of texts) {
                if (t.includes(target)) { matches.push(el); break; }
            }
        }
        return matches;
    };

    // v0.1.8: visibility 判定を緩和
    //   - width/height=0 で弾くと iOS Safari の render 直後で誤判定する
    //   - opacity=0 も Amazon の transition 中に一瞬 0 になることがある
    //   - display:none / visibility:hidden だけ弾けば実用上十分
    const isElementVisible = (el) => {
        if (!el) return false;
        try {
            const style = getComputedStyle(el);
            if (style.display === 'none') return false;
            if (style.visibility === 'hidden') return false;
        } catch (e) {}
        return true;
    };

    // ───────────────────────────────────────────────
    // UI: バッジ・ボタン
    // ───────────────────────────────────────────────
    // ★v0.1.12.0: 全 UI(バッジ/ボタン/トースト)を画面下部 1 つのパネルに集約。
    //   HIRO 指摘 2026-05-09: 「監視中の窓があったら検索できない」「ボタン含めて 1 窓に整理」
    //                        「LONDO BELL の予約画面みたいに」
    //   構造:
    //     [画面下部 fixed]
    //       ┌─────────────────────────┐
    //       │ status (バッジ内容)      │
    //       ├─────────────────────────┤
    //       │ toasts (積み上げ最大5件) │
    //       ├─────────────────────────┤
    //       │ [🛒 購入][🛑 停止][⚙ 設定] │
    //       └─────────────────────────┘
    //     body には padding-bottom でパネル分のスペースを確保。
    // ★v0.1.13.3: 構造的高速化
    //   旧: Object.assign + createElement + appendChild × 10回 = ページ遷移ごとに重い
    //   新: <style> 1 個 + innerHTML 1 発で構築 → DOM 操作回数を 1/10 に
    //   HIRO 指摘 2026-05-09: 「ウィンドウが消える」 = ページ遷移時のパネル再生成のもっさり
    let _panelStyleInjected = false;
    const injectPanelStyle = () => {
        if (_panelStyleInjected) return;
        const styleHost = document.head || document.documentElement;
        if (!styleHost) return;
        // ★v0.3.8.2: TRANS-AM MODE ACTIVATE - UI 全面再構築
        //   HIRO 主訴 5 件対応:
        //     A. ステータスを TRANS-AM ロゴ風に (太字 stencil + マゼンタグロー + 黒影)
        //     B. フォントも似た感じ (Impact / Haettenschweiler / Bahnschrift Condensed)
        //     C. TRANS-AM 画像を透かしに (panel::after, opacity 0.22, screen blend)
        //     D. 設定の下の余白なし → 上下対称 16px / 16px
        //     E. アイコン色を透かしに合わせて (青系 → マゼンタ系に総入れ替え)
        //   既存 ID/onclick/状態管理は完全維持。
        const st = document.createElement('style');
        st.id = 'lb-am-panel-style';
        st.textContent = `
            #lb-am-panel{
              /* TRANS-AM core palette (★旧 CB を完全置換) */
              --ta-magenta:        #c41e9e;
              --ta-magenta-bright: #ff4dc9;
              --ta-magenta-deep:   #6e0c54;
              --ta-pink:           #ff80d8;
              --ta-pink-soft:      #ffb3e8;
              --ta-void-deep:      #15071a;
              --ta-void-base:      #220c2a;
              --ta-void-edge:      #2e0f36;
              --ta-celestial-white:#f8e8f5;
              --ta-haze:           rgba(248, 232, 245, 0.85);
              --ta-haze-faint:     rgba(248, 232, 245, 0.55);
              --ta-state-danger:   #ff3a4e;
              --ta-state-warn:     #ffd166;
              /* 旧 --cb-* 変数を TRANS-AM 値にマッピング (既存参照を自動移行) */
              --cb-deep-space:    var(--ta-void-deep);
              --cb-navy-core:     var(--ta-void-base);
              --cb-gn-glow:       var(--ta-magenta);
              --cb-gn-bright:     var(--ta-magenta-bright);
              --cb-gn-dim:        var(--ta-magenta-deep);
              --cb-gold-primary:  var(--ta-magenta);
              --cb-gold-bright:   var(--ta-magenta-bright);
              --cb-gold-deep:     var(--ta-magenta-deep);
              --cb-celestial-white: var(--ta-celestial-white);
              --cb-haze:          var(--ta-haze);
              --cb-haze-faint:    var(--ta-haze-faint);
              --cb-state-danger:  var(--ta-state-danger);
              /* Typography stacks */
              --font-display:
                "Impact",
                "Haettenschweiler",
                "Bahnschrift Condensed Bold",
                "Arial Narrow Bold",
                "Helvetica Neue Condensed Bold",
                "Yu Gothic UI",
                "Hiragino Sans",
                "Meiryo",
                sans-serif;
              --font-ui:
                -apple-system, BlinkMacSystemFont,
                "SF Pro Text", system-ui,
                "Segoe UI", Roboto, "Helvetica Neue", Arial,
                "Hiragino Sans", "Hiragino Kaku Gothic ProN",
                "Yu Gothic UI", "Meiryo",
                sans-serif;
              --font-mono:
                ui-monospace,
                "SF Mono", "Cascadia Mono", "Roboto Mono",
                Menlo, Monaco, Consolas,
                monospace;
              /* Spacing scale */
              --space-xs: 4px;
              --space-sm: 8px;
              --space-md: 12px;
              --space-lg: 16px;
              --space-xl: 20px;
              /* Radius scale (HUD なので控えめ) */
              --radius-sm: 4px;
              --radius-md: 6px;
              --radius-lg: 8px;
              /* TRANS-AM glow */
              --glow-ta-soft:
                0 0 0 1px rgba(196,30,158,0.45),
                0 4px 18px rgba(196,30,158,0.35),
                inset 0 1px 0 rgba(255,128,216,0.20);
              --glow-ta-strong:
                0 0 0 1px rgba(196,30,158,0.65),
                0 6px 28px rgba(196,30,158,0.65),
                inset 0 1px 0 rgba(255,128,216,0.32);
              --glow-pink-soft:
                0 0 0 1px rgba(255,128,216,0.45),
                0 4px 18px rgba(255,77,201,0.32),
                inset 0 1px 0 rgba(255,179,232,0.22);
              --glow-pink-strong:
                0 0 0 1px rgba(255,128,216,0.65),
                0 6px 26px rgba(255,77,201,0.6),
                inset 0 1px 0 rgba(255,179,232,0.32);
              --glow-warn-soft:
                0 0 0 1px rgba(255,209,102,0.45),
                0 4px 18px rgba(255,209,102,0.32),
                inset 0 1px 0 rgba(255,255,255,0.22);
              --glow-warn-strong:
                0 0 0 1px rgba(255,209,102,0.65),
                0 6px 26px rgba(255,209,102,0.6),
                inset 0 1px 0 rgba(255,255,255,0.32);
              --glow-danger-soft:
                0 0 0 1px rgba(255,58,78,0.45),
                0 4px 18px rgba(255,58,78,0.35),
                inset 0 1px 0 rgba(255,179,179,0.20);
              --glow-danger-strong:
                0 0 0 1px rgba(255,58,78,0.7),
                0 6px 26px rgba(255,58,78,0.65),
                inset 0 1px 0 rgba(255,179,179,0.32);
              --shadow-panel:
                0 1px 0 rgba(255,128,216,0.08) inset,
                0 0 0 1px rgba(196,30,158,0.35),
                0 8px 28px rgba(0,0,0,0.65),
                0 24px 64px rgba(110,12,84,0.30);
              --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
              --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
              --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
              /* パネル本体 */
              position: fixed;
              right: var(--space-sm);
              bottom: calc(var(--space-sm) + env(safe-area-inset-bottom, 0px));
              width: 252px;
              max-width: calc(100vw - 16px);
              /* ★v0.3.8.7: トーストはみ出し対策 - 64vh→78vh に拡張
                 iPhone 14 (844px): 540px→658px (+118px)
                 iPhone SE (667px): 427px→520px (+93px)
                 → トースト 2 件まで余裕で収まる */
              max-height: 78vh;
              /* ★v0.3.8.64: 通常時パネル base = シアン HUD (HIRO 23:02 スクショで「ピンクのまま」根本対策)
                 旧: マゼンタグラデ + 紫黒背景 + マゼンタ枠 = トースト文字をシアンにしても錯視でピンク
                 新: シアン/紺グラデ + 紺背景 + シアン枠 = HUD カラーで統一感
                 is-transam クラス時のみ TA マゼンタテーマにオーバーライド */
              background:
                linear-gradient(168deg,
                  rgba(8,18,28,0.80) 0%,
                  rgba(14,30,46,0.74) 50%,
                  rgba(8,18,28,0.82) 100%),
                radial-gradient(120% 80% at 50% 0%,
                  rgba(2,136,209,0.18) 0%,
                  rgba(2,136,209,0) 55%),
                radial-gradient(80% 60% at 100% 100%,
                  rgba(128,224,255,0.10) 0%,
                  rgba(128,224,255,0) 60%);
              background-color: #08121c;
              color: #d0e8f5;
              font-family: var(--font-ui);
              font-size: 13px;
              font-weight: 400;
              line-height: 1.5;
              letter-spacing: 0.01em;
              z-index: 2147483647;
              border-radius: var(--radius-md);
              border: 1px solid rgba(93, 213, 229, 0.55);
              box-shadow:
                0 1px 0 rgba(128,224,255,0.08) inset,
                0 0 0 1px rgba(2,136,209,0.35),
                0 8px 28px rgba(0,0,0,0.65),
                0 24px 64px rgba(2,136,209,0.20);
              overflow: hidden;
              display: flex;
              flex-direction: column;
              gap: 0;
              contain: layout paint style;
              transform: translate3d(0,0,0);
              -webkit-backface-visibility: hidden;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
              animation: cbPanelMaterialize 0.6s var(--ease-out) forwards;
              opacity: 0;}
            /* ★v0.3.8.64: is-transam クラス時のみマゼンタ HUD にオーバーライド */
            #lb-am-panel.is-transam{
              background:
                linear-gradient(168deg,
                  rgba(21,7,26,0.78) 0%,
                  rgba(34,12,42,0.72) 50%,
                  rgba(21,7,26,0.82) 100%),
                radial-gradient(120% 80% at 50% 0%,
                  rgba(196,30,158,0.18) 0%,
                  rgba(196,30,158,0) 55%),
                radial-gradient(80% 60% at 100% 100%,
                  rgba(255,128,216,0.10) 0%,
                  rgba(255,128,216,0) 60%);
              background-color: #15071a;
              color: var(--ta-celestial-white);
              border: 1px solid rgba(196, 30, 158, 0.55);
              box-shadow: var(--shadow-panel);}
            /* ★v0.3.8.3: panel::after (透かし全面) 削除、
               panel::before (HUD コーナーマーカー) 削除。
               透かしは #lb-am-panel-status::before に移動 (ステータス領域のみ)。 */
            /* 動作中: TRANS-AM ならマゼンタ pulse、通常動作中はシアン pulse (v0.3.8.23) */
            #lb-am-panel.is-running{
              animation:
                cbPanelMaterialize 0.6s var(--ease-out) forwards,
                cyanBreathing 3.2s ease-in-out 0.6s infinite;}
            #lb-am-panel.is-running.is-transam{
              animation:
                cbPanelMaterialize 0.6s var(--ease-out) forwards,
                cbBreathing 3.2s ease-in-out 0.6s infinite;}
            @keyframes cbPanelMaterialize{
              0%   { opacity: 0; transform: translate3d(0,12px,0) scale(0.96); filter: blur(8px); }
              60%  { opacity: 1; filter: blur(0); }
              100% { opacity: 1; transform: translate3d(0,0,0) scale(1); filter: blur(0); }}
            @keyframes cbBreathing{
              0%, 100% {
                box-shadow:
                  0 1px 0 rgba(255,128,216,0.08) inset,
                  0 0 0 1px rgba(196,30,158,0.35),
                  0 8px 28px rgba(0,0,0,0.65),
                  0 0 0 rgba(196,30,158,0);}
              50% {
                box-shadow:
                  0 1px 0 rgba(255,128,216,0.15) inset,
                  0 0 0 1px rgba(196,30,158,0.65),
                  0 8px 28px rgba(0,0,0,0.65),
                  0 0 36px rgba(196,30,158,0.55);}}
            @keyframes cyanBreathing{
              0%, 100% {
                box-shadow:
                  0 1px 0 rgba(128,224,255,0.10) inset,
                  0 0 0 1px rgba(2,136,209,0.40),
                  0 8px 28px rgba(0,0,0,0.65),
                  0 0 0 rgba(2,136,209,0);}
              50% {
                box-shadow:
                  0 1px 0 rgba(128,224,255,0.18) inset,
                  0 0 0 1px rgba(2,136,209,0.70),
                  0 8px 28px rgba(0,0,0,0.65),
                  0 0 36px rgba(2,136,209,0.55);}}
            /* v0.3.8.24: is-running:not(.is-transam) の上書きは base に統合されたので削除 */

            /* ★v0.3.8.30: 折りたたみトグルボタン (右上) */
            #lb-am-btn-collapse{
              position: absolute;
              top: 6px; right: 6px;
              width: 28px; height: 28px;
              padding: 0;
              background: rgba(8,18,26,0.85);
              color: #5dd5e5;
              border: 1px solid rgba(128,224,255,0.5);
              border-radius: 6px;
              font-size: 16px;
              line-height: 1;
              font-weight: bold;
              cursor: pointer;
              z-index: 10;
              box-shadow: 0 2px 6px rgba(0,0,0,0.5);}
            #lb-am-btn-collapse:hover{
              background: rgba(2,136,209,0.4);
              border-color: #5dd5e5;}
            #lb-am-panel.is-transam #lb-am-btn-collapse{
              color: var(--ta-pink);
              border-color: rgba(255,128,216,0.5);}
            #lb-am-panel.is-transam #lb-am-btn-collapse:hover{
              background: rgba(196,30,158,0.35);
              border-color: var(--ta-magenta-bright);}
            /* ★v0.3.8.30: ミニバー (折りたたみ時のみ表示) */
            #lb-am-panel-minibar{
              display: none;
              padding: 8px 36px 8px 14px;
              font-family: var(--font-display);
              font-weight: 900;
              font-size: 12px;
              letter-spacing: 0.1em;
              color: #b8d8e8;
              cursor: pointer;
              text-shadow:
                0 0 5px rgba(93,213,229,0.65),
                0 0 12px rgba(123,184,216,0.45),
                0 2px 4px rgba(0,0,0,0.85);
              user-select: none;
              -webkit-user-select: none;}
            #lb-am-panel-minibar-state{
              display: inline-block;
              margin-left: 6px;
              color: #5dd5e5;
              font-size: 14px;
              animation: cbMinibarPulse 1.6s ease-in-out infinite;}
            @keyframes cbMinibarPulse{
              0%, 100% { opacity: 0.4; transform: scale(0.9); }
              50%      { opacity: 1.0; transform: scale(1.05); }}
            #lb-am-panel.is-transam #lb-am-panel-minibar{
              color: var(--ta-pink);
              text-shadow:
                0 0 6px rgba(196,30,158,0.85),
                0 0 14px rgba(255,77,201,0.55),
                0 2px 5px rgba(0,0,0,0.80);}
            #lb-am-panel.is-transam #lb-am-panel-minibar-state{
              color: var(--ta-pink);}
            /* ★v0.3.8.30: 折りたたみ状態 - inner を隠してミニバーを出す */
            #lb-am-panel.is-collapsed #lb-am-panel-inner{ display: none; }
            #lb-am-panel.is-collapsed #lb-am-panel-minibar{ display: block; }
            #lb-am-panel.is-collapsed{
              max-height: none;
              min-height: 0;
              padding: 0 !important;
              width: auto;
              min-width: 160px;}
            #lb-am-panel.is-collapsed #lb-am-btn-collapse{
              top: 4px; right: 4px;
              width: 24px; height: 24px;
              font-size: 14px;}
            /* オーバーレイ (ログ/商品データ) 表示中はパネル非表示 */
            body.lb-am-overlay-open #lb-am-panel{
              display: none !important;}
            /* CB ロゴ要素は v0.3.8.2 で DOM から削除済み。念のため CSS でも非表示 */
            #lb-am-cb-logo{ display: none !important; }
            #lb-am-panel-title, #lb-am-panel-subtitle{ display: none !important; }
            /* 内側コンテナ (主訴 D: 上下対称 16px) */
            #lb-am-panel-inner{
              padding: var(--space-lg) var(--space-md) var(--space-lg);
              display: flex;
              flex-direction: column;
              gap: var(--space-sm);
              min-height: 0;
              flex: 1 1 auto;
              position: relative;
              z-index: 2;}
            /* ★v0.3.8.24: ステータス base = HUD カラー (シアン)
               TRANS-AM 中 (.is-transam) のみマゼンタに上書き
               HIRO 要望: 「通常時(待機中含む)はシアン HUD、TRANS-AM 中だけマゼンタ」 */
            #lb-am-panel-status{
              font-family: var(--font-display);
              font-size: 13px;
              font-weight: 900;
              color: #b8d8e8;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              white-space: pre-wrap;
              word-break: break-all;
              line-height: 1.4;
              text-shadow:
                0 0 5px rgba(93,213,229,0.65),
                0 0 12px rgba(123,184,216,0.45),
                0 2px 4px rgba(0,0,0,0.85);
              -webkit-text-stroke: 0.3px rgba(0,0,0,0.42);
              padding: var(--space-sm) var(--space-md);
              background: linear-gradient(180deg,
                rgba(8,18,26,0.88) 0%,
                rgba(14,28,40,0.80) 100%);
              border-left: 3px solid #5dd5e5;
              border-radius: var(--radius-sm);
              box-shadow:
                inset 0 1px 0 rgba(128,224,255,0.14),
                inset 0 -2px 0 rgba(93,213,229,0.22),
                0 1px 4px rgba(0,0,0,0.5);
              flex: 0 0 auto;
              position: relative;
              overflow: hidden;
              z-index: 2;}
            /* TRANS-AM 中のみマゼンタに上書き */
            #lb-am-panel.is-transam #lb-am-panel-status{
              color: var(--ta-pink);
              border-left: 3px solid var(--ta-magenta-bright);
              text-shadow:
                0 0 6px rgba(196,30,158,0.85),
                0 0 14px rgba(255,77,201,0.55),
                0 2px 5px rgba(0,0,0,0.80);
              background: linear-gradient(180deg,
                rgba(21,7,26,0.88) 0%,
                rgba(34,12,42,0.80) 100%);
              box-shadow:
                inset 0 1px 0 rgba(255,128,216,0.12),
                inset 0 -2px 0 rgba(255,128,216,0.22),
                0 1px 4px rgba(0,0,0,0.5);}
            /* ★v0.3.8.3: 透かしをステータス領域内のみに ──
               HIRO 主訴「ボタンの後ろに透かし不要」→ status::before に移動
               実機検証 (検証 7): status::before に背景、ボタン後ろには無し → PASS */
            /* ★v0.3.8.23: 透かし共通ベース = HUD SVG (シアン)
               TRANS-AM 中のみ ::before 上書きでマゼンタ HUD に差し替え */
            #lb-am-panel-status::before{
              content: '';
              position: absolute;
              inset: 0;
              background-image: var(--hud-watermark-url);
              background-position: center;
              background-size: contain;
              background-repeat: no-repeat;
              opacity: 0.32;
              mix-blend-mode: screen;
              pointer-events: none;
              z-index: 0;}
            /* TRANS-AM 中はオリジナル TRANS-AM 画像 (JPEG) に上書き、cover で全面表示 */
            #lb-am-panel.is-transam #lb-am-panel-status::before{
              background-image: var(--ta-watermark-url);
              background-size: cover;
              opacity: 0.45;}
            /* ステータステキストを透かしの前面に */
            #lb-am-panel-status > * { position: relative; z-index: 1; }
            /* v0.3.8.25: .lb-am-toast = base シアン HUD、is-transam 中はマゼンタ */
            /* ★v0.3.8.58: HIRO 指摘「通常時の文字色ピンク」対応 */
            /* ★v0.3.8.61: HIRO 再指摘 (22:41 スクショ) でまだピンクに見える問題対応:
               原因: 淡シアン白 #b8d8e8 + マゼンタ背景 = 補色対比でピンク錯視
                    + トーストに text-shadow なし → 発色弱い
               対策:
                 ① 通常時 color を彩度高い純シアン #5dd5e5 に変更 (明確に「シアン」と認識)
                 ② text-shadow でシアン光を付与 (ステータス文字と同じ発色感) */
            .lb-am-toast{
              font-family: -apple-system, BlinkMacSystemFont, system-ui, "Hiragino Sans", "Yu Gothic UI", sans-serif;
              font-size: 11px;
              line-height: 1.45;
              padding: 8px 12px;
              border-radius: var(--radius-sm, 4px);
              background: rgba(8, 18, 26, 0.78);
              color: #5dd5e5 !important;
              text-shadow:
                0 0 4px rgba(93,213,229,0.55),
                0 0 10px rgba(123,184,216,0.35),
                0 1px 2px rgba(0,0,0,0.85);
              border-left: 2px solid var(--toast-accent, #5dd5e5);
              box-shadow: inset 0 1px 0 rgba(128, 224, 255, 0.08);
              white-space: pre-wrap;
              word-break: break-all;}
            #lb-am-panel.is-transam .lb-am-toast{
              background: rgba(21, 7, 26, 0.7);
              color: #ff80d8 !important;
              text-shadow:
                0 0 4px rgba(196,30,158,0.55),
                0 0 10px rgba(255,77,201,0.35),
                0 1px 2px rgba(0,0,0,0.85);
              border-left-color: var(--toast-accent, #c41e9e);
              box-shadow: inset 0 1px 0 rgba(255, 128, 216, 0.06);}
            /* トースト */
            #lb-am-panel-toasts{
              display: flex;
              flex-direction: column;
              gap: var(--space-xs);
              max-height: 110px;
              overflow-y: auto;
              flex: 0 0 auto;
              min-height: 32px;
              position: relative;
              z-index: 2;
              scrollbar-width: thin;
              scrollbar-color: #5dd5e5 rgba(0,0,0,0.3);}
            #lb-am-panel.is-transam #lb-am-panel-toasts{
              scrollbar-color: var(--ta-magenta) rgba(0,0,0,0.3);}
            #lb-am-panel-toasts::-webkit-scrollbar{ width: 5px; }
            #lb-am-panel-toasts::-webkit-scrollbar-track{
              background: rgba(0,0,0,0.3);
              border-radius: 999px;}
            #lb-am-panel-toasts::-webkit-scrollbar-thumb{
              background: #5dd5e5;
              border-radius: 999px;}
            #lb-am-panel.is-transam #lb-am-panel-toasts::-webkit-scrollbar-thumb{
              background: var(--ta-magenta);}
            /* ★v0.3.8.4: #lb-am-panel-toasts > div の保険スタイル
               .lb-am-toast class が何らかの理由で付かないケースでも
               TRANS-AM 統一スタイルが適用されるよう、CSS 変数に頼らず
               literal 値で全プロパティ指定。--toast-accent もデフォルト指定。 */
            /* v0.3.8.25: base = HUD シアン背景&枠、is-transam 中はマゼンタ */
            /* ★v0.3.8.61: 通常時の文字色を純シアン + text-shadow で明確化 (.lb-am-toast と同期) */
            #lb-am-panel-toasts > div{
              font-family: -apple-system, BlinkMacSystemFont, system-ui, "Hiragino Sans", "Yu Gothic UI", sans-serif;
              font-size: 11px;
              font-weight: 500;
              line-height: 1.45;
              letter-spacing: 0.02em;
              color: #5dd5e5 !important;
              text-shadow:
                0 0 4px rgba(93,213,229,0.55),
                0 0 10px rgba(123,184,216,0.35),
                0 1px 2px rgba(0,0,0,0.85);
              padding: 8px 12px;
              border-radius: 4px;
              background: rgba(8, 18, 26, 0.78);
              border-left: 2px solid var(--toast-accent, #5dd5e5);
              box-shadow: inset 0 1px 0 rgba(128, 224, 255, 0.08);
              white-space: pre-wrap;
              word-break: break-all;
              animation: cbToastSlide 0.4s var(--ease-out);}
            #lb-am-panel.is-transam #lb-am-panel-toasts > div{
              color: #ff80d8 !important;
              text-shadow:
                0 0 4px rgba(196,30,158,0.55),
                0 0 10px rgba(255,77,201,0.35),
                0 1px 2px rgba(0,0,0,0.85);
              background: rgba(21, 7, 26, 0.7);
              border-left-color: var(--toast-accent, #c41e9e);
              box-shadow: inset 0 1px 0 rgba(255, 128, 216, 0.06);}
            @keyframes cbToastSlide{
              from { opacity: 0; transform: translateX(8px); }
              to   { opacity: 1; transform: translateX(0); }}
            /* ボタン (主訴 E: 全マゼンタ系、主訴 B: stencil フォント) */
            #lb-am-panel-btns{
              display: flex;
              flex-direction: column;
              gap: var(--space-xs);
              margin-top: var(--space-xs);
              flex: 0 0 auto;
              position: relative;
              z-index: 2;}
            #lb-am-panel-btns button{
              width: 100%;
              padding: 11px 14px;
              color: var(--ta-celestial-white);
              border: 1px solid transparent;
              border-radius: var(--radius-md);
              font-family: var(--font-display);
              font-size: 14px;
              font-weight: 900;
              letter-spacing: 0.06em;
              text-transform: uppercase;
              text-shadow:
                0 0 6px rgba(0,0,0,0.55),
                1px 1px 0 rgba(0,0,0,0.45);
              cursor: pointer;
              text-align: center;
              position: relative;
              overflow: hidden;
              touch-action: manipulation;
              -webkit-tap-highlight-color: transparent;
              transition:
                transform 0.18s var(--ease-out),
                box-shadow 0.25s var(--ease-out),
                filter 0.2s var(--ease-out);}
            #lb-am-panel-btns button[hidden]{ display: none; }
            #lb-am-panel-btns button:hover{ transform: translateY(-1px); }
            #lb-am-panel-btns button:active{ transform: translateY(0); transition-duration: 0.08s; }
            /* v0.3.8.25: 🛒新規開始/▶再開 — base = HUD シアン、is-transam 中はマゼンタ */
            #lb-am-btn-buy,
            #lb-am-btn-resume{
              background: linear-gradient(180deg,
                rgba(93,213,229,0.95) 0%,
                rgba(2,136,209,0.95) 100%);
              border-color: rgba(128,224,255,0.7);
              color: #08151c;
              text-shadow: 0 1px 0 rgba(255,255,255,0.3);
              box-shadow:
                inset 0 1px 0 rgba(255,255,255,0.18),
                0 0 12px rgba(93,213,229,0.45),
                0 0 24px rgba(2,136,209,0.30);}
            #lb-am-btn-buy:hover,
            #lb-am-btn-resume:hover{
              filter: brightness(1.1);
              box-shadow:
                inset 0 1px 0 rgba(255,255,255,0.25),
                0 0 18px rgba(93,213,229,0.7),
                0 0 36px rgba(2,136,209,0.5);}
            /* TRANS-AM 中はマゼンタに戻す (主アクション) */
            #lb-am-panel.is-transam #lb-am-btn-buy,
            #lb-am-panel.is-transam #lb-am-btn-resume{
              background: linear-gradient(180deg,
                rgba(255,77,201,0.95) 0%,
                rgba(196,30,158,0.95) 100%);
              border-color: rgba(255,128,216,0.7);
              color: var(--ta-celestial-white);
              text-shadow: 0 1px 0 rgba(0,0,0,0.4);
              box-shadow: var(--glow-ta-soft);}
            #lb-am-panel.is-transam #lb-am-btn-buy:hover,
            #lb-am-panel.is-transam #lb-am-btn-resume:hover{
              filter: brightness(1.1);
              box-shadow: var(--glow-ta-strong);}
            /* ★v0.3.8.16: ⚡TRANS-AM⚡ — TRANS-AM フル発動カラー (赤×マゼンタ pulse) */
            #lb-am-btn-trans-am{
              background: linear-gradient(180deg,
                rgba(255,58,78,0.95) 0%,
                rgba(196,30,158,0.95) 50%,
                rgba(140,20,80,0.95) 100%);
              border-color: rgba(255,128,216,0.8);
              box-shadow:
                inset 0 1px 0 rgba(255,255,255,0.18),
                0 0 12px rgba(255,77,201,0.55),
                0 0 24px rgba(196,30,158,0.35);
              animation: cbTransAmIdle 2.4s ease-in-out infinite;}
            #lb-am-btn-trans-am:hover{
              filter: brightness(1.15) saturate(1.2);
              box-shadow:
                inset 0 1px 0 rgba(255,255,255,0.25),
                0 0 20px rgba(255,77,201,0.8),
                0 0 40px rgba(196,30,158,0.55);}
            @keyframes cbTransAmIdle{
              0%, 100% {
                box-shadow:
                  inset 0 1px 0 rgba(255,255,255,0.18),
                  0 0 12px rgba(255,77,201,0.55),
                  0 0 24px rgba(196,30,158,0.35);}
              50% {
                box-shadow:
                  inset 0 1px 0 rgba(255,255,255,0.25),
                  0 0 18px rgba(255,77,201,0.75),
                  0 0 36px rgba(196,30,158,0.50);}}
            /* ⏸ 一時停止 — 警告金 */
            #lb-am-btn-pause{
              background: linear-gradient(180deg,
                rgba(255,209,102,0.95) 0%,
                rgba(204,153,51,0.95) 100%);
              border-color: rgba(255,209,102,0.7);
              color: var(--ta-void-deep);
              text-shadow: 0 1px 0 rgba(255,255,255,0.3);
              box-shadow: var(--glow-warn-soft);}
            #lb-am-btn-pause:hover{
              filter: brightness(1.06);
              box-shadow: var(--glow-warn-strong);}
            /* 🛑 完全停止 — 警告赤 */
            #lb-am-btn-fullstop{
              background: linear-gradient(180deg,
                rgba(255,58,78,0.95) 0%,
                rgba(140,20,40,0.95) 100%);
              border-color: rgba(255,128,128,0.6);
              box-shadow: var(--glow-danger-soft);}
            #lb-am-btn-fullstop:hover{
              filter: brightness(1.1);
              box-shadow: var(--glow-danger-strong);}
            /* v0.3.8.25: 🔄直販URL — base = HUD シアン outline、TRANS-AM 中はマゼンタ */
            #lb-am-btn-force{
              background: rgba(2,136,209,0.10);
              color: #b8d8e8;
              border-color: rgba(93,213,229,0.5);
              font-size: 12px;
              padding: 9px 12px;
              text-shadow:
                0 0 4px rgba(93,213,229,0.5),
                1px 1px 0 rgba(0,0,0,0.5);
              box-shadow: inset 0 1px 0 rgba(128,224,255,0.06);}
            #lb-am-btn-force:hover{
              background: rgba(2,136,209,0.20);
              border-color: #5dd5e5;
              color: #d0e8f5;
              box-shadow:
                inset 0 1px 0 rgba(128,224,255,0.10),
                0 0 14px rgba(93,213,229,0.32);}
            #lb-am-panel.is-transam #lb-am-btn-force{
              background: rgba(196,30,158,0.10);
              color: var(--ta-pink);
              border-color: rgba(196,30,158,0.5);
              text-shadow:
                0 0 4px rgba(255,77,201,0.5),
                1px 1px 0 rgba(0,0,0,0.5);
              box-shadow: inset 0 1px 0 rgba(255,128,216,0.06);}
            #lb-am-panel.is-transam #lb-am-btn-force:hover{
              background: rgba(196,30,158,0.20);
              border-color: var(--ta-magenta-bright);
              color: var(--ta-pink-soft);}
            /* v0.3.8.25: 📋ログ — base = HUD シアン outline、TRANS-AM 中はマゼンタ */
            #lb-am-btn-log{
              background: rgba(128,224,255,0.06);
              color: #b8d8e8;
              border-color: rgba(128,224,255,0.4);
              font-size: 12px;
              padding: 9px 12px;
              text-shadow:
                0 0 4px rgba(93,213,229,0.4),
                1px 1px 0 rgba(0,0,0,0.5);
              box-shadow: inset 0 1px 0 rgba(128,224,255,0.06);}
            #lb-am-btn-log:hover{
              background: rgba(128,224,255,0.14);
              border-color: #5dd5e5;
              color: #d0e8f5;
              box-shadow:
                inset 0 1px 0 rgba(128,224,255,0.08),
                0 0 14px rgba(93,213,229,0.32);}
            #lb-am-panel.is-transam #lb-am-btn-log{
              background: rgba(255,128,216,0.06);
              color: var(--ta-pink);
              border-color: rgba(255,128,216,0.4);
              text-shadow:
                0 0 4px rgba(255,77,201,0.4),
                1px 1px 0 rgba(0,0,0,0.5);
              box-shadow: inset 0 1px 0 rgba(255,128,216,0.06);}
            #lb-am-panel.is-transam #lb-am-btn-log:hover{
              background: rgba(255,128,216,0.14);
              border-color: var(--ta-pink-soft);
              color: var(--ta-pink-soft);}
            /* v0.3.8.27: 📦商品データ — base = HUD シアン outline、TRANS-AM 中はマゼンタ */
            #lb-am-btn-products{
              background: rgba(128,224,255,0.06);
              color: #b8d8e8;
              border-color: rgba(128,224,255,0.4);
              font-size: 12px;
              padding: 9px 12px;
              text-shadow:
                0 0 4px rgba(93,213,229,0.4),
                1px 1px 0 rgba(0,0,0,0.5);
              box-shadow: inset 0 1px 0 rgba(128,224,255,0.06);}
            #lb-am-btn-products:hover{
              background: rgba(128,224,255,0.14);
              border-color: #5dd5e5;
              color: #d0e8f5;
              box-shadow:
                inset 0 1px 0 rgba(128,224,255,0.08),
                0 0 14px rgba(93,213,229,0.32);}
            #lb-am-panel.is-transam #lb-am-btn-products{
              background: rgba(255,128,216,0.06);
              color: var(--ta-pink);
              border-color: rgba(255,128,216,0.4);
              text-shadow:
                0 0 4px rgba(255,77,201,0.4),
                1px 1px 0 rgba(0,0,0,0.5);
              box-shadow: inset 0 1px 0 rgba(255,128,216,0.06);}
            #lb-am-panel.is-transam #lb-am-btn-products:hover{
              background: rgba(255,128,216,0.14);
              border-color: var(--ta-pink-soft);
              color: var(--ta-pink-soft);}
            /* v0.3.8.75: 🛑 数量更新トグル — ON=赤系 (停止) / OFF=橙系 (無視)
               data-on 属性で 2 状態を切替。視認性最優先で TRANS-AM 中も同色維持 */
            #lb-am-btn-qty-stop{
              font-size: 12px;
              padding: 9px 12px;
              text-shadow: 1px 1px 0 rgba(0,0,0,0.5);
              box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);}
            #lb-am-btn-qty-stop[data-on="1"]{
              background: rgba(255,77,77,0.18);
              color: #ff9090;
              border-color: rgba(255,77,77,0.5);}
            #lb-am-btn-qty-stop[data-on="1"]:hover{
              background: rgba(255,77,77,0.30);
              border-color: rgba(255,128,128,0.8);
              color: #ffb0b0;
              box-shadow: inset 0 1px 0 rgba(255,128,128,0.10),
                          0 0 12px rgba(255,77,77,0.35);}
            #lb-am-btn-qty-stop[data-on="0"]{
              background: rgba(237,108,2,0.18);
              color: #ffb84d;
              border-color: rgba(237,108,2,0.5);}
            #lb-am-btn-qty-stop[data-on="0"]:hover{
              background: rgba(237,108,2,0.30);
              border-color: rgba(255,160,60,0.8);
              color: #ffd089;
              box-shadow: inset 0 1px 0 rgba(255,160,60,0.10),
                          0 0 12px rgba(237,108,2,0.35);}
            /* v0.3.8.25: ⚙設定 — base = HUD シアン solid、TRANS-AM 中はマゼンタ */
            #lb-am-btn-cfg{
              background: linear-gradient(180deg,
                rgba(2,136,209,0.85) 0%,
                rgba(0,80,130,0.85) 100%);
              border-color: rgba(128,224,255,0.5);
              color: #e8f4fa;
              font-size: 12px;
              padding: 9px 12px;
              text-shadow:
                0 0 4px rgba(0,0,0,0.6),
                1px 1px 0 rgba(0,0,0,0.5);
              box-shadow:
                inset 0 1px 0 rgba(255,255,255,0.18),
                0 0 12px rgba(93,213,229,0.4),
                0 0 24px rgba(2,136,209,0.25);}
            #lb-am-btn-cfg:hover{
              filter: brightness(1.12);
              box-shadow:
                inset 0 1px 0 rgba(255,255,255,0.25),
                0 0 18px rgba(93,213,229,0.65),
                0 0 36px rgba(2,136,209,0.45);}
            #lb-am-panel.is-transam #lb-am-btn-cfg{
              background: linear-gradient(180deg,
                rgba(196,30,158,0.85) 0%,
                rgba(110,12,84,0.85) 100%);
              border-color: rgba(255,128,216,0.5);
              color: var(--ta-celestial-white);
              box-shadow: var(--glow-ta-soft);}
            #lb-am-panel.is-transam #lb-am-btn-cfg:hover{
              filter: brightness(1.12);
              box-shadow: var(--glow-ta-strong);}
            /* アクセシビリティ */
            @media (prefers-reduced-motion: reduce){
              #lb-am-panel,
              #lb-am-panel.is-running,
              #lb-am-panel-toasts > div{
                animation: none !important;}
              #lb-am-panel{
                opacity: 1 !important;
                transform: none !important;
                filter: none !important;}
              #lb-am-panel-btns button{
                transition: none !important;}}
            @media (max-width: 380px){
              #lb-am-panel{
                width: calc(100vw - 16px);
                right: 8px;}}
            /* ★v0.3.8.6: トーストをアラート型に完全分離 (TRANS-AM 統一感維持) */
            /* ★v0.3.8.65: HIRO 鋭い指摘 (2026-05-18 23:08) で発見した隠し定義
               原因: v0.3.8.6 で「トーストをアラート型に分離」する際 !important で
                    color: --ta-pink-soft, background: 紫グラデ をハードコードしていた。
                    v0.3.8.58〜64 の私の修正 (Line 3388 / 3407) は同 specificity で
                    !important 同士、後ろのこのルールが勝って ★全部上書きされていた★
               対策: ここでも通常時シアン HUD / TA時マゼンタ HUD に分離。
            */
            #lb-am-panel-toasts > div {
                font-family: -apple-system, BlinkMacSystemFont, system-ui,
                    "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif !important;
                font-size: 11px !important;
                font-weight: 500 !important;
                line-height: 1.45 !important;
                letter-spacing: 0.02em !important;
                text-transform: none !important;
                /* ★v0.3.8.65: 通常時 = シアン HUD */
                color: #5dd5e5 !important;
                padding: 7px 11px !important;
                border-radius: 4px !important;
                background: linear-gradient(95deg,
                    rgba(8, 18, 28, 0.92) 0%,
                    rgba(14, 30, 46, 0.86) 100%) !important;
                border-left: 3px solid var(--toast-accent, #5dd5e5) !important;
                box-shadow:
                    inset 0 1px 0 rgba(128, 224, 255, 0.12),
                    0 2px 6px rgba(0, 0, 0, 0.45) !important;
                text-shadow:
                    0 0 4px rgba(93, 213, 229, 0.55),
                    0 0 10px rgba(123, 184, 216, 0.35),
                    0 1px 2px rgba(0, 0, 0, 0.85) !important;
            }
            /* ★v0.3.8.65: TA時 = マゼンタ HUD (旧 v0.3.8.6 のスタイルを is-transam 限定で復活) */
            #lb-am-panel.is-transam #lb-am-panel-toasts > div {
                color: #ff80d8 !important;
                background: linear-gradient(95deg,
                    rgba(46, 15, 54, 0.92) 0%,
                    rgba(34, 12, 42, 0.86) 100%) !important;
                border-left-color: var(--toast-accent, #ff80d8) !important;
                box-shadow:
                    inset 0 1px 0 rgba(255, 128, 216, 0.12),
                    0 2px 6px rgba(0, 0, 0, 0.45) !important;
                text-shadow:
                    0 0 4px rgba(196, 30, 158, 0.55),
                    0 0 10px rgba(255, 77, 201, 0.35),
                    0 1px 2px rgba(0, 0, 0, 0.85) !important;
            }
        `;
        styleHost.appendChild(st);
        _panelStyleInjected = true;
    };

    const ensurePanel = () => {
        let panel = document.getElementById('lb-am-panel');
        if (panel) return panel;

        // ★v0.1.16.6: skeleton(IIFE 冒頭で出した暫定 panel)を取り除く
        try {
            const skel = document.getElementById('lb-am-skeleton');
            if (skel) skel.remove();
            const preStyle = document.getElementById('lb-am-pre-style');
            if (preStyle) preStyle.remove();
        } catch (e) {}

        // ★v0.1.14.0: body を待たない。body あれば body、無ければ documentElement に直接挿入
        //   HIRO 指摘 2026-05-09: 「ブラウザ開いてからメニュー出るまで時間がかかる」
        //   → body 出現待ちが原因。documentElement なら document-start 時点で確実に存在
        //   panel が <html> 直下に来ても position:fixed なので画面右下に正しく出る
        const host = document.body || document.documentElement;
        if (!host) return null;

        injectPanelStyle();

        panel = document.createElement('div');
        panel.id = 'lb-am-panel';
        // ★v0.2.0: 状態別ボタン構成
        //   STOPPED: 🛒新規開始 / 📋ログ / 🔄直販URL / ⚙設定
        //   RUNNING: ⏸一時停止 / 🛑完全停止 / 📋ログ / 🔄直販URL / ⚙設定
        //   PAUSED:  ▶再開 / 🛑完全停止 / 📋ログ / 🔄直販URL / ⚙設定
        // ★v0.3.8.2: TRANS-AM MODE
        //   - CB ロゴ DOM 削除 (透かし画像に紋章が既に含まれるため不要)
        //   - CB_LOGO_DATA_URL 定数は将来予備のため残す (削除しない)
        //   - 既存ボタン ID は一切変更しない (JS が参照)
        panel.innerHTML =
            // ★v0.3.8.30: 折りたたみトグル (右上の小さなボタン)
            '<button id="lb-am-btn-collapse" type="button" aria-label="折りたたみ">▾</button>' +
            // ★v0.3.8.30: 折りたたみ時に表示するミニバー (タップで展開)
            '<div id="lb-am-panel-minibar">📡 GUNDAMBOT <span id="lb-am-panel-minibar-state">●</span></div>' +
            '<div id="lb-am-panel-inner">' +
              '<div id="lb-am-panel-status"></div>' +
              '<div id="lb-am-panel-toasts"></div>' +
              '<div id="lb-am-panel-btns">' +
                '<button id="lb-am-btn-buy" type="button">🛒 新規開始</button>' +
                // ★v0.3.8.16: ⚡TRANS-AM⚡ ボタン (新規開始の下に縦並び、排他動作)
                '<button id="lb-am-btn-trans-am" type="button">⚡TRANS-AM⚡</button>' +
                '<button id="lb-am-btn-resume" type="button" hidden>▶ 再開</button>' +
                '<button id="lb-am-btn-pause" type="button" hidden>⏸ 一時停止</button>' +
                '<button id="lb-am-btn-fullstop" type="button" hidden>🛑 完全停止</button>' +
                '<button id="lb-am-btn-force" type="button">🔄 直販URL</button>' +
                // ★v0.3.8.75: 数量更新メッセージ で停止のトグル (リストック初日は OFF 推奨)
                '<button id="lb-am-btn-qty-stop" type="button">🛑 数量更新:停止</button>' +
                '<button id="lb-am-btn-log" type="button">📋 ログ</button>' +
                '<button id="lb-am-btn-products" type="button">📦 商品データ</button>' +
                '<button id="lb-am-btn-rotation" type="button">🔄 巡回購入</button>' +
                '<button id="lb-am-btn-cfg" type="button">⚙ 設定</button>' +
              '</div>' +
            '</div>';
        host.appendChild(panel);

        // ★v0.3.8.2 / 0.3.8.34: 透かし画像を CSS 変数経由で設定
        //   通常モード = HUD SVG (シアン)
        //   TRANS-AM モード = オリジナル TRANS_AM_BG_DATA_URL (JPEG、HIRO 指定)
        try {
            panel.style.setProperty('--ta-watermark-url', 'url("' + TRANS_AM_BG_DATA_URL + '")');
            panel.style.setProperty('--hud-watermark-url', 'url("' + HUD_WATERMARK_DATA_URL + '")');
        } catch (e) {}

        // ★v0.3.8: パネル生成直後に初期 is-running / is-transam 状態を反映
        //   (RUNNING 中のリロード後、ページ着地直後にも色が正しいように)
        try {
            if (typeof S !== 'undefined' && S.getMode && S.getMode() === MODE_RUNNING) {
                panel.classList.add('is-running');
                try { if (S.isTransAmMode && S.isTransAmMode()) panel.classList.add('is-transam'); } catch (e) {}
            }
        } catch (e) {}

        // ───── 🛒 新規開始 ─────
        document.getElementById('lb-am-btn-buy').addEventListener('click', () => {
            // ★v0.3.8.4: 開始ボタン押下時に panel レイアウト診断ログを 1 回出力
            //   HIRO 環境の「白い帯」原因特定用 (panel/status/toasts の bbox)
            try { logAm('info', 'panel-layout-snapshot', 'パネルレイアウト診断 (開始ボタン押下時)', dumpPanelLayout()); } catch (e) {}
            try { startPurchase(); } catch (e) {}
        });

        // ───── ⚡TRANS-AM⚡ (新規、URL 直撃モード) ─────
        // ★v0.3.8.16: Buy Box / AOD 描画待たずに URL 組み立てて直 navigate するモード
        //   バリア 3 (排他保証): opStartTransAm は前 session 強制 clearSession
        //   既存「🛒 新規開始」とは completely 独立、二重動作なし
        const transAmBtn = document.getElementById('lb-am-btn-trans-am');
        if (transAmBtn) {
            transAmBtn.addEventListener('click', () => {
                // ★v0.3.8.23: disabled 状態でクリックされた場合は何もしない (押下不可ガード)
                if (transAmBtn.disabled) {
                    try { toast(transAmBtn.title || '⚡TRANS-AM は現在使えません', '#ed6c02', 8000); } catch (e) {}
                    return;
                }
                try { logAm('info', 'panel-layout-snapshot', 'パネルレイアウト診断 (⚡TRANS-AM 開始時)', dumpPanelLayout()); } catch (e) {}
                try { startPurchaseTransAm(); } catch (e) {}
            });
        }

        // ───── ▶ 再開 ─────
        document.getElementById('lb-am-btn-resume').addEventListener('click', async () => {
            const ok = S.opResume();
            if (!ok) {
                toast('❌ セッションがないため再開できません\n🛒新規開始してください', STOP_RED, 5000);
                return;
            }
            const session = S.getSession();
            toast(`▶ 再開しました(${session ? session.reloadCount : 0}回リロード済み)`, BUY_GREEN, 3000);
            updatePanelButtons();
            // 商品ページなら即 attemptPurchase、別ページなら SESSION の productUrl に戻る
            if (location.pathname.startsWith('/dp/') || location.pathname.includes('/dp/')) {
                if (S.shouldHalt()) return;
                await sleep(300);
                if (S.shouldHalt()) return;
                await attemptPurchase();
            } else if (session && session.productUrl) {
                setTimeout(() => { if (!S.shouldHalt()) location.href = session.productUrl; }, 300);
            }
        });

        // ───── ⏸ 一時停止 ─────
        document.getElementById('lb-am-btn-pause').addEventListener('click', () => {
            S.opPause();
            try {
                if (typeof timerCheckIntervalId !== 'undefined' && timerCheckIntervalId) clearInterval(timerCheckIntervalId);
                if (typeof timerCountdownIntervalId !== 'undefined' && timerCountdownIntervalId) clearInterval(timerCountdownIntervalId);
            } catch (e) {}
            const session = S.getSession();
            toast(`⏸ 一時停止しました(${session ? session.reloadCount : 0}回リロード済み)\n▶再開で続行可`, '#666', 5000);
            updatePanelButtons();
        });

        // ───── 🛑 完全停止(SESSION クリア + STOPPED)─────
        // ★v0.3.8.3: 完全停止を即応化
        //   ① 状態フラグを即 STOPPED に (S.opFullStop)
        //   ② 進行中の fetch を全 abort (_activeFetchAborters)
        //   ③ 既存 timer interval 解除
        //   ④ 永続 setInterval 2 つを停止 (badge, modeWatch)
        document.getElementById('lb-am-btn-fullstop').addEventListener('click', () => {
            const skipConfirm = S.getSkipConfirm();
            if (!skipConfirm) {
                const ok = confirm('完全停止しますか?\n(セッションが破棄され、再開できません)');
                if (!ok) return;
            }
            // ① 状態フラグを即座に STOPPED に
            S.opFullStop();
            // ★v0.3.8.3 ② 進行中の fetch を全 abort
            try {
                for (const ctrl of _activeFetchAborters) {
                    try { ctrl.abort(); } catch (e) {}
                }
                _activeFetchAborters.clear();
            } catch (e) {}
            // ③ timer 系 interval を解除 (既存)
            try {
                if (typeof timerCheckIntervalId !== 'undefined' && timerCheckIntervalId) clearInterval(timerCheckIntervalId);
                if (typeof timerCountdownIntervalId !== 'undefined' && timerCountdownIntervalId) clearInterval(timerCountdownIntervalId);
            } catch (e) {}
            // ★v0.3.8.3 ④ 永続 setInterval 2 つを停止 (裏で動く感を解消)
            try {
                if (_badgeUpdateIntervalId) { clearInterval(_badgeUpdateIntervalId); _badgeUpdateIntervalId = null; }
                if (_modeWatchIntervalId)   { clearInterval(_modeWatchIntervalId);   _modeWatchIntervalId = null; }
            } catch (e) {}
            // ★v0.3.8.3: TRANS-AM 系赤 (#ff3a4e) で統一 (STOP_RED 定数は維持、引数のみ変更)
            toast('🛑 完全停止しました(セッション破棄)', '#ff3a4e', 4000);
            updatePanelButtons();
        });

        // ───── ⚙ 設定 ─────
        // ★v0.3.8.96: 設定ページ(Netlify)廃止 → アプリ内ダイアログに変更。
        //   configPageUrl があれば従来通り遷移(後方互換)、無ければローカル設定ダイアログ。
        //   現状の唯一の設定項目 = Discord webhook(端末ローカル保存・公開ファイルに残さない)。
        document.getElementById('lb-am-btn-cfg').addEventListener('click', () => {
            if (CONFIG.configPageUrl) { location.href = CONFIG.configPageUrl; return; }
            try {
                // ★v0.3.8.98 修正: escHtml は商品データパネル内ローカル定義でこのスコープに無い
                //   → 参照すると ReferenceError で例外 → try/catch に飲まれて「⚙ボタン無反応」化していた。
                //   ここ専用の esc を定義して使う。
                const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
                    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
                const cur = (function(){ try { return localStorage.getItem(KEY_DISCORD_WEBHOOK) || ''; } catch(e){ return ''; } })();
                const masked = cur ? (cur.slice(0, 40) + '…(設定済)') : '(未設定=通知OFF)';
                const dlg = document.createElement('div');
                dlg.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.85);' +
                    'display:flex;align-items:center;justify-content:center;padding:20px;';
                dlg.innerHTML =
                    '<div style="max-width:440px;width:100%;background:#0d1a24;border:1px solid rgba(93,213,229,0.5);' +
                    'border-radius:10px;padding:18px;font-family:sans-serif;color:#d0e8f5;">' +
                      '<div style="font-size:15px;font-weight:bold;color:#5dd5e5;margin-bottom:10px;">⚙ 設定</div>' +
                      '<div style="font-size:12px;color:#7bb8d8;margin-bottom:4px;">Discord webhook URL(通知用・任意)</div>' +
                      '<div style="font-size:11px;color:#9fd0e0;margin-bottom:6px;">現在: ' + esc(masked) + '</div>' +
                      '<input id="lb-am-cfg-webhook" type="text" placeholder="https://discord.com/api/webhooks/..." ' +
                        'style="width:100%;padding:8px;box-sizing:border-box;font-family:monospace;font-size:11px;' +
                        'background:#06131c;color:#b8e8d0;border:1px solid rgba(93,213,229,0.4);border-radius:5px;">' +
                      '<div style="font-size:10px;color:#7bb8d8;margin-top:5px;line-height:1.6;">' +
                        '※ この端末にだけ保存されます(公開ファイルには入りません)<br>' +
                        '※ 空のまま保存すると通知OFF' +
                      '</div>' +
                      '<div style="display:flex;gap:8px;margin-top:12px;">' +
                        '<button id="lb-am-cfg-save" style="flex:1;padding:11px;background:linear-gradient(180deg,#26c281,#1a8f5e);' +
                          'border:0;color:#fff;border-radius:8px;font-size:14px;font-weight:bold;">💾 保存</button>' +
                        '<button id="lb-am-cfg-clear" style="padding:11px 14px;background:rgba(255,77,77,0.2);' +
                          'border:1px solid rgba(255,77,77,0.5);color:#ff8080;border-radius:8px;font-size:13px;">クリア</button>' +
                      '</div>' +
                      '<button id="lb-am-cfg-close" style="margin-top:8px;width:100%;padding:9px;' +
                        'background:rgba(255,255,255,0.08);border:1px solid rgba(128,200,224,0.4);' +
                        'color:#9fd0e0;border-radius:6px;font-size:13px;">閉じる</button>' +
                    '</div>';
                document.body.appendChild(dlg);
                const closeDlg = () => { try { dlg.remove(); } catch (e) {} };
                dlg.addEventListener('click', (ev) => { if (ev.target === dlg) closeDlg(); });
                const inp = dlg.querySelector('#lb-am-cfg-webhook');
                if (inp && cur) inp.value = cur;
                const cc = dlg.querySelector('#lb-am-cfg-close'); if (cc) cc.addEventListener('click', closeDlg);
                const sv = dlg.querySelector('#lb-am-cfg-save');
                if (sv) sv.addEventListener('click', () => {
                    const v = (inp && inp.value || '').trim();
                    if (v && !/^https:\/\/discord(?:app)?\.com\/api\/webhooks\//.test(v)) {
                        toast('⚠️ Discord webhook の形式が不正です\nhttps://discord.com/api/webhooks/... を貼ってください', STOP_RED, 6000);
                        return;
                    }
                    setDiscordWebhook(v);
                    try { logAm('info', 'discord-webhook-set', 'Discord webhook を端末ローカルに保存', { set: !!v }); } catch (e) {}
                    toast(v ? '💾 Discord webhook 保存(この端末のみ)' : '🔕 Discord webhook クリア(通知OFF)', v ? BUY_GREEN : '#ed6c02', 4000);
                    closeDlg();
                });
                const cl = dlg.querySelector('#lb-am-cfg-clear');
                if (cl) cl.addEventListener('click', () => {
                    setDiscordWebhook('');
                    if (inp) inp.value = '';
                    toast('🔕 Discord webhook クリア(通知OFF)', '#ed6c02', 4000);
                });
            } catch (e) {}
        });

        // ───── 🛑 数量更新で停止 (v0.3.8.75) ─────
        //   amazon.html のチェックは「インストール時の初期値」のみ。運用中に切り替えるには
        //   インストールし直しが必要だったが、リストック初日 (2 段階リリース) 用に即時切替
        //   できるよう localStorage override を導入し、このボタンで切替可能にした。
        const qtyStopBtn = document.getElementById('lb-am-btn-qty-stop');
        const renderQtyStopBtn = () => {
            try {
                if (!qtyStopBtn) return;
                const on = getEffectiveQtyStop();
                qtyStopBtn.textContent = on ? '🛑 数量更新:停止' : '🚫 数量更新:無視';
                qtyStopBtn.setAttribute('data-on', on ? '1' : '0');
                const ov = getQtyStopOverride();
                const ovLabel = (ov === '1' || ov === '0') ? ' (画面上書き)' : ' (インストール時設定)';
                qtyStopBtn.title = on
                    ? '「数量更新」メッセージで完全停止' + ovLabel + '\nタップで OFF (リストック初日 2段階リリース向け) に切替'
                    : '「数量更新」メッセージ無視、ループ継続' + ovLabel + '\nタップで ON (通常運用) に切替';
            } catch (e) {}
        };
        if (qtyStopBtn) {
            renderQtyStopBtn();
            qtyStopBtn.addEventListener('click', () => {
                const next = !getEffectiveQtyStop();
                setQtyStopOverride(next);
                renderQtyStopBtn();
                try { logAm('info', 'qty-stop-toggle',
                    'パネルボタンから qty_stop ' + (next ? 'ON' : 'OFF') + ' に切替', {
                    qtyStop: next, override: getQtyStopOverride(),
                    configDefault: !!CONFIG.qtyStop,
                }); } catch (e) {}
                try {
                    toast(next
                        ? '🛑 数量更新で停止 ON\n(通常運用モード)'
                        : '🚫 数量更新を無視 OFF\n(リストック初日 2段階リリース対応)',
                        next ? STOP_RED : '#ed6c02', 4500);
                } catch (e) {}
            });
        }

        // ★v0.3.8.30: 折りたたみトグル + ミニバーから展開
        const applyCollapseState = (collapsed) => {
            try {
                const p = document.getElementById('lb-am-panel');
                if (!p) return;
                p.classList.toggle('is-collapsed', !!collapsed);
                const btn = document.getElementById('lb-am-btn-collapse');
                if (btn) btn.textContent = collapsed ? '▴' : '▾';
            } catch (e) {}
        };
        const getCollapsed = () => {
            try { return localStorage.getItem('LB_AM_PANEL_COLLAPSED') === '1'; }
            catch (e) { return false; }
        };
        const setCollapsed = (v) => {
            try {
                if (v) localStorage.setItem('LB_AM_PANEL_COLLAPSED', '1');
                else localStorage.removeItem('LB_AM_PANEL_COLLAPSED');
            } catch (e) {}
            applyCollapseState(v);
        };
        // 初期状態反映
        applyCollapseState(getCollapsed());
        // トグルボタン
        const collapseBtn = document.getElementById('lb-am-btn-collapse');
        if (collapseBtn) {
            collapseBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                setCollapsed(!getCollapsed());
            });
        }
        // ミニバーをタップで展開
        const minibar = document.getElementById('lb-am-panel-minibar');
        if (minibar) {
            minibar.addEventListener('click', () => { setCollapsed(false); });
        }

        // ★v0.3.8.27: 📦 商品データ — CSV 書出/読込/一覧 オーバーレイ
        // ───── 🔄 巡回購入 トグル(PC版:複数商品を順に巡る) ─────
        const rotationBtn = document.getElementById('lb-am-btn-rotation');
        if (rotationBtn) {
            rotationBtn.addEventListener('click', () => {
                try {
                    const on = !isRotationOn();
                    localStorage.setItem('LB_AM_ROT_ON', on ? '1' : '0');
                    if (on) localStorage.setItem('LB_AM_ROT_IDX', '0');
                    const n = listSavedProducts().length;
                    toast(on
                        ? '🔄 巡回購入 ON(登録 ' + n + ' 件を順に巡回)\n🛒新規開始 を押すと巡回します'
                        : '🔄 巡回購入 OFF(1商品のみ監視)', on ? '#2e7d32' : '#666', 5000);
                    rotationBtn.textContent = on ? '🔄 巡回:ON' : '🔄 巡回購入';
                } catch (e) {}
            });
            try { if (isRotationOn()) rotationBtn.textContent = '🔄 巡回:ON'; } catch (e) {}
        }

        const productsBtn = document.getElementById('lb-am-btn-products');
        if (productsBtn) productsBtn.addEventListener('click', () => {
            try {
                const exist = document.getElementById('lb-am-products-overlay');
                if (exist) { exist.remove(); try { document.body.classList.remove('lb-am-overlay-open'); } catch (e) {} return; }
                try { document.body.classList.add('lb-am-overlay-open'); } catch (e) {}
                const ov = document.createElement('div');
                ov.id = 'lb-am-products-overlay';
                Object.assign(ov.style, {
                    position:'fixed', top:'0', left:'0', right:'0', bottom:'0',
                    background:'rgba(2,8,14,0.96)', color:'#d0e8f5',
                    zIndex:'2147483647', overflowY:'auto',
                    padding:'14px', fontFamily:'-apple-system, system-ui, "Yu Gothic UI", sans-serif',
                    fontSize:'13px', whiteSpace:'normal',
                });
                const products = listSavedProducts();
                const fmtDate = (ms) => {
                    if (!ms) return '?';
                    try {
                        const d = new Date(ms);
                        const pad = (n) => String(n).padStart(2, '0');
                        return d.getFullYear() + '/' + pad(d.getMonth()+1) + '/' + pad(d.getDate()) +
                            ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
                    } catch (e) { return '?'; }
                };
                const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
                    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
                const listHtml = products.length === 0
                    ? '<div style="padding:20px;text-align:center;color:#7bb8d8;opacity:0.7;">登録済み商品はありません<br><br>通常の 🛒新規開始 で Buy Box / AOD から<br>直販判定済み URL が自動取得されます</div>'
                    : products.map((p, idx) => {
                        // ★v0.3.8.51: B方式専用化 - ステータス可視化
                        //   直販 URL あり (asinOnly=false) → ⚡TRANS-AM 可
                        //   ASIN のみ (asinOnly=true) → 🔒 URL 未取得
                        const accentColor = p.asinOnly ? '#ed6c02' : '#5dd5e5';
                        const asinColor = p.asinOnly ? '#ffb84d' : '#5dd5e5';
                        const statusBadge = p.asinOnly
                            ? '<span style="display:inline-block;margin-left:6px;padding:2px 8px;background:rgba(237,108,2,0.25);color:#ffb84d;border-radius:3px;font-size:10px;font-family:sans-serif;font-weight:bold;">🔒 URL 未取得</span>'
                            : '<span style="display:inline-block;margin-left:6px;padding:2px 8px;background:rgba(93,213,229,0.25);color:#5dd5e5;border-radius:3px;font-size:10px;font-family:sans-serif;font-weight:bold;">⚡ TRANS-AM 可</span>';
                        const statusHint = p.asinOnly
                            ? '<div style="color:#ffb84d;font-size:10px;margin-top:3px;">⚠️ 商品ページで 🛒新規開始 → Buy Box / AOD から自動記録</div>'
                            : '<div style="color:#5dd5e5;font-size:10px;margin-top:3px;">✅ 直販オファー記録済み</div>';
                        const isFirst = idx === 0;
                        const isLast = idx === products.length - 1;
                        return '<div data-row-asin="' + escHtml(p.asin) + '" style="padding:10px 12px;margin-bottom:6px;background:rgba(8,18,26,0.7);border-left:3px solid ' + accentColor + ';border-radius:4px;">' +
                            '<div style="font-weight:bold;color:' + asinColor + ';font-family:monospace;font-size:12px;">' + escHtml(p.asin) + statusBadge + '</div>' +
                            '<div style="color:#d0e8f5;font-size:12px;margin-top:3px;">' + (p.productName ? escHtml(p.productName) : '<span style="opacity:0.5;">(商品名未取得)</span>') + '</div>' +
                            statusHint +
                            '<div style="color:#7bb8d8;font-size:10px;margin-top:6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">' +
                                '<span>📅 ' + fmtDate(p.savedAt) + '</span>' +
                                '<div style="display:flex;gap:4px;flex-wrap:wrap;">' +
                                    '<button data-asin="' + escHtml(p.asin) + '" class="lb-am-prod-up" ' + (isFirst ? 'disabled' : '') + ' style="padding:4px 8px;background:rgba(93,213,229,0.15);border:1px solid rgba(93,213,229,0.4);color:#5dd5e5;border-radius:3px;font-size:10px;' + (isFirst ? 'opacity:0.3;cursor:not-allowed;' : '') + '">⬆</button>' +
                                    '<button data-asin="' + escHtml(p.asin) + '" class="lb-am-prod-down" ' + (isLast ? 'disabled' : '') + ' style="padding:4px 8px;background:rgba(93,213,229,0.15);border:1px solid rgba(93,213,229,0.4);color:#5dd5e5;border-radius:3px;font-size:10px;' + (isLast ? 'opacity:0.3;cursor:not-allowed;' : '') + '">⬇</button>' +
                                    '<button data-asin="' + escHtml(p.asin) + '" class="lb-am-prod-goto" style="padding:4px 8px;background:rgba(2,136,209,0.3);border:1px solid rgba(128,224,255,0.5);color:#b8d8e8;border-radius:3px;font-size:10px;">🔗 商品ページ</button>' +
                                    // ★v0.3.8.92: ホームアイコン用 URL は全商品で表示
                                    //   (TRANS-AM 不可商品でもアイコンタップ→新規開始フォールバックで動くため)
                                    '<button data-asin="' + escHtml(p.asin) + '" class="lb-am-prod-homeurl" style="padding:4px 8px;background:rgba(196,30,158,0.25);border:1px solid rgba(255,128,216,0.5);color:#ff80d8;border-radius:3px;font-size:10px;">🏠 アイコン用URL</button>' +
                                    '<button data-asin="' + escHtml(p.asin) + '" class="lb-am-prod-del" style="padding:4px 8px;background:rgba(255,77,77,0.2);border:1px solid rgba(255,77,77,0.5);color:#ff8080;border-radius:3px;font-size:10px;">🗑</button>' +
                                '</div>' +
                            '</div>' +
                        '</div>';
                    }).join('');
                ov.innerHTML =
                    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">' +
                        '<div style="font-size:16px;font-weight:bold;color:#5dd5e5;letter-spacing:1px;">📦 商品データ管理</div>' +
                        '<button id="lb-am-prod-close" style="padding:8px 14px;background:rgba(255,77,77,0.7);color:#fff;border:0;border-radius:5px;font-size:13px;">✕ 閉じる</button>' +
                    '</div>' +
                    '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">' +
                        '<button id="lb-am-prod-add" style="flex:1;min-width:140px;padding:11px;background:linear-gradient(180deg,rgba(46,196,127,0.95),rgba(20,140,75,0.95));color:#fff;border:0;border-radius:5px;font-size:13px;font-weight:bold;box-shadow:0 0 12px rgba(46,196,127,0.4);">➕ 候補商品 手動追加</button>' +
                    '</div>' +
                    '<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">' +
                        '<button id="lb-am-prod-export" style="flex:1;min-width:140px;padding:11px;background:linear-gradient(180deg,rgba(93,213,229,0.95),rgba(2,136,209,0.95));color:#08151c;border:0;border-radius:5px;font-size:13px;font-weight:bold;box-shadow:0 0 12px rgba(93,213,229,0.45);">💾 CSV 書き出し</button>' +
                        '<button id="lb-am-prod-import-file" style="flex:1;min-width:140px;padding:11px;background:rgba(2,136,209,0.85);color:#e8f4fa;border:1px solid rgba(128,224,255,0.5);border-radius:5px;font-size:13px;font-weight:bold;">📥 CSV ファイル選択</button>' +
                        '<button id="lb-am-prod-import-paste" style="flex:1;min-width:140px;padding:11px;background:rgba(2,136,209,0.6);color:#d0e8f5;border:1px solid rgba(128,224,255,0.4);border-radius:5px;font-size:13px;">📝 CSV 貼り付け</button>' +
                    '</div>' +
                    // ★v0.3.8.51: 全削除 (初期化) ボタン
                    '<div style="margin-bottom:14px;border-top:1px solid rgba(255,77,77,0.3);padding-top:10px;">' +
                        '<button id="lb-am-prod-reset-all" style="width:100%;padding:10px;background:rgba(255,77,77,0.15);border:1px solid rgba(255,77,77,0.5);color:#ff8080;border-radius:5px;font-size:12px;font-weight:bold;">⚠️ 全削除 (商品データ初期化)</button>' +
                        '<div style="font-size:10px;color:#7bb8d8;margin-top:4px;opacity:0.7;">※ addressID(送付先 ID)・UI 設定は保持</div>' +
                    '</div>' +
                    '<div style="margin-bottom:8px;color:#7bb8d8;font-size:11px;">📋 保存済み商品 (' + products.length + ' 件)</div>' +
                    '<div id="lb-am-prod-list" style="max-height:60vh;overflow-y:auto;">' + listHtml + '</div>' +
                    '<input id="lb-am-prod-file-input" type="file" accept=".csv,text/csv" style="display:none;">';
                document.body.appendChild(ov);
                const closeOv = () => {
                    try { ov.remove(); } catch (e) {}
                    try { document.body.classList.remove('lb-am-overlay-open'); } catch (e) {}
                };
                document.getElementById('lb-am-prod-close').addEventListener('click', closeOv);
                // CSV 書き出し
                document.getElementById('lb-am-prod-export').addEventListener('click', () => {
                    try {
                        const csv = exportProductsToCsv();
                        const fname = productCsvFilename();
                        downloadAsFile(csv, fname, 'text/csv');
                        toast('💾 ' + fname + '\n' + products.length + ' 件 CSV 書き出し完了', BUY_GREEN, 5000);
                        try { logAm('info', 'products-csv-export', 'CSV 書き出し', { count: products.length, fname: fname }); } catch (e) {}
                    } catch (e) {
                        toast('CSV 書き出し失敗: ' + (e && e.message ? e.message : e), STOP_RED, 5000);
                    }
                });
                // CSV ファイル選択取り込み
                const fileInput = document.getElementById('lb-am-prod-file-input');
                document.getElementById('lb-am-prod-import-file').addEventListener('click', () => {
                    fileInput.value = '';
                    fileInput.click();
                });
                fileInput.addEventListener('change', (ev) => {
                    const f = ev.target.files && ev.target.files[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                        try {
                            const text = String(reader.result || '');
                            const r = importProductsFromCsv(text);
                            const summary = `📥 取り込み完了\n・新規追加: ${r.added} 件\n・重複スキップ: ${r.skipped} 件` +
                                (r.invalid ? `\n・無効行: ${r.invalid} 件` : '') +
                                (r.addressIdSet ? '\n・addressID 登録' : '');
                            toast(summary, BUY_GREEN, 8000);
                            try { logAm('info', 'products-csv-import', 'CSV 取り込み', r); } catch (e) {}
                            closeOv();
                            setTimeout(() => { try { productsBtn.click(); } catch (e) {} }, 400);
                        } catch (e) {
                            toast('CSV 読み込み失敗: ' + (e && e.message ? e.message : e), STOP_RED, 6000);
                        }
                    };
                    reader.onerror = () => toast('ファイル読み込み失敗', STOP_RED, 5000);
                    reader.readAsText(f, 'utf-8');
                });
                // CSV 貼り付け取り込み
                document.getElementById('lb-am-prod-import-paste').addEventListener('click', () => {
                    let text = null;
                    try { text = prompt('CSV テキストを貼り付けてください:'); } catch (e) {}
                    if (!text) return;
                    try {
                        const r = importProductsFromCsv(text);
                        const summary = `📥 取り込み完了\n・新規追加: ${r.added} 件\n・重複スキップ: ${r.skipped} 件` +
                            (r.invalid ? `\n・無効行: ${r.invalid} 件` : '') +
                            (r.addressIdSet ? '\n・addressID 登録' : '');
                        toast(summary, BUY_GREEN, 8000);
                        try { logAm('info', 'products-csv-import', 'CSV 取り込み (貼付)', r); } catch (e) {}
                        closeOv();
                        setTimeout(() => { try { productsBtn.click(); } catch (e) {} }, 400);
                    } catch (e) {
                        toast('CSV 解析失敗: ' + (e && e.message ? e.message : e), STOP_RED, 6000);
                    }
                });
                // 個別削除
                Array.prototype.forEach.call(ov.querySelectorAll('.lb-am-prod-del'), (btn) => {
                    btn.addEventListener('click', () => {
                        const asin = btn.getAttribute('data-asin');
                        if (!asin) return;
                        if (!confirm(asin + ' を削除しますか?')) return;
                        try {
                            localStorage.removeItem('LB_AM_BUYNOW_URL_' + asin);
                            localStorage.removeItem('LB_AM_BUYNOW_URL_' + asin + '_AT');
                            localStorage.removeItem('LB_AM_PRODUCT_NAME_' + asin);
                            localStorage.removeItem('LB_AM_ASIN_ONLY_' + asin);
                            // ★v0.3.8.44: 連投ガード用 LAST_AT も削除 (削除→即再登録時の誤発動回避)
                            localStorage.removeItem('LB_AM_TRANS_AM_LAST_AT_' + asin);
                            // 並び順からも除去
                            try { setProductOrder(getProductOrder().filter(a => a !== asin)); } catch (e) {}
                            toast('🗑 ' + asin + ' 削除しました', '#ed6c02', 4000);
                            try { logAm('info', 'products-delete', '商品データ削除', { asin: asin }); } catch (e) {}
                        } catch (e) {}
                        closeOv();
                        setTimeout(() => { try { productsBtn.click(); } catch (e) {} }, 400);
                    });
                });
                // ★v0.3.8.33: 🔗 商品ページに飛ぶ
                Array.prototype.forEach.call(ov.querySelectorAll('.lb-am-prod-goto'), (btn) => {
                    btn.addEventListener('click', () => {
                        const asin = btn.getAttribute('data-asin');
                        if (!asin) return;
                        const url = 'https://www.amazon.co.jp/dp/' + asin + '?m=AN1VRQENFRJN5';
                        closeOv();
                        setTimeout(() => { try { location.href = url; } catch (e) {} }, 200);
                    });
                });
                // ★v0.3.8.91: 🏠 ホームアイコン用ダイアログ (コピーボタン + 背景 fetch 画像取得)
                //   HIRO 要望:「商品ページを開かなくても 🏠 で画像を表示したい」
                //   → 保存済み画像/名前があれば即表示。無ければ fetchProductMeta で
                //     商品ページHTMLを背景取得(画面遷移なし)し、画像・名前を埋める + 保存。
                //   URL は #gta=1 込みの Amazon 直 (Netlify 非依存)。
                //   ※ アイコン画像は iOS 仕様上 URL に埋め込み不可 → 商品画像は長押しで写真保存。
                Array.prototype.forEach.call(ov.querySelectorAll('.lb-am-prod-homeurl'), (btn) => {
                    btn.addEventListener('click', () => {
                        const asin = btn.getAttribute('data-asin');
                        if (!asin) return;
                        let curName = (function(){ try { return localStorage.getItem('LB_AM_PRODUCT_NAME_' + asin) || ''; } catch(e){return '';} })();
                        let curImg  = (function(){ try { return localStorage.getItem('LB_AM_PRODUCT_IMG_' + asin) || ''; } catch(e){return '';} })();
                        const gtaUrl = 'https://www.amazon.co.jp/dp/' + asin + '?m=AN1VRQENFRJN5#gta=1';
                        const doCopy = async (text) => {
                            try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) {}
                            try {
                                const ta = document.createElement('textarea');
                                ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
                                document.body.appendChild(ta); ta.focus(); ta.select();
                                const ok = document.execCommand('copy');
                                document.body.removeChild(ta);
                                return ok;
                            } catch (e) { return false; }
                        };
                        try { logAm('info', 'gta-url-issued',
                            '🏠 ホームアイコン ダイアログ表示', { asin: asin, hasImg: !!curImg, hasName: !!curName }); } catch (e) {}
                        try {
                            const btnCss = 'width:100%;padding:11px;border-radius:8px;font-size:14px;font-weight:bold;border:0;margin-bottom:8px;';
                            const dlg = document.createElement('div');
                            dlg.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.85);' +
                                'display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;';
                            dlg.innerHTML =
                                '<div style="max-width:440px;width:100%;background:#0d1a24;border:1px solid rgba(255,128,216,0.5);' +
                                'border-radius:10px;padding:18px;font-family:sans-serif;color:#d0e8f5;max-height:90vh;overflow:auto;">' +
                                  '<div style="font-size:15px;font-weight:bold;color:#ff80d8;margin-bottom:8px;">🏠 ホームアイコンを作る</div>' +
                                  // 商品画像エリア (id で後から差し替え)
                                  '<div id="lb-am-gta-imgwrap" style="text-align:center;margin-bottom:10px;min-height:24px;">' +
                                    (curImg
                                      ? '<img id="lb-am-gta-img" src="' + escHtml(curImg) + '" referrerpolicy="no-referrer" ' +
                                          'style="max-width:120px;max-height:120px;border-radius:8px;background:#fff;" alt="">' +
                                        '<div style="font-size:10px;color:#7bb8d8;margin-top:3px;">↑ 長押し →「写真に追加」でアイコン用に保存</div>'
                                      : '<div id="lb-am-gta-imgstatus" style="font-size:11px;color:#9fd0e0;">🖼 商品画像を取得中…</div>') +
                                  '</div>' +
                                  // 商品名エリア (id で後から差し替え)
                                  '<div style="font-size:11px;color:#7bb8d8;margin-bottom:2px;">アイコン名(商品名):</div>' +
                                  '<div id="lb-am-gta-name" style="font-size:12px;color:#d0e8f5;background:#06131c;border:1px solid rgba(93,213,229,0.3);' +
                                    'border-radius:5px;padding:6px 8px;margin-bottom:10px;word-break:break-all;">' +
                                    (curName ? escHtml(curName.slice(0, 60)) : '<span style="opacity:.6;">取得中…</span>') + '</div>' +
                                  // ① URL コピーボタン
                                  '<button id="lb-am-gta-copy-url" style="' + btnCss + 'background:linear-gradient(180deg,#ff2bb0,#b81f86);color:#fff;">📋 ① URLをコピー</button>' +
                                  // ② 商品名コピーボタン (常時表示、名前は後から入る場合あり)
                                  '<button id="lb-am-gta-copy-name" style="' + btnCss + 'background:rgba(93,213,229,0.2);border:1px solid rgba(93,213,229,0.5);color:#5dd5e5;">📋 ② 商品名をコピー</button>' +
                                  // 手順
                                  '<div style="font-size:11px;color:#cfe6f5;margin-top:6px;line-height:1.7;">' +
                                    '<b style="color:#ff80d8;">作り方(ショートカット):</b><br>' +
                                    '①「URLをコピー」を押す<br>' +
                                    '② ショートカットApp → 新規(+) → アクション「<b>URLを開く</b>」<br>' +
                                    '&nbsp;&nbsp;※「Webページを表示」は選ばない<br>' +
                                    '③ 青い[URL]をタップ → <b>貼り付け</b><br>' +
                                    '④ 共有 →「ホーム画面に追加」<br>' +
                                    '⑤ アイコン=保存した商品画像、名前=「商品名をコピー」して貼付<br>' +
                                    '⑥ 完成。タップで自動 TRANS-AM' +
                                  '</div>' +
                                  '<button id="lb-am-gta-dlg-close" style="margin-top:12px;width:100%;padding:10px;' +
                                    'background:rgba(255,255,255,0.08);border:1px solid rgba(128,200,224,0.4);' +
                                    'color:#9fd0e0;border-radius:6px;font-size:13px;">閉じる</button>' +
                                '</div>';
                            document.body.appendChild(dlg);
                            const closeDlg = () => { try { dlg.remove(); } catch (e) {} };
                            dlg.addEventListener('click', (ev) => { if (ev.target === dlg) closeDlg(); });
                            const cb = dlg.querySelector('#lb-am-gta-dlg-close');
                            if (cb) cb.addEventListener('click', closeDlg);
                            const ub = dlg.querySelector('#lb-am-gta-copy-url');
                            if (ub) ub.addEventListener('click', async () => {
                                const ok = await doCopy(gtaUrl);
                                ub.textContent = ok ? '✅ URLコピー完了' : '⚠️ 失敗(もう一度)';
                                setTimeout(() => { try { ub.textContent = '📋 ① URLをコピー'; } catch (e) {} }, 2000);
                            });
                            const nb = dlg.querySelector('#lb-am-gta-copy-name');
                            if (nb) nb.addEventListener('click', async () => {
                                if (!curName) { nb.textContent = '⏳ 商品名 取得中…'; setTimeout(() => { try { nb.textContent = '📋 ② 商品名をコピー'; } catch (e) {} }, 1500); return; }
                                const ok = await doCopy(curName);
                                nb.textContent = ok ? '✅ 商品名コピー完了' : '⚠️ 失敗(もう一度)';
                                setTimeout(() => { try { nb.textContent = '📋 ② 商品名をコピー'; } catch (e) {} }, 2000);
                            });

                            // ★v0.3.8.91: 画像/名前が未取得なら背景 fetch で取得して埋める (画面遷移なし)
                            if (!curImg || !curName) {
                                (async () => {
                                    try {
                                        const meta = await fetchProductMeta(asin);
                                        // 画像
                                        if (meta.img && !curImg) {
                                            curImg = meta.img;
                                            try { localStorage.setItem('LB_AM_PRODUCT_IMG_' + asin, meta.img); } catch (e) {}
                                            const wrap = dlg.querySelector('#lb-am-gta-imgwrap');
                                            if (wrap) {
                                                wrap.innerHTML =
                                                    '<img id="lb-am-gta-img" src="' + escHtml(meta.img) + '" referrerpolicy="no-referrer" ' +
                                                    'style="max-width:120px;max-height:120px;border-radius:8px;background:#fff;" alt="">' +
                                                    '<div style="font-size:10px;color:#7bb8d8;margin-top:3px;">↑ 長押し →「写真に追加」でアイコン用に保存</div>';
                                            }
                                        } else if (!meta.img && !curImg) {
                                            const st = dlg.querySelector('#lb-am-gta-imgstatus');
                                            if (st) { st.textContent = '画像を取得できませんでした(🔗商品ページから保存してください)'; st.style.color = '#ffb84d'; }
                                        }
                                        // 名前
                                        if (meta.name && !curName) {
                                            curName = meta.name;
                                            try { localStorage.setItem('LB_AM_PRODUCT_NAME_' + asin, meta.name); } catch (e) {}
                                            const nmEl = dlg.querySelector('#lb-am-gta-name');
                                            if (nmEl) nmEl.textContent = meta.name.slice(0, 60);
                                        } else if (!meta.name && !curName) {
                                            const nmEl = dlg.querySelector('#lb-am-gta-name');
                                            if (nmEl) nmEl.innerHTML = '<span style="opacity:.6;">(取得できませんでした)</span>';
                                        }
                                        try { logAm('info', 'gta-meta-fetch', '🏠 背景fetchで商品メタ取得', { asin: asin, gotImg: !!meta.img, gotName: !!meta.name }); } catch (e) {}
                                    } catch (e) {}
                                })();
                            }
                        } catch (e) {
                            toast('🏠 URL:\n' + gtaUrl, '#c41e9e', 12000);
                        }
                    });
                });
                // ★v0.3.8.33: ⬆ 上に並べ替え
                Array.prototype.forEach.call(ov.querySelectorAll('.lb-am-prod-up'), (btn) => {
                    btn.addEventListener('click', () => {
                        if (btn.disabled) return;
                        const asin = btn.getAttribute('data-asin');
                        if (!asin) return;
                        moveAsinInOrder(asin, -1);
                        closeOv();
                        setTimeout(() => { try { productsBtn.click(); } catch (e) {} }, 200);
                    });
                });
                // ★v0.3.8.33: ⬇ 下に並べ替え
                Array.prototype.forEach.call(ov.querySelectorAll('.lb-am-prod-down'), (btn) => {
                    btn.addEventListener('click', () => {
                        if (btn.disabled) return;
                        const asin = btn.getAttribute('data-asin');
                        if (!asin) return;
                        moveAsinInOrder(asin, 1);
                        closeOv();
                        setTimeout(() => { try { productsBtn.click(); } catch (e) {} }, 200);
                    });
                });
                // ★v0.3.8.51: ⚠️ 全削除 (初期化)
                document.getElementById('lb-am-prod-reset-all').addEventListener('click', () => {
                    if (!confirm('⚠️ 全削除します\n\n削除対象:\n・全商品データ (URL/商品名/ASIN_ONLY/並び順/連投ガード)\n\n削除されないもの:\n・addressID (送付先 ID)\n・UI 設定\n・エラーカウンタ\n\n本当に実行しますか?')) return;
                    let count = 0;
                    try {
                        const keysToDelete = [];
                        for (let i = 0; i < localStorage.length; i++) {
                            const k = localStorage.key(i);
                            if (!k) continue;
                            if (k.startsWith('LB_AM_BUYNOW_URL_') ||
                                k.startsWith('LB_AM_PRODUCT_NAME_') ||
                                k.startsWith('LB_AM_ASIN_ONLY_') ||
                                k.startsWith('LB_AM_TRANS_AM_LAST_AT_') ||
                                k === 'LB_AM_PRODUCT_ORDER') {
                                keysToDelete.push(k);
                            }
                        }
                        for (const k of keysToDelete) {
                            try { localStorage.removeItem(k); count++; } catch (e) {}
                        }
                        try { logAm('warn', 'products-reset-all',
                            '⚠️ 全削除実行 (商品データ初期化)', { deletedCount: count }); } catch (e) {}
                    } catch (e) {}
                    toast('🗑 全削除完了: ' + count + ' 件削除\n(addressID は保持)', '#ed6c02', 6000);
                    closeOv();
                    setTimeout(() => { try { productsBtn.click(); } catch (e) {} }, 400);
                });
                // ★v0.3.8.33: ➕ 候補商品 手動追加
                document.getElementById('lb-am-prod-add').addEventListener('click', () => {
                    let input = null;
                    try {
                        input = prompt(
                            '商品 URL or ASIN を貼り付けてください:\n\n' +
                            '例 1: https://www.amazon.co.jp/dp/B07YY9MRJZ\n' +
                            '例 2: B07YY9MRJZ\n' +
                            '例 3: https://www.amazon.co.jp/dp/B07YY9MRJZ?m=AN1VRQENFRJN5'
                        );
                    } catch (e) {}
                    if (!input) return;
                    const inputStr = String(input).trim();
                    let asin = '';
                    const m1 = inputStr.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
                    if (m1) asin = m1[1].toUpperCase();
                    else if (/^[A-Z0-9]{10}$/i.test(inputStr)) asin = inputStr.toUpperCase();
                    if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) {
                        toast('❌ ASIN を抽出できません\n10 桁の英数字または商品 URL を入力してください', STOP_RED, 8000);
                        return;
                    }
                    // 既に保存済みかチェック
                    const existingUrl = localStorage.getItem('LB_AM_BUYNOW_URL_' + asin);
                    const existingAsinOnly = localStorage.getItem('LB_AM_ASIN_ONLY_' + asin);
                    if (existingUrl || existingAsinOnly) {
                        toast('ℹ️ ' + asin + ' は既に登録済みです', '#ed6c02', 6000);
                        return;
                    }
                    // 商品名入力 (オプション)
                    let name = '';
                    try { name = prompt('商品名 (空欄可、後で商品ページで自動取得):') || ''; } catch (e) {}
                    name = name.trim().slice(0, 200);
                    saveAsinOnlyRecord(asin, name);
                    // 並び順の先頭に追加
                    try {
                        const order = getProductOrder();
                        const filtered = order.filter(a => a !== asin);
                        filtered.unshift(asin);
                        setProductOrder(filtered);
                    } catch (e) {}
                    toast('➕ ' + asin + (name ? ' (' + name.slice(0, 30) + ')' : '') + ' を仮登録\n商品ページに飛んで 🛒 すると完成 URL に昇格', BUY_GREEN, 8000);
                    try { logAm('info', 'products-manual-add', '商品データ手動追加', { asin: asin, name: name }); } catch (e) {}
                    closeOv();
                    setTimeout(() => { try { productsBtn.click(); } catch (e) {} }, 400);
                });
            } catch (e) {
                toast('オーバーレイ表示失敗: ' + e.message, STOP_RED, 5000);
            }
        });
        // ★v0.1.15.19: ログボタン — localStorage の全ログを画面に展開表示
        document.getElementById('lb-am-btn-log').addEventListener('click', () => {
            try {
                const exist = document.getElementById('lb-am-log-overlay');
                if (exist) { exist.remove(); try { document.body.classList.remove('lb-am-overlay-open'); } catch (e) {} return; }
                try { document.body.classList.add('lb-am-overlay-open'); } catch (e) {}
                const ov = document.createElement('div');
                ov.id = 'lb-am-log-overlay';
                Object.assign(ov.style, {
                    position:'fixed', top:'0', left:'0', right:'0', bottom:'0',
                    background:'rgba(0,0,0,0.95)', color:'#9fff9f',
                    zIndex:'2147483647', overflowY:'auto',
                    padding:'12px', fontFamily:'monospace', fontSize:'11px',
                    whiteSpace:'pre-wrap', wordBreak:'break-all',
                });
                const lines = LOG_BUFFER_AM.slice().reverse().map(e => {
                    const d = e.detail ? '\n  ' + JSON.stringify(e.detail).slice(0, 500) : '';
                    return `[${e.ts}] ${e.level} ${e.category}: ${e.message}${d}`;
                });
                // ★v0.2.0: ログ送信ダイアログ式(重要のみ / 全件)
                //   HIRO 要望「量が多いから必要最低限に」対応
                ov.innerHTML = '<div style="text-align:right;margin-bottom:8px;display:flex;gap:6px;flex-wrap:wrap;">' +
                    '<button id="lb-am-log-close" style="padding:8px 12px;background:#d32f2f;color:#fff;border:0;border-radius:6px;font-size:13px;">✕ 閉じる</button>' +
                    '<button id="lb-am-log-discord-imp" style="padding:8px 12px;background:#5865f2;color:#fff;border:0;border-radius:6px;font-size:13px;">📨 重要のみ</button>' +
                    '<button id="lb-am-log-discord-all" style="padding:8px 12px;background:#3f51b5;color:#fff;border:0;border-radius:6px;font-size:13px;">📨 全件</button>' +
                    '<button id="lb-am-log-csv" style="padding:8px 12px;background:#c41e9e;color:#fff;border:0;border-radius:6px;font-size:13px;font-weight:bold;">📥 CSV 保存</button>' +
                    '<button id="lb-am-log-copy" style="padding:8px 12px;background:#1976d2;color:#fff;border:0;border-radius:6px;font-size:13px;">📋 コピー</button>' +
                    '<button id="lb-am-log-clear" style="padding:8px 12px;background:#757575;color:#fff;border:0;border-radius:6px;font-size:13px;">🗑 クリア</button>' +
                    '</div>' +
                    '<div id="lb-am-log-content">' + (lines.length ? lines.join('\n\n') : '(ログなし)') + '</div>';
                document.body.appendChild(ov);
                document.getElementById('lb-am-log-close').addEventListener('click', () => {
                    try { ov.remove(); } catch (e) {}
                    try { document.body.classList.remove('lb-am-overlay-open'); } catch (e) {}
                });
                document.getElementById('lb-am-log-copy').addEventListener('click', () => {
                    try {
                        navigator.clipboard.writeText(lines.join('\n\n'));
                        toast('📋 ログをクリップボードにコピー', BUY_GREEN, 3000);
                    } catch (e) { toast('コピー失敗: ' + e.message, STOP_RED, 5000); }
                });
                // ★v0.3.8.16: 📥 CSV 保存 — localStorage 全ログを CSV ダウンロード
                //   Discord 1 通 2000 文字制限の壁を回避、長いログを完全に取り出せる
                //   UTF-8 with BOM、ファイル名 gundambot-amazon-log-YYYYMMDD-HHMMSS.csv
                //   列: timestamp, perfMs, level, tag, message, data(JSON)
                document.getElementById('lb-am-log-csv').addEventListener('click', () => {
                    try {
                        const csvEscape = (v) => {
                            if (v === null || v === undefined) return '';
                            const s = String(v);
                            // " を "" に、改行は維持 (CSV 仕様)
                            if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
                            return s;
                        };
                        // ★v0.3.8.76: 通常バッファ + 重要バッファをマージして時系列順にソート
                        //   重要タグ (order-confirm 等) は通常バッファから消えても critical
                        //   バッファに残っているので両方マージ。同一エントリ重複排除も行う。
                        const header = ['timestamp', 'perfMs', 'level', 'tag', 'message', 'data'].join(',');
                        const seen = new Set();
                        const merged = [];
                        const allEntries = LOG_BUFFER_AM.concat(LOG_BUFFER_AM_CRITICAL);
                        for (const e of allEntries) {
                            const key = (e.ts || '') + '|' + (e.perfMs || '') + '|' + (e.category || '') + '|' + (e.message || '').slice(0, 40);
                            if (seen.has(key)) continue;
                            seen.add(key);
                            merged.push(e);
                        }
                        // 時系列順ソート (ts 文字列比較で十分、HH:MM:SS.mmm 形式)
                        merged.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
                        const rows = merged.map((e) => {
                            const dataJson = e.detail ? JSON.stringify(e.detail) : '';
                            return [
                                csvEscape(e.ts || ''),
                                csvEscape(e.perfMs !== undefined ? e.perfMs : ''),
                                csvEscape(e.level || ''),
                                csvEscape(e.category || ''),
                                csvEscape(e.message || ''),
                                csvEscape(dataJson),
                            ].join(',');
                        });
                        const csvBody = '﻿' + header + '\n' + rows.join('\n');   // BOM 付き UTF-8
                        const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const pad = (n) => String(n).padStart(2, '0');
                        const now = new Date();
                        const fname = 'gundambot-amazon-log-' +
                            now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' +
                            pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()) + '.csv';
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = fname;
                        a.style.display = 'none';
                        document.body.appendChild(a);
                        a.click();
                        setTimeout(() => {
                            try { URL.revokeObjectURL(url); } catch (e) {}
                            try { a.remove(); } catch (e) {}
                        }, 1000);
                        toast(`📥 ${fname}\n${LOG_BUFFER_AM.length} 件、CSV 保存`, BUY_GREEN, 4000);
                    } catch (e) {
                        toast('CSV 保存失敗: ' + (e && e.message ? e.message : e), STOP_RED, 5000);
                    }
                });
                document.getElementById('lb-am-log-clear').addEventListener('click', () => {
                    if (!confirm('ログを全消去しますか?\n(重要ログも含めて全削除)')) return;
                    LOG_BUFFER_AM.length = 0;
                    saveLogAm();
                    // ★v0.3.8.76: critical バッファも同時クリア
                    try {
                        LOG_BUFFER_AM_CRITICAL.length = 0;
                        saveLogAmCritical();
                    } catch (e) {}
                    document.getElementById('lb-am-log-content').textContent = '(クリア済み)';
                });
                // ★v0.2.0: Discord 送信を「重要のみ」「全件」の 2 ボタンに分離
                //   HIRO 要望:量が多いので普段は重要のみ、デバッグ時のみ全件
                //   重要 = error / warn / order-complete カテゴリ
                const sendLogsToDiscord = async (filterImportantOnly) => {
                    const url = getDiscordWebhook();   // ★v0.3.8.96: 端末ローカル優先
                    if (!url || url.length < 30) {
                        toast(`📨 webhook URL 不正 (length=${url ? url.length : 0})\n` +
                              `→ amazon.html → webhook 欄に URL 入力 → 再インストール`,
                              STOP_RED, 8000);
                        return;
                    }
                    if (!/^https:\/\/discord(?:app)?\.com\/api\/webhooks\//.test(url)) {
                        toast(`📨 webhook URL の形式が違う: ${url.slice(0, 40)}...`, STOP_RED, 8000);
                        return;
                    }

                    // 統計集計(全件ベース)
                    const stats = { error: 0, warn: 0, info: 0, other: 0 };
                    for (const e of LOG_BUFFER_AM) {
                        if (e.level === 'error') stats.error++;
                        else if (e.level === 'warn') stats.warn++;
                        else if (e.level === 'info') stats.info++;
                        else stats.other++;
                    }
                    const total = LOG_BUFFER_AM.length;

                    // 送信対象 entry を決定
                    let targetEntries;
                    if (filterImportantOnly) {
                        targetEntries = LOG_BUFFER_AM.filter(e =>
                            e.level === 'error' ||
                            e.level === 'warn' ||
                            e.category === 'order-complete'
                        );
                    } else {
                        targetEntries = LOG_BUFFER_AM.slice();
                    }
                    const targetLines = targetEntries.slice().reverse().map(e => {
                        const d = e.detail ? '\n  ' + JSON.stringify(e.detail).slice(0, 500) : '';
                        return `[${e.ts}] ${e.level} ${e.category}: ${e.message}${d}`;
                    });

                    const summary = `合計 ${total} 件 (error:${stats.error} / warn:${stats.warn} / info:${stats.info}${stats.other > 0 ? ' / 他:' + stats.other : ''})`;
                    const filterTag = filterImportantOnly ? '重要のみ' : '全件';
                    toast(`📨 ${filterTag}: ${targetEntries.length}/${total} 件\n→ Discord に送信中…`, '#5865f2', 4500);

                    const text = targetLines.length ? targetLines.join('\n\n') : '(該当ログなし)';
                    const chunks = [];
                    for (let i = 0; i < text.length; i += 1900) {
                        chunks.push(text.slice(i, i + 1900));
                    }
                    if (chunks.length === 0) chunks.push('(該当ログなし)');

                    // 先頭メッセージ(統計サマリ + 送信対象数)
                    const headerMsg = {
                        content: `[Amazon ${CONFIG.profileName || ''}] **ログ送信開始** ${new Date().toLocaleString('ja-JP')}\n` +
                                 `📊 ${summary}\n📂 v${SCRIPT_VERSION} / 送信対象: ${filterTag} ${targetEntries.length}件 / ${chunks.length} 通に分割`,
                    };
                    let summaryRes = await sendToDiscordRaw(headerMsg);
                    if (!summaryRes.ok) {
                        await sleep(1000);
                        summaryRes = await sendToDiscordRaw(headerMsg);
                    }
                    if (!summaryRes.ok) {
                        toast(`📨 サマリ送信失敗: ${summaryRes.reason} ${summaryRes.detail ? '/ ' + summaryRes.detail.slice(0, 60) : ''}`,
                              STOP_RED, 12000);
                        return;
                    }
                    await sleep(500);

                    let sent = 0;
                    let firstErr = '';
                    for (let i = 0; i < chunks.length; i++) {
                        const header = `[Amazon ${CONFIG.profileName || ''}] ${filterTag} (${i + 1}/${chunks.length})`;
                        const payload = { content: (header + '\n```\n' + chunks[i] + '\n```').slice(0, 1990) };
                        let res = await sendToDiscordRaw(payload);
                        if (!res.ok) {
                            await sleep(1000);
                            res = await sendToDiscordRaw(payload);
                        }
                        if (res.ok) {
                            sent++;
                        } else {
                            if (!firstErr) firstErr = `${res.reason}${res.detail ? ' / ' + res.detail.slice(0, 80) : ''}`;
                            toast(`📨 失敗(${i + 1}/${chunks.length}): ${firstErr}`, STOP_RED, 12000);
                            break;
                        }
                        if (i < chunks.length - 1) await sleep(500);
                    }
                    if (sent === chunks.length) {
                        toast(`📨 送信完了 ${sent}/${chunks.length}\n📊 ${filterTag} ${targetEntries.length}件`, BUY_GREEN, 6000);
                    } else {
                        toast(`📨 中断 ${sent}/${chunks.length} 送信済 — 失敗: ${firstErr}`, STOP_RED, 15000);
                    }
                };
                document.getElementById('lb-am-log-discord-imp').addEventListener('click', () => sendLogsToDiscord(true));
                document.getElementById('lb-am-log-discord-all').addEventListener('click', () => sendLogsToDiscord(false));
            } catch (e) {
                toast('ログ表示失敗: ' + e.message, STOP_RED, 5000);
            }
        });
        // ★v0.1.15.1: 「🔄 直販URL」 = 現 URL に ?m=AN1VRQENFRJN5 を付けて即リロード
        //   HIRO 用途 2026-05-09: 購入動作と分離して URL 動作確認だけ手動でやりたい時用
        document.getElementById('lb-am-btn-force').addEventListener('click', () => {
            try {
                const url = new URL(location.href);
                if (url.searchParams.get('m') === AMAZON_SELLER_ID) {
                    toast('既に直販URL(?m=)が付いています', '#1976d2', 3000);
                    return;
                }
                url.searchParams.set('m', AMAZON_SELLER_ID);
                url.searchParams.set('_pageRefresh', String(Date.now()));
                url.searchParams.set('_sw', String(Date.now()));
                url.searchParams.delete('aod');
                toast('🔄 直販URLに切替', '#1976d2', 1500);
                setTimeout(() => { location.href = url.toString(); }, 250);
            } catch (e) {
                toast('URL 変換失敗: ' + e.message, STOP_RED, 5000);
            }
        });

        try { document.body.style.paddingBottom = ''; } catch (e) {}

        // ★v0.2.0: 初回描画後にボタン状態を MODE に応じて切替
        try { updatePanelButtons(); } catch (e) {}

        return panel;
    };

    // ★v0.2.0: ボタン状態別表示制御
    //   STOPPED: 🛒新規開始 / 📋ログ / 🔄直販URL / ⚙設定
    //   RUNNING: ⏸一時停止 / 🛑完全停止 / 📋ログ / 🔄直販URL / ⚙設定
    //   PAUSED:  ▶再開 / 🛑完全停止 / 📋ログ / 🔄直販URL / ⚙設定
    const updatePanelButtons = () => {
        const mode = S.getMode();
        const showHide = (id, show) => {
            const el = document.getElementById(id);
            if (el) {
                if (show) el.removeAttribute('hidden');
                else el.setAttribute('hidden', '');
            }
        };
        if (mode === MODE_STOPPED) {
            showHide('lb-am-btn-buy', true);
            showHide('lb-am-btn-trans-am', true);   // ★v0.3.8.16: STOPPED のみ表示
            showHide('lb-am-btn-resume', false);
            showHide('lb-am-btn-pause', false);
            showHide('lb-am-btn-fullstop', false);
        } else if (mode === MODE_RUNNING) {
            showHide('lb-am-btn-buy', false);
            showHide('lb-am-btn-trans-am', false);  // ★v0.3.8.16: 動作中は非表示 (バリア 1)
            showHide('lb-am-btn-resume', false);
            showHide('lb-am-btn-pause', true);
            showHide('lb-am-btn-fullstop', true);
        } else if (mode === MODE_PAUSED) {
            showHide('lb-am-btn-buy', false);
            showHide('lb-am-btn-trans-am', false);  // ★v0.3.8.16: PAUSED 中も非表示 (▶再開で復帰)
            showHide('lb-am-btn-resume', true);
            showHide('lb-am-btn-pause', false);
            showHide('lb-am-btn-fullstop', true);
        }
        // 共通(常時表示): force / log / products / cfg
        showHide('lb-am-btn-force', true);
        showHide('lb-am-btn-log', true);
        showHide('lb-am-btn-products', true);
        showHide('lb-am-btn-cfg', true);
        // ★v0.3.8: 動作中 pulse アニメ用 class toggle (CB UI)
        // ★v0.3.8.23: TRANS-AM 中はマゼンタ pulse、通常動作中はシアン pulse に切替
        // ★v0.3.8.23 修正: STOPPED 状態では is-transam を必ず外す
        //   (localStorage に LB_AM_TRANS_AM_MODE='1' が古く残っていても、待機中は通常 HUD)
        // ★v0.3.8.60: PAUSED 状態でも is-transam を外す
        //   HIRO 報告: PAUSED 中のトーストがピンク → is-transam が残っていた。
        //   PAUSED は「動作停止中」なので TRANS-AM 配色は不要。
        //   RUNNING + TRANS-AM フラグ の時だけマゼンタ HUD に切替。
        try {
            const panel = document.getElementById('lb-am-panel');
            if (panel) {
                panel.classList.toggle('is-running', mode === MODE_RUNNING);
                const transAm = (mode === MODE_RUNNING) &&
                    (function(){ try { return S.isTransAmMode(); } catch (e) { return false; } })();
                panel.classList.toggle('is-transam', transAm);
            }
        } catch (e) {}

        // ★v0.3.8.23 / 0.3.8.33: TRANS-AM ボタンの有効/無効状態を更新
        //   有効化条件: STOPPED + 商品ページ + (完成 URL あり OR ASIN のみ仮登録) + 連続エラー未発生
        try {
            // ★v0.3.8.51: B方式専用化 - 保存値 (直販判定済み URL) 必須
            //   有効化条件: 商品ページ + addressID + 直販 URL 保存済み
            const transAmBtn = document.getElementById('lb-am-btn-trans-am');
            if (transAmBtn && mode === MODE_STOPPED) {
                const asin = extractAsinFromUrl();
                const addrId = (function(){ try { return localStorage.getItem('LB_AM_ADDRESS_ID') || ''; } catch (e) { return ''; } })();
                const hasUrl = hasSavedTransAmUrl(asin);
                let label = '⚡TRANS-AM⚡';
                let enabled = false;
                let tip = '';
                if (!asin) {
                    label = '🔒 TRANS-AM (商品ページで)';
                    tip = '商品ページ (/dp/...) を開いてください';
                } else if (!addrId || addrId.length < 6) {
                    label = '🔒 TRANS-AM (要 addressID)';
                    tip = '通常の 🛒 で 1 回購入を試して送付先 ID を localStorage に保存してください (初回のみ)';
                } else if (!hasUrl) {
                    label = '🔒 TRANS-AM (要記録)';
                    tip = 'この商品の直販 URL が未取得です\n→ 🛒新規開始 で Buy Box / AOD から自動取得されます';
                } else {
                    enabled = true;
                    label = '⚡TRANS-AM⚡';
                    const name = (function(){ try { return localStorage.getItem('LB_AM_PRODUCT_NAME_' + asin) || ''; } catch(e){return '';} })();
                    tip = name ? ('B方式 直販オファー: ' + name.slice(0, 60)) : 'B方式 (直販判定済み offerListing.1)';
                }
                transAmBtn.textContent = label;
                transAmBtn.title = tip;
                transAmBtn.disabled = !enabled;
                if (enabled) {
                    transAmBtn.style.opacity = '';
                    transAmBtn.style.cursor = '';
                    transAmBtn.style.filter = '';
                } else {
                    transAmBtn.style.opacity = '0.45';
                    transAmBtn.style.cursor = 'not-allowed';
                    transAmBtn.style.filter = 'grayscale(60%)';
                }
            }
        } catch (e) {}
    };

    const ensureToastPanel = () => {
        ensurePanel();
        return document.getElementById('lb-am-panel-toasts');
    };

    // ★v0.1.15.19/v0.1.16.8: ログバッファ + Discord webhook
    //   localStorage に最大 300 件保存(リロードでも残る、HIRO がパネルから閲覧可能)
    //   v0.1.16.8: バッファサイズ 200→300、entry に perfMs(起動からの相対 ms)を追加
    const LOG_KEY_AM = 'lb_am_log_buffer';
    // ★v0.3.8.86: LOG_MAX_AM 5000 → 2000 に削減 (localStorage quota 圧迫対策)
    //   v0.3.8.85 ログ解析で session 書き込み silent fail を確認:
    //     - 1件 ~300-500 bytes × 5000 = 1.5-2.5 MB
    //     - iOS Safari + Userscripts 拡張の localStorage 実効容量を超過していた
    //     - setMode (7 bytes) は通るが setItem(KEY_V2_SESSION, JSON.stringify(...)) (~200 bytes) が
    //       silent fail (QuotaExceededError を投げずに無視される iOS Safari quirk)
    //     - 結果: TRANS-AM navigate 後に mode=RUNNING だが session=null で完全停止
    //   v0.3.8.77 で 5000 にしたのは HIRO「細かい部分も把握したい」要望だったが、
    //   CRITICAL バッファ (1000 件) で重要イベントは保護されているので 2000 で運用可能。
    //   1件 ~400 bytes × 2000 = 800 KB に削減 → localStorage 余裕回復。
    const LOG_MAX_AM = 2000;
    // ★v0.3.8.77: 重要タグ別バッファ 1000 件は維持 (CRITICAL は最重要なので残す)
    const LOG_KEY_AM_CRITICAL = 'lb_am_log_buffer_critical';
    const LOG_MAX_AM_CRITICAL = 1000;
    const CRITICAL_TAGS = new Set([
        'order-confirm', 'order-confirm-debug', 'order-confirm-recovery',
        'place-order-non-html-response', 'place-order-response-body',
        'iframe-postmsg', 'qty-update', 'qty-stop-toggle',
        'amazon-error', 'cart-add-fail', 'signin',
        'completed', 'thankyou', 'op', 'mode', 'session',
        'stock-out-dog-page', 'aod-click', 'buynow-url-saved-from-buybox',
        'buynow-url-saved-from-xhr-body', 'express-modal',
        // ★v0.3.8.81: 待機室 + 未知 OTHER 画面ダンプ
        'waiting-room', 'unknown-screen',
    ]);
    const LOG_BUFFER_AM = (() => {
        try { return JSON.parse(localStorage.getItem(LOG_KEY_AM) || '[]').slice(-LOG_MAX_AM); }
        catch (e) { return []; }
    })();
    const LOG_BUFFER_AM_CRITICAL = (() => {
        try { return JSON.parse(localStorage.getItem(LOG_KEY_AM_CRITICAL) || '[]').slice(-LOG_MAX_AM_CRITICAL); }
        catch (e) { return []; }
    })();
    // ★v0.3.8.77: saveLogAm を 500ms throttle 化 (LOG_MAX_AM=5000 で書き込みコスト増大対策)
    //   毎 logAm() で 2.5MB の JSON.stringify + setItem は数十ms 必要 → busy 時に遅延蓄積
    //   メモリには即追加、localStorage には 500ms 集約書き込み
    //   ページ遷移直前の取りこぼし対策: beforeunload / pagehide / visibilitychange で flush
    let _saveLogAmTimerId = null;
    let _saveLogAmCriticalTimerId = null;
    const _saveLogAmFlush = () => {
        if (_saveLogAmTimerId) {
            try { clearTimeout(_saveLogAmTimerId); } catch (e) {}
            _saveLogAmTimerId = null;
        }
        try { localStorage.setItem(LOG_KEY_AM, JSON.stringify(LOG_BUFFER_AM)); } catch (e) {}
    };
    const _saveLogAmCriticalFlush = () => {
        if (_saveLogAmCriticalTimerId) {
            try { clearTimeout(_saveLogAmCriticalTimerId); } catch (e) {}
            _saveLogAmCriticalTimerId = null;
        }
        try { localStorage.setItem(LOG_KEY_AM_CRITICAL, JSON.stringify(LOG_BUFFER_AM_CRITICAL)); } catch (e) {}
    };
    const saveLogAm = () => {
        if (_saveLogAmTimerId) return;  // 既に予約済み → throttle
        _saveLogAmTimerId = setTimeout(_saveLogAmFlush, 500);
    };
    const saveLogAmCritical = () => {
        if (_saveLogAmCriticalTimerId) return;
        _saveLogAmCriticalTimerId = setTimeout(_saveLogAmCriticalFlush, 500);
    };
    // ページ遷移直前に必ず flush (saveLogAm の 500ms 遅延中に navigate されたら取りこぼし防止)
    try {
        const _flushAll = () => {
            try { _saveLogAmFlush(); } catch (e) {}
            try { _saveLogAmCriticalFlush(); } catch (e) {}
        };
        window.addEventListener('beforeunload', _flushAll, { capture: true });
        window.addEventListener('pagehide', _flushAll, { capture: true });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') _flushAll();
        }, { capture: true });
    } catch (e) {}

    // ★v0.1.16.8: Discord 送信の低レイヤー実装
    //   修正点(v0.1.16.7 の Content-Type:application/json は iOS Safari + Userscripts で
    //   CORS preflight が通らないケースあり):
    //     - application/x-www-form-urlencoded + payload_json=... 形式に切替
    //       → simple request 扱いで preflight (OPTIONS) 不要
    //       → Discord webhook は payload_json を公式サポート(file 添付なしでも動く)
    //     - エラー時は { ok:false, reason, detail } を返す(silent swallow しない)
    const sendToDiscordRaw = async (payload) => {
        const url = getDiscordWebhook();   // ★v0.3.8.96: 端末ローカル優先
        if (!url) return { ok: false, reason: 'no-url' };
        if (!/^https:\/\/discord(?:app)?\.com\/api\/webhooks\//.test(url)) {
            return { ok: false, reason: 'invalid-url-format', detail: url.slice(0, 60) };
        }
        try {
            const body = 'payload_json=' + encodeURIComponent(JSON.stringify(payload));
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body,
            });
            if (!res.ok) {
                let txt = '';
                try { txt = await res.text(); } catch (e) {}
                return { ok: false, reason: 'http-' + res.status, detail: txt.slice(0, 200) };
            }
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: 'fetch-error', detail: e.message };
        }
    };

    // ★v0.1.16.8: Discord 送信の高レイヤー API(自動分割 + リトライ + エラーログ)
    //   - フィールド最大 5 件/メッセージ(Discord 6000 char/embed 制限回避)
    //   - フィールド value は 1000 char 上限(``` 含めて 1006 char、Discord 1024 制限内)
    //   - 失敗時 1 秒後に 1 度だけリトライ
    //   - リトライも失敗 → LOG_BUFFER_AM に error 記録(category=discord-send で再帰防止)
    const notifyDiscord = async (title, fieldsObj, opts) => {
        const url = getDiscordWebhook();   // ★v0.3.8.96: 端末ローカル優先
        if (!url) return false;
        const color = (opts && opts.color) || 16753920; // amber デフォルト
        const tag = `[Amazon ${CONFIG.profileName || 'no-prof'}]`;
        const ts = new Date().toLocaleString('ja-JP');

        const allEntries = [];
        for (const [k, v] of Object.entries(fieldsObj || {})) {
            if (v === null || v === undefined || v === '') continue;
            let val = typeof v === 'string' ? v : JSON.stringify(v);
            const truncated = val.length > 1000 ? val.slice(0, 1000) + '…(切詰)' : val;
            allEntries.push({
                name: String(k).slice(0, 250),
                value: '```' + truncated + '```',
                inline: false,
            });
        }

        const FIELDS_PER_MSG = 5;
        const totalChunks = Math.max(1, Math.ceil(allEntries.length / FIELDS_PER_MSG));
        let allOk = true;
        let firstErrReason = '';
        let firstErrDetail = '';

        for (let i = 0; i < totalChunks; i++) {
            const chunkFields = allEntries.slice(i * FIELDS_PER_MSG, (i + 1) * FIELDS_PER_MSG);
            const chunkLabel = totalChunks > 1 ? ` (${i + 1}/${totalChunks})` : '';
            const payload = {
                content: `${tag} ${title}${chunkLabel} (${ts})`.slice(0, 1900),
                embeds: [{
                    title: (title + chunkLabel).slice(0, 250),
                    color: color,
                    fields: chunkFields.length ? chunkFields : [{ name: '(no fields)', value: '```(none)```', inline: false }],
                    footer: { text: location.href.slice(0, 100) },
                }],
            };
            let res = await sendToDiscordRaw(payload);
            if (!res.ok) {
                await sleep(1000);
                res = await sendToDiscordRaw(payload);
            }
            if (!res.ok) {
                allOk = false;
                if (!firstErrReason) {
                    firstErrReason = res.reason || 'unknown';
                    firstErrDetail = res.detail || '';
                }
                // ★再帰防止のため LOG_BUFFER_AM に直接 push(logAm を呼ばない)
                try {
                    const errEntry = {
                        ts: _formatTs(new Date()),
                        perfMs: perfNow(),
                        level: 'error',
                        category: 'discord-send',
                        message: `Discord 送信失敗 ${firstErrReason}`,
                        detail: { title, chunk: i + 1, total: totalChunks, errDetail: firstErrDetail },
                    };
                    LOG_BUFFER_AM.push(errEntry);
                    if (LOG_BUFFER_AM.length > LOG_MAX_AM) LOG_BUFFER_AM.shift();
                    saveLogAm();
                } catch (e) {}
                break;
            }
            if (i < totalChunks - 1) await sleep(500);
        }
        return allOk;
    };

    // ts 整形ヘルパー(複数箇所で使うため共通化)
    const _formatTs = (t) => {
        return String(t.getHours()).padStart(2,'0') + ':' +
               String(t.getMinutes()).padStart(2,'0') + ':' +
               String(t.getSeconds()).padStart(2,'0') + '.' +
               String(t.getMilliseconds()).padStart(3,'0');
    };

    // ★v0.1.16.9: 自動 Discord push を撤廃(HIRO 要望「ログはまとめて送りたい」)
    //   全ログは localStorage バッファに蓄積のみ。
    //   📨 Discord ボタン押下時にまとめて送信する従来仕様に統一。
    //   レベル(error/warn/info)はバッファ内の filter / 統計用に保持。
    const LOG_COLOR_MAP = {
        error: 13959168, // red
        warn:  15893760, // orange/yellow
        info:  3447003,  // blue
    };
    const logAm = (level, category, message, detail) => {
        const t = new Date();
        const ts = _formatTs(t);
        const entry = { ts, perfMs: perfNow(), level, category, message, detail: detail || null };
        LOG_BUFFER_AM.push(entry);
        if (LOG_BUFFER_AM.length > LOG_MAX_AM) LOG_BUFFER_AM.shift();
        saveLogAm();
        // ★v0.3.8.76: 重要タグは別バッファにも永続保持 (shift() 影響を受けない)
        try {
            if (CRITICAL_TAGS.has(category) || level === 'error' || level === 'warn') {
                LOG_BUFFER_AM_CRITICAL.push(entry);
                if (LOG_BUFFER_AM_CRITICAL.length > LOG_MAX_AM_CRITICAL) LOG_BUFFER_AM_CRITICAL.shift();
                saveLogAmCritical();
            }
        } catch (e) {}
        try { console.log(`[GBOT-AM] ${ts} +${entry.perfMs}ms ${level} ${category}: ${message}`, detail || ''); } catch (e) {}
    };

    // button の完全な DOM 情報を抽出(Discord 詳細ログ用)
    const dumpButtonInfo = (btn) => {
        if (!btn) return '(null)';
        try {
            const r = btn.getBoundingClientRect();
            const form = btn.closest && btn.closest('form');
            const formInfo = form ? `form#${form.id || '?'} action=${(form.action||'').slice(-80)} method=${form.method}` : 'no form';
            const reactKey = Object.keys(btn).find(k => k.startsWith('__reactProps$'));
            const reactProps = reactKey && btn[reactKey] ? Object.keys(btn[reactKey]).join(',') : 'no react';
            return JSON.stringify({
                tag: btn.tagName,
                id: btn.id || null,
                name: btn.name || null,
                type: btn.type || null,
                value: (btn.value || '').slice(0, 50),
                text: (btn.innerText || '').trim().slice(0, 50),
                ariaLabel: btn.getAttribute('aria-label'),
                role: btn.getAttribute('role'),
                className: (btn.className || '').slice(0, 100),
                disabled: btn.disabled,
                ariaDisabled: btn.getAttribute('aria-disabled'),
                parent: btn.parentElement ? btn.parentElement.tagName + '#' + (btn.parentElement.id || '?') : '?',
                form: formInfo,
                reactProps: reactProps,
                rect: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`,
                visible: r.width > 0 && r.height > 0,
            }, null, 2);
        } catch (e) {
            return 'error: ' + e.message;
        }
    };

    // ★v0.3.8.3: toast 関数を CSS 委譲化
    //   インラインスタイル (Object.assign) を廃止し、class + CSS 変数で制御。
    //   背景・フォント・border は CSS 側 (.lb-am-toast) で TRANS-AM 統一スタイル。
    //   color 引数はアクセント色のみ、CSS 変数 --toast-accent で渡す。
    // ★v0.3.8.56: HIRO 指摘「通常時ピンクに見える」対応:
    //   color 未指定時はパネル状態に応じて動的に色決定。
    // ★v0.3.8.58: HIRO 再指摘「通常時の文字色ピンクのまま」対応:
    //   文字色 (CSS color) もインラインで動的設定する。
    //     - 通常時: #b8d8e8 (ステータス通常時と完全一致 = 淡シアン)
    //     - TA時:   #ff80d8 (ステータス TA時と完全一致 = ビビッドピンク)
    //   CSS の継承や他ルールの干渉を確実に上書きするため style.color も指定。
    //   BUY_GREEN/STOP_RED/その他明示色は引数指定で従来通り。
    const toast = (msg, color, duration = 4000) => {
        try {
            const tArea = ensureToastPanel();
            if (!tArea) return;
            // ★v0.3.8.60: 状態判定を mode + TRANS-AM フラグ直接参照に変更
            //   HIRO 報告 (2026-05-18 22:35 スクショ): 「⏸ 一時停止しました」 toast が
            //   ピンク表示されていた。原因は判定タイミング:
            //     opPause() → toast() → updatePanelButtons() の順なので、
            //     toast() 呼出時はまだ is-transam クラスが前状態 (RUNNING 中) のまま。
            //   対策: classList ではなく現在の mode + TRANS-AM フラグを直接判定。
            //     - mode === RUNNING かつ TRANS-AM フラグ ON → TA 色 (ピンク)
            //     - それ以外 (STOPPED / PAUSED / 通常 RUNNING) → 通常色 (シアン)
            let isTa = false;
            try {
                const mode = S.getMode && S.getMode();
                const transAmFlag = S.isTransAmMode && S.isTransAmMode();
                isTa = (mode === MODE_RUNNING) && !!transAmFlag;
            } catch (e) {}
            // 枠線色 (accent) - 未指定時のみ動的決定
            const accentColor = color || (isTa ? '#c41e9e' : '#5dd5e5');
            // 文字色 - 状態で決定
            // ★v0.3.8.61: 通常時は彩度高い純シアン #5dd5e5 に変更
            //   (マゼンタ背景上の補色対比でピンク錯視を起こさないように)
            const textColor = isTa ? '#ff80d8' : '#5dd5e5';
            // 文字光彩 (text-shadow) も状態で変更 (CSS と同期)
            const textShadow = isTa
                ? '0 0 4px rgba(196,30,158,0.55), 0 0 10px rgba(255,77,201,0.35), 0 1px 2px rgba(0,0,0,0.85)'
                : '0 0 4px rgba(93,213,229,0.55), 0 0 10px rgba(123,184,216,0.35), 0 1px 2px rgba(0,0,0,0.85)';
            const div = document.createElement('div');
            div.textContent = msg;
            div.className = 'lb-am-toast';
            try { div.style.setProperty('--toast-accent', accentColor); } catch (e) {}
            try { div.style.color = textColor; } catch (e) {}
            try { div.style.textShadow = textShadow; } catch (e) {}
            tArea.appendChild(div);
            // ★v0.2.0: 履歴件数 2 件(LITE 概念削除、軽量を標準化)
            const limit = 2;
            while (tArea.children.length > limit) tArea.removeChild(tArea.firstChild);
            try { tArea.scrollTop = tArea.scrollHeight; } catch (e) {}
            setTimeout(() => { try { div.remove(); } catch (e) {} }, duration);
        } catch (e) {}
    };

    // 駿河屋・楽天と区別するための Amazon ブランドカラー
    //   バッジ: Amazon濃紺 #232f3e + 黄色文字 #febd69
    //   ⚙設定: Amazon オレンジ #ff9900
    //   開始ボタン色: 緑 #2e7d32(統一・HIROの慣れ)
    //   停止: 赤 #d32f2f(国際標準)
    const AMAZON_NAVY   = '#232f3e';
    const AMAZON_YELLOW = '#febd69';
    const AMAZON_ORANGE = '#ff9900';
    const STOP_RED      = '#d32f2f';
    const BUY_GREEN     = '#2e7d32';
    // ★v0.3.8: Celestial Being 紋章 PNG (128x128, パネル右下に控えめ表示用 base64 埋め込み)
    const CB_LOGO_DATA_URL = 'data:image/png;base64,' +
        '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' +
        'naw74P8M/T8Bc1u5NTRcDwAAAABJRU5ErkJggg==';

    // ★v0.3.8.23: 通常モード用 HUD 風透かし (SVG インライン data URL)
    //   FNS INSTRUMENT MENU 風のレーダー + メニューボックス HUD を SVG で自作。
    //   HIRO 環境 (iPhone Safari) でレンダリング可能、base64 不要、軽量。
    //   色: HUD グレー + 淡シアンで「稼働中」感を演出。
    const HUD_WATERMARK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">' +
        '<defs>' +
            '<style>' +
                '.hl{stroke:#7bb8d8;stroke-width:1;fill:none;opacity:0.85}' +
                '.hd{stroke:#a8c4d4;stroke-width:0.6;fill:none;opacity:0.55}' +
                '.hb{fill:none;stroke:#5dd5e5;stroke-width:1.2;opacity:0.7}' +
                '.htxt{fill:#a8c8d8;font-family:monospace;font-size:7px;opacity:0.7;letter-spacing:1.5px}' +
                '.htxt-sm{fill:#7bb8d8;font-family:monospace;font-size:5px;opacity:0.6;letter-spacing:1px}' +
                '.hbox{fill:none;stroke:#7bb8d8;stroke-width:0.8;opacity:0.55}' +
                '.hbg{fill:#0a1218;opacity:0.4}' +
            '</style>' +
        '</defs>' +
        '<rect class="hbg" x="0" y="0" width="400" height="300"/>' +
        '<rect class="hb" x="6" y="6" width="388" height="288"/>' +
        '<text class="htxt" x="60" y="18">DEP 387.2</text>' +
        '<text class="htxt" x="180" y="18">DCPL</text>' +
        '<text class="htxt" x="320" y="18">CNTL 1390</text>' +
        '<rect class="hbox" x="14" y="32" width="58" height="38"/>' +
        '<text class="htxt-sm" x="32" y="46">MFD</text>' +
        '<text class="htxt-sm" x="22" y="60">CFG</text>' +
        '<rect class="hbox" x="14" y="76" width="58" height="38"/>' +
        '<text class="htxt-sm" x="22" y="90">FIELD CAM</text>' +
        '<text class="htxt-sm" x="22" y="104">DATA XFER</text>' +
        '<rect class="hbox" x="14" y="120" width="58" height="38"/>' +
        '<text class="htxt-sm" x="32" y="134">FOV</text>' +
        '<text class="htxt-sm" x="22" y="148">CUSTOMER</text>' +
        '<rect class="hbox" x="14" y="164" width="58" height="38"/>' +
        '<text class="htxt-sm" x="30" y="178">TIALD</text>' +
        '<text class="htxt-sm" x="24" y="192">ORDERS</text>' +
        '<rect class="hbox" x="14" y="208" width="58" height="38"/>' +
        '<text class="htxt-sm" x="32" y="222">QFT</text>' +
        '<text class="htxt-sm" x="22" y="236">PURCHASE</text>' +
        '<rect class="hbox" x="14" y="252" width="58" height="38"/>' +
        '<text class="htxt-sm" x="32" y="266">LAS</text>' +
        '<rect class="hbox" x="328" y="32" width="58" height="38"/>' +
        '<text class="htxt-sm" x="346" y="46">MAP</text>' +
        '<rect class="hbox" x="328" y="76" width="58" height="38"/>' +
        '<text class="htxt-sm" x="350" y="90">M+</text>' +
        '<text class="htxt-sm" x="336" y="104">ROUTES</text>' +
        '<rect class="hbox" x="328" y="120" width="58" height="38"/>' +
        '<text class="htxt-sm" x="346" y="134">WAY</text>' +
        '<text class="htxt-sm" x="334" y="148">INVENTORY</text>' +
        '<rect class="hbox" x="328" y="164" width="58" height="38"/>' +
        '<text class="htxt-sm" x="346" y="178">TAR</text>' +
        '<text class="htxt-sm" x="336" y="192">LEVEL</text>' +
        '<rect class="hbox" x="328" y="208" width="58" height="38"/>' +
        '<text class="htxt-sm" x="346" y="222">TLD</text>' +
        '<text class="htxt-sm" x="334" y="236">OPTIONS</text>' +
        '<rect class="hbox" x="328" y="252" width="58" height="38"/>' +
        '<text class="htxt-sm" x="346" y="266">HDR</text>' +
        '<g transform="translate(200,160)">' +
            '<circle class="hl" cx="0" cy="0" r="100"/>' +
            '<ellipse class="hd" cx="0" cy="0" rx="100" ry="35"/>' +
            '<ellipse class="hd" cx="0" cy="0" rx="35" ry="100"/>' +
            '<line class="hd" x1="-100" y1="0" x2="100" y2="0"/>' +
            '<line class="hd" x1="0" y1="-100" x2="0" y2="100"/>' +
            '<rect class="hd" x="-2" y="-2" width="4" height="4"/>' +
            '<rect class="hd" x="-52" y="-2" width="4" height="4"/>' +
            '<rect class="hd" x="48" y="-2" width="4" height="4"/>' +
            '<rect class="hd" x="-2" y="-52" width="4" height="4"/>' +
            '<rect class="hd" x="-2" y="48" width="4" height="4"/>' +
            '<path class="hl" d="M -100 -8 L -95 -8 M -100 8 L -95 8 M 95 -8 L 100 -8 M 95 8 L 100 8"/>' +
        '</g>' +
        '<text class="htxt" x="155" y="290">FNS INSTRUMENT MENU</text>' +
        '<text class="htxt-sm" x="84" y="290">STEUP</text>' +
        '<text class="htxt-sm" x="280" y="290">SMS</text>' +
        '<text class="htxt-sm" x="318" y="290">HSO</text>' +
        '<text class="htxt-sm" x="350" y="290">TEST</text>' +
        '</svg>';
    const HUD_WATERMARK_DATA_URL = 'data:image/svg+xml;utf8,' + encodeURIComponent(HUD_WATERMARK_SVG);

    // ★v0.3.8.23: TRANS-AM 用 HUD 透かし (マゼンタ + ソレスタルビーイング風エンブレム)
    //   HIRO 要望: 通常モードの HUD と同じレイアウトでマゼンタ配色 → 切り替え時に
    //   「同じ HUD が色だけ変わる」滑らかな視覚演出。
    //   中央エンブレムは Celestial Being 風の翼+地球儀の簡略版。
    const TRANS_AM_HUD_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">' +
        '<defs>' +
            '<style>' +
                '.tl{stroke:#ff77c9;stroke-width:1;fill:none;opacity:0.92}' +
                '.td{stroke:#ffb6e8;stroke-width:0.6;fill:none;opacity:0.7}' +
                '.tb{fill:none;stroke:#ff2eb0;stroke-width:1.2;opacity:0.85}' +
                '.ttxt{fill:#ffc8ee;font-family:monospace;font-size:7px;opacity:0.8;letter-spacing:1.5px}' +
                '.ttxt-sm{fill:#ff77c9;font-family:monospace;font-size:5px;opacity:0.7;letter-spacing:1px}' +
                '.tbox{fill:none;stroke:#ff77c9;stroke-width:0.8;opacity:0.62}' +
                '.tbg{fill:#1a0612;opacity:0.45}' +
                '.tem{fill:#ffe0f3;opacity:0.92}' +
                '.tem2{fill:#ff8fd0;opacity:0.85}' +
                '.tname{fill:#ffe0f3;font-family:sans-serif;font-size:18px;font-weight:900;letter-spacing:2.5px;opacity:0.95}' +
                '.tsub{fill:#ffb6e8;font-family:sans-serif;font-size:5px;letter-spacing:2px;opacity:0.85}' +
            '</style>' +
        '</defs>' +
        '<rect class="tbg" x="0" y="0" width="400" height="300"/>' +
        '<rect class="tb" x="6" y="6" width="388" height="288"/>' +
        '<text class="ttxt" x="60" y="18">DEP 387.2</text>' +
        '<text class="ttxt" x="180" y="18">DCPL</text>' +
        '<text class="ttxt" x="320" y="18">CNTL 1390</text>' +
        '<rect class="tbox" x="14" y="32" width="58" height="38"/>' +
        '<text class="ttxt-sm" x="32" y="46">MFD</text>' +
        '<rect class="tbox" x="14" y="76" width="58" height="38"/>' +
        '<text class="ttxt-sm" x="22" y="90">FIELD CAM</text>' +
        '<rect class="tbox" x="14" y="120" width="58" height="38"/>' +
        '<text class="ttxt-sm" x="32" y="134">FOV</text>' +
        '<rect class="tbox" x="14" y="164" width="58" height="38"/>' +
        '<text class="ttxt-sm" x="30" y="178">TIALD</text>' +
        '<rect class="tbox" x="14" y="208" width="58" height="38"/>' +
        '<text class="ttxt-sm" x="32" y="222">QFT</text>' +
        '<rect class="tbox" x="14" y="252" width="58" height="38"/>' +
        '<text class="ttxt-sm" x="32" y="266">LAS</text>' +
        '<rect class="tbox" x="328" y="32" width="58" height="38"/>' +
        '<text class="ttxt-sm" x="346" y="46">MAP</text>' +
        '<rect class="tbox" x="328" y="76" width="58" height="38"/>' +
        '<text class="ttxt-sm" x="350" y="90">M+</text>' +
        '<rect class="tbox" x="328" y="120" width="58" height="38"/>' +
        '<text class="ttxt-sm" x="346" y="134">WAY</text>' +
        '<rect class="tbox" x="328" y="164" width="58" height="38"/>' +
        '<text class="ttxt-sm" x="346" y="178">TAR</text>' +
        '<rect class="tbox" x="328" y="208" width="58" height="38"/>' +
        '<text class="ttxt-sm" x="346" y="222">TLD</text>' +
        '<rect class="tbox" x="328" y="252" width="58" height="38"/>' +
        '<text class="ttxt-sm" x="346" y="266">HDR</text>' +
        '<g transform="translate(200,160)">' +
            '<circle class="tl" cx="0" cy="0" r="100"/>' +
            '<ellipse class="td" cx="0" cy="0" rx="100" ry="35"/>' +
            '<ellipse class="td" cx="0" cy="0" rx="35" ry="100"/>' +
            '<line class="td" x1="-100" y1="0" x2="100" y2="0"/>' +
            '<line class="td" x1="0" y1="-100" x2="0" y2="100"/>' +
            '<circle class="td" cx="0" cy="0" r="68"/>' +
            '<rect class="tl" x="-104" y="-3" width="8" height="6"/>' +
            '<rect class="tl" x="96" y="-3" width="8" height="6"/>' +
            '<rect class="tl" x="-3" y="-104" width="6" height="8"/>' +
            '<rect class="tl" x="-3" y="96" width="6" height="8"/>' +
            '<path class="tem" d="M -55 -30 L -10 -10 L -10 0 Z"/>' +
            '<path class="tem" d="M 55 -30 L 10 -10 L 10 0 Z"/>' +
            '<path class="tem2" d="M -42 -22 L -14 -8 L -14 -3 Z"/>' +
            '<path class="tem2" d="M 42 -22 L 14 -8 L 14 -3 Z"/>' +
            '<circle class="tem" cx="0" cy="-28" r="6" fill="none" stroke="#ffe0f3" stroke-width="2"/>' +
            '<path class="tem" d="M -2 -22 L -2 48 L 2 48 L 2 -22 Z"/>' +
        '</g>' +
        '<text class="tname" x="118" y="158">TRANS-AM</text>' +
        '<text class="tsub" x="170" y="170">SYSTEM</text>' +
        '<text class="tsub" x="156" y="180">MODE ACT MAX</text>' +
        '<text class="ttxt" x="148" y="290">FNS INSTRUMENT MENU</text>' +
        '</svg>';
    const TRANS_AM_HUD_DATA_URL = 'data:image/svg+xml;utf8,' + encodeURIComponent(TRANS_AM_HUD_SVG);

    // ★v0.3.8.2: TRANS-AM 透かし画像 (200x200 JPG, base64 10,712 文字)
    //   パネル背景に半透明配置 (panel::after, opacity 0.22, screen blend)
    //   CSS 変数 --ta-watermark-url 経由で設定 (巨大な base64 をテキストに直書きせず)
    const TRANS_AM_BG_DATA_URL = 'data:image/jpeg;base64,' +
        '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';


    // ★v0.3.0(HIRO 設計): 「他に何か必要ですか?」画面のテキストベース判定
    //   URL では判定不可(Amazon側でパスが揺れる、A/B テスト等)
    //   3条件 AND で誤検出防止:
    //     ①見出し or 全文に「他に何か必要ですか」
    //     ②「レジに進む」visible(完全一致)
    //     ③「カートに戻る」visible(完全一致)
    //   3つ全部揃った時だけ ADDON_UPSELL と判定する(CART 画面と区別)
    const detectAddOnUpsellByText = () => {
        // ★v0.3.4 [優先 1]: URL パスベース判定
        //   /checkout/byg/ は「他に何か必要ですか?」画面で一意
        //   experienceType (ssdCarousel ほか) に依存しない
        try {
            if (/^\/checkout\/byg\//.test(location.pathname)) return true;
        } catch (e) {}

        // ★v0.3.4 [優先 2]: テキスト + ID ベース (フォールバック)
        //   v0.3.3 の 3 条件 AND を緩和: 「カートに戻る」必須要件を撤廃
        try {
            let hasHeader = false;
            const headerEls = document.querySelectorAll('h1, h2, h3, h4');
            for (const h of headerEls) {
                if (/他に何か必要ですか/.test(h.textContent || '')) {
                    hasHeader = true; break;
                }
            }
            if (!hasHeader) {
                const txt = (document.body && document.body.innerText) || '';
                if (/他に何か必要ですか/.test(txt)) hasHeader = true;
            }
            if (!hasHeader) return false;

            // byg 系の「レジに進む」ボタンが visible に存在
            const bygBtn = document.querySelector('#checkout-byg-ptc-button, .byg-ptc');
            if (bygBtn && isElementVisible(bygBtn)) return true;

            // 保険: テキストベースで visible な「レジに進む」完全一致
            const allBtns = document.querySelectorAll(
                'button, input[type="submit"], a, [role="button"], span'
            );
            for (const el of allBtns) {
                const t = (el.innerText || el.textContent || el.value || '').trim();
                if (!t) continue;
                if (/^レジに進む\s*$/.test(t) && isElementVisible(el)) return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    };

    const detectScreen = () => {
        const path = location.pathname;
        const search = location.search || '';
        // ★v0.1.16.13: 「カート追加失敗」エラーを最優先で検出(path 関係なく全画面で)
        if (isCartAddFailed()) return 'CART_ADD_FAIL';
        // ★v0.3.0(HIRO 設計): 「他に何か必要?」画面を CART より先に判定
        //   URL では判定不可 → テキストベース
        if (detectAddOnUpsellByText()) return 'ADDON_UPSELL';
        // ★v0.2.2: 商品ページ判定にモバイル版 /gp/aw/d/<ASIN> を追加
        //   HIRO 環境(iPhone Safari、カート画像/再購入リスト経由)で /gp/aw/d/ URL に飛ぶ
        const isProductPath =
            path.startsWith('/dp/') || path.includes('/dp/') ||
            path.startsWith('/gp/product/') ||
            path.startsWith('/gp/aw/d/');  // ★モバイル appstore-web
        if (isProductPath && /[?&]aod=1\b/.test(search)) return 'PRODUCT_AOD';
        if (isProductPath) return 'PRODUCT';
        if (path.startsWith('/cart/smart-wagon')) return 'SMART_WAGON';
        // ★v0.1.9.2/v0.2.2: カート判定(モバイル /gp/aw/c も追加)
        if (path === '/gp/cart/view.html' || path.startsWith('/gp/cart/view.html')) return 'CART';
        if (path === '/gp/aw/c' || path.startsWith('/gp/aw/c')) return 'CART';  // ★モバイルカート
        if (path === '/cart' || path === '/cart/' || (path.startsWith('/cart/') && !path.startsWith('/cart/smart-wagon'))) return 'CART';
        if (path.startsWith('/checkout/p/') && path.includes('/spc')) return 'CHECKOUT';
        // ★v0.3.8.81: Amazon 混雑待機室 (リストック殺到時の整理券ページ)
        //   HIRO 報告 2026-05-26: GP02 リストックで「変なゲージ + トラフィック」画面に着地
        //   旧 v0.3.8.80 までは screen=OTHER 扱いで bot が何もしなかった
        //   新: 'WAITING_ROOM' で認識し、handleWaitingRoom で順番待ち
        if (path.startsWith('/checkout/entry/waiting')) return 'WAITING_ROOM';
        // ★v0.1.11.2: 在庫切れ Express Checkout 画面(数量0、「次に進む」「削除する」が出る危険画面)
        //   HIRO 指摘 2026-05-09: 「ボタン押すと別ページに行くから注意」「ループで元に戻したい」
        if (path.startsWith('/checkout/entry/buynow') ||
            path.startsWith('/checkout/entry/cart') ||
            path.startsWith('/checkout/entry/oos') ||  // ★v0.3.8.45: 在庫切れ専用ページ (Out Of Stock)
            path.startsWith('/gp/buy/spc/handlers/buy-now-checkout')) return 'STOCK_OUT_BUYNOW';
        if (path.startsWith('/gp/buy/thankyou/')) return 'COMPLETE';
        if (path.startsWith('/ap/signin')) return 'SIGNIN';
        // ★v0.3.8.22: Amazon の汎用エラー画面 (TRANS-AM 連投で踏むことがある)
        //   /errors/500   = 「ご迷惑をおかけしています!」(500 系)
        //   /errors/4xx 等もまとめて拾う
        //   /ref=cs_503_link = 503 リダイレクト
        if (path.startsWith('/errors/') ||
            path.includes('cs_503_link') ||
            path === '/ref=cs_503_link/' ||
            path.startsWith('/ref=cs_')) return 'AMAZON_ERROR';
        return 'OTHER';
    };

    // ★v0.1.12.0: 個別ボタン関数は統合パネルに集約済み → 統合パネル作成だけ呼ぶ
    const renderStopButton = () => { ensurePanel(); };
    const renderSettingsButton = () => { ensurePanel(); };

    // ★v0.1.15.2: renderVersionBadge は renderVersionBadgeSafe に置き換え(差分更新最適化)
    //   毎回 textContent 書き換えると Safari が再描画する。
    //   差分があった時だけ書き換える方式に変更 → スクロール時のフリッカー減
    // ★v0.2.0: バッジ表示を MODE 対応に
    let _lastBadgeText = '';
    let _lastBadgeMode = '';
    const renderVersionBadgeSafe = () => {
        try {
            ensurePanel();
            const badge = document.getElementById('lb-am-panel-status');
            if (!badge) return;
            try { const old = document.getElementById('lb-am-version-badge'); if (old) old.remove(); } catch (e) {}

            const profile = CONFIG.profileName || '(no profile)';
            const mode = S.getMode();
            const session = S.getSession();
            // ★v0.3.8.16: TRANS-AM モード時は「⚡ TRANS-AM 発動中」を最優先表示
            const isTransAm = S.isTransAmMode();
            const modeIcon = (mode === MODE_RUNNING && isTransAm) ? '⚡ TRANS-AM 発動中' :
                             (mode === MODE_RUNNING) ? '▶監視中' :
                             (mode === MODE_PAUSED && isTransAm) ? '⏸一時停止 ⚡ TRANS-AM' :
                             (mode === MODE_PAUSED)  ? '⏸一時停止' : '⛔停止';
            const screen = detectScreen();
            let detectLine = '';
            if (screen === 'PRODUCT' || screen === 'PRODUCT_AOD') {
                const bn = findBuyNowButton();
                const ac = findAddToCartButton();
                const bnDesc = bn ? `OK[${bn.id || bn.name || bn.tagName}]` : 'NG';
                const acDesc = ac ? `OK[${ac.id || ac.name || ac.tagName}]` : 'NG';
                const forced = isUrlForcedAmazon() ? '🟢直販URL' : '⚪通常URL';
                detectLine = `\n今すぐ買う:${bnDesc}\nカート:${acDesc}\n${forced}`;
            }
            let reloadLine = '';
            if (session && session.reloadCount > 0) {
                const max = CONFIG.reloadMax;
                reloadLine = `\nリロード:${session.reloadCount}${max > 0 ? '/' + max : '回'}`;
            }
            let stepLine = '';
            const step = S.getStep();
            if (step !== STEP_IDLE) stepLine = `\nstep: ${step}`;

            let text;
            if (!CONFIG.debugMode) {
                text = `v${SCRIPT_VERSION} ${modeIcon}\nprofile: ${profile}\nscreen: ${screen}` + detectLine + reloadLine + stepLine;
            } else {
                const sid = session ? session.sid.slice(0, 6) : '-';
                let pathStr = location.pathname || '';
                try { pathStr = decodeURIComponent(pathStr); } catch (e) {}
                if (pathStr.length > 50) pathStr = '…' + pathStr.slice(-50);
                text = `v${SCRIPT_VERSION} ${modeIcon}\nprofile: ${profile}\nscreen: ${screen}\nsid: ${sid}\npath: ${pathStr}` + detectLine + reloadLine + stepLine;
            }
            if (text !== _lastBadgeText) {
                badge.textContent = text;
                _lastBadgeText = text;
            }
            // ★v0.2.0: モード変化時はボタン表示も同時に切替
            if (mode !== _lastBadgeMode) {
                _lastBadgeMode = mode;
                try { updatePanelButtons(); } catch (e) {}
            }
        } catch (e) {}
    };

    // ★v0.3.8.3: setInterval ID を保存して、完全停止時に clearInterval できるように
    let _badgeUpdateIntervalId = null;
    let _modeWatchIntervalId = null;
    const startBadgeUpdater = () => {
        renderVersionBadgeSafe();
        // ★v0.2.0: 1500ms 周期(LITE 概念削除、電池消費とのバランス)
        if (_badgeUpdateIntervalId) clearInterval(_badgeUpdateIntervalId);
        _badgeUpdateIntervalId = setInterval(renderVersionBadgeSafe, 1500);
    };

    // ★v0.1.12.0: 開始ボタンは統合パネル(下部)に集約済み
    const renderStartButton = () => { ensurePanel(); };

    // ───────────────────────────────────────────────
    // タイマー機能(v0.2.0: S.* 経由で v2 化)
    // ───────────────────────────────────────────────
    const isTimerFired   = () => S.isTimerFired();
    const markTimerFired = () => S.markTimerFired();
    const clearTimerFired= () => S.clearTimerFired();

    const computeTimerTargetMs = () => {
        if (!CONFIG.timerEnabled || !CONFIG.timerHHMM) return null;
        const m = CONFIG.timerHHMM.match(/^(\d{1,2}):(\d{1,2})$/);
        if (!m) return null;
        const hh = parseInt(m[1], 10);
        const mm = parseInt(m[2], 10);
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
        const now = new Date();
        const target = new Date(now);
        target.setHours(hh, mm, 0, 0);
        if (target.getTime() <= now.getTime()) return null;
        return target.getTime();
    };

    let timerCheckIntervalId = null;
    let timerCountdownIntervalId = null;

    const formatRemain = (sec) => {
        if (sec < 0) sec = 0;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${m}:${String(s).padStart(2, '0')}`;
    };

    const updateTimerBadge = (targetMs) => {
        ensurePanel();
        const badge = document.getElementById('lb-am-panel-status');
        if (!badge) return;
        const remainSec = Math.floor((targetMs - Date.now()) / 1000);
        const stop = isStopped() ? '⛔停止中' : '▶監視中';
        badge.textContent =
            `v${SCRIPT_VERSION} ${stop}\n` +
            `state: ${getState() || 'idle'}\n` +
            `⏰ ${CONFIG.timerHHMM} (あと ${formatRemain(remainSec)})`;
    };

    // ★v0.2.0: タイマー発火 = 新規セッション開始 + リロード
    //   PAUSED 中なら発火しない(明示的に意図しない動作を避ける)
    const fireTimer = () => {
        if (S.isFullyStopped() || S.isPaused()) {
            try { logAm('info', 'timer', `タイマー時刻到達したが ${S.getMode()} 中なので発火スキップ`); } catch (e) {}
            return;
        }
        if (S.isTimerFired()) return;
        S.markTimerFired();
        try {
            logAm('warn', 'timer', `🔔 タイマー発火 ${CONFIG.timerHHMM}`, {
                hhmm: CONFIG.timerHHMM, url: location.href.slice(0, 200),
            });
        } catch (e) {}
        toast(`🔔 タイマー発火! ${CONFIG.timerHHMM}\n新規セッション開始 → リロード`, BUY_GREEN, 4000);
        // ★v0.2.0: 新規セッション開始(reloadCount=0 から)
        S.opStart(location.href);
        setTimeout(() => {
            if (S.shouldHalt()) return;
            location.reload();
        }, 500);
    };

    const startTimer = () => {
        if (!CONFIG.timerEnabled) return;
        if (isStopped()) return;
        if (isTimerFired()) {
            toast('⏰ タイマーは既に発火済み(再発火しません)', '#7b1fa2', 4000);
            return;
        }
        const targetMs = computeTimerTargetMs();
        if (targetMs === null) {
            toast(`⏰ タイマー設定時刻(${CONFIG.timerHHMM})は既に過ぎています\n発火しません`, STOP_RED, 6000);
            return;
        }
        const remainSec = Math.floor((targetMs - Date.now()) / 1000);
        toast(`⏰ タイマー作動中: ${CONFIG.timerHHMM} 発火予定(あと ${formatRemain(remainSec)})`, '#7b1fa2', 5000);

        if (timerCountdownIntervalId) clearInterval(timerCountdownIntervalId);
        timerCountdownIntervalId = setInterval(() => updateTimerBadge(targetMs), 1000);
        updateTimerBadge(targetMs);

        if (timerCheckIntervalId) clearInterval(timerCheckIntervalId);
        timerCheckIntervalId = setInterval(() => {
            if (isStopped() || isTimerFired()) {
                clearInterval(timerCheckIntervalId);
                clearInterval(timerCountdownIntervalId);
                return;
            }
            if (Date.now() >= targetMs) {
                clearInterval(timerCheckIntervalId);
                clearInterval(timerCountdownIntervalId);
                fireTimer();
            }
        }, 250);
    };

    // ───────────────────────────────────────────────
    // リロード待機(楽天 v2.9.19 / 駿河屋 v0.3.5 と同等)
    //   HIRO 仕様(2026-05-07): reloadInterval=1000ms デフォルト(なるべく早く)
    // ───────────────────────────────────────────────
    // ════════ 複数商品の巡回(PC版・iOSには無い機能) ════════
    //   在庫切れ時に「同じ商品を再読込」する代わりに「次の登録商品へ移動」して順に巡る。
    //   登録商品(listSavedProducts)を /dp/asin?m= の商品ページとして巡回し、各商品で
    //   Buy Box / AOD で在庫検出 → 在庫があれば購入。OFFなら従来どおり1商品リロード。
    //   ON/OFF は localStorage('LB_AM_ROT_ON')。パネルの「🔄 巡回購入」ボタンで切替。
    const ROT_ON_KEY = 'LB_AM_ROT_ON';
    const ROT_IDX_KEY = 'LB_AM_ROT_IDX';
    const isRotationOn = () => {
        try { return localStorage.getItem(ROT_ON_KEY) === '1'; } catch (e) { return false; }
    };
    const rotateNextUrl = () => {
        // 巡回ONかつ登録2件以上なら「次の登録商品」へ移動。★TRANS-AM優先(HIRO仕様):
        //   保存buynow URL(offerListing付き)あり → TRANS-AMモードON + そのURL直撃のみ(AOD不要・最速購入)
        //   URL未取得                          → モードOFF + /dp商品ページ(新規開始でBuyBox/AOD→URL取得)
        // ※購入フロー本体・別商品ガードは無変更。ここでモード切替とセッションproductUrl更新だけ行う。
        try {
            if (!isRotationOn()) return null;
            const list = listSavedProducts();
            if (!list || list.length < 2) return null;
            const curAsin = (typeof extractAsin === 'function') ? (extractAsin(location.pathname) || '') : '';
            let idx = -1;
            if (curAsin) idx = list.findIndex(function (p) { return p.asin === curAsin; });
            if (idx < 0) idx = parseInt(localStorage.getItem(ROT_IDX_KEY) || '0', 10) || 0;
            const nextIdx = (idx + 1) % list.length;
            const next = list[nextIdx];
            try { localStorage.setItem(ROT_IDX_KEY, String(nextIdx)); } catch (e) {}
            if (!next || !next.asin) return null;

            // 次商品が TRANS-AM 可(有効な保存 buynow URL あり)か判定
            let savedUrl = '';
            try { if (hasSavedTransAmUrl(next.asin)) savedUrl = getSavedTransAmUrl(next.asin) || ''; } catch (e) { savedUrl = ''; }

            let targetUrl, transAm;
            if (savedUrl) {
                targetUrl = savedUrl;            // ⚡ buynow 直撃のみ(AOD不要・最速購入)
                transAm = true;
            } else {
                const ts0 = String(Date.now());
                const u = new URL('https://www.amazon.co.jp/dp/' + next.asin);
                u.searchParams.set('m', AMAZON_SELLER_ID);   // Amazon直販をBuy Boxに強制
                u.searchParams.set('_pageRefresh', ts0);
                u.searchParams.set('_sw', ts0);
                targetUrl = u.toString();        // 商品ページ(新規開始で BuyBox/AOD)
                transAm = false;
            }

            // ★巡回でセッションを次商品へ引き継ぐ(購入本体は無変更):
            //   ① モードフラグを次商品に合わせる(opStart/opStartTransAm と同じ規約)
            //   ② 前商品の直販確認済タイムスタンプはクリア(別商品へ持ち越さない)
            //   ③ セッションの productUrl を次商品に更新 → 別商品ガードに引っかからない
            try {
                if (transAm) localStorage.setItem('LB_AM_TRANS_AM_MODE', '1');
                else localStorage.removeItem('LB_AM_TRANS_AM_MODE');
            } catch (e) {}
            try { localStorage.removeItem('LB_AM_VERIFIED_DIRECT'); } catch (e) {}
            try { S.updateSession({ productUrl: targetUrl }); } catch (e) {}

            try {
                logAm('info', 'rotation',
                    transAm ? '🔄⚡ 次の商品へ巡回(TRANS-AM直撃)' : '🔄 次の商品へ巡回(新規開始/AOD)',
                    { nextAsin: next.asin, idx: nextIdx, total: list.length, transAm: transAm });
            } catch (e) {}
            return targetUrl;
        } catch (e) { return null; }
    };

    const scheduleReloadForWait = (reason) => {
        // ★v0.2.0: shouldHalt() 入口ガード
        if (S.shouldHalt()) {
            try { logAm('info', 'reload', 'halt 状態でリロード要求 → 無視', { reason, mode: S.getMode() }); } catch (e) {}
            return;
        }

        const interval = CONFIG.reloadInterval;
        const max      = CONFIG.reloadMax;  // 0 = 無制限

        // ★v0.2.0: SESSION から reloadCount 取得
        const session = S.getSession();
        if (!session) {
            try { logAm('warn', 'reload', 'セッションなし → 完全停止'); } catch (e) {}
            S.opFullStop();
            return;
        }
        let count = session.reloadCount || 0;

        if (max > 0 && count >= max) {
            try {
                logAm('warn', 'reload-limit', `${max}回リロード上限到達 → 一時停止(再開可)`, {
                    reason: reason, max: max, count: count,
                });
            } catch (e) {}
            toast(`❌ ${max}回リロードしても${reason}\n一時停止します(▶再開で続行可)`, STOP_RED, 10000);
            // ★v0.2.0: 完全停止ではなく一時停止(HIROさんが▶再開できるように)
            S.opPause();
            return;
        }

        count = S.incrementReloadCount();

        // ★v0.1.16.2: リロード間隔ランダム化(±30%)
        // ★v0.3.8.70 撤回: 一旦 ±50% にしたが、HIRO「現状フローはそのまま」指示で
        //   ±30% に戻す。BOT 検知対策は humanReactionDelay + ヒッカップで担保。
        const jitter = Math.floor((Math.random() - 0.5) * 0.6 * interval);
        const actualInterval = Math.max(300, interval + jitter);

        const limitMsg = max > 0 ? `(${count}/${max})` : `(${count}回目・無制限)`;
        try {
            logAm('info', 'reload', `${reason} #${count}${max > 0 ? '/' + max : ''}`, {
                reason: reason, count: count, max: max, intervalMs: actualInterval,
            });
        } catch (e) {}
        toast(`⏳ ${reason} ${limitMsg}… ${actualInterval}ms 後リロード`,
              '#7b1fa2', Math.max(800, actualInterval - 200));

        setTimeout(() => {
            // ★v0.2.0 最重要: setTimeout 中に HIRO さんが ⏸/🛑 押下したら kill
            if (S.shouldHalt()) {
                try { logAm('info', 'reload', 'リロード直前 halt 検出 → 中止', { reason, mode: S.getMode() }); } catch (e) {}
                return;
            }
            // ★巡回ON:同じ商品の再読込でなく「次の登録商品」へ移動
            try {
                var _rurl = rotateNextUrl();
                if (_rurl) { location.href = _rurl; return; }
            } catch (e) {}
            try {
                const url = new URL(location.href);
                const ts = String(Date.now());
                url.searchParams.set('_pageRefresh', ts);
                url.searchParams.set('_sw', ts);
                if (CONFIG.autoForceAmazon) {
                    url.searchParams.set('m', AMAZON_SELLER_ID);
                }
                url.searchParams.delete('aod');
                location.href = url.toString();
            } catch (e) {
                location.reload();
            }
        }, actualInterval);
    };

    // ───────────────────────────────────────────────
    // v0.1.1: Buy Box の出荷元/販売元判定
    //   実機調査(2026-05-07 B00O869KJE Amazonベーシック単3電池)で確認した構造:
    //     group "出品者、配送、購入オプションの詳細"
    //       ├─ heading "出荷元 / 販売元"
    //       │   └─ link "Amazon.co.jp" href="...nodeId=643004"  ← 直販指紋
    //       ├─ heading "カスタマーサービス"
    //       └─ heading "支払い方法"
    //
    //   AOD パネル(他の出品者一覧)では別構造:
    //     listitem "出荷元" + 値 / listitem "販売元" + 値
    //   → これは v0.1.3 で別関数 findAodAmazonOffer として実装予定。
    //
    //   この関数は商品ページ Buy Box(右側)専用。
    // ───────────────────────────────────────────────
    const detectBuyBoxSeller = () => {
        const result = {
            isDirect:    false,
            sellerText:  '',
            shipperText: '',
            method:      '',
        };

        // ─── 共通: 「出荷元 / 販売元」というラベルの直後にあるテキストを抽出 ───
        //   モバイル版・デスクトップ版で構造が違うが、innerText ベースなら両方で動く。
        //   実機調査(2026-05-07 iPhone Safari)で判明:
        //     - モバイル版: "出荷元 / 販売元" の値はリンクではなく ただのテキスト
        //     - nodeId=643004 リンクはモバイルにない
        //   → DOM 構造ではなく **テキストパターン** で判定する。
        const LABELS = [
            '出荷元 / 販売元',
            '出荷元/販売元',
            '出荷元 ／ 販売元',
            '出荷元／販売元',
            '販売元 / 出荷元',
            '販売元/出荷元',
        ];

        // ラベルの **直後にある最初の意味のある行** を取り出す
        const extractValueAfterLabel = (rootEl) => {
            if (!rootEl) return null;
            const txt = rootEl.innerText || '';
            for (const label of LABELS) {
                let idx = txt.indexOf(label);
                if (idx === -1) continue;
                // ラベル直後を取得
                let after = txt.slice(idx + label.length);
                // 行頭/末尾の空白・コロン・改行を削る
                after = after.replace(/^[\s:：　\t\n\r]+/, '');
                if (!after) continue;
                // 最初の改行までを値とする
                const firstLine = after.split(/[\n\r]/)[0].trim();
                if (firstLine) return { label, value: firstLine };
            }
            return null;
        };

        // ─── パターンB: 「出荷元」「販売元」が別ラベルで出るレイアウト ───
        //   実機調査(2026-05-08 iPhone Safari、Amazon FBA マケプレ商品)で確認:
        //     出荷元    Amazon
        //     販売元    KTストアー【...】
        //   両方が個別ラベルで存在する場合がある(特にマケプレ FBA 商品)。
        //   直販判定: 販売元 が "Amazon.co.jp" で始まる(かつそれ以外は許さない)。
        const extractShipperAndSeller = (rootEl) => {
            if (!rootEl) return null;
            const txt = rootEl.innerText || '';
            // 「出荷元」だけ(後ろに / がない)、と「販売元」だけ
            const shipMatch = txt.match(/(?:^|\n)\s*出荷元(?!\s*[\/／])[:：\s\t　]+([^\n]+)/);
            const sellMatch = txt.match(/(?:^|\n)\s*販売元(?!\s*[\/／])[:：\s\t　]+([^\n]+)/);
            if (!shipMatch && !sellMatch) return null;
            return {
                shipper: (shipMatch?.[1] || '').trim(),
                seller:  (sellMatch?.[1] || '').trim(),
            };
        };

        // 1次: Buy Box 周辺(出品者情報のグループ)で抽出を試みる
        const buyBoxRoots = Array.from(document.querySelectorAll(
            '#tabular-buybox, ' +
            '#merchantInfoFeature_feature_div, ' +
            '#merchant-info, ' +
            '[data-feature-name="merchantInfo"], ' +
            '[offer-display-feature-name*="merchant"], ' +
            '[id*="buybox"]'
        ));

        for (const root of buyBoxRoots) {
            const found = extractValueAfterLabel(root);
            if (found) {
                result.sellerText = found.value.slice(0, 60);
                result.method = `buyBox root (${root.id || root.tagName})`;
                if (/^Amazon\.co\.jp(?:\s|$|[^a-zA-Z])/.test(found.value) && !found.value.includes('マーケットプレイス')) {
                    result.isDirect = true;
                    result.shipperText = 'Amazon.co.jp';
                }
                return result;
            }
        }

        // 2次: ページ本文全体から抽出(モバイル版や予期しないレイアウトで効く)
        //   ただし AOD パネルが開いていると複数ヒットするので、最初のマッチ = Buy Box とみなす。
        const bodyFound = extractValueAfterLabel(document.body);
        if (bodyFound) {
            result.sellerText = bodyFound.value.slice(0, 60);
            result.method = 'body innerText match';
            if (/^Amazon\.co\.jp(?:\s|$|[^a-zA-Z])/.test(bodyFound.value) && !bodyFound.value.includes('マーケットプレイス')) {
                result.isDirect = true;
                result.shipperText = 'Amazon.co.jp';
            }
            return result;
        }

        // 2.5次: パターンB(別ラベル「出荷元」「販売元」)を Buy Box ルートと body 両方で探す
        //   モバイル版の FBA マケプレ商品はこのレイアウト。
        const checkSeparate = (root, methodTag) => {
            const two = extractShipperAndSeller(root);
            if (!two) return false;
            // 販売元が Amazon.co.jp で始まる(末尾以降に他文字なし)= 直販
            const sellerIsAmazon = /^Amazon\.co\.jp(?:\s|$|[^a-zA-Z])/.test(two.seller);
            // 出荷元は "Amazon" or "Amazon.co.jp"(FBA表記は単に "Amazon" のことあり)
            const shipperIsAmazon = /^Amazon(?:\.co\.jp)?(?:\s|$|[^a-zA-Z])/.test(two.shipper);
            result.shipperText = two.shipper.slice(0, 60);
            result.sellerText  = two.seller.slice(0, 60);
            result.method      = `separate labels: ${methodTag}`;
            // 直販判定: 販売元が Amazon.co.jp(★必須) かつ 出荷元も Amazon系
            //   → 出荷元が "Amazon" だけでも、販売元が "Amazon.co.jp" なら直販扱い
            if (sellerIsAmazon && shipperIsAmazon) {
                result.isDirect = true;
            }
            return true;
        };

        for (const root of buyBoxRoots) {
            if (checkSeparate(root, root.id || root.tagName)) return result;
        }
        if (checkSeparate(document.body, 'body')) return result;

        // 3次 fallback: #merchant-info の旧レイアウト文章
        const m = document.querySelector('#merchant-info');
        if (m) {
            const txt = (m.innerText || '').trim();
            if (/Amazon\.co\.jp\s*が\s*販売.*発送/.test(txt)) {
                result.isDirect    = true;
                result.sellerText  = 'Amazon.co.jp';
                result.shipperText = 'Amazon.co.jp';
                result.method      = '#merchant-info legacy text';
            } else if (txt) {
                result.sellerText = txt.slice(0, 60);
                result.method     = '#merchant-info legacy (not direct)';
            }
        }

        return result;
    };

    // ───────────────────────────────────────────────
    // v0.1.2: 「今すぐ買う」優先 click ロジック
    //   Amazon 直販と判定された後に実行する。
    //   CONFIG.buyNowPriority が true(デフォルト)なら #buy-now-button を最優先。
    //   無ければ #add-to-cart-button にフォールバック。
    //
    //   ★ 単発 click のみ(駿河屋 v0.1.6 教訓: 二重押下絶対禁止)
    //   ★ robustClick は使わない(複数イベント発火で AJAX が二重発火する事故防止)
    // ───────────────────────────────────────────────
    const findBuyNowButton = () => {
        // Amazon 標準の #buy-now-button (id 固定)
        const candidates = [
            () => document.querySelector('#buy-now-button'),
            () => document.querySelector('input[name="submit.buy-now"]'),
            () => document.querySelector('button[name="submit.buy-now"]'),
            // モバイルでは .a-button-input 等のラッパが入ることがあるので、id ベースで子も探す
            () => document.querySelector('#buy-now-button .a-button-input'),
            () => document.querySelector('#buyNow_feature_div #buy-now-button'),
        ];
        for (const fn of candidates) {
            try {
                const el = fn();
                if (el && isElementVisible(el)) return el;
            } catch (e) {}
        }
        return null;
    };

    const findAddToCartButton = () => {
        const candidates = [
            () => document.querySelector('#add-to-cart-button'),
            () => document.querySelector('input[name="submit.add-to-cart"]'),
            () => document.querySelector('button[name="submit.add-to-cart"]'),
            () => document.querySelector('#add-to-cart-button .a-button-input'),
        ];
        for (const fn of candidates) {
            try {
                const el = fn();
                if (el && isElementVisible(el)) return el;
            } catch (e) {}
        }
        return null;
    };

    const clickBuyNowOrAddToCart = async () => {
        if (isStopped()) return false;
        const _t0 = Date.now();

        // ★v0.1.16.1: 待機ゼロ — 1 回チェックで出てなければ即 AOD へ
        //   HIRO 指示 2026-05-09: 「秒での勝負、最速で」
        let target = null;
        let label = '';
        if (CONFIG.buyNowPriority) {
            target = findBuyNowButton();
            if (target) label = '今すぐ買う';
            else {
                target = findAddToCartButton();
                if (target) label = 'カートに入れる(buy-now なし)';
            }
        } else {
            target = findAddToCartButton();
            if (target) label = 'カートに入れる';
            else {
                target = findBuyNowButton();
                if (target) label = '今すぐ買う';
            }
        }

        if (!target) {
            // ★v0.3.1: Buy Box ボタンなし → インライン → AOD ページ(?m= 剥がし)
            try {
                logAm('info', 'click-buynow', 'Buy Box ボタンなし → インライン AOD 走査', {
                    elapsedMs: Date.now() - _t0,
                    buyNowPriority: CONFIG.buyNowPriority,
                });
            } catch (e) {}
            toast(`⚡ Buy Box ボタンなし → インライン AOD`, '#1976d2', 1500);
            const foundB = findAodAmazonOffer();
            try {
                logAm('info', 'click-buynow', `インライン AOD 結果: found=${foundB.found}`, {
                    scanned: foundB.scanned,
                    usedSkipped: foundB.usedSkipped,
                    nonAmazonSkipped: foundB.nonAmazonSkipped,
                    method: foundB.method,
                });
            } catch (e) {}
            if (foundB.found) {
                toast(`✓ インライン AOD で Amazon 直販発見 (${foundB.price}) → click`, BUY_GREEN, 2500);
                await clickAodAmazonOffer(foundB.cartButton, foundB.price);
                return true;
            }
            // インライン無し → AOD ページ(?m= 剥がし)へ navigate
            openAodPanel();
            return false;
        }

        // ★v0.2.0: SESSION 更新(productUrl 保存、step→PURCHASING)
        if (!S.getSession()) {
            S.startNewSession(location.href);
        } else {
            S.updateSession({ productUrl: location.href });
        }
        S.setStep(STEP_PURCHASING);

        // ★v0.1.16.8: target 詳細をログ(ボタン種別と所要 ms)
        try {
            logAm('info', 'click-buynow', `target=${label} (検出 ${Date.now() - _t0}ms)`, {
                label: label,
                tag: target.tagName, id: target.id || '',
                name: target.name || '', type: target.type || '',
            });
        } catch (e) {}

        toast(`▶ ${label} click`, BUY_GREEN, 2000);

        // click 前に MutationObserver 起動(モーダル表示を即捉える)
        startExpressCheckoutWatch();
        // ★v0.1.16.1: sleep 300ms 削除(最速化)
        if (isStopped()) return false;

        // ★v0.3.8.70: 人間反応速度 delay (中央値 200ms 正規分布 + 10% ヒッカップ、BOT 検知対策)
        await sleep(humanReactionDelay());
        if (isStopped()) return false;

        // ★★★【絶対不可侵】HIRO 2026-05-09 動作確認済み ★★★
        //   「今すぐ買う」発火は target.click() (A 方式) **固定**。
        //   試した他の方式は全て NG だった:
        //     - G: form.dispatchEvent('submit') → 空振り
        //     - F: nativeTap (touch+pointer+click) → 反応なし
        //     - H: page-context script injection → 反応なし
        //     - B: form.requestSubmit → "not a submit button" エラー
        //     - C: placeBtn.onclick → onclick が関数でない
        //     - D: form.onsubmit → ★危険な空白ページに遷移(在庫切れ画面)
        //   → A 方式以外を絶対に試さない。CONFIG.confirmMethod を適用しない。
        //   詳細は memory/feedback_amazon_winning_recipe.md
        let ok = false;
        let methodLabel = '';
        let errMsg = '';
        // v0.3.8.12: buynow click 後の通信観測を仕掛ける (click 投入そのものは無変更)
        //   click 直前に hook を仕掛けて、直後 5 秒間の全 fetch/XHR を即時記録。
        //   AOD 版 observeNetworkAfterAodClick と並行動作、タグ別 (buynow-*) で混ざらない。
        try {
            observeNetworkAfterBuyNowClick(5000);
        } catch (e) { /* swallow */ }
        try {
            target.click();
            ok = true;
            methodLabel = 'A: target.click() [HIRO 確認済み 不変]';
        } catch (e) {
            errMsg = e.message;
            methodLabel = `A: 例外 ${e.message}`;
        }
        // ★v0.1.16.8: click 結果をログ(成功は info、失敗は error → Discord 自動 push)
        try {
            if (ok) {
                logAm('info', 'click-buynow', `click 成功: ${label}`, {
                    method: methodLabel, totalMs: Date.now() - _t0,
                });
            } else {
                logAm('error', 'click-buynow', `click 失敗: ${label}`, {
                    method: methodLabel, error: errMsg, totalMs: Date.now() - _t0,
                });
            }
        } catch (e) {}
        toast(`▶ 発火 [${methodLabel}] = ${ok ? '✅' : '❌'}`, ok ? BUY_GREEN : STOP_RED, 8000);
        if (!ok) {
            toast(`❌ 発火失敗 → 停止`, STOP_RED, 8000);
            clearState();
            setStopped(true);
            return false;
        }

        if (CONFIG.debugMode) {
            console.log('[GBOT-AM] fired:', methodLabel, label, target);
        }

        // ★v0.1.15.11: click 後 即時 1 回試行(MutationObserver の前に DOM 完了済みの場合用)
        setTimeout(() => {
            if (!expressCheckoutHandled && !isStopped()) watchExpressCheckoutModal();
        }, 200);
        setTimeout(() => {
            if (!expressCheckoutHandled && !isStopped()) watchExpressCheckoutModal();
        }, 800);
        setTimeout(() => {
            if (!expressCheckoutHandled && !isStopped()) watchExpressCheckoutModal();
        }, 2000);
        return true;
    };

    // ───────────────────────────────────────────────
    // v0.1.3: AOD パネル(他出品者一覧) 探索
    //   実機調査(2026-05-07 デスクトップ B07NC1BQC1)で確認した構造:
    //     dialog "すべてのおすすめ商品情報枠"
    //       ├─ ピン留めオファー(Buy Box と同じ出品者)
    //       ├─ heading "その他N個のオプション"
    //       └─ list / listitem (各オファー)
    //           ├─ form > button[type=submit] aria-label="出品者{名}と価格{価}からカートに追加する"
    //           └─ list (出荷元/販売元/カスタマーサービス listitem)
    //
    //   モバイル UA では構造が違う可能性大なので、テキストパターン抽出(出荷元/販売元 ラベル)
    //   ベースで判定する。Buy Box 判定と同じ extractValueAfterLabel/extractShipperAndSeller を再利用。
    //
    //   ★ 中古は即スキップ(キャンセル不可リスク防衛、駿河屋 v0.1.0 教訓)
    // ───────────────────────────────────────────────
    const openAodPanel = () => {
        // 既に AOD URL なら何もしない
        if (/[?&]aod=1\b/.test(location.search)) return false;
        if (S.shouldHalt()) return false;

        // ★v0.2.0: SESSION 更新 (productUrl 保存、step→AOD_OPEN)
        if (!S.getSession()) {
            S.startNewSession(location.href);
        } else {
            S.updateSession({ productUrl: location.href });
        }
        S.setStep(STEP_AOD_OPEN);

        // ★v0.3.1: ?m=AN1VRQENFRJN5 フィルター除去
        //   HIRO ログ B07R1LFX7P (2026-05-11 23:54〜23:56) で判明:
        //   ?m=AN1VRQENFRJN5 が付いてると AOD も Amazon-only に絞られて 0 件返却。
        //   AOD では「全 seller」を見て Amazon が出品しているかをチェックしたいので
        //   ?m= を除去してから ?aod=1 を付与する。
        //   AOD で Amazon 直販を見つけて click すれば smart-wagon → SPC で
        //   そのまま Amazon カートに入る(Amazon フィルターは購入フロー側で復活)。
        //
        //   ★ regex 注意: 中間位置の &m=XXX と先頭の ?m=XXX を別処理(連続&誤変換防止)
        let strippedSearch = location.search;
        strippedSearch = strippedSearch.replace(/&m=[^&]*/g, '');   // 中間/末尾の &m=XXX を除去
        strippedSearch = strippedSearch.replace(/^\?m=[^&]*&?/, '?'); // 先頭の ?m=XXX(後続あれば &含む)を ? に
        if (strippedSearch === '?') strippedSearch = '';            // ? だけ残ったら空文字
        strippedSearch = strippedSearch.replace(/&{2,}/g, '&');     // 念のため &&→&
        strippedSearch = strippedSearch.replace(/[?&]$/, '');       // 末尾の ? や & を除去
        const sep = strippedSearch ? '&' : '?';
        const newUrl = location.pathname + strippedSearch + sep + 'aod=1' + location.hash;
        try {
            logAm('info', 'aod-nav', '?m= 剥がして AOD ナビ', {
                fromSearch: location.search.slice(0, 150),
                toUrl: newUrl.slice(0, 200),
            });
        } catch (e) {}
        toast(`▶ AOD ページ(全 seller)を開きます…`, '#1976d2', 3000);
        // ★v0.1.16.10: 600 → 200ms(toast は 3000ms 表示なのでリダイレクト後も少し残る)
        setTimeout(() => {
            if (S.shouldHalt()) return;
            location.href = newUrl;
        }, 200);
        return true;
    };

    // AOD オファー1件分のコンテナを取得(モバイル/デスクトップ汎用)
    const getAodOfferContainers = () => {
        // 候補パターンを順に試す
        const candidates = [
            () => Array.from(document.querySelectorAll('#aod-offer, [id^="aod-offer-"]')),
            () => Array.from(document.querySelectorAll('[data-cel-widget*="aod-offer"]')),
            () => Array.from(document.querySelectorAll('[id*="aod"][id*="offer"]')),
            // モバイル用 fallback: dialog 内の listitem
            () => {
                const dlg = document.querySelector('div[aria-modal="true"][role="dialog"], dialog, #all-offers-display-dialog');
                if (!dlg) return [];
                return Array.from(dlg.querySelectorAll('li, [role="listitem"]'));
            },
            // 最終 fallback: 「カートに追加する」ボタンを含む form を逆引き
            () => {
                const btns = Array.from(document.querySelectorAll('button[aria-label*="からカートに追加"], button[type="submit"]'));
                const containers = [];
                for (const b of btns) {
                    const ctx = b.closest('li, [role="listitem"], .a-section, form')?.parentElement;
                    if (ctx) containers.push(ctx);
                }
                return containers;
            },
        ];
        for (const fn of candidates) {
            try {
                const r = fn();
                if (r && r.length > 0) return r;
            } catch (e) {}
        }
        return [];
    };

    const containsUsedOrUsedKeyword = (txt) => {
        if (!txt) return false;
        if (txt.includes('中古')) return true;
        if (/\bUsed\b/i.test(txt)) return true;
        if (txt.includes('コレクター商品')) return true;
        if (txt.includes('再生品')) return true;  // 再生品は中古扱い
        return false;
    };

    // ★v0.3.0: 商品ページ内の「他の出品者」セクションを展開する試行
    //   モバイル UI では AOD オファーがインライン展開されることがある
    //   「その他N件の出品」「すべての出品者を表示」等のボタンを click して開く
    const expandInlineAodIfPresent = async () => {
        const expandLabels = [
            'その他の出品', 'その他N件の出品', 'すべての出品者', 'すべての出品',
            '他の出品者', '他の販売者', 'もっと表示', 'もっと見る'
        ];
        try {
            const els = document.querySelectorAll(
                'a, button, span, div[role="button"], [data-action*="offer"]'
            );
            for (const el of els) {
                if (!isElementVisible(el)) continue;
                const t = (el.innerText || el.textContent || '').trim();
                if (!t || t.length > 30) continue;  // 30 char 超は除外(誤発火防止)
                for (const label of expandLabels) {
                    if (t.includes(label) && (t.includes('出品') || t.includes('販売'))) {
                        try {
                            el.click();
                            await sleep(400);  // 展開アニメ待ち
                            return true;
                        } catch (e) {}
                        break;
                    }
                }
            }
        } catch (e) {}
        return false;
    };

    // AOD パネル内から Amazon.co.jp 直販かつ新品のオファーを探す
    //   v0.1.3.1: aria-label 直読み方式に変更。
    //   モバイル版 AOD は「もっと見る」を押さないと出荷元/販売元が見えないため、
    //   テキスト抽出方式は失敗する。
    //   一方、「カートに追加する」ボタンには
    //     aria-label="出品者{出品者名}と価格{価格}からカートに追加する"
    //   が常に付いている(アクセシビリティ標準、モバイル/デスクトップ両対応)。
    //   これを直読みすれば、折りたたまれていても出品者名と価格が取れる。
    //   v0.3.0: ?aod=1 別ページ専用じゃなく、商品ページ DOM 内でも動く(セレクタは DOM 全体)
    //   v0.3.3: Amazon AOD UI 変更対応(新旧UI両対応セレクタ)
    //     旧UI: button[aria-label*="からカートに追加"] (ラベル「出品者X と価格Y から…」)
    //     新UI: input[type="submit"][name="submit.addToCart"] (aria-label 空)
    //     直販判定:
    //       旧UI → aria-label から「出品者(Amazon\.co\.jp)」をパース
    //       新UI → 親を遡って [id^="aod-offer-soldBy"] テキストの「販売元 Amazon.co.jp」検出
    const findAodAmazonOffer = () => {
        const result = {
            found: false,
            price: '',
            sellerText: '',
            shipperText: '',
            cartButton: null,
            offerEl: null,
            method: '',
            scanned: 0,
            usedSkipped: 0,
            nonAmazonSkipped: 0,
        };

        // ★v0.3.3: 新旧UI 両対応セレクタ。Set で重複除去(同一ボタンが両セレクタにマッチする可能性)
        const oldBtns = Array.from(document.querySelectorAll(
            'button[aria-label*="からカートに追加"], ' +
            'input[aria-label*="からカートに追加"], ' +
            'button[aria-label*="カートに入れて予約"], ' +
            'input[aria-label*="カートに入れて予約"]'
        ));
        const newBtns = Array.from(document.querySelectorAll(
            'input[type="submit"][name="submit.addToCart"]'
        ));
        const buttons = Array.from(new Set([...oldBtns, ...newBtns]));

        // ★v0.3.3: visible チェック(pinned offer 内の隠しボタン等を除外)
        const visibleButtons = buttons.filter(b => {
            try {
                if (typeof isElementVisible === 'function' && !isElementVisible(b)) return false;
                const rect = b.getBoundingClientRect && b.getBoundingClientRect();
                if (rect && rect.width === 0 && rect.height === 0) return false;
            } catch (e) {}
            return true;
        });

        result.scanned = visibleButtons.length;

        if (visibleButtons.length === 0) {
            result.method = `no cart buttons found (old=${oldBtns.length}, new=${newBtns.length}, visible=0)`;
            return result;
        }

        for (const btn of visibleButtons) {
            // ★v0.3.3: 「両方をカートに追加する」(セット販売・合わせ買い) を除外
            //   form 内に複数の items[N.base][asin] があれば合わせ買い
            try {
                const form = btn.closest && btn.closest('form');
                if (form) {
                    const asinInputs = form.querySelectorAll('input[name*="asin"]');
                    if (asinInputs.length > 1) {
                        // 合わせ買いオファーはスキップ(本商品単品の購入意図に反する)
                        continue;
                    }
                }
            } catch (e) {}

            let seller = '';
            let price = '';
            let detectMethod = '';

            // 旧UI判定: aria-label から「出品者X と価格Y から」をパース
            const ariaLabel = btn.getAttribute('aria-label') || '';
            const m = ariaLabel.match(/出品者(.+?)と価格(.+?)から/);
            if (m) {
                seller = m[1].trim();
                price  = m[2].trim();
                detectMethod = 'old-ui (aria-label)';
            } else {
                // 新UI判定: 親を遡って [id^="aod-offer-soldBy"] を探す
                let p = btn.parentElement;
                let soldByEl = null;
                let d = 0;
                while (p && d < 20) {
                    soldByEl = p.querySelector('[id^="aod-offer-soldBy"]');
                    if (soldByEl) break;
                    p = p.parentElement;
                    d++;
                }
                if (!soldByEl) continue;
                const byText = soldByEl.innerText || '';
                // 「販売元」直後のテキストを抽出
                //   実機検証で確認した形式:
                //     " 販売元 Amazon.co.jp "
                //     "販売元\nAmazon.co.jp\n..."
                //   余計な空白や改行を許容して 1行目の販売元名を取る
                const sellerMatch = byText.match(/販売元[\s\n　]*([^\n【]+?)(?:【|\n|Amazon出品者|$)/);
                seller = sellerMatch ? sellerMatch[1].trim() : '';
                // 価格は同じオファー内の [id^="aod-offer-price"] から
                const offerRoot = soldByEl.closest('[id^="aod-pinned-offer"]') ||
                                  soldByEl.closest('[id^="aod-offer-"]') ||
                                  soldByEl.parentElement;
                if (offerRoot) {
                    const priceEl = offerRoot.querySelector('[id^="aod-offer-price"], .a-price .a-offscreen, .a-price-whole');
                    if (priceEl) {
                        const pm = (priceEl.innerText || priceEl.textContent || '').match(/[¥￥]\s*([\d,]+)/);
                        if (pm) price = '￥' + pm[1];
                    }
                }
                detectMethod = 'new-ui (aod-offer-soldBy)';
            }

            // Amazon.co.jp 出品でなければスキップ
            if (!/^Amazon\.co\.jp(?:\s|$|[^a-zA-Z0-9])/.test(seller)) {
                result.nonAmazonSkipped++;
                continue;
            }

            // オファーカード(親要素)を特定 → 中古チェック
            let cardEl = btn.parentElement;
            for (let i = 0; i < 12 && cardEl; i++) {
                const t = cardEl.innerText || '';
                if (/[¥￥]/.test(t) && t.length > 30) break;
                cardEl = cardEl.parentElement;
            }

            // 中古即スキップ(キャンセル不可リスク防衛)
            if (cardEl) {
                const ctxText = cardEl.innerText || '';
                if (containsUsedOrUsedKeyword(ctxText)) {
                    result.usedSkipped++;
                    continue;
                }
            }

            result.found       = true;
            result.price       = price;
            result.sellerText  = 'Amazon.co.jp';
            result.shipperText = 'Amazon.co.jp';
            result.cartButton  = btn;
            result.offerEl     = cardEl;
            result.method      = `${detectMethod} match (Amazon.co.jp 出品)`;

            // ★v0.3.8.51: AOD 直販オファー検出時、offerListing.1 を localStorage に保存
            //   (TRANS-AM B方式用 - 直販判定済み URL として再利用)
            // ★v0.3.8.52: 失敗時の原因究明用デバッグログ強化 (form/olid/asin/addr のどこで脱落したか)
            // ★v0.3.8.53: form 探索を 4 段階に拡張 (HIRO 2026-05-18 ログで btn.closest(form)=null 多発)
            //   段階1: btn.closest('form')                 (標準: ボタンが form 内)
            //   段階2: cardEl.querySelector('form')        (cardEl 内に form がある)
            //   段階3: ancestor を遡り <form> 要素を探索    (DOM 構造変化対応)
            //   段階4: AOD コンテナ全体から最近接 form を探す (最終手段)
            //   さらに olid を form 外の hidden input からも探索 (近隣要素含む)
            // ★v0.3.8.59: 各段階で「offer/asin/offering input を持つ form のみ採用」を徹底
            //   HIRO 2026-05-18 21:51 ログで formInputCount=0 多発 → 段階1-3 でも
            //   空 form を拾っていた。form-has-offer 判定を共通化して各段階で適用。
            const hasOfferInput = (f) => {
                if (!f) return false;
                try {
                    return !!f.querySelector(
                        'input[name*="offer"], input[name*="asin"], ' +
                        'input[name*="ASIN"], input[name*="offering"]'
                    );
                } catch (e) { return false; }
            };
            try {
                let form = (function() {
                    const f = btn.closest && btn.closest('form');
                    return (f && hasOfferInput(f)) ? f : null;
                })();
                let formSource = form ? 'closest' : '';
                // 段階2: cardEl 内の form (offer/asin input を持つもののみ)
                if (!form && cardEl) {
                    try {
                        const forms2 = cardEl.querySelectorAll && cardEl.querySelectorAll('form');
                        if (forms2 && forms2.length) {
                            for (const f2 of forms2) {
                                if (hasOfferInput(f2)) { form = f2; formSource = 'cardEl.querySelector'; break; }
                            }
                        }
                    } catch (e) {}
                }
                // 段階3: 親を遡って offer/asin input を持つ form を探す
                if (!form) {
                    let p = btn.parentElement;
                    let d = 0;
                    while (p && d < 15) {
                        if (p.tagName === 'FORM' && hasOfferInput(p)) {
                            form = p; formSource = 'ancestor-walk'; break;
                        }
                        // 親が form じゃなくても、その子に offer/asin input を持つ form があれば取得
                        try {
                            const forms3 = p.querySelectorAll && p.querySelectorAll('form');
                            if (forms3 && forms3.length) {
                                let found3 = null;
                                for (const f3 of forms3) {
                                    if (hasOfferInput(f3)) { found3 = f3; break; }
                                }
                                if (found3) { form = found3; formSource = 'ancestor-querySelector'; break; }
                            }
                        } catch (e) {}
                        p = p.parentElement;
                        d++;
                    }
                }
                // 段階4: AOD コンテナ全体から探す (最終手段)
                // ★v0.3.8.55: HIRO ログで「formInputCount: 0」多発 → 段階4 が空 form を拾っていた。
                //   修正: offerListing/offering/asin の hidden input を含む form のみ採用。
                //   さらに本ボタンとの DOM 距離が近いものを優先 (複数 form がある場合の救済)。
                if (!form) {
                    try {
                        const aodContainer = document.getElementById('aod-container') ||
                                             document.querySelector('[id^="aod-"]');
                        if (aodContainer) {
                            const forms = aodContainer.querySelectorAll('form');
                            // input 数 > 0 かつ offer/asin 系 input を含む form のみ候補化
                            const candidates = [];
                            for (const f of forms) {
                                try {
                                    const hasOfferOrAsin = f.querySelector(
                                        'input[name*="offer"], input[name*="asin"], ' +
                                        'input[name*="ASIN"], input[name*="offering"]'
                                    );
                                    if (hasOfferOrAsin) candidates.push(f);
                                } catch (e) {}
                            }
                            if (candidates.length === 1) {
                                form = candidates[0];
                                formSource = 'aod-container offer-form';
                            } else if (candidates.length > 1) {
                                // 複数候補 → ボタンとの祖先共通距離が最も短い form を選択
                                let best = null;
                                let bestDepth = 99;
                                for (const f of candidates) {
                                    // 共通祖先までの距離を計測 (ボタン側)
                                    let p = btn;
                                    let d = 0;
                                    while (p && d < 30) {
                                        if (p.contains && p.contains(f)) {
                                            if (d < bestDepth) { best = f; bestDepth = d; }
                                            break;
                                        }
                                        p = p.parentElement;
                                        d++;
                                    }
                                }
                                if (best) {
                                    form = best;
                                    formSource = 'aod-container nearest offer-form';
                                } else {
                                    form = candidates[0];
                                    formSource = 'aod-container offer-form[0]';
                                }
                            }
                        }
                    } catch (e) {}
                }
                // form 全 input の name 列挙 (デバッグ用)
                let formInputNames = [];
                if (form) {
                    try {
                        const allInputs = form.querySelectorAll('input');
                        for (const inp of allInputs) {
                            const nm = inp.getAttribute('name') || '';
                            const val = inp.getAttribute('value') || inp.value || '';
                            if (nm) formInputNames.push(nm + '(' + val.length + ')');
                        }
                    } catch (e) {}
                }
                if (!form) {
                    // 全部失敗 → ボタン周辺 DOM の詳細を出力 (Amazon AOD 構造解明用)
                    try {
                        // ボタン周辺の hidden input を直接 grep (form なしでも取得試行)
                        let nearbyHiddenInputs = [];
                        try {
                            let scope = cardEl || btn.parentElement;
                            if (scope) {
                                const inputs = scope.querySelectorAll('input[type="hidden"], input[name]');
                                for (const inp of inputs) {
                                    const nm = inp.getAttribute('name') || '';
                                    const val = inp.getAttribute('value') || inp.value || '';
                                    if (nm) nearbyHiddenInputs.push(nm + '(' + val.length + ')');
                                }
                            }
                        } catch (e) {}
                        logAm('warn', 'aod-save-skip-formless',
                            '⚠ AOD save スキップ: form 探索全失敗 (4 段階) → ボタン周辺 DOM ダンプ',
                            {
                                btnTag: btn.tagName,
                                btnId: (btn.id || '').slice(0, 80),
                                btnName: btn.getAttribute('name') || '',
                                btnAriaLabel: (btn.getAttribute('aria-label') || '').slice(0, 100),
                                btnOnclick: (btn.getAttribute('onclick') || '').slice(0, 100),
                                btnDataAsin: btn.getAttribute('data-asin') || '',
                                btnDataAction: (btn.getAttribute('data-action') || '').slice(0, 100),
                                cardElTag: cardEl ? cardEl.tagName : '(no cardEl)',
                                cardElId: cardEl ? (cardEl.id || '').slice(0, 60) : '',
                                cardElClass: cardEl ? (cardEl.className || '').slice(0, 80) : '',
                                nearbyHiddenInputCount: nearbyHiddenInputs.length,
                                nearbyHiddenInputs: nearbyHiddenInputs.slice(0, 40).join(','),
                                detectMethod: detectMethod,
                            });
                    } catch (e) {}
                    // 段階5: form がなくても、cardEl 内の hidden input から olid を直接取得試行
                    let olid = '';
                    let olidSourceName = '';
                    try {
                        const scope = cardEl || document;
                        const olidCandidates = scope.querySelectorAll(
                            'input[name="offerListingID"], input[name="offerListingId"], ' +
                            'input[name="offering-id"], input[name="offering.0"], input[name="offering.1"], ' +
                            'input[name="offeringID"], input[name="offeringId"], ' +
                            'input[name*="offerListing"], input[name*="offeringID"], ' +
                            'input[name*="offering"]'
                        );
                        for (const inp of olidCandidates) {
                            const v = (inp.getAttribute('value') || inp.value || '');
                            if (v && v.length >= 20) {
                                olid = v;
                                olidSourceName = inp.getAttribute('name') || '';
                                break;
                            }
                        }
                    } catch (e) {}
                    if (olid) {
                        // cardEl 経由で olid 取得成功 → 保存処理に進む (form なし救済ルート)
                        const asinFromUrl = (function(){ try { return extractAsinFromUrl(); } catch (e) { return ''; } })();
                        const asinX = (asinFromUrl && /^[A-Z0-9]{10}$/.test(asinFromUrl)) ? asinFromUrl : '';
                        const addrX = (function(){ try { return localStorage.getItem('LB_AM_ADDRESS_ID') || ''; } catch (e) { return ''; } })();
                        if (asinX && addrX) {
                            const urlX = buildBuynowUrlFromAsinAndOffer(asinX, olid, addrX);
                            if (urlX) {
                                const keyX = 'LB_AM_BUYNOW_URL_' + asinX;
                                const prevX = localStorage.getItem(keyX) || '';
                                if (prevX !== urlX) {
                                    localStorage.setItem(keyX, urlX);
                                    try { localStorage.setItem(keyX + '_AT', String(Date.now())); } catch (e) {}
                                    try { localStorage.removeItem('LB_AM_ASIN_ONLY_' + asinX); } catch (e) {}
                                    try {
                                        const title = extractProductTitle();
                                        if (title) localStorage.setItem('LB_AM_PRODUCT_NAME_' + asinX, title);
                                    } catch (e) {}
                                    try { resetTransAmErrCount(); } catch (e) {}
                                    try {
                                        logAm('info', 'buynow-url-saved-from-aod-cardEl',
                                            '✅ AOD 救済ルート (form なし → cardEl 内 hidden input): 直販 URL 保存',
                                            { asin: asinX, olidLen: olid.length, olidSourceName: olidSourceName });
                                    } catch (e) {}
                                    try { toast('💾 直販 URL 保存: ' + asinX + ' (AOD 経由)', BUY_GREEN, 3500); } catch (e) {}
                                }
                            }
                        }
                    }
                    return result; // form なし救済ルートで完了 (または保存できず終了)
                }
                {
                    // hidden input から offerListing ID を取得 (Amazon 仕様で複数の名前候補)
                    let olid = '';
                    let olidSourceName = '';
                    const olidCandidates = form.querySelectorAll(
                        'input[name="offerListingID"], input[name="offerListingId"], ' +
                        'input[name="offering-id"], input[name="offering.0"], input[name="offering.1"], ' +
                        'input[name="offeringID"], input[name="offeringId"], ' +
                        'input[name*="offerListing"], input[name*="offeringID"], ' +
                        'input[name*="offering"]'
                    );
                    for (const inp of olidCandidates) {
                        const v = (inp.getAttribute('value') || inp.value || '');
                        if (v && v.length >= 20) {
                            olid = v;
                            olidSourceName = inp.getAttribute('name') || '';
                            break;
                        }
                    }
                    if (!olid) {
                        try { logAm('warn', 'aod-save-skip',
                            '⚠ AOD save スキップ: olid 取得失敗 (form 内 input 全件)',
                            {
                                formInputCount: formInputNames.length,
                                formInputNames: formInputNames.slice(0, 30).join(','),
                                olidCandidateCount: olidCandidates.length,
                            }); } catch (e) {}
                    } else {
                        // ASIN 抽出: form の hidden input 優先、なければ URL から
                        let asin = '';
                        const asinInputs = form.querySelectorAll('input[name*="asin"], input[name*="ASIN"]');
                        for (const ai of asinInputs) {
                            const v = (ai.getAttribute('value') || ai.value || '');
                            if (/^[A-Z0-9]{10}$/.test(v)) { asin = v; break; }
                        }
                        if (!asin) {
                            try { asin = extractAsinFromUrl(); } catch (e) {}
                        }
                        if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) {
                            try { logAm('warn', 'aod-save-skip',
                                '⚠ AOD save スキップ: ASIN 取得失敗',
                                { olidSourceName: olidSourceName, olidLen: olid.length }); } catch (e) {}
                        } else {
                            const addr = (function(){ try { return localStorage.getItem('LB_AM_ADDRESS_ID') || ''; } catch (e) { return ''; } })();
                            if (!addr) {
                                try { logAm('warn', 'aod-save-skip',
                                    '⚠ AOD save スキップ: addressID 未設定 (📦設定→住所登録 必要)',
                                    { asin: asin }); } catch (e) {}
                            } else {
                                const url = buildBuynowUrlFromAsinAndOffer(asin, olid, addr);
                                if (!url) {
                                    try { logAm('warn', 'aod-save-skip',
                                        '⚠ AOD save スキップ: buildBuynowUrl が空文字',
                                        { asin: asin, olidLen: olid.length }); } catch (e) {}
                                } else {
                                    const key = 'LB_AM_BUYNOW_URL_' + asin;
                                    const prev = localStorage.getItem(key) || '';
                                    if (prev !== url) {
                                        localStorage.setItem(key, url);
                                        try { localStorage.setItem(key + '_AT', String(Date.now())); } catch (e) {}
                                        try { localStorage.removeItem('LB_AM_ASIN_ONLY_' + asin); } catch (e) {}
                                        // 商品名取得
                                        try {
                                            const title = extractProductTitle();
                                            if (title) localStorage.setItem('LB_AM_PRODUCT_NAME_' + asin, title);
                                        } catch (e) {}
                                        try { resetTransAmErrCount(); } catch (e) {}
                                        try {
                                            logAm('info', 'buynow-url-saved-from-aod',
                                                '✅ AOD 直販オファー → 完成 URL を保存 (TRANS-AM B方式用)',
                                                { asin: asin, olidLen: olid.length, olidSourceName: olidSourceName });
                                        } catch (e) {}
                                        try { toast('💾 直販 URL 保存: ' + asin + ' (AOD 経由)', BUY_GREEN, 3500); } catch (e) {}
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                try { logAm('error', 'aod-save-exception',
                    '⛔ AOD save 例外発生',
                    { err: String(e && e.message || e) }); } catch (e2) {}
            }
            return result;
        }

        result.method =
            `no Amazon-direct found ` +
            `(scanned=${result.scanned}, old=${oldBtns.length}, new=${newBtns.length}, ` +
            `usedSkipped=${result.usedSkipped}, nonAmazonSkipped=${result.nonAmazonSkipped})`;
        return result;
    };

    // ★v0.3.8.3: 進行中 fetch を一括キャンセルするための AbortController レジストリ
    //   完全停止ボタン (lb-am-btn-fullstop) 押下時に全 entry に abort() を呼ぶ。
    //   実機検証 (PC Chrome 2026-05-16): AbortController.abort() → AbortError 発火 OK
    const _activeFetchAborters = new Set();

    // ★v0.3.8.4: 観測機構 4 つ (恒久組み込み)
    //   今後の環境変化 (Amazon UI 変更 / HIRO 端末固有 DOM) に対して
    //   推測ゼロで根拠ログを取れる仕組み。全関数 try/catch で完全防御。

    // [1.1] AOD 環境フィンガープリント (1 セッション 1 回のみ取得)
    const collectAodEnvSnapshot = () => {
        try {
            return {
                ts: Date.now(),
                ua: navigator.userAgent || '',
                isMobile: /Mobile|iPhone|iPad|Android/.test(navigator.userAgent || ''),
                platform: navigator.platform || '',
                bodyClass: (document.body && document.body.className || '').slice(0, 120),
                viewportW: window.innerWidth,
                viewportH: window.innerHeight,
                aodContainer: !!document.getElementById('aod-container'),
                formAodAddToCartCount: document.querySelectorAll('form.AodAddToCart').length,
                submitAddToCartCount: document.querySelectorAll('input[name="submit.addToCart"]').length,
                allFormsCount: document.querySelectorAll('form').length,
                oldUiBtnCount: document.querySelectorAll('[aria-label*="からカートに追加"]').length,
                sessionIdInputPresent: !!document.querySelector('input[name="sessionID"]'),
                customerIdInputPresent: !!document.querySelector('input[name="customerId"]'),
                csrfInputPresent: !!document.querySelector('input[name="anti-csrftoken-a2z"]'),
                // ── v0.3.8.8 追加項目 (cookie / sandbox / referrer) ──
                cookieEnabled: navigator.cookieEnabled,
                cookieRawLength: document.cookie ? document.cookie.length : 0,
                cookieCount: document.cookie ? document.cookie.split(';').filter(Boolean).length : 0,
                hasStorageAccessFn: typeof document.hasStorageAccess === 'function',
                gmSetValueExists: (typeof GM_setValue !== 'undefined'),
                unsafeWindowExists: (typeof unsafeWindow !== 'undefined'),
                referrer: (document.referrer || '').slice(0, 80),
                topEqualsSelf: window.top === window.self,
                protocol: location.protocol,
            };
        } catch (e) { return { err: e.message }; }
    };

    // [1.2] AOD button context dump (詳細 DOM 取得)
    const dumpAodButtonContext = (btn) => {
        if (!btn) return null;
        try {
            const ctx = {
                tag: btn.tagName,
                type: btn.type || null,
                name: btn.name || null,
                id: btn.id || null,
                outerHtmlHead: (btn.outerHTML || '').slice(0, 250),
                ariaLabelHead: (btn.getAttribute && btn.getAttribute('aria-label') || '').slice(0, 80),
                attrs: Object.fromEntries(
                    Array.from(btn.attributes || []).map(a => [a.name, String(a.value).slice(0, 60)])
                ),
                closestForm: null,
                parentChain: [],
            };
            const f = btn.closest && btn.closest('form');
            if (f) {
                ctx.closestForm = {
                    class: f.className || null,
                    action: f.action || null,
                    method: f.method || null,
                    inputCount: f.querySelectorAll('input').length,
                    inputNames: Array.from(f.querySelectorAll('input')).map(i => i.name).slice(0, 12),
                };
            }
            let p = btn.parentElement;
            // v0.3.8.8: 親 chain ループ 10→15 階層、outerHtmlHead 150→200 文字
            for (let i = 0; i < 15 && p; i++) {
                ctx.parentChain.push({
                    tag: p.tagName,
                    id: p.id || null,
                    cls: p.className ? String(p.className).slice(0, 40) : null,
                    outerHtmlHead: (p.outerHTML || '').slice(0, 200),
                });
                p = p.parentElement;
            }
            return ctx;
        } catch (e) { return { err: e.message }; }
    };

    // ────────────────────────────────────────────────────────
    // v0.3.8.8: document.cookie 全件を生値でダンプ
    //   - マスクなし (HIRO さん本人専用運用、検証への影響回避)
    //   - 値が極端に長い場合のみ 250 文字で切る (可読性のため)
    // ────────────────────────────────────────────────────────
    const dumpCookieSnapshot = () => {
        try {
            const raw = document.cookie || '';
            const pairs = raw.split(';').map(s => s.trim()).filter(Boolean);
            const snap = {};
            for (const p of pairs) {
                const eqIdx = p.indexOf('=');
                const name = eqIdx >= 0 ? p.slice(0, eqIdx) : p;
                const val = eqIdx >= 0 ? p.slice(eqIdx + 1) : '';
                if (val.length > 250) {
                    snap[name] = val.slice(0, 250) + '...(続く、全長 ' + val.length + ' 文字)';
                } else {
                    snap[name] = val;
                }
            }
            return {
                rawLength: raw.length,
                count: pairs.length,
                cookieEnabled: navigator.cookieEnabled,
                cookies: snap,
            };
        } catch (e) {
            return { err: e && e.message ? e.message : String(e) };
        }
    };

    // ────────────────────────────────────────────────────────
    // v0.3.8.8: AOD パネル全構造ダンプ
    //   - panel outerHTML 頭 3000 文字
    //   - 全 form の {action, method, class, id, inputs[全件 name=value]}
    //   - #aod-pinned-offer の有無と中身
    //   - submit.addToCart ボタン全件の outerHTML 頭 200 文字
    // ────────────────────────────────────────────────────────
    const dumpAodPanelStructure = () => {
        try {
            // AOD パネルのルート要素を複数候補で探す
            const candidates = ['#aod-container', '#aod-modal-rdesign', '[data-csa-c-slot-id="aod-features"]'];
            let panel = null;
            let panelRootSelector = null;
            for (const sel of candidates) {
                const el = document.querySelector(sel);
                if (el) { panel = el; panelRootSelector = sel; break; }
            }
            if (!panel) return { panelRootSelector: null, panelExists: false };

            // 全 form 走査
            const forms = Array.from(panel.querySelectorAll('form'));
            const formsInPanel = forms.map((f, idx) => {
                const inputs = Array.from(f.querySelectorAll('input')).map(inp => ({
                    name: inp.name || '',
                    value: (inp.value || '').slice(0, 200),
                    type: inp.type || '',
                }));
                return {
                    idx: idx,
                    className: f.className || '',
                    action: f.action || '',
                    method: f.method || '',
                    id: f.id || '',
                    inputCount: inputs.length,
                    inputs: inputs,
                };
            });

            // #aod-pinned-offer 構造
            const pinned = document.querySelector('#aod-pinned-offer');
            let pinnedOffer = { exists: false };
            if (pinned) {
                const soldByEl = pinned.querySelector('#aod-offer-soldBy, [id*="soldBy"]');
                const soldByLink = pinned.querySelector('a[href*="/sp/"]');
                pinnedOffer = {
                    exists: true,
                    soldByText: soldByEl ? (soldByEl.textContent || '').trim().slice(0, 100) : null,
                    soldByLink: soldByLink ? (soldByLink.getAttribute('href') || '').slice(0, 100) : null,
                    outerHtmlHead: (pinned.outerHTML || '').slice(0, 500),
                };
            }

            // submit.addToCart ボタン全件
            const submitButtons = Array.from(panel.querySelectorAll('input[name="submit.addToCart"]')).map((btn, idx) => ({
                idx: idx,
                outerHtmlHead: (btn.outerHTML || '').slice(0, 200),
            }));

            return {
                panelRootSelector: panelRootSelector,
                panelExists: true,
                panelOuterHtmlHead: (panel.outerHTML || '').slice(0, 3000),
                formsInPanel: formsInPanel,
                pinnedOffer: pinnedOffer,
                submitAddToCartButtons: submitButtons,
            };
        } catch (e) {
            return { err: e && e.message ? e.message : String(e) };
        }
    };

    // ────────────────────────────────────────────────────────
    // v0.3.8.11: AOD パネル内の全 cart 追加ボタンを全リスト化
    //   背景: 422 失敗時に別出品者のボタンを click している可能性
    //   観測対象: input[name="submit.addToCart"] と data-csa-c-content-id="aod-atc-mobile"
    //   各ボタンについて aria-label, outerHTML, 周辺の seller テキストを記録
    // ────────────────────────────────────────────────────────
    const dumpAllAodCartButtons = () => {
        try {
            // AOD パネル内の cart 追加ボタンを全部取得
            const selectors = [
                'input[name="submit.addToCart"]',
                'input[data-csa-c-content-id="aod-atc-mobile"]',
                'input[type="submit"][aria-label*="カートに追加"]',
            ];
            const seen = new Set();
            const buttons = [];
            for (const sel of selectors) {
                try {
                    document.querySelectorAll(sel).forEach((btn) => {
                        if (!seen.has(btn)) {
                            seen.add(btn);
                            buttons.push(btn);
                        }
                    });
                } catch (e) {}
            }

            const list = buttons.map((btn, idx) => {
                // 親を 15 階層遡って seller テキストを探す
                let sellerNearby = '';
                let p = btn;
                for (let i = 0; i < 15 && p; i++) {
                    try {
                        const txt = p.textContent || '';
                        if (txt.length > 0 && txt.length < 1000) {
                            if (txt.includes('Amazon.co.jp')
                                || txt.includes('出品者')
                                || txt.includes('発送元')) {
                                sellerNearby = txt.replace(/\s+/g, ' ').trim().slice(0, 400);
                                break;
                            }
                        }
                    } catch (e) {}
                    p = p.parentElement;
                }

                // 親 chain 5 階層
                const parentChain = [];
                let p2 = btn.parentElement;
                for (let i = 0; i < 5 && p2; i++) {
                    const tag = p2.tagName || '';
                    const id = p2.id ? '#' + p2.id : '';
                    const cls = (p2.className || '').toString();
                    const clsHead = cls ? '.' + cls.split(/\s+/).slice(0, 2).join('.') : '';
                    parentChain.push(tag + id + clsHead);
                    p2 = p2.parentElement;
                }

                return {
                    idx: idx,
                    tag: btn.tagName || '',
                    type: btn.getAttribute('type') || '',
                    name: btn.getAttribute('name') || '',
                    id: btn.id || '',
                    ariaLabel: (btn.getAttribute('aria-label') || '').slice(0, 300),
                    csaContentId: btn.getAttribute('data-csa-c-content-id') || '',
                    csaSlotId: btn.getAttribute('data-csa-c-slot-id') || '',
                    csaType: btn.getAttribute('data-csa-c-type') || '',
                    outerHtml: (btn.outerHTML || '').slice(0, 800),
                    sellerNearby: sellerNearby,
                    parentChain: parentChain.join(' > '),
                };
            });

            return {
                count: buttons.length,
                buttons: list,
            };
        } catch (e) {
            return { err: e && e.message ? e.message : String(e) };
        }
    };

    // ────────────────────────────────────────────────────────
    // v0.3.8.15: 「今すぐ買う」ボタン (#buy-now-button) 周辺のフォーム DOM ダンプ
    //   背景: HIRO 要望「今すぐ買う URL をツールで読み解いて直接組み立てたい」。
    //         click 後の navigate 先 (/checkout/entry/buynow?...) は v0.3.8.12 で
    //         判明したが、その URL に含まれる asin / offerListingId / addressID
    //         などのパラメータが商品ページ DOM のどこに埋まっているかは未確認。
    //   観測: #buy-now-button の closest('form') から全 input (hidden 含む) を
    //         name/value で記録。これで URL 組み立てに必要なパラメータが商品
    //         ページから取れるかを検証する。
    //   呼出: attemptPurchase の Buy Box 直販ヒット時に 1 回出力。
    //   v0.3.8.15 では観測のみ、URL 組み立て実装は v0.3.8.16 以降。
    // ────────────────────────────────────────────────────────
    const dumpBuyNowFormDom = () => {
        try {
            const btn = document.getElementById('buy-now-button');
            if (!btn) return { btnExists: false };
            const form = btn.closest('form');
            if (!form) {
                return {
                    btnExists: true,
                    formExists: false,
                    btnOuterHtmlHead: (btn.outerHTML || '').slice(0, 500),
                };
            }
            const inputs = Array.from(form.querySelectorAll('input')).map(function(inp) {
                return {
                    name: (inp.name || inp.getAttribute('name') || '').slice(0, 80),
                    type: (inp.type || inp.getAttribute('type') || '').slice(0, 30),
                    valueLen: (inp.value || '').length,
                    valueHead: (inp.value || '').slice(0, 300),
                };
            });
            // form 周辺の data-* 属性も
            const formAttrs = {};
            try {
                for (const attr of form.attributes) {
                    if (attr.name.toLowerCase().startsWith('data-')) {
                        formAttrs[attr.name] = (attr.value || '').slice(0, 200);
                    }
                }
            } catch (e) {}
            return {
                btnExists: true,
                formExists: true,
                btnOuterHtmlHead: (btn.outerHTML || '').slice(0, 500),
                formAction: form.action || '',
                formMethod: form.method || '',
                formId: form.id || '',
                formClassName: (form.className || '').toString().slice(0, 200),
                formDataAttrs: formAttrs,
                inputCount: inputs.length,
                inputs: inputs,
            };
        } catch (e) {
            return { err: e && e.message ? e.message : String(e) };
        }
    };

    // ────────────────────────────────────────────────────────
    // v0.3.8.23: ⚡TRANS-AM⚡ 保存値必須方式 (HIRO 設計提案 2026-05-17)
    //
    //   背景:
    //     v0.3.8.21 の A方式 (offerListing.1 なし URL を組み立てて navigate) は、
    //     アドレスバー直叩きでは在庫切れ画面が出るが、商品ページからの遷移では
    //     Amazon に bot 検知され /errors/500 にリダイレクトされた (HIRO 検証で確定)。
    //
    //   原因:
    //     正規の「今すぐ買う」ボタンは内部で offerListing.1 を hidden input から
    //     送る。bot が offerListing.1 なしで同 URL を踏むと不正遷移と判定される。
    //
    //   新設計 (HIRO 提案):
    //     - 過去に動作確認済み URL (offerListing.1 込み) が localStorage に保存
    //       されている商品のみ TRANS-AM ボタンを有効化
    //     - 未記録商品ではボタン押下不可 (灰色化 + ツールチップで通知)
    //     - これにより 500 エラーが物理的に発生不可能
    //
    //   保存 URL の取得元:
    //     HIRO さんが普通に 🛒新規開始 で購入を試みると、Buy Box の「今すぐ買う」
    //     ボタン click → buynow URL navigate が起きる。その buynow URL を main 内の
    //     既存ロジック (v0.3.8.20 から維持) が自動保存する。
    //     キー: LB_AM_BUYNOW_URL_<ASIN>
    //
    //   永続化 (連投/連続エラー):
    //     モジュール let 変数はページ遷移で消えるので localStorage に格上げ。
    //     - LB_AM_TRANS_AM_LAST_AT_<ASIN>  = 最終 navigate 時刻 (連投ガード 5秒)
    //     - LB_AM_TRANS_AM_ERR_COUNT       = 連続エラー数 (1回で完全停止)
    //     - LB_AM_TRANS_AM_ERR_AT          = 最終エラー時刻 (60秒経過でリセット)
    // ────────────────────────────────────────────────────────
    const TRANS_AM_DEFAULT_ADDRESS_ID = 'nmopnsqrokn';
    // ★v0.3.8.34: 連投ガードを 5秒 → 3秒に短縮 (HIRO 要望: 在庫待ちループの実用性)
    // ★v0.3.8.82: 連投ガード固定 3000ms → ランダム 1700-2300ms (平均 2000ms)
    //   過去成功時のサイクル時間 (~2 秒) に合わせる + 機械的固定間隔の検知シグナル排除
    //   getTransAmMinIntervalMs() で毎回ランダム値を返す
    const TRANS_AM_MIN_INTERVAL_MS_BASE = 2000;  // 中央値
    const TRANS_AM_MIN_INTERVAL_MS_JITTER = 300; // ±300ms (1700-2300)
    const getTransAmMinIntervalMs = () => {
        return TRANS_AM_MIN_INTERVAL_MS_BASE +
               Math.floor((Math.random() * 2 - 1) * TRANS_AM_MIN_INTERVAL_MS_JITTER);
    };
    // 旧定数 (deprecated、互換性のため残す)
    const TRANS_AM_MIN_INTERVAL_MS = TRANS_AM_MIN_INTERVAL_MS_BASE;
    const TRANS_AM_ERR_RESET_MS = 60000;

    // localStorage 永続カウンタ系ヘルパー
    const getTransAmLastNavigateAt = (asin) => {
        try { return parseInt(localStorage.getItem('LB_AM_TRANS_AM_LAST_AT_' + asin) || '0', 10) || 0; }
        catch (e) { return 0; }
    };
    const setTransAmLastNavigateAt = (asin) => {
        try { localStorage.setItem('LB_AM_TRANS_AM_LAST_AT_' + asin, String(Date.now())); } catch (e) {}
    };
    const getTransAmErrCount = () => {
        try {
            const at = parseInt(localStorage.getItem('LB_AM_TRANS_AM_ERR_AT') || '0', 10);
            if (at && (Date.now() - at) > TRANS_AM_ERR_RESET_MS) return 0;
            return parseInt(localStorage.getItem('LB_AM_TRANS_AM_ERR_COUNT') || '0', 10) || 0;
        } catch (e) { return 0; }
    };
    const incrementTransAmErrCount = () => {
        try {
            const n = getTransAmErrCount() + 1;
            localStorage.setItem('LB_AM_TRANS_AM_ERR_COUNT', String(n));
            localStorage.setItem('LB_AM_TRANS_AM_ERR_AT', String(Date.now()));
            return n;
        } catch (e) { return 1; }
    };
    const resetTransAmErrCount = () => {
        try {
            localStorage.removeItem('LB_AM_TRANS_AM_ERR_COUNT');
            localStorage.removeItem('LB_AM_TRANS_AM_ERR_AT');
        } catch (e) {}
    };

    // 保存済み商品データ判定 (TRANS-AM ボタン状態管理から呼ばれる)
    const hasSavedTransAmUrl = (asin) => {
        if (!asin) return false;
        try {
            const url = localStorage.getItem('LB_AM_BUYNOW_URL_' + asin);
            return !!(url && url.length > 100 && /offerListing\.1=/.test(url));
        } catch (e) { return false; }
    };
    const getSavedTransAmUrl = (asin) => {
        if (!asin) return null;
        try { return localStorage.getItem('LB_AM_BUYNOW_URL_' + asin) || null; }
        catch (e) { return null; }
    };
    // v0.3.8.41 の URL 自動削除撤回で呼び出し元なし、将来再利用のため定義は残置
    // ★v0.3.8.44: 個別削除と整合のため ASIN_ONLY / LAST_AT も削除対象に追加
    const deleteSavedTransAmUrl = (asin) => {
        if (!asin) return;
        try {
            localStorage.removeItem('LB_AM_BUYNOW_URL_' + asin);
            localStorage.removeItem('LB_AM_BUYNOW_URL_' + asin + '_AT');
            localStorage.removeItem('LB_AM_PRODUCT_NAME_' + asin);
            localStorage.removeItem('LB_AM_ASIN_ONLY_' + asin);
            localStorage.removeItem('LB_AM_TRANS_AM_LAST_AT_' + asin);
        } catch (e) {}
    };

    // URL pathname から ASIN を抽出 (商品ページのみ判定)
    const extractAsinFromUrl = () => {
        try {
            const m = (location.pathname || '').match(/\/(?:dp|gp\/aw\/d|gp\/product)\/([A-Z0-9]{10})(?:[\/\?#]|$)/);
            return m ? m[1] : null;
        } catch (e) { return null; }
    };

    // ★v0.3.8.27: 商品データ CSV 書出/読込/一覧 (HIRO 要望: バックアップ機能)
    //   localStorage は iOS Safari で簡単に消えるため、HIRO が手動でバックアップを
    //   作成・復元できる仕組みを提供。
    //   形式: CSV (BOM 付き UTF-8、既存ログ CSV と同じ仕組み)
    //   列: asin, product_name, buynow_url, saved_at, address_id
    //   インポート方針 (HIRO 指示): 同じ ASIN は重複スキップ、新規のみ追加
    // ★v0.3.8.33: 並び順管理 (LB_AM_PRODUCT_ORDER = ASIN 配列の JSON)
    const getProductOrder = () => {
        try {
            const raw = localStorage.getItem('LB_AM_PRODUCT_ORDER') || '[]';
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr.filter(a => /^[A-Z0-9]{10}$/.test(a)) : [];
        } catch (e) { return []; }
    };
    const setProductOrder = (arr) => {
        try { localStorage.setItem('LB_AM_PRODUCT_ORDER', JSON.stringify(arr || [])); } catch (e) {}
    };
    const moveAsinInOrder = (asin, delta) => {
        try {
            const products = listSavedProducts();
            const currentOrder = products.map(p => p.asin);
            const idx = currentOrder.indexOf(asin);
            if (idx < 0) return;
            const newIdx = idx + delta;
            if (newIdx < 0 || newIdx >= currentOrder.length) return;
            const tmp = currentOrder[idx];
            currentOrder[idx] = currentOrder[newIdx];
            currentOrder[newIdx] = tmp;
            setProductOrder(currentOrder);
        } catch (e) {}
    };

    const listSavedProducts = () => {
        const arr = [];
        const seen = new Set();
        try {
            // 完成 URL あり (TRANS-AM 有効化済み)
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k || !k.startsWith('LB_AM_BUYNOW_URL_')) continue;
                if (k.endsWith('_AT')) continue;
                const asin = k.slice('LB_AM_BUYNOW_URL_'.length);
                if (!/^[A-Z0-9]{10}$/.test(asin)) continue;
                const url = localStorage.getItem(k) || '';
                if (!url || !/offerListing\.1=/.test(url)) continue;
                const name = localStorage.getItem('LB_AM_PRODUCT_NAME_' + asin) || '';
                const atStr = localStorage.getItem(k + '_AT') || '';
                const savedAt = parseInt(atStr, 10) || 0;
                arr.push({ asin: asin, productName: name, buynowUrl: url, savedAt: savedAt, asinOnly: false });
                seen.add(asin);
            }
            // ★v0.3.8.32: ASIN のみの仮登録分も列挙 (URL 未取得状態)
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k || !k.startsWith('LB_AM_ASIN_ONLY_')) continue;
                const asin = k.slice('LB_AM_ASIN_ONLY_'.length);
                if (!/^[A-Z0-9]{10}$/.test(asin)) continue;
                if (seen.has(asin)) continue;
                const name = localStorage.getItem('LB_AM_PRODUCT_NAME_' + asin) || '';
                const atStr = localStorage.getItem(k) || '';
                const savedAt = parseInt(atStr, 10) || 0;
                arr.push({ asin: asin, productName: name, buynowUrl: '', savedAt: savedAt, asinOnly: true });
            }
        } catch (e) {}
        // ★v0.3.8.33: ユーザー指定の並び順 (LB_AM_PRODUCT_ORDER) を尊重
        try {
            const order = getProductOrder();
            if (order.length > 0) {
                const indexMap = {};
                order.forEach((a, i) => { indexMap[a] = i; });
                arr.sort((a, b) => {
                    const ia = indexMap[a.asin];
                    const ib = indexMap[b.asin];
                    if (ia !== undefined && ib !== undefined) return ia - ib;
                    if (ia !== undefined) return -1;
                    if (ib !== undefined) return 1;
                    return b.savedAt - a.savedAt;
                });
            } else {
                arr.sort((a, b) => b.savedAt - a.savedAt);
            }
        } catch (e) {
            arr.sort((a, b) => b.savedAt - a.savedAt);
        }
        return arr;
    };

    const csvEscapeField = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
    };

    const exportProductsToCsv = () => {
        // ★v0.3.9.0: buynow_url 列を復活 (PC版 TRANS-AM とのデータ双方向連携)。
        //   保存済み B方式 URL (LB_AM_BUYNOW_URL_<asin>) があれば書き出す。無ければ空。
        //   列: asin, product_name, buynow_url, saved_at, address_id
        const products = listSavedProducts();
        const addressID = (function(){ try { return localStorage.getItem('LB_AM_ADDRESS_ID') || ''; } catch (e) { return ''; } })();
        const header = ['asin', 'product_name', 'buynow_url', 'saved_at', 'address_id'].join(',');
        const rows = products.map((p) => {
            const iso = p.savedAt ? new Date(p.savedAt).toISOString() : '';
            const buUrl = (function(){ try { return localStorage.getItem('LB_AM_BUYNOW_URL_' + p.asin) || ''; } catch (e) { return ''; } })();
            return [
                csvEscapeField(p.asin),
                csvEscapeField(p.productName),
                csvEscapeField(buUrl),
                csvEscapeField(iso),
                csvEscapeField(addressID),
            ].join(',');
        });
        return '﻿' + header + '\n' + rows.join('\n');
    };

    // CSV テキストを行配列 (オブジェクトの配列) にパースする
    //   仕様: ダブルクォート対応、エスケープされた "" を " に戻す、BOM 除去
    const parseCsvText = (text) => {
        if (!text) return [];
        let body = String(text);
        if (body.charCodeAt(0) === 0xFEFF) body = body.slice(1);
        const rows = [];
        let row = [];
        let cur = '';
        let inQ = false;
        let i = 0;
        while (i < body.length) {
            const c = body[i];
            if (inQ) {
                if (c === '"') {
                    if (body[i + 1] === '"') { cur += '"'; i += 2; continue; }
                    inQ = false; i++; continue;
                }
                cur += c; i++; continue;
            }
            if (c === '"') { inQ = true; i++; continue; }
            if (c === ',') { row.push(cur); cur = ''; i++; continue; }
            if (c === '\r') { i++; continue; }
            if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; }
            cur += c; i++;
        }
        if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
        if (rows.length === 0) return [];
        const header = rows[0].map(h => String(h || '').trim().toLowerCase());
        const out = [];
        for (let r = 1; r < rows.length; r++) {
            const cols = rows[r];
            if (!cols || cols.length === 0) continue;
            const obj = {};
            for (let c = 0; c < header.length; c++) {
                obj[header[c]] = cols[c] !== undefined ? cols[c] : '';
            }
            // 空行スキップ
            if (!obj.asin && !obj.buynow_url) continue;
            out.push(obj);
        }
        return out;
    };

    // CSV から商品データを取り込む (ASIN_ONLY 登録、重複 ASIN はスキップ)
    // ★v0.3.8.48: B方式凍結に伴い、buynow_url 列は読まない (旧 CSV 互換のため列があっても無視)
    const importProductsFromCsv = (csvText) => {
        const result = { added: 0, skipped: 0, invalid: 0, addressIdSet: false };
        const rows = parseCsvText(csvText);
        for (const row of rows) {
            const asin = String(row.asin || '').trim().toUpperCase();
            const name = String(row.product_name || '').trim();
            const isoAt = String(row.saved_at || '').trim();
            // ★v0.3.9.0: buynow_url 列を取り込み(PC版との双方向連携)。
            const buUrl = String(row.buynow_url || '').trim();
            if (!/^[A-Z0-9]{10}$/.test(asin)) {
                result.invalid++;
                continue;
            }
            const existingUrl = localStorage.getItem('LB_AM_BUYNOW_URL_' + asin);
            const existingAsinOnly = localStorage.getItem('LB_AM_ASIN_ONLY_' + asin);
            if (existingUrl || existingAsinOnly) {
                result.skipped++;
                continue;
            }
            try {
                let atMs = Date.parse(isoAt);
                if (!Number.isFinite(atMs)) atMs = Date.now();
                if (buUrl && /\/checkout\/entry\/buynow/.test(buUrl)) {
                    // 完成 B方式 URL あり → TRANS-AM 可として復元(ASIN_ONLY より強い)
                    localStorage.setItem('LB_AM_BUYNOW_URL_' + asin, buUrl);
                    localStorage.setItem('LB_AM_BUYNOW_URL_' + asin + '_AT', String(atMs));
                } else {
                    // URL なし → 候補(ASIN_ONLY)として登録
                    localStorage.setItem('LB_AM_ASIN_ONLY_' + asin, String(atMs));
                }
                if (name) localStorage.setItem('LB_AM_PRODUCT_NAME_' + asin, name);
                result.added++;
            } catch (e) {
                result.invalid++;
            }
        }
        // address_id は最後の行のものを使う (空でなく既存にも無いとき)
        try {
            const lastWithAddr = rows.slice().reverse().find(r => r.address_id && String(r.address_id).length >= 6);
            if (lastWithAddr) {
                const current = localStorage.getItem('LB_AM_ADDRESS_ID') || '';
                if (!current) {
                    localStorage.setItem('LB_AM_ADDRESS_ID', String(lastWithAddr.address_id));
                    result.addressIdSet = true;
                }
            }
        } catch (e) {}
        return result;
    };

    // ファイルダウンロード共通ヘルパー (ログ CSV と同じ仕組み)
    const downloadAsFile = (text, fileName, mime) => {
        const blob = new Blob([text], { type: (mime || 'text/csv') + ';charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            try { URL.revokeObjectURL(url); } catch (e) {}
            try { a.remove(); } catch (e) {}
        }, 1000);
    };

    const productCsvFilename = () => {
        const pad = (n) => String(n).padStart(2, '0');
        const now = new Date();
        return 'gundambot-amazon-products-' +
            now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' +
            pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()) + '.csv';
    };

    // ★v0.3.8.31: カート画面の「あとで買う」(Save for Later) を自動スキャン
    //   HIRO 要望: カートの「あとで買う」リストから offerListing.1 を一気に収集して
    //   TRANS-AM 用 URL を自動生成・保存する
    //   仕組み:
    //     1. /gp/cart/view.html 着地で発動
    //     2. 「あとで買う」セクション内の各商品 div を走査
    //     3. data-asin と input[name="offerListingId"] (または埋め込み JSON) を抽出
    //     4. ASIN + offerListing.1 + addressID で URL 構築 → localStorage 保存
    //     5. offerListing.1 が取れなかった item は ASIN のみログ出力 (商品ページで補完誘導)
    // ★v0.3.8.32: モバイル版「あとで買う」DOM スキャン強化
    //   モバイル Amazon (/gp/aw/c) では hidden input ではなく data 属性や
    //   ページ内 JSON に offerListingId が埋まっている。
    //   全体テキストから ASIN→offerListingId のマップを作って参照する方式に変更。
    const buildAsinToOfferIdMap = () => {
        const map = {};
        try {
            // ① 全 a タグの href から offerListingId 抽出
            //    例: /gp/item-dispatch?...offerListingId=ABC...
            const links = document.querySelectorAll('a[href*="offerListingId"], a[href*="offering.0"], a[href*="offering.1"]');
            links.forEach((a) => {
                try {
                    const href = a.getAttribute('href') || '';
                    const olid = (href.match(/[?&]offerListingId=([^&#]{20,})/) ||
                                  href.match(/[?&]offering\.[01]=([^&#]{20,})/) || [])[1];
                    if (!olid) return;
                    const olidDec = (function(){ try { return decodeURIComponent(olid); } catch (e) { return olid; } })();
                    // 近傍の data-asin を探す (親 / 兄弟 / 子)
                    let asin = '';
                    let p = a;
                    for (let i = 0; i < 10 && p; i++) {
                        const a1 = p.getAttribute && p.getAttribute('data-asin');
                        if (a1 && /^[A-Z0-9]{10}$/.test(a1)) { asin = a1; break; }
                        p = p.parentElement;
                    }
                    if (!asin) {
                        const m = (a.href || '').match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/);
                        if (m) asin = m[1];
                    }
                    if (asin && olidDec && olidDec.length >= 20 && !map[asin]) {
                        map[asin] = olidDec;
                    }
                } catch (e) {}
            });
            // ② form 全体の hidden input から (PC 版互換)
            const forms = document.querySelectorAll('form');
            forms.forEach((f) => {
                try {
                    let asin = '';
                    let olid = '';
                    const inputs = f.querySelectorAll('input[name]');
                    inputs.forEach((inp) => {
                        const n = (inp.getAttribute('name') || '').toLowerCase();
                        const v = inp.getAttribute('value') || inp.value || '';
                        if (!v) return;
                        if (n === 'asin' && /^[A-Z0-9]{10}$/.test(v)) asin = v;
                        else if (n === 'offerlistingid' || n.indexOf('offerlistingid') >= 0 ||
                                 n === 'offer-listing-id' || n === 'offering.0' || n === 'offering.1') {
                            if (v.length >= 20) olid = v;
                        }
                    });
                    if (asin && olid && !map[asin]) map[asin] = olid;
                } catch (e) {}
            });
            // ③ ページ全体の script タグから JSON 抽出
            //    例: ..."offerListingId":"XYZ...","asin":"B0XXX..." の組
            const scripts = document.querySelectorAll('script');
            scripts.forEach((s) => {
                try {
                    const txt = (s.textContent || '').slice(0, 200000);
                    if (!txt || txt.indexOf('offerListingId') < 0) return;
                    // 簡易: offerListingId と asin が同一オブジェクト内で隣接して出現
                    const re = /["']?asin["']?\s*[:=]\s*["']([A-Z0-9]{10})["'][^}]{0,500}["']?offerListingId["']?\s*[:=]\s*["']([^"']{20,})["']/g;
                    let m;
                    while ((m = re.exec(txt)) !== null) {
                        const a = m[1]; const o = m[2];
                        if (a && o && !map[a]) map[a] = o;
                    }
                    // 逆順 (offerListingId が先、asin が後)
                    const re2 = /["']?offerListingId["']?\s*[:=]\s*["']([^"']{20,})["'][^}]{0,500}["']?asin["']?\s*[:=]\s*["']([A-Z0-9]{10})["']/g;
                    while ((m = re2.exec(txt)) !== null) {
                        const o = m[1]; const a = m[2];
                        if (a && o && !map[a]) map[a] = o;
                    }
                } catch (e) {}
            });
            // ④ data-a-input-name / data-a-state 属性からの抽出
            try {
                const stateEls = document.querySelectorAll('[data-a-state], [data-a-input-name]');
                stateEls.forEach((s) => {
                    try {
                        const ds = s.getAttribute('data-a-state') || '';
                        if (!ds || ds.indexOf('offerListing') < 0) return;
                        const m = ds.match(/asin["']?\s*[:=]\s*["']([A-Z0-9]{10})["'][^}]{0,500}offerListingId["']?\s*[:=]\s*["']([^"']{20,})["']/);
                        if (m) { const a = m[1]; const o = m[2]; if (a && o && !map[a]) map[a] = o; }
                    } catch (e) {}
                });
            } catch (e) {}
        } catch (e) {}
        return map;
    };

    const scanSaveForLaterItems = () => {
        const items = [];
        try {
            // 「あとで買う」セクションを探す (Amazon の構造は時期により変わるので複数候補)
            const sections = [
                document.querySelector('[data-name="Save for later"]'),
                document.querySelector('#sc-saved-cart'),
                document.querySelector('[data-feature-id="save-for-later"]'),
                document.querySelector('[data-feature-id="saved-for-later"]'),
                document.querySelector('[id*="saved-for-later"]'),
                document.querySelector('[id*="sfl"]'),
            ].filter(Boolean);
            const scopes = sections.length > 0 ? sections : [document.body];
            const seenAsin = new Set();
            // 先にページ全体から ASIN → offerListingId マップを作る
            const offerMap = buildAsinToOfferIdMap();
            for (const scope of scopes) {
                if (!scope || !scope.querySelectorAll) continue;
                const candidates = scope.querySelectorAll('[data-asin], div[data-itemid]');
                candidates.forEach((el) => {
                    try {
                        const asin = (el.getAttribute('data-asin') || '').trim().toUpperCase();
                        if (!/^[A-Z0-9]{10}$/.test(asin)) return;
                        if (seenAsin.has(asin)) return;
                        seenAsin.add(asin);
                        let offerId = offerMap[asin] || '';
                        // 商品名取得
                        let productName = '';
                        try {
                            const nameEl = el.querySelector('.sc-product-title') ||
                                el.querySelector('.a-truncate-cut') ||
                                el.querySelector('span.a-list-item') ||
                                el.querySelector('a.a-link-normal span') ||
                                el.querySelector('a[href*="/dp/"]');
                            if (nameEl) productName = (nameEl.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 200);
                        } catch (e2) {}
                        items.push({
                            asin: asin,
                            offerListingId: offerId,
                            productName: productName,
                            hasOfferId: !!offerId,
                        });
                    } catch (e2) {}
                });
            }
        } catch (e) {}
        return items;
    };

    const buildBuynowUrlFromAsinAndOffer = (asin, offerId, addressID) => {
        if (!asin || !offerId) return '';
        const addr = addressID || (function(){
            try { return localStorage.getItem('LB_AM_ADDRESS_ID') || ''; } catch (e) { return ''; }
        })();
        if (!addr) return '';
        // ★v0.3.8.36: quantity.1=1 を追加 (これがないと在庫切れ誤判定される)
        // ★v0.3.8.41: m=AN1VRQENFRJN5 (Amazon 直販強制) を追加
        //   → マケプレオファーへの自動切替を防ぐ (HIRO 指摘: 直販に切り替えずに動いていた)
        return 'https://www.amazon.co.jp/checkout/entry/buynow?'
            + 'ref_=dp_mw_buy_now_chw_buyNow_2-1'
            + '&referrer=detail'
            + '&pipelineType=turbo'
            + '&clientId=retailwebsite'
            + '&devicestring-override=Browser-SmartPhone'
            + '&weblab=RCX_CHECKOUT_TURBO_MWEB_126825'
            + '&primeStatus=true'
            + '&temporaryAddToCart=1'
            + '&asin.1=' + encodeURIComponent(asin)
            + '&offerListing.1=' + encodeURIComponent(offerId)
            + '&quantity.1=1'
            + '&merchantID=' + AMAZON_SELLER_ID
            + '&turboCheckoutMigrationFlag=1'
            + '&isAsync=0'
            + '&addressID=' + encodeURIComponent(addr);
    };

    // ★v0.3.8.32: ASIN のみで仮登録(URL 未取得状態でも商品データ一覧に表示)
    const saveAsinOnlyRecord = (asin, productName) => {
        try {
            if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) return false;
            const existingUrl = localStorage.getItem('LB_AM_BUYNOW_URL_' + asin);
            if (existingUrl && /offerListing\.1=/.test(existingUrl)) return false;
            if (productName) {
                const nameKey = 'LB_AM_PRODUCT_NAME_' + asin;
                const prev = localStorage.getItem(nameKey) || '';
                if (prev !== productName) localStorage.setItem(nameKey, productName);
            }
            const markerKey = 'LB_AM_ASIN_ONLY_' + asin;
            if (!localStorage.getItem(markerKey)) {
                localStorage.setItem(markerKey, String(Date.now()));
            }
            return true;
        } catch (e) { return false; }
    };

    const collectFromCartSaveForLater = async () => {
        // ★v0.3.8.33: HIRO 要望「画面表示に変化なく自動登録してほしい」
        //   アコーディオン自動 click は撤去 (Amazon 左上のメニュー等を誤押下する副作用あり)
        //   代わりに MutationObserver で HIRO が手動展開した時を検知して再スキャン (完全パッシブ)
        let bestItems = [];
        for (let i = 0; i < 8; i++) {
            await sleep(700);
            const items = scanSaveForLaterItems();
            if (items.length > bestItems.length) bestItems = items;
            if (items.length > 0 && items.filter(it => it.hasOfferId).length === items.length) break;
        }
        if (bestItems.length === 0) {
            try { logAm('info', 'cart-sfl-scan', '「あとで買う」: 商品見つからず (セクションなし or 別 DOM 構造)', {}); } catch (e) {}
            return { scanned: 0, saved: 0, partial: 0, asinOnly: 0 };
        }
        const addressID = (function(){ try { return localStorage.getItem('LB_AM_ADDRESS_ID') || ''; } catch (e) { return ''; } })();
        let saved = 0;
        let partial = 0;
        let asinOnly = 0;
        const newlySavedAsins = [];
        for (const it of bestItems) {
            try {
                if (!it.asin) continue;
                const existingUrl = localStorage.getItem('LB_AM_BUYNOW_URL_' + it.asin);
                if (existingUrl && /offerListing\.1=/.test(existingUrl)) {
                    continue;
                }
                // ★v0.3.8.48: SFL 経由は ASIN_ONLY 仮登録のみ (B方式凍結、A方式専用化)
                const wasNew = !localStorage.getItem('LB_AM_ASIN_ONLY_' + it.asin) &&
                    !localStorage.getItem('LB_AM_PRODUCT_NAME_' + it.asin);
                if (saveAsinOnlyRecord(it.asin, it.productName) && wasNew) {
                    asinOnly++;
                    newlySavedAsins.push(it.asin);
                }
            } catch (e) {}
        }
        try {
            logAm('info', 'cart-sfl-scan',
                `「あとで買う」スキャン完了: 検出 ${bestItems.length} 件 / 新規 URL ${saved} 件 / ASIN のみ仮登録 ${asinOnly} 件`,
                {
                    scanned: bestItems.length,
                    saved: saved,
                    partial: partial,
                    asinOnly: asinOnly,
                    addressIDLen: addressID.length,
                    items: bestItems.map(it => ({
                        asin: it.asin,
                        hasOfferId: it.hasOfferId,
                        offerIdLen: it.offerListingId ? it.offerListingId.length : 0,
                        nameLen: it.productName ? it.productName.length : 0,
                    })),
                });
        } catch (e) {}
        if (asinOnly > 0) {
            try { toast(`📦 カートの「あとで買う」から ${asinOnly} 件を商品リスト登録\n(${newlySavedAsins.slice(0,3).join(', ')}${newlySavedAsins.length>3?'...':''})`, BUY_GREEN, 8000); } catch (e) {}
        }
        return { scanned: bestItems.length, saved: saved, partial: partial, asinOnly: asinOnly };
    };

    // ★v0.3.8.32: アコーディオン展開検知 — カート画面で SFL セクションが拡張されたら再スキャン
    let _cartSflObserver = null;
    let _cartSflObserverDebounce = null;
    const startCartSflObserver = () => {
        try {
            if (_cartSflObserver) return;
            const target = document.body;
            if (!target) return;
            _cartSflObserver = new MutationObserver((mutations) => {
                let hasAsinAdded = false;
                for (const m of mutations) {
                    for (const n of m.addedNodes) {
                        if (n.nodeType === 1 && (n.querySelector && n.querySelector('[data-asin]') || (n.getAttribute && n.getAttribute('data-asin')))) {
                            hasAsinAdded = true; break;
                        }
                    }
                    if (hasAsinAdded) break;
                }
                if (!hasAsinAdded) return;
                if (_cartSflObserverDebounce) clearTimeout(_cartSflObserverDebounce);
                _cartSflObserverDebounce = setTimeout(() => {
                    try { collectFromCartSaveForLater(); } catch (e) {}
                }, 1200);
            });
            _cartSflObserver.observe(target, { childList: true, subtree: true });
            try { logAm('info', 'cart-sfl-observer', 'SFL MutationObserver 起動 (アコーディオン展開検知)', {}); } catch (e) {}
        } catch (e) {}
    };

    // ★v0.3.8.28 修正: 商品名抽出ヘルパー (モバイル Amazon 対応)
    //   2026-05-17 HIRO スクショ: B08XWCY6BJ で「商品名未取得」になっていた。
    //   原因: モバイル Amazon (iPhone Safari) は #productTitle や h1.a-size-large が
    //         存在しないことが多い。複数セレクタ + document.title フォールバックで対応。
    const extractProductTitle = () => {
        try {
            const candidates = [
                document.getElementById('productTitle'),
                document.querySelector('#title_feature_div span.a-size-large'),
                document.querySelector('#title_feature_div h1'),
                document.querySelector('#title_feature_div'),
                document.querySelector('h1#title'),
                document.querySelector('h1.a-size-large'),
                document.querySelector('span#productTitle'),
                document.querySelector('span.product-title-word-break'),
                document.querySelector('h1[data-feature-name="title"]'),
                document.querySelector('[data-feature-name="title"] h1'),
                document.querySelector('[data-feature-name="title"] span'),
                // モバイル mShop: a-size-medium / a-size-large の最初の見出し
                document.querySelector('#dp h1'),
                document.querySelector('#ppd h1'),
                document.querySelector('#centerCol h1'),
            ];
            for (const el of candidates) {
                if (!el) continue;
                const t = (el.textContent || '').trim();
                if (t && t.length > 1 && t.length < 500) {
                    return t.replace(/\s+/g, ' ').slice(0, 200);
                }
            }
            // フォールバック: document.title から抽出
            const docTitle = (document.title || '').trim();
            if (docTitle && docTitle.length > 1) {
                // 形式例:
                //   「Amazon.co.jp: <タイトル> : <カテゴリ>」
                //   「Amazon | <タイトル> | <ブランド>」
                //   「<タイトル> | Amazon.co.jp」
                let cleaned = docTitle;
                cleaned = cleaned.replace(/^Amazon(\.co\.jp)?\s*[:：|｜]\s*/i, '');
                cleaned = cleaned.replace(/\s*[:：|｜]\s*Amazon(\.co\.jp)?.*$/i, '');
                // 末尾のカテゴリ部分(2 個目以降の : / | 以降)を除く
                const sepIdx = cleaned.search(/\s*[:：|｜]\s*/);
                if (sepIdx > 8) cleaned = cleaned.slice(0, sepIdx);
                cleaned = cleaned.trim();
                if (cleaned && cleaned.length > 1) {
                    return cleaned.replace(/\s+/g, ' ').slice(0, 200);
                }
                return docTitle.replace(/\s+/g, ' ').slice(0, 200);
            }
        } catch (e) {}
        return '';
    };

    // ★v0.3.8.93: Amazon 画像URLを高解像度化 (サイズトークンを SL600 に書換)
    //   例 .../61Mk+XIPdmL._AC_SS288_.jpg → .../61Mk+XIPdmL._AC_SL600_.jpg
    const upscaleAmazonImg = (u) => {
        try {
            if (!u || !/\/images\/I\//.test(u)) return u;
            return u.replace(/\._[A-Za-z0-9,_]+_\.(jpg|jpeg|png)(\?.*)?$/i, '._AC_SL600_.$1');
        } catch (e) { return u; }
    };
    // ★v0.3.8.93: data-a-dynamic-image 属性 ({"url":[w,h],...}) から最大解像度URLを取得
    //   → これが商品メイン画像。og:image 空・在庫切れ等でも確実に商品画像が取れる。
    //   旧 v0.3.8.91 は og:image 失敗時に「最初の /images/I/ 画像」を拾い、ブランドロゴ
    //   (青いバンダイのアイコン等) を誤取得していた。その根本対策。
    const pickLargestDynamicImage = (attrVal) => {
        try {
            let best = '', bestArea = 0;
            const re = /(https:\/\/[^"'\\\s]+?\.(?:jpg|jpeg|png))"?\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/gi;
            let m;
            while ((m = re.exec(attrVal))) {
                const a = (parseInt(m[2], 10) || 0) * (parseInt(m[3], 10) || 0);
                if (a > bestArea) { bestArea = a; best = m[1]; }
            }
            return best;
        } catch (e) { return ''; }
    };

    // ★v0.3.8.89/.93: 商品メイン画像 URL を抽出 (ホームアイコン画像用)
    //   data-a-dynamic-image(最大解像度) → og:image → landingImage → 各種 img。
    //   https:// で始まる 1000 文字未満の URL のみ採用。
    const extractProductImage = () => {
        try {
            const getters = [
                // ★v0.3.8.93: data-a-dynamic-image の最大解像度 (最優先=商品メイン画像)
                () => {
                    const el = document.querySelector('#landingImage[data-a-dynamic-image], #imgTagWrapperId img[data-a-dynamic-image], img[data-a-dynamic-image]');
                    if (!el) return '';
                    const best = pickLargestDynamicImage(el.getAttribute('data-a-dynamic-image') || '');
                    return best ? upscaleAmazonImg(best) : '';
                },
                () => { const m = document.querySelector('meta[property="og:image"]'); return m && m.getAttribute('content'); },
                () => { const i = document.getElementById('landingImage'); return i && (i.getAttribute('data-old-hires') || i.currentSrc || i.src); },
                () => { const i = document.querySelector('#imgTagWrapperId img'); return i && (i.getAttribute('data-old-hires') || i.src); },
                () => { const i = document.getElementById('main-image'); return i && i.src; },
                () => { const i = document.querySelector('#imageBlock img, #ivLargeImage img, #ebooksImgBlkFront'); return i && i.src; },
                () => { const i = document.querySelector('#dp img.a-dynamic-image, #ppd img.a-dynamic-image'); return i && i.src; },
            ];
            for (const g of getters) {
                try {
                    const u = g();
                    if (u && /^https?:\/\//.test(u) && u.length < 1000) return u;
                } catch (e) {}
            }
        } catch (e) {}
        return '';
    };

    // ★v0.3.8.91/.93: 商品ページを背景 fetch して画像・商品名を取得 (画面遷移なし)
    //   HIRO 要望:「商品ページを開かなくても 🏠 を押したら画像を表示したい」
    //   同一オリジン (amazon.co.jp) への fetch なので CORS 不要、HTML をそのまま取得可能。
    //   ★v0.3.8.93: 画像は data-a-dynamic-image の最大解像度を最優先
    //     (og:image が空のページで「最初の /images/I/ = ブランドロゴ」を誤取得する問題を修正)
    const fetchProductMeta = async (asin) => {
        const out = { img: '', name: '' };
        if (!/^[A-Z0-9]{10}$/.test(asin)) return out;
        const decode = (s) => String(s)
            .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
            .replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 8000);
            const res = await fetch('https://www.amazon.co.jp/dp/' + asin + '?m=' + AMAZON_SELLER_ID,
                { credentials: 'include', signal: ctrl.signal });
            clearTimeout(tid);
            if (!res || !res.ok) return out;
            const html = await res.text();

            // ── 画像 ──
            // ① data-a-dynamic-image の最大解像度 (商品メイン画像、最も確実)
            const dyn = html.match(/data-a-dynamic-image\s*=\s*"([^"]+)"/i) ||
                        html.match(/data-a-dynamic-image\s*=\s*'([^']+)'/i);
            if (dyn) { const best = pickLargestDynamicImage(decode(dyn[1])); if (best) out.img = upscaleAmazonImg(best); }
            // ② og:image (属性順不問)
            if (!out.img) {
                const ogimg = html.match(/<meta[^>]*\bproperty=["']og:image["'][^>]*>/i);
                if (ogimg) { const c = ogimg[0].match(/content=["']([^"']+)["']/i); if (c) out.img = decode(c[1]); }
            }
            // ③ landingImage の src / data-old-hires
            if (!out.img) {
                const li = html.match(/id=["']landingImage["'][^>]*>/i);
                if (li) { const s = li[0].match(/(?:data-old-hires|src)=["'](https:\/\/[^"']+?\.(?:jpg|jpeg|png))["']/i); if (s) out.img = s[1]; }
            }
            // ※ v0.3.8.91 の「最初の /images/I/ 画像」フォールバックは撤去 (ロゴ誤取得の原因)

            // ── 商品名 ──
            // ① og:title
            const ogt = html.match(/<meta[^>]*\bproperty=["']og:title["'][^>]*>/i);
            if (ogt) { const c = ogt[0].match(/content=["']([^"']+)["']/i); if (c) out.name = decode(c[1]); }
            // ② productTitle
            if (!out.name) { const t = html.match(/id=["']productTitle["'][^>]*>([^<]{2,300})</i); if (t) out.name = decode(t[1].trim()); }
            // ③ メイン画像の alt (= 商品名のことが多い)
            if (!out.name) {
                const im = html.match(/<img[^>]*data-a-dynamic-image[^>]*>/i);
                if (im) { const a = im[0].match(/\balt=["']([^"']{3,300})["']/i); if (a) out.name = decode(a[1].trim()); }
            }
            // ④ <title> をクリーニング
            if (!out.name) {
                const tt = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
                if (tt) {
                    let c = decode(tt[1].replace(/\s+/g, ' ').trim());
                    c = c.replace(/^Amazon(\.co\.jp)?\s*[:：|｜]\s*/i, '').replace(/\s*[:：|｜]\s*Amazon(\.co\.jp)?.*$/i, '');
                    const si = c.search(/\s*[:：|｜]\s*/); if (si > 8) c = c.slice(0, si);
                    c = c.trim();
                    if (c.length > 1) out.name = c.slice(0, 200);
                }
            }
            return out;
        } catch (e) { return out; }
    };

    // ──────────────────────────────────────────────────────────────
    // ★v0.3.8.52: パッシブ捕捉 — STOPPED 状態でも商品ページ訪問だけで
    //   offerListing.1 を自動保存する
    //
    // 背景: HIRO 要件「私は開始またはトランザムしか押さない、情報収集は自動化」
    //   v0.3.8.51 までは attemptPurchase / findAodAmazonOffer の中で
    //   offerListing.1 を保存していたが、これらは RUNNING 状態でしか走らない。
    //   結果: HIRO が商品ページを普通に開いて「カートに入れる」を押しても
    //   TRANS-AM 対象にならない。
    //
    // 対策: STOPPED でも商品ページ訪問時に Buy Box / AOD form から
    //   olid を自動抽出 → 直販判定済みなら保存
    // ──────────────────────────────────────────────────────────────

    // パッシブ Buy Box 保存 (商品ページ訪問時に毎回呼ばれる、setTimeout 経由)
    const passiveSaveBuyBoxOlid = () => {
        try {
            // TRANS-AM / 購入中はスキップ (本処理タイミング競合防止)
            if (S.isTransAmMode && S.isTransAmMode()) return;
            const step = S.getStep && S.getStep();
            if (step && step !== 'IDLE' && step !== STEP_IDLE) {
                // PURCHASING / CHECKOUT 等はスキップ
                if (step === 'PURCHASING' || step === 'CHECKOUT' ||
                    step === STEP_PURCHASING || step === STEP_CHECKOUT) return;
            }

            const asin = (function(){ try { return extractAsinFromUrl(); } catch (e) { return ''; } })();
            if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) return;
            const addr = (function(){ try { return localStorage.getItem('LB_AM_ADDRESS_ID') || ''; } catch (e) { return ''; } })();
            if (!addr) return;

            // 直販判定 (detectBuyBoxSeller を呼ぶ)
            const seller = (function(){ try { return detectBuyBoxSeller(); } catch (e) { return null; } })();
            if (!seller || !seller.isDirect) return;

            // Buy Box form を探索 — 「今すぐ買う」と「カートに入れる」両方の form を候補に
            const candidateForms = [];
            try {
                const buyNowBtn = document.getElementById('buy-now-button') ||
                    document.querySelector('input[id*="buy-now"], button[id*="buy-now"]');
                const f1 = buyNowBtn && buyNowBtn.closest && buyNowBtn.closest('form');
                if (f1) candidateForms.push(f1);
            } catch (e) {}
            try {
                const addBtns = document.querySelectorAll(
                    'input[id="add-to-cart-button"], input[name="submit.add-to-cart"], ' +
                    'button[id="add-to-cart-button"], button[name="submit.add-to-cart"], ' +
                    'input[id*="add-to-cart"], button[id*="add-to-cart"]'
                );
                for (const b of addBtns) {
                    const f = b.closest && b.closest('form');
                    if (f && !candidateForms.includes(f)) candidateForms.push(f);
                }
            } catch (e) {}

            if (!candidateForms.length) return;

            let olid = '';
            let olidSourceName = '';
            for (const f of candidateForms) {
                try {
                    const olidCandidates = f.querySelectorAll(
                        'input[name="offerListingID"], input[name="offerListingId"], ' +
                        'input[name="offering-id"], input[name="offering.0"], input[name="offering.1"], ' +
                        'input[name="offeringID"], input[name="offeringId"], ' +
                        'input[name*="offerListing"], input[name*="offeringID"], ' +
                        'input[name*="offering"]'
                    );
                    for (const inp of olidCandidates) {
                        const v = (inp.getAttribute('value') || inp.value || '');
                        if (v && v.length >= 20) {
                            olid = v;
                            olidSourceName = inp.getAttribute('name') || '';
                            break;
                        }
                    }
                } catch (e) {}
                if (olid) break;
            }
            if (!olid) return;

            const url = buildBuynowUrlFromAsinAndOffer(asin, olid, addr);
            if (!url) return;

            const key = 'LB_AM_BUYNOW_URL_' + asin;
            const prev = localStorage.getItem(key) || '';
            if (prev === url) return; // 重複保存スキップ (ログも出さない)

            localStorage.setItem(key, url);
            try { localStorage.setItem(key + '_AT', String(Date.now())); } catch (e) {}
            try { localStorage.removeItem('LB_AM_ASIN_ONLY_' + asin); } catch (e) {}
            try {
                const title = extractProductTitle();
                if (title) localStorage.setItem('LB_AM_PRODUCT_NAME_' + asin, title);
            } catch (e) {}
            try { resetTransAmErrCount(); } catch (e) {}
            try {
                logAm('info', 'passive-buynow-saved-buybox',
                    '✅ 商品ページ訪問時パッシブ捕捉 (Buy Box): 直販 URL 保存',
                    { asin: asin, olidLen: olid.length, olidSourceName: olidSourceName,
                      mode: (S.getMode && S.getMode()) || 'unknown' });
            } catch (e) {}
            try { toast('💾 直販 URL 自動保存\n' + asin + ' (Buy Box → 自動収集)', BUY_GREEN, 4000); } catch (e) {}
        } catch (e) {}
    };

    // パッシブ AOD 保存 (AOD ページ訪問時に呼ばれる、findAodAmazonOffer を save 専用で実行)
    const passiveSaveAodOlid = () => {
        try {
            if (S.isTransAmMode && S.isTransAmMode()) return;
            const step = S.getStep && S.getStep();
            if (step === 'PURCHASING' || step === 'CHECKOUT' ||
                step === STEP_PURCHASING || step === STEP_CHECKOUT) return;

            const asin = (function(){ try { return extractAsinFromUrl(); } catch (e) { return ''; } })();
            if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) return;
            const addr = (function(){ try { return localStorage.getItem('LB_AM_ADDRESS_ID') || ''; } catch (e) { return ''; } })();
            if (!addr) return;

            // findAodAmazonOffer は内部で 直販オファー検出 → form から olid 抽出 → 保存
            // のロジックを既に含む (v0.3.8.51 + v0.3.8.52 強化版)
            // ここでは結果を見て passive ログだけ追加
            const found = (function(){ try { return findAodAmazonOffer(); } catch (e) { return null; } })();
            if (!found || !found.found) return;

            // findAodAmazonOffer 内部で保存処理が走ったかを確認 (saved 直後なら _AT が直近)
            try {
                const key = 'LB_AM_BUYNOW_URL_' + asin;
                const atKey = key + '_AT';
                const atRaw = localStorage.getItem(atKey);
                const at = atRaw ? parseInt(atRaw, 10) : 0;
                if (at && (Date.now() - at) < 2000) {
                    // 直近 2 秒以内に保存された → passive 由来としてログ
                    logAm('info', 'passive-buynow-saved-aod',
                        '✅ 商品ページ AOD パッシブ捕捉: 直販 URL 保存確認',
                        { asin: asin, mode: (S.getMode && S.getMode()) || 'unknown' });
                }
            } catch (e) {}
        } catch (e) {}
    };

    // ★v0.3.8.28: xhr/fetch で観測した buynow URL を保存する
    //   背景 (2026-05-17 HIRO ログ解析):
    //     Amazon の Express Checkout (turbo モード) は buy-now click 時に
    //     xhr/fetch で /checkout/entry/buynow を呼ぶだけで、location.href は
    //     商品ページのまま。だから main 関数内の URL 保存ロジックは発動しない。
    //   対策: xhr/fetch ラッパー (observeNetworkAfterBuyNowClick) で URL を
    //     検知したら、この関数で localStorage に保存する。
    const trySaveBuynowUrlFromObserved = (observedUrl) => {
        try {
            if (!observedUrl) return false;
            if (!/\/checkout\/entry\/buynow/.test(observedUrl)) return false;
            let fullUrl = String(observedUrl);
            if (fullUrl.startsWith('/')) fullUrl = 'https://www.amazon.co.jp' + fullUrl;
            const asinMatch = fullUrl.match(/[?&]asin\.1=([A-Z0-9]{10})/);
            const offerMatch = fullUrl.match(/[?&]offerListing\.1=([^&#]+)/);
            if (!asinMatch || !asinMatch[1]) return false;
            const asin = asinMatch[1];
            // addressID は引き続き抽出して保存 (B方式 / 商品ページ両方で必須)
            try {
                const addrMatch = fullUrl.match(/[?&]addressID=([^&#]+)/);
                if (addrMatch && addrMatch[1] && addrMatch[1].length >= 6) {
                    const decoded = decodeURIComponent(addrMatch[1]);
                    const prevAddr = localStorage.getItem('LB_AM_ADDRESS_ID');
                    if (prevAddr !== decoded) localStorage.setItem('LB_AM_ADDRESS_ID', decoded);
                }
            } catch (e) {}

            // ★v0.3.8.51: 直販判定 → OK の時のみ完成 URL 保存 (B方式専用化)
            //   xhr 観測時点で「商品ページの Buy Box が直販」だったかを確認
            //   isDirect=true (直近 30 秒以内に検出) なら直販 offerListing.1 として保存
            //   それ以外なら ASIN_ONLY 仮登録のみ (マケプレ URL を絶対に保存しない)
            let isDirect = false;
            try {
                isDirect = !!window.__lbam_lastBuyBoxIsDirect;
                const t = Number(window.__lbam_lastBuyBoxAt) || 0;
                if (!t || (Date.now() - t) > 30000) isDirect = false;
            } catch (e) { isDirect = false; }

            if (!offerMatch || !offerMatch[1] || offerMatch[1].length < 20 || !isDirect) {
                // 直販判定 NG or offerListing.1 なし → ASIN_ONLY 仮登録のみ
                try { localStorage.setItem('LB_AM_ASIN_ONLY_' + asin, String(Date.now())); } catch (e) {}
                try {
                    const title = extractProductTitle();
                    if (title) localStorage.setItem('LB_AM_PRODUCT_NAME_' + asin, title);
                } catch (e) {}
                try {
                    logAm('info', 'buynow-asin-only-from-xhr',
                        'xhr 観測: 直販判定 NG → ASIN_ONLY 仮登録のみ',
                        { asin: asin, isDirect: isDirect, hasOfferId: !!(offerMatch && offerMatch[1]) });
                } catch (e) {}
                return false;
            }
            // 直販確定: 完成 URL を保存
            const key = 'LB_AM_BUYNOW_URL_' + asin;
            const prevUrl = localStorage.getItem(key) || '';
            if (prevUrl === fullUrl) return false;
            localStorage.setItem(key, fullUrl);
            try { localStorage.setItem(key + '_AT', String(Date.now())); } catch (e) {}
            try { localStorage.removeItem('LB_AM_ASIN_ONLY_' + asin); } catch (e) {}
            // 商品名抽出 (DOM/document.title から、モバイル対応)
            let savedTitle = '';
            try {
                const title = extractProductTitle();
                if (title) {
                    const nameKey = 'LB_AM_PRODUCT_NAME_' + asin;
                    const prevName = localStorage.getItem(nameKey) || '';
                    if (prevName !== title) localStorage.setItem(nameKey, title);
                    savedTitle = title;
                }
            } catch (e) {}
            try { resetTransAmErrCount(); } catch (e) {}
            try {
                logAm('info', 'buynow-url-saved-from-xhr-direct',
                    '✅ 直販判定 OK → 完成 URL を localStorage 保存 (B方式)',
                    {
                        asin: asin,
                        urlLen: fullUrl.length,
                        urlHead: fullUrl.slice(0, 200),
                        productName: savedTitle || '(取得不可)',
                    });
            } catch (e) {}
            return true;
        } catch (e) {
            return false;
        }
    };

    // ★v0.3.8.33: A方式 URL 組み立て (offerListing.1 なし、asin + addressID のみ)
    //   ASIN のみ仮登録の商品で TRANS-AM 押下時に使う。
    //   navigate は noreferrer link click で Referer を消す (商品ページ起点でも 500 回避)。
    const buildAMethodUrl = (asin, addressID) => {
        const addr = addressID || (function(){ try { return localStorage.getItem('LB_AM_ADDRESS_ID') || ''; } catch (e) { return ''; } })();
        if (!asin || !addr) return '';
        // ★v0.3.8.36: quantity.1=1 を追加
        // ★v0.3.8.41: merchantID=AN1VRQENFRJN5 (Amazon 直販強制) を追加
        return 'https://www.amazon.co.jp/checkout/entry/buynow?'
            + 'ref_=dp_mw_buy_now_chw_buyNow_2-1'
            + '&referrer=detail'
            + '&pipelineType=turbo'
            + '&clientId=retailwebsite'
            + '&devicestring-override=Browser-SmartPhone'
            + '&weblab=RCX_CHECKOUT_TURBO_MWEB_126825'
            + '&primeStatus=true'
            + '&temporaryAddToCart=1'
            + '&asin.1=' + encodeURIComponent(asin)
            + '&quantity.1=1'
            + '&merchantID=' + AMAZON_SELLER_ID
            + '&turboCheckoutMigrationFlag=1'
            + '&isAsync=0'
            + '&addressID=' + encodeURIComponent(addr);
    };

    // noreferrer link click で navigate (Referer を消す)
    const navigateNoReferrer = (url) => {
        try {
            const a = document.createElement('a');
            a.href = url;
            a.rel = 'noreferrer noopener';
            a.target = '_self';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            try { a.remove(); } catch (e) {}
        } catch (e) {
            try { location.href = url; } catch (e2) {}
        }
    };

    // ASIN のみ仮登録があるかチェック
    const hasAsinOnlyMarker = (asin) => {
        try { return !!localStorage.getItem('LB_AM_ASIN_ONLY_' + asin); }
        catch (e) { return false; }
    };

    const tryInstantBuyTransAm = async () => {
        const _t0 = Date.now();
        try {
            // (1) ASIN を URL から抽出
            const asin = extractAsinFromUrl();
            if (!asin) {
                try { logAm('warn', 'trans-am', '⚡ TRANS-AM: ASIN 未取得 (商品ページ以外?) → 完全停止',
                    { pathname: (location.pathname || '').slice(0, 120) }); } catch (e) {}
                toast('⚠️ ASIN 取得不可 → 商品ページで使ってください', STOP_RED, 8000);
                S.opFullStop();
                return { navigated: false, reason: 'no-asin' };
            }

            // ★v0.3.8.51: B方式専用化 (HIRO 最終確定 - 直販限定保証)
            //
            //   仕様:
            //     - offerListing.1 必須 (保存値ベース)
            //     - 保存元: Buy Box 経由 / AOD 経由 (直販判定済みのみ保存)
            //     - 保存値なし → TRANS-AM 無効化 (ボタン灰色)
            //     - addressID 必須
            //
            //   マケプレ混入防止 (二重防御):
            //     第1の壁: URL レベル → 直販判定済み offerListing.1 を必ず指定 (構造的に直販限定)
            //     第2の壁: verifyCheckoutSafety → 確定モーダルで 5 項目チェック
            //
            //   過去 A方式 (v0.3.8.48-50) の問題:
            //     offerListing.1 なしで navigate すると Amazon が直販無視してマケプレを選ぶ
            //     (merchantID パラメータが期待通り効かない)
            //     → B方式 (保存済み直販 offerListing.1 必須) で確実に直販限定
            const addrCheck = (function(){ try { return localStorage.getItem('LB_AM_ADDRESS_ID') || ''; } catch (e) { return ''; } })();
            if (!addrCheck || addrCheck.length < 6) {
                try { logAm('warn', 'trans-am', '⚡ TRANS-AM: addressID 未保存 → 完全停止', { asin: asin }); } catch (e) {}
                toast(
                    '⚠️ addressID 未保存\n通常の 🛒 で 1 回購入を試して送付先 ID を確定してください\n(初回のみ必要)',
                    STOP_RED, 14000
                );
                S.opFullStop();
                return { navigated: false, reason: 'no-address-id' };
            }

            // 保存値 URL (offerListing.1 込み、直販判定済み) 取得
            const savedUrl = getSavedTransAmUrl(asin);
            if (!savedUrl || savedUrl.length < 100 || !/offerListing\.1=/.test(savedUrl)) {
                try { logAm('warn', 'trans-am', '⚡ TRANS-AM: 保存済み直販 URL なし → 完全停止 (要記録)',
                    { asin: asin, hasUrl: !!savedUrl, urlLen: savedUrl ? savedUrl.length : 0 }); } catch (e) {}
                toast(
                    '⚠️ この商品は直販 URL 未取得\n\n' +
                    '【記録方法】\n' +
                    '① 商品ページで 🛒新規開始 を 1 回押す\n' +
                    '② リロードガチャ中に Buy Box / AOD で直販判定されると\n' +
                    '   offerListing.1 が自動保存される\n' +
                    '③ 保存後、TRANS-AM が押せるようになる',
                    STOP_RED, 18000
                );
                S.opFullStop();
                return { navigated: false, reason: 'no-saved-direct-url' };
            }

            // 保存値から offerListing.1 を抽出 → 最新フォーマットで再構築 (quantity.1=1 / merchantID 付与)
            let useUrl = savedUrl;
            try {
                const olidMatch = savedUrl.match(/[?&]offerListing\.1=([^&#]+)/);
                if (olidMatch && olidMatch[1]) {
                    let olidDecoded = olidMatch[1];
                    try { olidDecoded = decodeURIComponent(olidMatch[1]); } catch (e) {}
                    const rebuilt = buildBuynowUrlFromAsinAndOffer(asin, olidDecoded, addrCheck);
                    if (rebuilt) useUrl = rebuilt;
                }
            } catch (e) {}
            const method = 'b-method (saved direct offerListing.1, rebuilt)';

            // (3) 連投ガード (localStorage 永続化、ランダム化、ページ遷移跨ぎ)
            //   ★v0.3.8.82: 3000ms 固定 → 1700-2300ms ランダム (機械的均一性排除、検知シグナル除去)
            try {
                const minIntervalMs = getTransAmMinIntervalMs();
                const lastAt = getTransAmLastNavigateAt(asin);
                const sinceLast = Date.now() - lastAt;
                if (sinceLast < minIntervalMs) {
                    const waitMs = minIntervalMs - sinceLast;
                    try { logAm('info', 'trans-am', '⚡ TRANS-AM: 連投ガード発動 → スキップ', {
                        asin: asin, sinceLastMs: sinceLast, minIntervalMs: minIntervalMs,
                    }); } catch (e) {}
                    toast('⏳ ' + Math.ceil(waitMs / 1000) + '秒後にリトライしてください (連投防止)', '#ed6c02', 6000);
                    return { navigated: false, reason: 'interval-guard', waitMs: waitMs };
                }
            } catch (e) {}

            // ★v0.3.8.36: errCount による cool-down チェックを撤去 (HIRO 要望)
            //   連続エラーカウンタは handleAmazonError 内の「4 回連続で完全停止」のみで判定。
            //   ボタン押下時のガードは連投ガード (3秒) だけ。

            // (5) navigate
            try { logAm('info', 'trans-am', '⚡ TRANS-AM: navigate', {
                asin: asin,
                urlLen: useUrl.length,
                urlHead: useUrl.slice(0, 200),
                elapsedMs: Date.now() - _t0,
                method: method,
            }); } catch (e) {}

            toast('⚡ TRANS-AM (B方式 直販オファー) → checkout', '#c41e9e', 2500);
            S.setStep(STEP_PURCHASING);
            setTransAmLastNavigateAt(asin);
            setTimeout(function() {
                try {
                    if (S.shouldHalt()) return;
                    // B方式: 通常の location.href (offerListing.1 込みなので Referer 問題なし)
                    location.href = useUrl;
                } catch (e2) {}
            }, 50);
            return { navigated: true, source: method };
        } catch (e) {
            try { logAm('warn', 'trans-am', '⚡ TRANS-AM: 例外発生 → 完全停止',
                { err: e && e.message ? e.message : String(e) }); } catch (er) {}
            S.opFullStop();
            return { navigated: false, reason: 'exception' };
        }
    };

    // ────────────────────────────────────────────────────────
    // v0.3.8.11: click 対象ボタン周辺の DOM 完全観測 (offerListingId 抽出経路の特定)
    //   背景: Amazon の click ハンドラが POST で offerListingId を送れている
    //         = HTML 内のどこかに必ず埋まっている
    //   観測: 対象ボタンから親 20 階層遡って、各階層の以下を全部記録
    //     - hidden input (name, value)
    //     - data 属性 (data-* で offer/listing 系の名前)
    //     - script タグ内容 (offerListingId 文字列を含む場合)
    // ────────────────────────────────────────────────────────
    const dumpClickTargetFormStructure = (clickTarget) => {
        try {
            if (!clickTarget) {
                return { err: 'no clickTarget' };
            }

            const result = {
                buttonOuterHtml: (clickTarget.outerHTML || '').slice(0, 2000),
                parentChain: [],
                hiddenInputs: [],
                dataAttrs: [],
                offerListingIdCandidates: [],
                scriptHints: [],
            };

            let p = clickTarget;
            const seenInputKeys = new Set();
            const seenDataKeys = new Set();

            for (let i = 0; i < 20 && p; i++) {
                try {
                    // 親 chain 記録
                    const tag = p.tagName || '';
                    const id = p.id ? '#' + p.id : '';
                    const cls = (p.className || '').toString();
                    const clsHead = cls ? '.' + cls.split(/\s+/).slice(0, 3).join('.') : '';
                    result.parentChain.push('[' + i + '] ' + tag + id + clsHead);

                    // この階層の hidden input + name 付き input を全部取得
                    if (p.querySelectorAll) {
                        try {
                            const inputs = p.querySelectorAll('input[type="hidden"], input[name]');
                            inputs.forEach((h) => {
                                const name = h.getAttribute('name') || '';
                                const val = (h.getAttribute('value') || '').slice(0, 1000);
                                const type = h.getAttribute('type') || '';
                                const key = name + '|' + val.slice(0, 30);
                                if (name && !seenInputKeys.has(key)) {
                                    seenInputKeys.add(key);
                                    result.hiddenInputs.push({
                                        scopeLevel: i,
                                        scopeTag: tag,
                                        type: type,
                                        name: name,
                                        valueLen: val.length,
                                        value: val,
                                    });
                                    // offerListingId 候補判定
                                    const lname = name.toLowerCase();
                                    if (lname.includes('offer')
                                        || lname.includes('listing')
                                        || lname === 'olid'
                                        || lname === 'listingid') {
                                        result.offerListingIdCandidates.push({
                                            source: 'hidden-input',
                                            scopeLevel: i,
                                            name: name,
                                            value: val,
                                        });
                                    }
                                }
                            });
                        } catch (e) {}
                    }

                    // この階層の data-* 属性を観測 (offer/listing 系)
                    if (p.attributes) {
                        try {
                            for (const attr of p.attributes) {
                                const aname = attr.name.toLowerCase();
                                if (aname.startsWith('data-')) {
                                    const akey = i + '|' + attr.name;
                                    if (!seenDataKeys.has(akey)) {
                                        if (aname.includes('offer')
                                            || aname.includes('listing')
                                            || aname.includes('asin')
                                            || aname.includes('seller')
                                            || aname.includes('merchant')) {
                                            seenDataKeys.add(akey);
                                            const val = (attr.value || '').slice(0, 1000);
                                            result.dataAttrs.push({
                                                scopeLevel: i,
                                                scopeTag: tag,
                                                name: attr.name,
                                                value: val,
                                            });
                                            if (aname.includes('offer') || aname.includes('listing')) {
                                                result.offerListingIdCandidates.push({
                                                    source: 'data-attr',
                                                    scopeLevel: i,
                                                    name: attr.name,
                                                    value: val,
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (e) {}
                    }

                    // この階層の script タグ内容を観測 (offerListingId 文字列含むか)
                    if (p.querySelectorAll && i <= 5) { // 上位 5 階層のみ (パフォーマンス)
                        try {
                            const scripts = p.querySelectorAll('script');
                            scripts.forEach((s) => {
                                const txt = s.textContent || '';
                                if (txt.length > 0 && txt.length < 50000) {
                                    const m = txt.match(/offerListingId["']?\s*[:=]\s*["']([^"']+)["']/);
                                    if (m && m[1]) {
                                        const found = m[1].slice(0, 1000);
                                        if (!result.scriptHints.find(x => x.value === found)) {
                                            result.scriptHints.push({
                                                scopeLevel: i,
                                                value: found,
                                            });
                                            result.offerListingIdCandidates.push({
                                                source: 'script-tag',
                                                scopeLevel: i,
                                                name: 'offerListingId',
                                                value: found,
                                            });
                                        }
                                    }
                                }
                            });
                        } catch (e) {}
                    }
                } catch (e) {}

                p = p.parentElement;
            }

            // 観測サマリ
            result.summary = {
                parentChainLen: result.parentChain.length,
                hiddenInputCount: result.hiddenInputs.length,
                dataAttrCount: result.dataAttrs.length,
                offerListingIdCandidateCount: result.offerListingIdCandidates.length,
                scriptHintCount: result.scriptHints.length,
            };

            return result;
        } catch (e) {
            return { err: e && e.message ? e.message : String(e) };
        }
    };

    // ────────────────────────────────────────────────────────
    // v0.3.8.13: AOD AJAX endpoint を fetch(GET) で取得、結果をログに残す (観測モード)
    //   /gp/product/ajax/aodAjaxMain/ref=dp_aod_ALL_mbc?asin=...&pc=dp
    //   既存フローには影響を与えない (await されない fire-and-forget)
    //   結果は使わない、ログだけ取る (iPhone Safari + Userscripts で動くかの検証)
    //   v0.3.8.14 以降で実用化を検討するための基礎情報収集
    // ────────────────────────────────────────────────────────
    const fetchAodAjax = (asin) => {
        if (!asin) return Promise.resolve(null);
        const url = '/gp/product/ajax/aodAjaxMain/ref=dp_aod_ALL_mbc?asin=' + encodeURIComponent(asin) + '&pc=dp';
        const t0 = Date.now();
        try {
            return fetch(url, { credentials: 'include' })
                .then(function(res) {
                    const elapsedMs = Date.now() - t0;
                    if (!res || !res.ok) {
                        try {
                            logAm('info', 'aod-ajax-fetch',
                                'AOD AJAX fetch 失敗: status=' + (res && res.status),
                                { url: url, status: res && res.status, elapsedMs: elapsedMs });
                        } catch (e) {}
                        return null;
                    }
                    return res.text().then(function(html) {
                        try {
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(html, 'text/html');
                            const pinned = doc.querySelector('#aod-pinned-offer');
                            const pinnedSoldBy = pinned && pinned.querySelector('#aod-offer-soldBy');
                            const pinnedSoldByText = pinnedSoldBy ? (pinnedSoldBy.textContent || '').trim().slice(0, 80) : '';
                            const offerCount = doc.querySelectorAll('#aod-offer').length;
                            const submitInput = pinned && pinned.querySelector('input[name="submit.addToCart"]');
                            const allInputs = pinned ? Array.from(pinned.querySelectorAll('input')).slice(0, 20).map(function(input) {
                                return {
                                    name: (input.getAttribute('name') || '').slice(0, 60),
                                    valueHead: ((input.getAttribute('value') || '') + '').slice(0, 80),
                                    valueLen: (input.getAttribute('value') || '').length,
                                };
                            }) : [];
                            const isDirectFromAjax = pinnedSoldByText.indexOf('Amazon') >= 0 || pinnedSoldByText.indexOf('アマゾン') >= 0;
                            logAm('info', 'aod-ajax-fetch',
                                'AOD AJAX 取得成功: pinnedSoldBy="' + pinnedSoldByText + '" offerCount=' + offerCount + ' isDirect=' + isDirectFromAjax,
                                {
                                    url: url,
                                    status: res.status,
                                    elapsedMs: elapsedMs,
                                    htmlLen: html.length,
                                    pinnedExists: !!pinned,
                                    pinnedSoldByText: pinnedSoldByText,
                                    pinnedSubmitInputExists: !!submitInput,
                                    offerCount: offerCount,
                                    isDirectFromAjax: isDirectFromAjax,
                                    pinnedInputs: allInputs,
                                });
                        } catch (e) {
                            try {
                                logAm('info', 'aod-ajax-fetch',
                                    'AOD AJAX パース失敗: ' + String(e && e.message ? e.message : e),
                                    { url: url, error: String(e && e.message ? e.message : e), elapsedMs: elapsedMs });
                            } catch (e2) {}
                        }
                        return null;
                    });
                })
                .catch(function(err) {
                    try {
                        logAm('info', 'aod-ajax-fetch',
                            'AOD AJAX fetch エラー: ' + String(err && err.message ? err.message : err),
                            { url: url, error: String(err && err.message ? err.message : err), elapsedMs: Date.now() - t0 });
                    } catch (e) {}
                    return null;
                });
        } catch (e) {
            try {
                logAm('info', 'aod-ajax-fetch',
                    'AOD AJAX fetch 起動エラー: ' + String(e && e.message ? e.message : e),
                    { url: url, error: String(e && e.message ? e.message : e) });
            } catch (e2) {}
            return Promise.resolve(null);
        }
    };

    // ────────────────────────────────────────────────────────
    // v0.3.8.10: AOD click 後のネットワーク観測 (即時出力方式)
    //   - fetch/XHR 検知の瞬間に即 logAm (画面遷移で消失しない)
    //   - status は readystatechange / fetch.then で後追い別ログ
    //     ('aod-click-network-status' タグ)
    //   - 5 秒バッチ蓄積は廃止 (HIRO 指示「全部常時 ON」)
    //   - durationMs 経過で hook 解除 (cart 画面以降の req 混入防止)
    //     終了時に 'aod-click-network-end' タグで 1 件出力
    // ────────────────────────────────────────────────────────

    // ★v0.3.8.73 案C: 注文確定 POST /spc/place-order のレスポンス監視
    //   HIRO 報告: 確定 click 時にダウンロードポップアップが出る
    //   原因仮説: Amazon サーバが HTML 以外 (JSON/エラー) を返し、Safari がダウンロード扱い
    //   対策: fetch/xhr hook で POST /spc/place-order を捕捉、Content-Type が HTML 以外なら
    //         place-order-non-html-response 警告ログを出す (原因特定+将来検知用)
    //   呼出: performOrderConfirm の click 投入直前で 10 秒間 hook 起動
    const observePlaceOrderResponse = (durationMs) => {
        try {
            const startedAt = Date.now();
            let active = true;
            const origFetch = window.fetch;
            const origOpen = XMLHttpRequest.prototype.open;
            const origSend = XMLHttpRequest.prototype.send;

            // ── fetch wrap ──
            window.fetch = function(input, init) {
                if (!active) return origFetch.apply(this, arguments);
                const url = (typeof input === 'string') ? input : (input && input.url) || '';
                const method = (init && init.method) || ((input && input.method) || 'GET');
                return origFetch.apply(this, arguments).then(function(res) {
                    try {
                        const isPlaceOrder = /\/spc\/place-order/.test(String(url || '')) && /POST/i.test(method || '');
                        if (isPlaceOrder) {
                            const ct = (res && res.headers && res.headers.get('content-type')) || '';
                            const isHtml = /text\/html/i.test(ct);
                            // ★v0.3.8.80: error → info に格下げ
                            //   form.requestSubmit() は top-frame submit (XHR ではない) のため、
                            //   observer が捕捉する XHR は本物の注文 POST ではなく副次 XHR (テレメトリ等)。
                            //   非 HTML 応答は副次 XHR の正常応答 (空 body の ping 等) であり、
                            //   ダウンロード popup の原因ではない。観察情報として info で記録。
                            const tag = isHtml ? 'place-order-response' : 'place-order-non-html-response';
                            const msg = isHtml
                                ? '✅ place-order POST 正常 (HTML レスポンス)'
                                : '📋 place-order 副次 XHR 観測 (購入は別経路で完結、参考情報)';
                            try { logAm('info', tag, msg, {
                                method: method, url: String(url || '').slice(0, 200),
                                status: res ? res.status : null,
                                contentType: ct, tMs: Date.now() - startedAt,
                            }); } catch (e) {}
                            // body 先頭を取得 (HTML 以外の時は中身も記録 - 将来の調査用)
                            if (!isHtml && res) {
                                res.clone().text().then(function(text) {
                                    try { logAm('info', 'place-order-response-body',
                                        '📋 place-order 副次 XHR レスポンスボディ先頭 (参考情報)', {
                                        bodyHead: String(text || '').slice(0, 2000),
                                        contentType: ct,
                                    }); } catch (e) {}
                                }).catch(function() {});
                            }
                        }
                    } catch (e) {}
                    return res;
                });
            };

            // ── XHR wrap ──
            XMLHttpRequest.prototype.open = function(method, url) {
                try {
                    this.__lbamPlaceOrderMethod = method;
                    this.__lbamPlaceOrderUrl = url;
                } catch (e) {}
                return origOpen.apply(this, arguments);
            };
            XMLHttpRequest.prototype.send = function(body) {
                if (!active) return origSend.apply(this, arguments);
                const self = this;
                const method = self.__lbamPlaceOrderMethod || '';
                const url = String(self.__lbamPlaceOrderUrl || '');
                self.addEventListener('loadend', function() {
                    try {
                        const isPlaceOrder = /\/spc\/place-order/.test(url) && /POST/i.test(method);
                        if (isPlaceOrder) {
                            const ct = self.getResponseHeader('content-type') || '';
                            const isHtml = /text\/html/i.test(ct);
                            // ★v0.3.8.80: error → info に格下げ (理由は fetch wrap 側コメント参照)
                            const tag = isHtml ? 'place-order-response' : 'place-order-non-html-response';
                            const msg = isHtml
                                ? '✅ place-order POST 正常 (HTML レスポンス) [xhr]'
                                : '📋 place-order 副次 XHR 観測 [xhr] (購入は別経路で完結、参考情報)';
                            try { logAm('info', tag, msg, {
                                method: method, url: url.slice(0, 200),
                                status: self.status,
                                contentType: ct, tMs: Date.now() - startedAt,
                            }); } catch (e) {}
                            if (!isHtml) {
                                try {
                                    let respText = '';
                                    try { respText = self.responseText || ''; } catch (e2) {}
                                    logAm('info', 'place-order-response-body',
                                        '📋 place-order 副次 XHR レスポンスボディ先頭 [xhr] (参考情報)', {
                                        bodyHead: String(respText).slice(0, 2000),
                                        contentType: ct,
                                    });
                                } catch (e) {}
                            }
                        }
                    } catch (e) {}
                });
                return origSend.apply(this, arguments);
            };

            // ── durationMs 経過で hook 解除 ──
            setTimeout(function() {
                try {
                    active = false;
                    window.fetch = origFetch;
                    XMLHttpRequest.prototype.open = origOpen;
                    XMLHttpRequest.prototype.send = origSend;
                    try { logAm('info', 'place-order-observe-end',
                        'place-order 観測終了 (' + durationMs + 'ms 経過、hook 解除)', {
                        durationMs: durationMs,
                    }); } catch (e) {}
                } catch (e) {}
            }, durationMs);
        } catch (e) {
            try { logAm('warn', 'place-order-observe',
                'observePlaceOrderResponse 起動失敗', { err: String(e && e.message || e) }); } catch (er) {}
        }
    };

    // ────────────────────────────────────────────────────────
    //   v0.3.8.4 AOD click 後のネットワーク観測 (即時出力方式)
    //   - fetch/xhr を hook して、req 発生の瞬間に logAm 1 件出力
    //     ('aod-click-network' タグ)
    //   - resp の status を loadend で同じ reqId に紐付け 1 件出力
    // ────────────────────────────────────────────────────────
    const observeNetworkAfterAodClick = (durationMs) => {
        try {
            const startedAt = Date.now();
            let active = true;

            // ── fetch wrap ──
            const origFetch = window.fetch;
            window.fetch = function(input, init) {
                if (!active) return origFetch.apply(this, arguments);
                let reqId, method, url, body;
                try {
                    reqId = 'f' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
                    url = (typeof input === 'string')
                        ? input
                        : (input && input.url) ? input.url : '';
                    method = (init && init.method)
                        ? init.method
                        : ((input && input.method) ? input.method : 'GET');
                    body = '';
                    if (init && init.body) {
                        try {
                            if (typeof init.body === 'string') {
                                body = init.body;
                            } else if (init.body instanceof FormData) {
                                const parts = [];
                                for (const [k, v] of init.body.entries()) {
                                    parts.push(k + '=' + String(v).slice(0, 100));
                                }
                                body = parts.join('&');
                            } else if (init.body instanceof URLSearchParams) {
                                body = init.body.toString();
                            } else {
                                body = String(init.body);
                            }
                        } catch (be) { body = '(body parse err: ' + (be && be.message ? be.message : 'unknown') + ')'; }
                    }
                    // ★ 検知の瞬間に即出力 (画面遷移で消失しない)
                    logAm('info', 'aod-click-network',
                        '[fetch] ' + method + ' ' + String(url).slice(0, 200),
                        {
                            reqId: reqId,
                            tMs: Date.now() - startedAt,
                            type: 'fetch',
                            method: method,
                            url: String(url).slice(0, 1000),
                            bodyLen: body.length,
                            bodyHead: body.slice(0, 1000),
                        });
                    // ★v0.3.8.66: fetch 経由も同じく body から offerListingId 抽出 → 保存
                    try {
                        if (/POST/i.test(method || '')
                            && /\/cart\/carts\/retail\/items/.test(String(url))
                            && body && body.length > 0) {
                            const asinM = body.match(/"asin"\s*:\s*"([A-Z0-9]{10})"/);
                            const olidM = body.match(/"offerListingId"\s*:\s*"([^"]+)"/);
                            if (asinM && olidM) {
                                const asinX = asinM[1];
                                const olidRaw = olidM[1];
                                const olid = (function(){ try { return decodeURIComponent(olidRaw); } catch (e) { return olidRaw; } })();
                                const addr = (function(){ try { return localStorage.getItem('LB_AM_ADDRESS_ID') || ''; } catch (e) { return ''; } })();
                                if (asinX && olid && olid.length >= 20 && addr) {
                                    const urlNew = buildBuynowUrlFromAsinAndOffer(asinX, olid, addr);
                                    if (urlNew) {
                                        const key = 'LB_AM_BUYNOW_URL_' + asinX;
                                        const prev = localStorage.getItem(key) || '';
                                        if (prev !== urlNew) {
                                            localStorage.setItem(key, urlNew);
                                            try { localStorage.setItem(key + '_AT', String(Date.now())); } catch (e) {}
                                            try { localStorage.removeItem('LB_AM_ASIN_ONLY_' + asinX); } catch (e) {}
                                            try {
                                                const title = extractProductTitle();
                                                if (title) localStorage.setItem('LB_AM_PRODUCT_NAME_' + asinX, title);
                                            } catch (e) {}
                                            try { resetTransAmErrCount(); } catch (e) {}
                                            try {
                                                logAm('info', 'buynow-url-saved-from-xhr-body',
                                                    '✅ AOD カート追加 fetch body から offerListingId 抽出 → URL 保存',
                                                    { asin: asinX, olidLen: olid.length });
                                            } catch (e) {}
                                            try { toast('💾 直販 URL 保存: ' + asinX + ' (AOD fetch 経由)', BUY_GREEN, 3500); } catch (e) {}
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) {}
                } catch (e) {}

                return origFetch.apply(this, arguments).then(function(res) {
                    try {
                        logAm('info', 'aod-click-network-status',
                            '[fetch resp] ' + (method || '?') + ' ' + String(url || '').slice(0, 100) + ' → ' + (res ? res.status : '?'),
                            {
                                reqId: reqId,
                                tMs: Date.now() - startedAt,
                                type: 'fetch',
                                status: res ? res.status : null,
                            });
                    } catch (e2) {}
                    // v0.3.8.15: AOD カート追加 API 200 検知 → グローバルフラグ ON
                    //   clickAodAmazonOffer の「カートを見る」visible 待ちが
                    //   このフラグを並列チェックして DOM 検出失敗時のショートカットに使う。
                    try {
                        if (res && res.status === 200
                            && /POST/i.test(method || '')
                            && /\/cart\/carts\/retail\/items/.test(String(url || ''))) {
                            _aodCartAddApiOk = true;
                            _aodCartAddApiOkAt = Date.now();
                            try {
                                logAm('info', 'aod-cart-api-ok',
                                    'AOD カート追加 API 200 検知 (DOM 待たずに進める)',
                                    { url: String(url || '').slice(0, 200), status: 200, tMs: Date.now() - startedAt });
                            } catch (e3) {}
                        }
                    } catch (e2) {}
                    // v0.3.8.13/15/16: 4xx/5xx の response body を取得 (422 原因究明用)
                    //   v0.3.8.15: bodyHead を 1000 → 3000 文字に拡張
                    //   v0.3.8.16: bodyTail も別ログ (Discord 切れ対策、末尾も見える)
                    try {
                        if (res && res.status >= 400) {
                            res.clone().text().then(function(text) {
                                try {
                                    const fullText = String(text || '');
                                    const bodyHead = fullText.slice(0, 3000);
                                    logAm('info', 'aod-click-network-error-body',
                                        '[fetch err body] ' + (method || '?') + ' ' + String(url || '').slice(0, 100) + ' → ' + res.status,
                                        {
                                            reqId: reqId,
                                            tMs: Date.now() - startedAt,
                                            method: method,
                                            url: String(url || '').slice(0, 1000),
                                            status: res.status,
                                            bodyLen: fullText.length,
                                            bodyHead: bodyHead,
                                        });
                                    // v0.3.8.16: body が 3000 超なら末尾も別ログ
                                    if (fullText.length > 3000) {
                                        const bodyTail = fullText.slice(-3000);
                                        logAm('info', 'aod-click-network-error-body-tail',
                                            '[fetch err body 末尾] ' + (method || '?') + ' → ' + res.status,
                                            { reqId: reqId, bodyLen: fullText.length, bodyTail: bodyTail });
                                    }
                                } catch (e3) {}
                            }).catch(function() {});
                        }
                    } catch (e2) {}
                    return res;
                }).catch(function(err) {
                    try {
                        logAm('info', 'aod-click-network-status',
                            '[fetch err] ' + (method || '?') + ' ' + String(url || '').slice(0, 100),
                            {
                                reqId: reqId,
                                tMs: Date.now() - startedAt,
                                type: 'fetch',
                                err: err && err.message ? err.message : 'unknown',
                            });
                    } catch (e2) {}
                    throw err;
                });
            };

            // ── XHR wrap ──
            const origOpen = XMLHttpRequest.prototype.open;
            const origSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function(method, url) {
                try {
                    this.__lbamMethod = method;
                    this.__lbamUrl = url;
                    this.__lbamReqId = 'x' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
                } catch (e) {}
                return origOpen.apply(this, arguments);
            };
            XMLHttpRequest.prototype.send = function(body) {
                if (!active) return origSend.apply(this, arguments);
                let bodyStr = '';
                try {
                    if (body) {
                        try {
                            if (typeof body === 'string') {
                                bodyStr = body;
                            } else if (body instanceof FormData) {
                                const parts = [];
                                for (const [k, v] of body.entries()) {
                                    parts.push(k + '=' + String(v).slice(0, 100));
                                }
                                bodyStr = parts.join('&');
                            } else if (body instanceof URLSearchParams) {
                                bodyStr = body.toString();
                            } else {
                                bodyStr = String(body);
                            }
                        } catch (be) { bodyStr = '(body parse err: ' + (be && be.message ? be.message : 'unknown') + ')'; }
                    }
                    const method = this.__lbamMethod || '';
                    const url = String(this.__lbamUrl || '');
                    const reqId = this.__lbamReqId || '';
                    // ★ 検知の瞬間に即出力
                    logAm('info', 'aod-click-network',
                        '[xhr] ' + method + ' ' + url.slice(0, 200),
                        {
                            reqId: reqId,
                            tMs: Date.now() - startedAt,
                            type: 'xhr',
                            method: method,
                            url: url.slice(0, 1000),
                            bodyLen: bodyStr.length,
                            bodyHead: bodyStr.slice(0, 1000),
                        });
                    // ★v0.3.8.66: AOD カート追加 xhr body から asin + offerListingId を抽出 → URL 保存
                    //   HIRO 報告 (2026-05-19 ログ精査): Amazon の新 AOD UI は DOM form に
                    //   offerListingId hidden input を持たず、xhr POST body のみに含む。
                    //   DOM 探索 (段階1〜4 + 救済) は構造的に取得不可能 → xhr 観測のみが唯一の経路。
                    //   findAodAmazonOffer で直販判定 (Amazon.co.jp 出品) 済の click 直後 5 秒以内
                    //   なので、body 内の offerListingId は直販 URL として保存可能。
                    try {
                        if (/POST/i.test(method)
                            && /\/cart\/carts\/retail\/items/.test(url)
                            && bodyStr && bodyStr.length > 0) {
                            const asinM = bodyStr.match(/"asin"\s*:\s*"([A-Z0-9]{10})"/);
                            const olidM = bodyStr.match(/"offerListingId"\s*:\s*"([^"]+)"/);
                            if (asinM && olidM) {
                                const asinX = asinM[1];
                                const olidRaw = olidM[1];
                                const olid = (function(){ try { return decodeURIComponent(olidRaw); } catch (e) { return olidRaw; } })();
                                const addr = (function(){ try { return localStorage.getItem('LB_AM_ADDRESS_ID') || ''; } catch (e) { return ''; } })();
                                if (asinX && olid && olid.length >= 20 && addr) {
                                    const urlNew = buildBuynowUrlFromAsinAndOffer(asinX, olid, addr);
                                    if (urlNew) {
                                        const key = 'LB_AM_BUYNOW_URL_' + asinX;
                                        const prev = localStorage.getItem(key) || '';
                                        if (prev !== urlNew) {
                                            localStorage.setItem(key, urlNew);
                                            try { localStorage.setItem(key + '_AT', String(Date.now())); } catch (e) {}
                                            try { localStorage.removeItem('LB_AM_ASIN_ONLY_' + asinX); } catch (e) {}
                                            try {
                                                const title = extractProductTitle();
                                                if (title) localStorage.setItem('LB_AM_PRODUCT_NAME_' + asinX, title);
                                            } catch (e) {}
                                            try { resetTransAmErrCount(); } catch (e) {}
                                            try {
                                                logAm('info', 'buynow-url-saved-from-xhr-body',
                                                    '✅ AOD カート追加 xhr body から offerListingId 抽出 → URL 保存 (TRANS-AM 用)',
                                                    { asin: asinX, olidLen: olid.length });
                                            } catch (e) {}
                                            try { toast('💾 直販 URL 保存: ' + asinX + ' (AOD xhr 経由)', BUY_GREEN, 3500); } catch (e) {}
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) {}
                    const self = this;
                    this.addEventListener('readystatechange', function() {
                        try {
                            if (self.readyState === 4) {
                                logAm('info', 'aod-click-network-status',
                                    '[xhr resp] ' + method + ' ' + url.slice(0, 100) + ' → ' + self.status,
                                    {
                                        reqId: reqId,
                                        tMs: Date.now() - startedAt,
                                        type: 'xhr',
                                        status: self.status,
                                    });
                                // v0.3.8.15: AOD カート追加 API 200 検知 → グローバルフラグ ON
                                try {
                                    if (self.status === 200
                                        && /POST/i.test(method || '')
                                        && /\/cart\/carts\/retail\/items/.test(url)) {
                                        _aodCartAddApiOk = true;
                                        _aodCartAddApiOkAt = Date.now();
                                        try {
                                            logAm('info', 'aod-cart-api-ok',
                                                'AOD カート追加 API 200 検知 (DOM 待たずに進める)',
                                                { url: url.slice(0, 200), status: 200, tMs: Date.now() - startedAt });
                                        } catch (e4) {}
                                    }
                                } catch (e3) {}
                            }
                        } catch (e2) {}
                    });
                    // v0.3.8.13/15/16: 4xx/5xx の response body を取得 (422 原因究明用)
                    //   v0.3.8.15: bodyHead を 1000 → 3000 文字に拡張
                    //   v0.3.8.16: bodyTail も別ログ (Discord 切れ対策)
                    this.addEventListener('loadend', function() {
                        try {
                            if (self.status >= 400) {
                                let respText = '';
                                try { respText = self.responseText || ''; } catch (e3) {}
                                const respHead = String(respText).slice(0, 3000);
                                logAm('info', 'aod-click-network-error-body',
                                    '[xhr err body] ' + method + ' ' + url.slice(0, 100) + ' → ' + self.status,
                                    {
                                        reqId: reqId,
                                        tMs: Date.now() - startedAt,
                                        method: method,
                                        url: url.slice(0, 1000),
                                        status: self.status,
                                        bodyLen: respText.length,
                                        bodyHead: respHead,
                                    });
                                if (respText.length > 3000) {
                                    logAm('info', 'aod-click-network-error-body-tail',
                                        '[xhr err body 末尾] ' + method + ' → ' + self.status,
                                        { reqId: reqId, bodyLen: respText.length, bodyTail: respText.slice(-3000) });
                                }
                            }
                        } catch (e3) {}
                    });
                } catch (e) {}
                return origSend.apply(this, arguments);
            };

            // ── durationMs 経過で hook 解除 (cart 画面以降の req 混入防止) ──
            setTimeout(function() {
                try {
                    active = false;
                    window.fetch = origFetch;
                    XMLHttpRequest.prototype.open = origOpen;
                    XMLHttpRequest.prototype.send = origSend;
                    logAm('info', 'aod-click-network-end',
                        '観測終了 (' + (durationMs / 1000) + ' 秒経過、hook 解除)',
                        { durationMs: durationMs });
                } catch (e) {}
            }, durationMs);
        } catch (e) {
            try {
                logAm('warn', 'aod-click-network',
                    '観測機構エラー', { err: e && e.message ? e.message : String(e) });
            } catch (e2) {}
        }
    };

    // ────────────────────────────────────────────────────────
    // v0.3.8.12: Buy Box ルートの「今すぐ買う」click 後通信観測
    //   - observeNetworkAfterAodClick (v0.3.8.10) と同じ即時出力方式
    //   - ログタグは buynow-click-network / buynow-click-network-status /
    //     buynow-click-network-end (AOD 版と区別、混ざらない)
    //   - click 投入箇所そのものは触らない、hook を仕掛けるだけ
    //   - 5 秒で hook 解除 (navigation 後の req 混入防止)
    //   - fetch response の responseUrl / redirected も記録 (navigate 解析用)
    // ────────────────────────────────────────────────────────
    const observeNetworkAfterBuyNowClick = (durationMs) => {
        try {
            const startedAt = Date.now();
            let active = true;

            // ── fetch wrap ──
            const origFetch = window.fetch;
            window.fetch = function(input, init) {
                if (!active) return origFetch.apply(this, arguments);
                let reqId, method, url, body;
                try {
                    reqId = 'f' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
                    url = (typeof input === 'string')
                        ? input
                        : (input && input.url) ? input.url : '';
                    method = (init && init.method)
                        ? init.method
                        : ((input && input.method) ? input.method : 'GET');
                    body = '';
                    if (init && init.body) {
                        try {
                            if (typeof init.body === 'string') {
                                body = init.body;
                            } else if (init.body instanceof FormData) {
                                const parts = [];
                                for (const [k, v] of init.body.entries()) {
                                    parts.push(k + '=' + String(v).slice(0, 100));
                                }
                                body = parts.join('&');
                            } else if (init.body instanceof URLSearchParams) {
                                body = init.body.toString();
                            } else {
                                body = String(init.body);
                            }
                        } catch (be) { body = '(body parse err: ' + (be && be.message ? be.message : 'unknown') + ')'; }
                    }
                    logAm('info', 'buynow-click-network',
                        '[fetch] ' + method + ' ' + String(url).slice(0, 200),
                        {
                            reqId: reqId,
                            tMs: Date.now() - startedAt,
                            type: 'fetch',
                            method: method,
                            url: String(url).slice(0, 1500),
                            bodyLen: body.length,
                            bodyHead: body.slice(0, 1500),
                        });
                    // ★v0.3.8.28: 観測した URL を localStorage に保存
                    try { trySaveBuynowUrlFromObserved(url); } catch (sve) {}
                } catch (e) {}

                return origFetch.apply(this, arguments).then(function(res) {
                    try {
                        logAm('info', 'buynow-click-network-status',
                            '[fetch resp] ' + (method || '?') + ' ' + String(url || '').slice(0, 100) + ' → ' + (res ? res.status : '?'),
                            {
                                reqId: reqId,
                                tMs: Date.now() - startedAt,
                                type: 'fetch',
                                status: res ? res.status : null,
                                respUrl: res && res.url ? String(res.url).slice(0, 1500) : '',
                                redirected: res ? !!res.redirected : false,
                            });
                        // ★v0.3.8.28: response URL からも保存 (redirect 後の URL)
                        try { if (res && res.url) trySaveBuynowUrlFromObserved(res.url); } catch (sve) {}
                    } catch (e2) {}
                    // v0.3.8.13/15/16: 4xx/5xx の response body を取得 (v0.3.8.16: bodyTail も別ログ)
                    try {
                        if (res && res.status >= 400) {
                            res.clone().text().then(function(text) {
                                try {
                                    const fullText = String(text || '');
                                    const bodyHead = fullText.slice(0, 3000);
                                    logAm('info', 'buynow-click-network-error-body',
                                        '[fetch err body] ' + (method || '?') + ' ' + String(url || '').slice(0, 100) + ' → ' + res.status,
                                        {
                                            reqId: reqId,
                                            tMs: Date.now() - startedAt,
                                            method: method,
                                            url: String(url || '').slice(0, 1500),
                                            status: res.status,
                                            bodyLen: fullText.length,
                                            bodyHead: bodyHead,
                                        });
                                    if (fullText.length > 3000) {
                                        logAm('info', 'buynow-click-network-error-body-tail',
                                            '[fetch err body 末尾] ' + (method || '?') + ' → ' + res.status,
                                            { reqId: reqId, bodyLen: fullText.length, bodyTail: fullText.slice(-3000) });
                                    }
                                } catch (e3) {}
                            }).catch(function() {});
                        }
                    } catch (e2) {}
                    return res;
                }).catch(function(err) {
                    try {
                        logAm('info', 'buynow-click-network-status',
                            '[fetch err] ' + (method || '?') + ' ' + String(url || '').slice(0, 100),
                            {
                                reqId: reqId,
                                tMs: Date.now() - startedAt,
                                type: 'fetch',
                                err: err && err.message ? err.message : 'unknown',
                            });
                    } catch (e2) {}
                    throw err;
                });
            };

            // ── XHR wrap ──
            const origOpen = XMLHttpRequest.prototype.open;
            const origSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function(method, url) {
                try {
                    this.__lbamBnMethod = method;
                    this.__lbamBnUrl = url;
                    this.__lbamBnReqId = 'x' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
                } catch (e) {}
                return origOpen.apply(this, arguments);
            };
            XMLHttpRequest.prototype.send = function(body) {
                if (!active) return origSend.apply(this, arguments);
                let bodyStr = '';
                try {
                    if (body) {
                        try {
                            if (typeof body === 'string') {
                                bodyStr = body;
                            } else if (body instanceof FormData) {
                                const parts = [];
                                for (const [k, v] of body.entries()) {
                                    parts.push(k + '=' + String(v).slice(0, 100));
                                }
                                bodyStr = parts.join('&');
                            } else if (body instanceof URLSearchParams) {
                                bodyStr = body.toString();
                            } else {
                                bodyStr = String(body);
                            }
                        } catch (be) { bodyStr = '(body parse err: ' + (be && be.message ? be.message : 'unknown') + ')'; }
                    }
                    const method = this.__lbamBnMethod || '';
                    const url = String(this.__lbamBnUrl || '');
                    const reqId = this.__lbamBnReqId || '';
                    logAm('info', 'buynow-click-network',
                        '[xhr] ' + method + ' ' + url.slice(0, 200),
                        {
                            reqId: reqId,
                            tMs: Date.now() - startedAt,
                            type: 'xhr',
                            method: method,
                            url: url.slice(0, 1500),
                            bodyLen: bodyStr.length,
                            bodyHead: bodyStr.slice(0, 1500),
                        });
                    // ★v0.3.8.28: 観測した URL を localStorage に保存
                    try { trySaveBuynowUrlFromObserved(url); } catch (sve) {}
                    const self = this;
                    this.addEventListener('readystatechange', function() {
                        try {
                            if (self.readyState === 4) {
                                logAm('info', 'buynow-click-network-status',
                                    '[xhr resp] ' + method + ' ' + url.slice(0, 100) + ' → ' + self.status,
                                    {
                                        reqId: reqId,
                                        tMs: Date.now() - startedAt,
                                        type: 'xhr',
                                        status: self.status,
                                        responseURL: self.responseURL ? String(self.responseURL).slice(0, 1500) : '',
                                    });
                                // ★v0.3.8.28: responseURL からも保存
                                try { if (self.responseURL) trySaveBuynowUrlFromObserved(self.responseURL); } catch (sve) {}
                            }
                        } catch (e2) {}
                    });
                    // v0.3.8.13/15/16: 4xx/5xx の response body を取得 (v0.3.8.16: bodyTail も別ログ)
                    this.addEventListener('loadend', function() {
                        try {
                            if (self.status >= 400) {
                                let respText = '';
                                try { respText = self.responseText || ''; } catch (e3) {}
                                const respHead = String(respText).slice(0, 3000);
                                logAm('info', 'buynow-click-network-error-body',
                                    '[xhr err body] ' + method + ' ' + url.slice(0, 100) + ' → ' + self.status,
                                    {
                                        reqId: reqId,
                                        tMs: Date.now() - startedAt,
                                        method: method,
                                        url: url.slice(0, 1500),
                                        status: self.status,
                                        bodyLen: respText.length,
                                        bodyHead: respHead,
                                    });
                                if (respText.length > 3000) {
                                    logAm('info', 'buynow-click-network-error-body-tail',
                                        '[xhr err body 末尾] ' + method + ' → ' + self.status,
                                        { reqId: reqId, bodyLen: respText.length, bodyTail: respText.slice(-3000) });
                                }
                            }
                        } catch (e3) {}
                    });
                } catch (e) {}
                return origSend.apply(this, arguments);
            };

            // ── durationMs 経過で hook 解除 (navigation 後の req 混入防止) ──
            setTimeout(function() {
                try {
                    active = false;
                    window.fetch = origFetch;
                    XMLHttpRequest.prototype.open = origOpen;
                    XMLHttpRequest.prototype.send = origSend;
                    logAm('info', 'buynow-click-network-end',
                        '観測終了 (' + (durationMs / 1000) + ' 秒経過、hook 解除)',
                        { durationMs: durationMs });
                } catch (e) {}
            }, durationMs);
        } catch (e) {
            try {
                logAm('warn', 'buynow-click-network',
                    '観測機構エラー', { err: e && e.message ? e.message : String(e) });
            } catch (e2) {}
        }
    };

    // [2.3] パネル UI 構造診断 (bbox + class)
    const dumpPanelLayout = () => {
        try {
            const panel = document.getElementById('lb-am-panel');
            const status = document.getElementById('lb-am-panel-status');
            const toasts = document.getElementById('lb-am-panel-toasts');
            if (!panel) return null;
            const toJson = (el) => {
                try { return el ? el.getBoundingClientRect().toJSON() : null; } catch (e) { return null; }
            };
            return {
                panelBox: toJson(panel),
                statusBox: toJson(status),
                toastsBox: toJson(toasts),
                toastCount: toasts && toasts.children ? toasts.children.length : 0,
                toastClassNames: Array.from((toasts && toasts.children) || []).map(c => c.className).slice(0, 5),
            };
        } catch (e) { return { err: e.message }; }
    };

    // ───────────────────────────────────────────────
    // ★v0.3.7: AOD オファーを fetch(urlencoded) でカート追加してから、
    //   /checkout/entry/cart に直接 navigate することで byg 画面 + カート画面
    //   を 2 段スキップして注文確定画面に直行する。
    //   Chrome MCP 実機検証で完全動作確認済み (B0DPFH5SR3, 2026-05-16):
    //     fetch 409ms → 200 OK → navigate → Amazon 内部 redirect →
    //     /checkout/p/.../spc → 「注文を確定する」click → /thankyou/
    //     合計約 2.6 秒 (v0.3.5 比 -2.8 秒)
    //
    //   ★v0.3.8.3: 3 段階フォールバック実装
    //     Step 1:  closest('form') 試行 (既存)
    //     Step 1b: closest 失敗時に ASIN 逆引き (form.AodAddToCart 全列挙)
    //     Step 1c: それでも失敗なら DOM 情報を logAm に出力 (調査用)
    //     Step 5:  fetch に AbortController.signal 付与 (停止ボタン即応)
    //
    //   成功時: true 返す (Express Checkout 監視が「注文を確定する」 click を引き継ぐ)
    //   失敗時: false 返す (clickAodAmazonOffer の従来 click 処理にフォールバック)
    //
    //   iOS Safari (HIRO 環境) で closest が外れる場合も Step 1b で救済可能。
    // ───────────────────────────────────────────────
    const tryAodFetchAndDirectCheckout = async (aodCartButton) => {
        if (S.shouldHalt()) return false;

        try {
            // ── Step 1: AOD form 取得 (closest 経路) ──
            let aodForm = aodCartButton.closest && aodCartButton.closest('form');

            // ── ★v0.3.8.3: Step 1b: closest で取れない場合は ASIN 逆引き ──
            //   HIRO iOS Safari モバイル UI でボタンが form 外にあっても、
            //   ページ内の form.AodAddToCart から ASIN 一致するものを選ぶ。
            //   実機検証 (PC Chrome 2026-05-16):
            //     ASIN 逆引き form → FormData → fetch = 200 OK (464ms)
            if (!aodForm) {
                const asinMatch = location.href.match(/\/dp\/([A-Z0-9]{10})/);
                const asin = asinMatch ? asinMatch[1] : null;
                if (asin) {
                    const aodForms = document.querySelectorAll('form.AodAddToCart');
                    for (const f of aodForms) {
                        const ai = f.querySelector('input[name="items[0.base][asin]"]');
                        if (ai && ai.value === asin) {
                            aodForm = f;
                            try {
                                logAm('info', 'aod-direct-form-lookup', 'ASIN 逆引き form 取得成功', {
                                    asin: asin,
                                    formAction: f.action,
                                });
                            } catch (e) {}
                            break;
                        }
                    }
                }
            }

            // ── ★v0.3.8.3 / v0.3.8.4 拡張: Step 1c: それでも form が取れなければ詳細 DOM dump ──
            //   調査用: HIRO 環境の AOD DOM 構造を判明させて次イテレーションで対応
            //   v0.3.8.4: dumpAodButtonContext で詳細 DOM (outerHTML + 親 10 階層) を取得
            if (!aodForm) {
                try {
                    logAm('info', 'aod-direct-skip', 'AOD form not found (closest も逆引きも失敗) → fallback', {
                        cartBtnTag: aodCartButton.tagName,
                        cartBtnType: aodCartButton.type,
                        cartBtnAriaLabel: (aodCartButton.getAttribute && aodCartButton.getAttribute('aria-label') || '').slice(0, 80),
                        pageAodFormsCount: document.querySelectorAll('form.AodAddToCart').length,
                        pageAllFormsCount: document.querySelectorAll('form').length,
                        parentChain: (function(){
                            let cur = aodCartButton.parentElement, path = [];
                            for (let i = 0; i < 8 && cur; i++) {
                                path.push(cur.tagName + (cur.id ? '#'+cur.id : ''));
                                cur = cur.parentElement;
                            }
                            return path.join(' > ');
                        })(),
                        // ★v0.3.8.4: 詳細 DOM dump (outerHTML 250 文字 + 親 10 階層 outerHTML 150 文字)
                        //   v0.3.8.8: 親 chain 10→15 階層、outerHTML 150→200 文字に拡張
                        buttonContext: dumpAodButtonContext(aodCartButton),
                    });
                } catch (e) {}

                // v0.3.8.8: AOD パネル全構造ダンプ (form 取得失敗時のみ、常時 ON)
                //   Safari の AOD パネル実構造 (form 名前空間、#aod-pinned-offer 中身など) を
                //   把握して次バージョンの form 取得経路設計に使う
                try {
                    logAm('info', 'aod-panel-structure', 'AOD パネル全構造ダンプ',
                        dumpAodPanelStructure());
                } catch (e) { /* swallow */ }

                // v0.3.8.11: AOD パネル内の全 cart 追加ボタンをリスト化
                //   422 失敗時に別出品者のボタンを掴んでいる可能性の検証用
                try {
                    logAm('info', 'aod-all-buttons',
                        'AOD パネル内 cart 追加ボタン全リスト',
                        dumpAllAodCartButtons());
                } catch (e) { /* swallow */ }

                // v0.3.8.11: click 対象ボタン周辺 20 階層の DOM 完全観測
                //   hidden input / data 属性 / script から offerListingId 候補を抽出
                try {
                    logAm('info', 'aod-click-target-dom',
                        'click 対象ボタン周辺 DOM (offerListingId 候補抽出)',
                        dumpClickTargetFormStructure(aodCartButton));
                } catch (e) { /* swallow */ }

                return false;
            }

            // ── Step 2: sessionID と customerId をページから取得 ──
            //   特定 form に依存せず全 input を走査する (頑健性)
            let sessionID = null;
            let customerId = null;

            const allInputs = document.querySelectorAll('input');
            for (let i = 0; i < allInputs.length; i++) {
                const inp = allInputs[i];
                const n = inp.name || '';
                const v = inp.value || '';
                if (!sessionID && (n === 'sessionID' || n === 'session-id') && /^\d{3}-\d{7}-\d{7}$/.test(v)) {
                    sessionID = v;
                }
                if (!customerId && n === 'customerId' && v.length === 14) {
                    customerId = v;
                }
                if (sessionID && customerId) break;
            }

            // sessionID は cookie からも fallback で取れる
            if (!sessionID) {
                const m = document.cookie.match(/(?:^|;\s*)session-id=([\d\-]+)/);
                if (m) sessionID = m[1];
            }

            if (!sessionID || !customerId) {
                try {
                    logAm('info', 'aod-direct-creds-fail', 'sessionID or customerId not found → fallback', {
                        hasSession: !!sessionID,
                        hasCustomer: !!customerId,
                    });
                } catch (e) {}
                return false;
            }

            // ── Step 3: SESSION + state 更新 ──
            if (!S.getSession()) {
                S.startNewSession(location.href);
            } else {
                S.updateSession({ productUrl: location.href });
            }
            S.setStep(STEP_PURCHASING);

            try {
                logAm('info', 'aod-direct-attempt', 'AOD fetch(urlencoded) → direct /checkout/entry/cart navigate', {
                    aodAction: aodForm.action,
                });
            } catch (e) {}

            // ── Step 4: FormData → URLSearchParams 変換して fetch(POST, urlencoded) ──
            const fd = new FormData(aodForm);
            const params = new URLSearchParams();
            for (const pair of fd.entries()) {
                params.append(pair[0], pair[1]);
            }

            // ── ★v0.3.8.3: Step 5: AbortController 付与で停止ボタン即応 ──
            const abortCtrl = new AbortController();
            _activeFetchAborters.add(abortCtrl);

            const tFetchStart = Date.now();
            let fetchRes;
            try {
                fetchRes = await fetch(aodForm.action, {
                    method: 'POST',
                    body: params,
                    redirect: 'manual',
                    credentials: 'include',
                    signal: abortCtrl.signal,
                });
            } catch (e) {
                _activeFetchAborters.delete(abortCtrl);
                if (e.name === 'AbortError') {
                    try { logAm('info', 'aod-direct-aborted', '停止ボタンで fetch キャンセル'); } catch (er) {}
                    return false;
                }
                try { logAm('warn', 'aod-direct-fetch-fail', 'fetch network error → fallback', { err: e.message }); } catch (er) {}
                return false;
            }
            _activeFetchAborters.delete(abortCtrl);

            if (S.shouldHalt()) return false;  // ★v0.3.8.3: fetch 後即時停止チェック

            const fetchMs = Date.now() - tFetchStart;

            // Amazon の AOD カート追加は urlencoded で 200 を返す
            if (fetchRes.status !== 200) {
                try {
                    logAm('warn', 'aod-direct-fetch-fail', 'fetch status not 200 → fallback', {
                        status: fetchRes.status,
                        type: fetchRes.type,
                        fetchMs: fetchMs,
                    });
                } catch (e) {}
                return false;
            }

            try {
                logAm('info', 'aod-direct-fetch-ok', 'カート追加完了 (200)', { fetchMs: fetchMs });
            } catch (e) {}

            // ── Step 6: /checkout/entry/cart に直接 navigate ──
            const checkoutUrl = 'https://www.amazon.co.jp/checkout/entry/cart?proceedToCheckout=1' +
                '&sessionID=' + encodeURIComponent(sessionID) +
                '&useDefaultCart=1' +
                '&oldCustomerId=' + encodeURIComponent(customerId) +
                '&preInitiateCustomerId=' + encodeURIComponent(customerId) +
                '&partialCheckoutCart=1';

            try {
                logAm('info', 'aod-direct-navigate', 'checkout/entry/cart に直接 navigate', {
                    urlHead: checkoutUrl.slice(0, 80),
                });
            } catch (e) {}

            toast(
                '▶ AOD 直販 → checkout 直行\n' +
                'カート追加完了 (' + fetchMs + 'ms)\n' +
                '次画面: 注文確定画面',
                BUY_GREEN, 3000
            );

            // navigate (ページ遷移後は startExpressCheckoutWatch + handleCheckoutP が拾う)
            window.location.href = checkoutUrl;
            return true;

        } catch (e) {
            try { logAm('warn', 'aod-direct-skip', '例外発生 → fallback', { err: e.message }); } catch (er) {}
            return false;
        }
    };

    // ───────────────────────────────────────────────
    // ★v0.3.8.5: cart→byg をスキップして checkout 直行 URL を組み立てる
    //   過去ログ (12:36, 13:14) で確認した経路:
    //     /gp/cart/view.html → /checkout/byg/... → /checkout/entry/cart?proceedToCheckout=1
    //     (合計 約 2.7 秒)
    //   「カートを見る」visible 検出 = カート追加完了済みの合図なので、
    //   /checkout/entry/cart?proceedToCheckout=1&sessionID=...&useDefaultCart=1
    //   &oldCustomerId=...&preInitiateCustomerId=...&partialCheckoutCart=1
    //   に直接 navigate して中間 2 画面をスキップ。
    //
    //   sessionID: cookie 'session-id' から取得 (XXX-XXXXXXX-XXXXXXX 形式)
    //   customerId: cookie 'x-main' から取得 (Amazon 標準、14 文字以上)
    //   どちらか取れなければ null 返却 → 従来 /gp/cart/view.html 経路に fallback
    // ───────────────────────────────────────────────
    const buildDirectCheckoutUrl = () => {
        try {
            // sessionID: cookie の "session-id" から取得
            let sessionID = null;
            const sidMatch = document.cookie.match(/(?:^|;\s*)session-id=([\d\-]+)/);
            if (sidMatch && /^\d{3}-\d{7}-\d{7}$/.test(sidMatch[1])) {
                sessionID = sidMatch[1];
            }
            if (!sessionID) {
                const inp = document.querySelector('input[name="sessionId"], input[name="session-id"], input[name="sessionID"]');
                if (inp && /^\d{3}-\d{7}-\d{7}$/.test(inp.value)) {
                    sessionID = inp.value;
                }
            }
            if (!sessionID) return null;

            // customerId: cookie "x-main" から取得 (Amazon 標準)
            let customerId = null;
            const xmMatch = document.cookie.match(/(?:^|;\s*)x-main=([^;\s]+)/);
            if (xmMatch && xmMatch[1].length >= 10) {
                customerId = xmMatch[1];
            }
            if (!customerId) {
                const inp = document.querySelector('input[name="customerId"]');
                if (inp && inp.value.length === 14) {
                    customerId = inp.value;
                }
            }
            if (!customerId) return null;

            return 'https://www.amazon.co.jp/checkout/entry/cart?proceedToCheckout=1' +
                '&sessionID=' + encodeURIComponent(sessionID) +
                '&useDefaultCart=1' +
                '&oldCustomerId=' + encodeURIComponent(customerId) +
                '&preInitiateCustomerId=' + encodeURIComponent(customerId) +
                '&partialCheckoutCart=1';
        } catch (e) {
            return null;
        }
    };

    // ───────────────────────────────────────────────
    // v0.1.4: AOD オファー自動クリック
    //   findAodAmazonOffer で見つかった「カートに追加する」ボタンを click。
    //   ★単発 click のみ(駿河屋 v0.1.6 教訓: 二重押下絶対禁止)
    //   click 後、smart-wagon または Express Checkout モーダルに遷移。
    // ───────────────────────────────────────────────
    const clickAodAmazonOffer = async (cartButton, price) => {
        if (S.shouldHalt()) return false;
        if (!cartButton) {
            try { logAm('error', 'aod-click', 'カートに追加するボタンが取得できなかった'); } catch (e) {}
            toast('❌ カートに追加するボタンが取得できませんでした', STOP_RED, 8000);
            S.opFullStop();
            return false;
        }

        // ★v0.3.8.9: AOD click 後のネットワーク観測は常時 ON
        //   (verbose スイッチ廃止、AOD カート追加失敗時の Amazon 通信を必ず捕捉する)
        //   v0.3.8.9 で observeNetworkAfterAodClick の内部で logAm を発火する設計に変更
        //   (旧: Promise 返却 → ここで .then して logAm)
        try {
            observeNetworkAfterAodClick(5000);
        } catch (e) { /* swallow */ }

        // ★v0.3.7: 先に「AOD fetch + 直接 checkout navigate」方式を試行
        //   成功 → カート画面 + byg 画面の 2 段ロードを完全スキップ (約 -2.8 秒)
        //   失敗 → 従来の AOD click 処理にフォールバック (v0.3.5 と同じ動作)
        //   注意: 内部で S.startNewSession + S.setStep を行うため、フォールバック側
        //         でも同じ処理が再実行されるが setStep は冪等なので問題なし
        const directOk = await tryAodFetchAndDirectCheckout(cartButton);
        if (directOk) {
            // window.location.href で navigate 済み。後続は handleCheckoutP /
            // startExpressCheckoutWatch / handleAddOnUpsell / STOCK_OUT_BUYNOW
            // のいずれかが引き受ける。
            return true;
        }

        // ── ここから従来の AOD click 処理 (v0.3.5 と同じ、フォールバック) ──
        if (!S.getSession()) {
            S.startNewSession(location.href);
        } else {
            S.updateSession({ productUrl: location.href });
        }
        S.setStep(STEP_PURCHASING);

        toast(
            `▶ AOD オファーをカートに追加します(1回のみ)\n` +
            `価格: ${price}\n` +
            `次画面: smart-wagon または注文確認画面`,
            BUY_GREEN, 4000
        );

        // ★v0.3.4: click 前に ord (offer index) を抽出
        //   優先1: cartButton の form action から
        //   優先2: cartButton の親を遡って [id^="aod-offer-view-cart-"] を探す
        let ord = null;
        try {
            const form = cartButton.closest && cartButton.closest('form');
            if (form) {
                const m = (form.action || '').match(/aod_dpdsk_\w+_(\d+)/);
                if (m) ord = m[1];
            }
        } catch (e) {}
        if (ord === null) {
            try {
                let parent = cartButton.parentElement;
                let depth = 0;
                while (parent && depth < 12) {
                    const vc = parent.querySelector('[id^="aod-offer-view-cart-"]');
                    if (vc) {
                        const m = vc.id.match(/aod-offer-view-cart-(\d+)/);
                        if (m) { ord = m[1]; break; }
                    }
                    parent = parent.parentElement;
                    depth++;
                }
            } catch (e) {}
        }

        // ★v0.3.8.56: click 投入前 sleep 400ms → 120ms 短縮 (HIRO「競り負け」対応)
        //   DOM 安定 + bot 検知対策の最小限を維持。AOD ボタン visible 確認済なので OK。
        await sleep(120);
        if (S.shouldHalt()) return false;

        // v0.3.8.9: cookie-snapshot-aod-pre 呼出を削除 (HttpOnly 確定でノイズ化)

        // v0.3.8.11: click 投入直前の対象ボタン識別情報 (常時 ON)
        //   422 失敗時に別出品者のボタンを掴んでいる可能性の検証用
        //   aria-label / outerHTML / csa-c-* 属性を全部記録
        try {
            logAm('info', 'aod-click-target',
                'AOD click 投入直前: ' + (cartButton ? (cartButton.getAttribute('aria-label') || '').slice(0, 80) : '(null)'),
                {
                    ariaLabel: cartButton ? (cartButton.getAttribute('aria-label') || '').slice(0, 300) : null,
                    outerHtmlHead: cartButton ? (cartButton.outerHTML || '').slice(0, 1500) : null,
                    name: cartButton ? (cartButton.getAttribute('name') || '') : null,
                    type: cartButton ? (cartButton.getAttribute('type') || '') : null,
                    csaContentId: cartButton ? (cartButton.getAttribute('data-csa-c-content-id') || '') : null,
                    csaSlotId: cartButton ? (cartButton.getAttribute('data-csa-c-slot-id') || '') : null,
                });
        } catch (e) { /* swallow */ }

        // v0.3.8.15: AOD カート追加 API 200 検知フラグを click 直前にリセット
        //   前回 click の値が残らないようにする
        try {
            _aodCartAddApiOk = false;
            _aodCartAddApiOkAt = 0;
        } catch (e) {}

        // ★ 単発 click (駿河屋 v0.1.6 教訓: 二重押下絶対禁止)
        try {
            cartButton.click();
        } catch (e) {
            try { logAm('error', 'aod-click', `クリック失敗: ${e.message}`); } catch (er) {}
            toast(`❌ クリック失敗: ${e.message}`, STOP_RED, 8000);
            S.opFullStop();
            return false;
        }

        if (CONFIG.debugMode) {
            console.log('[GBOT-AM] AOD cart-add clicked:', cartButton, 'ord=', ord);
        }

        // ★v0.3.4 [新規]: click 後の状態 polling
        //   新Amazonでは AOD パネル内に「✓追加済み・カートを見る」が出るだけで
        //   自動遷移しない。「カートを見る」を自動 click する必要がある。
        //   旧Amazonの自動遷移ケースも URL 変化検出でカバー。
        // ★v0.3.8.56: POLL_MS 200 → 60ms に短縮 (HIRO「競り負け」対応)
        //   発見即 break するので、検出速度が約 3 倍に向上。
        //   TIMEOUT_MS 2000 → 2400ms (40 回 → 40 回維持)
        try {
            const startTs = Date.now();
            const TIMEOUT_MS = 2400;
            const POLL_MS = 60;
            const beforeUrl = location.href;

            while (Date.now() - startTs < TIMEOUT_MS) {
                if (S.shouldHalt()) return false;

                // URL 遷移チェック (旧Amazonの自動遷移ケース)
                if (location.href !== beforeUrl) {
                    try { logAm('info', 'aod-click', 'AOD click 後の自動遷移検出',
                        {newUrl: location.href.slice(0,120)}); } catch(e) {}
                    return true;
                }

                // ★v0.3.8.15: AOD カート追加 API 200 検知ショートカット
                //   observeNetworkAfterAodClick の hook が POST /cart/carts/retail/items
                //   の 200 を観測したらフラグを立てている。これを並列チェックして、
                //   DOM (「カートを見る」visible) を待たずに checkout に進む。
                //   背景: 09:11:53 ログで API 200 なのに DOM 検出失敗で 2 秒タイムアウト
                //         → 実は成功してたのにリロード継続してた事例の対策。
                //   既存の URL 遷移検出 / not-added-to-cart visible 検出は維持。
                try {
                    if (_aodCartAddApiOk) {
                        const apiAge = Date.now() - _aodCartAddApiOkAt;
                        try { logAm('info', 'aod-api-success-bypass',
                            'AOD カート追加 API 200 検知済 → DOM 待たずに checkout 直行',
                            { ord: ord, apiAgeMs: apiAge,
                              waitedMs: Date.now() - startTs }); } catch (e) {}
                        // API 検知済フラグはここで使い切るのでリセット
                        _aodCartAddApiOk = false;
                        _aodCartAddApiOkAt = 0;
                        try {
                            const directCheckoutUrl = buildDirectCheckoutUrl();
                            if (directCheckoutUrl) {
                                try { logAm('info', 'aod-direct-checkout',
                                    'cart→byg をスキップ → checkout 直行 (API 経路)',
                                    { ord: ord, urlHead: directCheckoutUrl.slice(0, 80) }); } catch (e) {}
                                location.href = directCheckoutUrl;
                            } else {
                                // ★v0.3.8.79: /gp/cart/view.html で「カート空」誤判定問題を回避
                                //   sessionID/customerId 取得失敗 → 従来は /gp/cart/view.html 直行
                                //   だが iOS Safari の HttpOnly cookie + session 不整合で空表示される。
                                //   保存済 TRANS-AM URL があれば そちらに直行 (Express Checkout)。
                                const _asin = (function(){ try { return extractAsinFromUrl(); } catch (e) { return null; } })();
                                const _savedUrl = _asin ? getSavedTransAmUrl(_asin) : null;
                                if (_savedUrl) {
                                    try { logAm('info', 'aod-trans-am-fallback',
                                        'sessionID 取得失敗 + cart 空問題 回避 → 保存 TRANS-AM URL 直行',
                                        { ord: ord, asin: _asin, urlLen: _savedUrl.length,
                                          urlHead: _savedUrl.slice(0, 80) }); } catch (e) {}
                                    location.href = _savedUrl;
                                } else {
                                    try { logAm('info', 'aod-cart-fallback',
                                        'sessionID 取得失敗 + TRANS-AM URL 未保存 → cart 画面経由 (最終 fallback)',
                                        { ord: ord, asin: _asin }); } catch (e) {}
                                    location.href = 'https://www.amazon.co.jp/gp/cart/view.html';
                                }
                            }
                        } catch (e) {
                            try { logAm('error', 'aod-click',
                                `API 経路カート URL 遷移失敗: ${e.message}`); } catch (er) {}
                            S.setStep(STEP_IDLE);
                            scheduleReloadForWait('API 経路カート URL 遷移失敗');
                            return false;
                        }
                        return true;
                    }
                } catch (e) {}

                // 失敗検出: not-added-to-cart が visible
                if (ord !== null) {
                    const notAdded = document.querySelector(`#aod-offer-not-added-to-cart-${ord}`);
                    if (notAdded && isElementVisible(notAdded)) {
                        try { logAm('warn', 'aod-click', 'AOD カート追加失敗(not-added-to-cart visible)',
                            {ord: ord}); } catch(e) {}
                        toast('❌ AOD カート追加失敗 → リロード継続', STOP_RED, 4000);
                        S.setStep(STEP_IDLE);
                        scheduleReloadForWait('AOD カート追加失敗');  // ★v0.3.4.1: リロード再開
                        return false;
                    }
                }

                // 成功検出: view-cart が visible
                let viewCartBtn = null;
                if (ord !== null) {
                    viewCartBtn = document.querySelector(`#aod-offer-view-cart-${ord}`);
                    if (viewCartBtn && !isElementVisible(viewCartBtn)) viewCartBtn = null;
                }
                if (!viewCartBtn) {
                    const all = document.querySelectorAll('[id^="aod-offer-view-cart-"]');
                    for (const el of all) {
                        if (el.id.endsWith('-announce')) continue;
                        if (isElementVisible(el)) { viewCartBtn = el; break; }
                    }
                }

                if (viewCartBtn) {
                    // ★v0.3.8.4: 「カートを見る」visible 検出までの所要 ms をログ化
                    //   HIRO 環境の AOD click → カート遷移の典型所要時間ベンチマーク
                    try { logAm('info', 'aod-view-cart-emergence', '「カートを見る」visible 検出までの所要 ms', {
                        elapsedMs: Date.now() - startTs,
                        ord: ord,
                        vcId: viewCartBtn.id,
                    }); } catch (e) {}
                    // ★v0.3.4.2: SPAN.click() は無効 (Chrome MCP 実機検証 2026-05-15 で確認)。
                    //   内部の input.a-button-input は /cart/add-to-cart/ form 内なので
                    //   click すると add-to-cart 再 submit で二重カート追加リスク。
                    //   → 既に「✓追加済み」状態なのでカートには商品が入っている。
                    //
                    // ★v0.3.8.5: cart 画面 → byg 画面をスキップして checkout 直行
                    //   過去ログ (12:36, 13:14) で確認した経路の cart/view.html → byg → entry/cart
                    //   合計約 2.7 秒を直行 URL で削減。cookie から sessionID/customerId 取得。
                    //   取得失敗時は従来 /gp/cart/view.html に fallback (劣化なし)。
                    try {
                        // v0.3.8.9: cookie-snapshot-aod-post 呼出を削除 (HttpOnly 確定でノイズ化)

                        const directCheckoutUrl = buildDirectCheckoutUrl();
                        if (directCheckoutUrl) {
                            try { logAm('info', 'aod-direct-checkout', 'cart→byg をスキップ → checkout 直行', {
                                ord: ord, vcId: viewCartBtn.id,
                                urlHead: directCheckoutUrl.slice(0, 80),
                            }); } catch (e) {}
                            location.href = directCheckoutUrl;
                        } else {
                            // ★v0.3.8.79: 「カート空」誤判定 回避 (DOM 検出経路)
                            //   API 経路と同様、保存済 TRANS-AM URL があれば直行
                            const _asin2 = (function(){ try { return extractAsinFromUrl(); } catch (e) { return null; } })();
                            const _savedUrl2 = _asin2 ? getSavedTransAmUrl(_asin2) : null;
                            if (_savedUrl2) {
                                try { logAm('info', 'aod-trans-am-fallback',
                                    'sessionID 取得失敗 + cart 空問題 回避 → 保存 TRANS-AM URL 直行 (DOM 経路)',
                                    { ord: ord, vcId: viewCartBtn.id, asin: _asin2,
                                      urlLen: _savedUrl2.length, urlHead: _savedUrl2.slice(0, 80) }); } catch (e) {}
                                location.href = _savedUrl2;
                            } else {
                                try { logAm('info', 'aod-cart-fallback',
                                    'sessionID/customerId 取得失敗 + TRANS-AM URL 未保存 → cart 画面経由 (最終 fallback)',
                                    {ord: ord, vcId: viewCartBtn.id, asin: _asin2}); } catch (e) {}
                                location.href = 'https://www.amazon.co.jp/gp/cart/view.html';
                            }
                        }
                    } catch (e) {
                        try { logAm('error', 'aod-click', `カート URL 遷移失敗: ${e.message}`); } catch(er) {}
                        S.setStep(STEP_IDLE);
                        scheduleReloadForWait('カート URL 遷移失敗');
                        return false;
                    }
                    return true;
                }

                await sleep(POLL_MS);
            }

            // タイムアウト
            try { logAm('warn', 'aod-click', 'AOD click 後 2秒経過、状態変化なし',
                {ord: ord, url: location.href.slice(0,120)}); } catch(e) {}
            if (location.href !== beforeUrl) return true;
            S.setStep(STEP_IDLE);
            scheduleReloadForWait('AOD click タイムアウト');  // ★v0.3.4.1: リロード再開
            return false;
        } catch (e) {
            try { logAm('error', 'aod-click', `polling 中エラー: ${e.message}`); } catch(er) {}
            return true; // click は完了しているので true
        }
    };

    // ───────────────────────────────────────────────
    // v0.1.4.1: AOD オファーをすべてロード
    //   AOD は遅延ロード(初期 10 件)で、下スクロール or 「さらに表示」押下で
    //   追加ロードされる。Amazon.co.jp 直販オファーは下位にあることもあるため、
    //   「N件のオプション」と表示されている全件をロードしてから走査する。
    //
    //   実装:
    //     1. 「さらに表示」「もっと見る」「次のページ」リンク/ボタンを押す
    //     2. AODパネル(dialog/modal)内で下スクロール
    //     3. window 自体も下スクロール(モバイルでは window が AOD 全体)
    //     4. ボタン数が増えなくなったら終了 / または expectedTotal に到達
    //     5. 最大 maxIter 回まで繰り返し(暴走防止)
    // ───────────────────────────────────────────────
    const countAodCartButtons = () => {
        // ★v0.3.3: 新旧UI 両対応の正確なカウント
        //   旧UI: button/input[aria-label*="からカートに追加"]
        //   新UI: input[type="submit"][name="submit.addToCart"]
        //   Set で重複除去(同一ボタンが両方マッチするケースに備える)
        const oldSet = Array.from(document.querySelectorAll(
            'button[aria-label*="からカートに追加"], ' +
            'input[aria-label*="からカートに追加"], ' +
            'button[aria-label*="カートに入れて予約"], ' +
            'input[aria-label*="カートに入れて予約"]'
        ));
        const newSet = Array.from(document.querySelectorAll(
            'input[type="submit"][name="submit.addToCart"]'
        ));
        const unique = new Set([...oldSet, ...newSet]);
        // ★v0.3.3: fallback [id^="aod-offer-"] は廃止
        //   理由: 1オファーあたり 12〜15個のサブ要素(heading/soldBy/qty/promotion など)も
        //   拾ってしまい finalCount を異常に水増し(13オファーで 254/327件などになる)
        return unique.size;
    };

    // 「N個のオプション」の N を抽出(全件数の目安)
    const detectAodTotalCount = () => {
        const txt = document.body.innerText || '';
        // 「137個のオプション」「137 個のオプション」「その他137個のオプション」など
        const m = txt.match(/(?:その他)?\s*(\d{1,4})\s*個の(?:オプション|出品)/);
        if (m) {
            const n = parseInt(m[1], 10);
            if (n > 0 && n < 10000) return n;
        }
        return null;
    };

    const expandAllAodOffers = async (firstScanResult) => {
        const maxIter = 25;          // 最大繰り返し回数
        const maxOffers = 200;        // 上限(暴走防止)
        const expectedTotal = detectAodTotalCount();
        let prevCount = countAodCartButtons();
        let stableIters = 0;
        let totalIters = 0;

        // ★v0.1.16.10: 全件ロード済みなら expand 不要(2.1 秒無駄遣い問題)
        //   旧: 16/16 全件ロード済みでも stable 確認に 3 iter × 700ms = 2.1 秒使ってた
        //   新: scanned >= expectedTotal なら expand しても増えない → 即終了
        if (expectedTotal !== null && prevCount >= expectedTotal) {
            if (CONFIG.debugMode) {
                console.log(`[GBOT-AM] expandAllAodOffers SKIP: ${prevCount}/${expectedTotal} 全件ロード済`);
            }
            return { finalCount: prevCount, expectedTotal: expectedTotal, iters: 0, skipped: 'all-loaded' };
        }

        // ★v0.1.16.11: モバイル UA で expectedTotal=null でも、first scan の結果から判断
        //   first scan で 6+ 件が全て non-Amazon なら、下位に Amazon 直販あっても展開で出る確率低い
        //   (Amazon 直販オファーは通常リストの上位に出る傾向)
        //   → 2.1 秒の expand 待ちを skip(リロード戦略のほうが高効率)
        if (firstScanResult &&
            firstScanResult.scanned >= 6 &&
            firstScanResult.found === false &&
            firstScanResult.nonAmazonSkipped === firstScanResult.scanned) {
            if (CONFIG.debugMode) {
                console.log(`[GBOT-AM] expandAllAodOffers SKIP (mobile-fallback): first scan ${firstScanResult.scanned} 件全て non-Amazon`);
            }
            return { finalCount: prevCount, expectedTotal: expectedTotal, iters: 0, skipped: 'first-scan-no-amazon' };
        }

        if (CONFIG.debugMode) {
            console.log(`[GBOT-AM] expandAllAodOffers start: current=${prevCount}, expected=${expectedTotal}`);
        }

        for (let i = 0; i < maxIter; i++) {
            totalIters++;
            if (isStopped()) return prevCount;

            // 「さらに表示」「もっと見る」「次のページ」「もっと表示」系のボタン/リンクを順に押す
            const moreLabels = [
                'さらに表示する', 'さらに表示', 'もっと表示する', 'もっと表示',
                'もっと見る', '次のページ', 'もっと出品者を見る', 'すべての出品者を表示',
            ];
            let clickedMore = false;
            for (const label of moreLabels) {
                const el = findByText('a, button, span, div[role="button"]', label);
                if (el && isElementVisible(el)) {
                    try { el.click(); clickedMore = true; } catch (e) {}
                    break;
                }
            }

            // スクロールも併用(lazy-load 発火)
            try {
                // dialog 内のスクロール
                const dlgs = document.querySelectorAll('div[aria-modal="true"], dialog, [role="dialog"]');
                for (const d of dlgs) {
                    d.scrollTop = d.scrollHeight;
                }
                // ページ全体スクロール
                window.scrollTo(0, document.body.scrollHeight);
            } catch (e) {}

            await sleep(700); // ロード待ち

            const curCount = countAodCartButtons();

            if (CONFIG.debugMode) {
                console.log(`[GBOT-AM] expand iter=${i}: count=${curCount}, prev=${prevCount}, clickedMore=${clickedMore}`);
            }

            // 暴走防止: 上限到達
            if (curCount >= maxOffers) break;

            // 期待件数到達 = 全件ロード完了
            if (expectedTotal !== null && curCount >= expectedTotal) break;

            // 増えてなければ stableIters++、3 回連続で増えなければ終了
            if (curCount === prevCount) {
                stableIters++;
                if (stableIters >= 3) break;
            } else {
                stableIters = 0;
            }
            prevCount = curCount;
        }

        const finalCount = countAodCartButtons();
        if (CONFIG.debugMode) {
            console.log(`[GBOT-AM] expandAllAodOffers done: final=${finalCount}, expected=${expectedTotal}, iters=${totalIters}`);
        }
        return { finalCount, expectedTotal, iters: totalIters };
    };

    // AOD パネルに到達した時の処理
    const handleAodScreen = async () => {
        if (S.shouldHalt()) return;

        // ★v0.3.2: AOD URL でも Buy Box に Amazon 直販が出ることがある(HIRO 0:37 観察)
        //   B08XWSBM49 で確認: ?m= 剥がした AOD URL の画面トップに
        //   「出荷元 Amazon.co.jp / 販売元 Amazon.co.jp / カートに追加する」が表示。
        //   けど従来は AOD オファーの aria-label しか見てなかったので 11連続0でリロード。
        //   AOD オファー走査の前に通常 Buy Box を先にチェックする。
        await sleep(100);
        const _bbSeller = detectBuyBoxSeller();
        try {
            logAm('info', 'aod-prebuy', `AOD URL の Buy Box 事前チェック: isDirect=${_bbSeller.isDirect}`, {
                isDirect: _bbSeller.isDirect,
                sellerText: _bbSeller.sellerText,
                shipperText: _bbSeller.shipperText,
                method: _bbSeller.method,
            });
        } catch (e) {}
        if (_bbSeller.isDirect) {
            try { localStorage.setItem('LB_AM_VERIFIED_DIRECT', String(Date.now())); } catch (e) {}
            toast(`✓ AOD ページの Buy Box に Amazon 直販 → 即 click`, BUY_GREEN, 2500);
            await clickBuyNowOrAddToCart();
            return;
        }

        // ★v0.2.1: AOD オファー検出ロジック改善
        //   - 待機時間 2000 → 2500ms に延長(Amazon 遅延ロード対応)
        //   - 「button 0 が 2 回連続」を未表示判定の条件に変更(初回 0 で即諦めない)
        //   - countAodCartButtons は AOD パネル要素ベースの fallback も含む(セレクタ拡張)

        // ★v0.3.4.1: count が "最後の変化から STABLE_MS 安定" するまで待つ
        //   v0.3.4 修正点を残しつつ、初期 count > 0 で変化なし時の早期 break を防ぐ:
        //     - lastChangeAt = null (初期は変化を見ていない状態)
        //     - 変化を 1 回以上見てから STABLE_MS=500ms 安定で break
        //     - 初期 count > 0 で全く変化なし → INITIAL_STABLE_MS=1000ms で break
        //       (既に全件ロード済みで入室した想定、無駄な MAX_WAIT 回避)
        //     - count = 0 が連続 → v0.3.3 と同じ早期 break 維持
        //   旧 (v0.3.4) のバグ: lastChangeAt=0 初期値で「初期 count>0 変化なし」時
        //     waited が STABLE_MS=500ms 到達で break → pinned 1個だけで走査開始
        //     → 問題C 再発の潜在リスク
        let buttons = countAodCartButtons();
        let prevCount = buttons;
        let lastChangeAt = null;        // ★v0.3.4.1: null = まだ変化を見ていない
        let waited = 0;
        let zeroCount = (buttons === 0) ? 1 : 0;
        const STABLE_MS = 500;
        // ★v0.3.5: INITIAL_STABLE_MS を 1000 → 500 に短縮 (リロードサイクル短縮)
        //   理由: 初期 count>0 で変化なし時、ここで break して走査開始するが、
        //   もし走査で見つからなければ expandAllAodOffers (展開処理) が走り
        //   再走査される。500ms で走査開始しても展開が救済するため、
        //   1000ms 保持する必要が薄かった。
        //   効果: 1 サイクル -500ms
        const INITIAL_STABLE_MS = 500;
        const MAX_WAIT = 3000;

        while (waited < MAX_WAIT && !S.shouldHalt()) {
            await sleep(200);
            waited += 200;
            const cur = countAodCartButtons();

            if (cur !== prevCount) {
                // count 変化あり (ロード中)
                prevCount = cur;
                lastChangeAt = waited;
                zeroCount = 0;
            } else if (cur === 0) {
                // count = 0 が続く: v0.3.3 と同じ早期 break ロジック
                zeroCount++;
                if (waited >= 2000 && zeroCount >= 3) break;
            } else if (lastChangeAt !== null && (waited - lastChangeAt) >= STABLE_MS) {
                // 変化を 1 回以上見てから STABLE_MS 安定 → ロード完了とみなす
                break;
            } else if (lastChangeAt === null && waited >= INITIAL_STABLE_MS) {
                // ★v0.3.4.1 新規: 初期 count > 0 で全く変化なし
                //   → 既に全件ロード済みで handler に入った想定
                //   MAX_WAIT 全部待つのは無駄なので INITIAL_STABLE_MS で break
                break;
            }
        }
        buttons = prevCount;

        if (CONFIG.debugMode) {
            console.log(`[GBOT-AM] AOD load wait done: count=${buttons}, waited=${waited}ms`);
        }
        if (S.shouldHalt()) return;

        if (buttons === 0) {
            try {
                logAm('info', 'aod', `オファー未表示(2.5秒、${zeroCount}回連続0) → リロード`, {
                    waited, zeroCount,
                });
            } catch (e) {}
            toast(`✗ AOD オファー未表示(2.5秒) → リロード`, '#f57c00', 2500);
            scheduleReloadForWait('AOD オファー未表示');
            return;
        }

        toast(`▶ AOD 走査(${buttons} 件、aria-label 直読み)`, '#1976d2', 1500);

        const found = findAodAmazonOffer();
        if (CONFIG.debugMode) console.log('[GBOT-AM] findAodAmazonOffer =>', found);

        // ★v0.1.16.8: AOD 走査結果ログ
        try {
            logAm('info', 'aod', `AOD 走査: found=${found.found} scanned=${found.scanned}`, {
                found: found.found, price: found.price, scanned: found.scanned,
                usedSkipped: found.usedSkipped, nonAmazonSkipped: found.nonAmazonSkipped,
                method: found.method,
            });
        } catch (e) {}

        if (found.found) {
            toast(`✓ AOD 直販検出 ¥${found.price} → カートに追加`, BUY_GREEN, 2000);
            await clickAodAmazonOffer(found.cartButton, found.price);
            return;
        }

        // 折りたたまれた状態で見つからない場合のみ展開を試行(fallback)
        // ★v0.1.16.11: first scan 結果を渡してモバイル対応 skip を有効化
        toast(`⏳ aria-label 直読みで未検出 → 展開して再走査`, '#1976d2', 1500);
        const expanded = await expandAllAodOffers(found);
        if (isStopped()) return;
        const finalCount = (expanded && expanded.finalCount) || countAodCartButtons();
        const found2 = findAodAmazonOffer();
        // ★v0.1.16.8: 展開後の再走査結果ログ
        try {
            logAm('info', 'aod', `AOD 再走査(展開後): found=${found2.found}`, {
                found: found2.found, finalCount: finalCount, scanned: found2.scanned,
                usedSkipped: found2.usedSkipped, nonAmazonSkipped: found2.nonAmazonSkipped,
            });
        } catch (e) {}
        if (found2.found) {
            toast(`✓ 展開後に AOD 直販検出 ¥${found2.price} → カートに追加`, BUY_GREEN, 2000);
            await clickAodAmazonOffer(found2.cartButton, found2.price);
            return;
        }

        // それでも見つからない → リロード待機(scheduleReloadForWait 内で info ログ済)
        toast(
            `✗ AOD に Amazon 直販なし(${found2.scanned} 件)\n` +
            `中古skip:${found2.usedSkipped} / 他seller:${found2.nonAmazonSkipped || 0}\n` +
            `→ リロード待機`,
            '#f57c00', 3000
        );
        scheduleReloadForWait('AOD に Amazon直販なし');
    };

    // ───────────────────────────────────────────────
    // attemptPurchase: 商品ページで起動する購入オーケストレーター
    //   v0.1.5.1: マケプレ判定時に ?m=AN1VRQENFRJN5 で URL 強制切替(AOD 廃止)
    //   v0.1.3: マケプレ時に AOD パネルを開く処理(v0.1.5.1 で fallback 化)
    //   v0.1.2: 直販判定 → 「今すぐ買う」優先 click
    // ───────────────────────────────────────────────
    const attemptPurchase = async () => {
        if (isStopped()) return;
        const _t0 = Date.now();
        // ★v0.1.16.8: attemptPurchase 開始ログ
        try {
            logAm('info', 'attempt-purchase', '開始', {
                url: location.href.slice(0, 200),
                forcedM: isUrlForcedAmazon(),
                state: getState() || 'idle',
            });
        } catch (e) {}

        // ★v0.3.8.70: HIRO 提案「ボタン状況を見たら即フラグ」を MutationObserver で実装
        // ★v0.3.8.71: HIRO 提案「ページコンテンツ + ボタン無し → 即直販無し判定」を追加
        //   旧 v0.3.8.70: 2 並列 (ボタン visible / 「直販なし」テキスト) + 1500ms タイムアウト
        //   新 v0.3.8.71: 3 並列 Observer + Promise.race で最初に確定シグナル出した方を採用
        //
        //   並列待ち (どれか先に確定したら即抜ける):
        //     ① Buy Box ボタン visible (今すぐ買う / カートに入れる) → 直販あり
        //     ② 「おすすめ出品の要件を満たす出品はありません」テキスト → 直販無し
        //     ③ ★新★ 商品名 visible + 300ms 追加待ち + ボタン無し → 直販無し
        //   ④ 1500ms タイムアウト (DOM ロード上限) → 最終判定
        //
        //   HIRO 環境では「Buy Box DOM が出ない商品」が常態 = ① も ② も発火しない
        //   → 旧 v0.3.8.70 では毎回 1500ms 待っていた
        //   → 新 v0.3.8.71 は商品名 (~500ms で出る) + 300ms = ~800ms で諦める
        //   → 毎リロード ~700ms 短縮 (HIRO ログから実測)
        let seller = null;
        let earlyExitNoOffer = false;
        const pollStartTs = Date.now();
        let observerHit = 'unknown';
        try {
            // 早期 cart-add-fail チェック (Observer 起動前に)
            if (isCartAddFailed()) {
                try {
                    logAm('error', 'cart-add-fail', 'attemptPurchase 開始時に「カート追加失敗」検出 → 自動停止', {
                        url: location.href.slice(0, 200),
                    });
                } catch (e) {}
                toast(
                    '⚠️ Amazon「カート追加失敗」検出 → 自動停止\n\n' +
                    '【復旧手順】\n' +
                    '① 「カートを見る」をタップ\n' +
                    '② カート内全商品を削除\n' +
                    '③ 5〜10 分待つ\n' +
                    '④ 商品ページに戻って🛒押下',
                    STOP_RED, 30000
                );
                clearState();
                setStopped(true);
                return;
            }

            // 3 並列 Observer (Promise.race) - 「確定シグナル」を出した Promise だけが解決
            //   null/false の場合は無視 = 他の Promise を待つ
            const earlyExit = () => isStopped() || isCartAddFailed();
            const racable = (label, p) => new Promise((resolve) => {
                Promise.resolve(p).then((v) => {
                    if (v !== null && v !== false && v !== undefined) {
                        resolve({ label: label, value: v });
                    }
                    // null/false/undefined は無視 (この Promise は永遠に未解決のまま)
                }).catch(() => {});
            });
            // ★v0.3.8.74: 案C 速度復元 - タイムアウト 1500ms → 2000ms
            //   Buy Box 遅延ロード商品(商品名は出るがボタンは ~1.6 秒後)の取りこぼし防止。
            //   2000ms は人間が「ページが表示された」と認識する時間で、bot 検知側からも
            //   通常のページ閲覧と区別できないラインに収まる。
            const raceResult = await Promise.race([
                // ① ボタン visible → 直販あり
                racable('button',
                    waitForVisible('#buy-now-button, #add-to-cart-button', 2000, { earlyExitFn: earlyExit })),
                // ② 「直販なし」テキスト → 直販無し確定 (?m= 強制 URL の場合のみ)
                racable('noOfferText',
                    isUrlForcedAmazon()
                        ? waitForText(/おすすめ出品の要件を満たす出品はありません/, 2000, { earlyExitFn: earlyExit })
                        : Promise.resolve(false)),
                // ③ ★v0.3.8.71★ 商品名 visible + 300ms + ボタン無し → 直販無し確定
                //    商品ページの本文がロード済 = Amazon は Buy Box を「出すか出さないか」を決定済
                //    出さない判断なら待っても永遠に出ない → 即諦めて AOD ナビへ
                racable('pageReadyNoBtn',
                    isUrlForcedAmazon()
                        ? (async () => {
                            const titleEl = await waitForVisible('#productTitle, h1', 2000, { earlyExitFn: earlyExit });
                            if (!titleEl) return null;
                            await sleep(300);  // Buy Box 遅延ロード対応の追加待ち
                            if (earlyExit()) return null;
                            const btn = document.querySelector('#buy-now-button, #add-to-cart-button');
                            if (btn && isElementVisible(btn)) return null;  // ボタン visible → ① が解決すべき
                            return 'page-ready-no-button';
                        })()
                        : Promise.resolve(null)),
                // ④ タイムアウト (2000ms)
                new Promise((resolve) => setTimeout(() => resolve({ label: 'timeout', value: null }), 2000)),
            ]);

            observerHit = raceResult ? raceResult.label : 'unknown';
            const btnEl = (observerHit === 'button') ? raceResult.value : null;
            const noOfferDetected = (observerHit === 'noOfferText') ? !!raceResult.value : false;
            const pageReadyNoBtn = (observerHit === 'pageReadyNoBtn');

            if (isStopped()) return;
            if (isCartAddFailed()) {
                try { logAm('error', 'cart-add-fail',
                    'attemptPurchase polling 中に「カート追加失敗」検出 → 停止', {}); } catch (e) {}
                clearState(); setStopped(true); return;
            }

            seller = detectBuyBoxSeller();
            const elapsed = Date.now() - pollStartTs;
            try {
                logAm('info', 'buybox-poll',
                    `[observer] t=${elapsed}ms hit=${observerHit} sellerLen=${seller && seller.sellerText ? seller.sellerText.length : 0} btnVisible=${!!btnEl} noOffer=${noOfferDetected} pageReadyNoBtn=${pageReadyNoBtn}`,
                    {
                        elapsedMs: elapsed,
                        observerHit: observerHit,
                        sellerText: (seller && seller.sellerText) ? String(seller.sellerText).slice(0, 50) : '',
                        sellerTextLen: seller && seller.sellerText ? seller.sellerText.length : 0,
                        isDirect: !!(seller && seller.isDirect),
                        method: seller && seller.method ? seller.method : '',
                        hasBuyBtn: !!document.querySelector('#buy-now-button'),
                        hasAddBtn: !!document.querySelector('#add-to-cart-button'),
                        noOfferText: noOfferDetected,
                        pageReadyNoBtn: pageReadyNoBtn,
                        forcedM: isUrlForcedAmazon(),
                    });
            } catch (e) {}

            // 「直販なし」確定シグナルのいずれかが出た → AOD ナビへ
            if (noOfferDetected || pageReadyNoBtn) {
                earlyExitNoOffer = true;
            }
            // タイムアウト + ボタン無し → isAmazonDirectUnavailable で最終判定
            if (observerHit === 'timeout' && !seller.sellerText && !seller.isDirect) {
                if (isUrlForcedAmazon() && isAmazonDirectUnavailable()) {
                    earlyExitNoOffer = true;
                }
            }
        } catch (pollErr) {
            try { logAm('warn', 'buybox-poll',
                `[observer error] ${String(pollErr && pollErr.message || pollErr)}`, {}); } catch (e) {}
            // エラー時は従来の seller 再走査にフォールバック
            seller = detectBuyBoxSeller();
        }

        // ★v0.1.16.8: Buy Box 検出結果ログ(所要時間と判定方法)
        // ★v0.1.16.10: earlyExitNoOffer を含む
        // ★v0.3.8.41: 直販判定をグローバル変数に保存 (xhr 観測経由の URL 保存時の判定材料)
        // ★v0.3.8.70 バグ修正: breakIdx 変数は Observer 化で削除されたので参照しない
        try { window.__lbam_lastBuyBoxIsDirect = !!(seller && seller.isDirect); } catch (e) {}
        try { window.__lbam_lastBuyBoxAt = Date.now(); } catch (e) {}
        try {
            const _isDirect = !!(seller && seller.isDirect);
            const _method = (seller && seller.method) || '';
            const _sellerText = (seller && seller.sellerText) || '';
            const _shipperText = (seller && seller.shipperText) || '';
            logAm('info', 'buybox-detect', `isDirect=${_isDirect} method=${_method || '?'}${earlyExitNoOffer ? ' [早期break:直販なし確定]' : ''}`, {
                isDirect: _isDirect,
                sellerText: _sellerText,
                shipperText: _shipperText,
                method: _method,
                earlyExitNoOffer: earlyExitNoOffer,
                detectMs: Date.now() - _t0,
                forcedM: isUrlForcedAmazon(),
            });
        } catch (e) {}

        // v0.3.8.8: Buy Box hidden input ダンプ (常時 ON、マスクなし)
        //   PC Chrome の Python Bot v4.66 で動いた input[name="merchantID"] / offerListingID が
        //   Safari でも取れるかを確認。取れれば PC 相当の直販判定経路が使える可能性。
        try {
            const _merchantInput = document.querySelector('input[name="merchantID"]');
            const _offerInput = document.querySelector('input[name="offerListingID"]');
            logAm('info', 'buybox-hidden-input',
                `merchantID="${_merchantInput ? _merchantInput.value : '(not found)'}" offerListingID="${_offerInput ? (_offerInput.value || '').slice(0, 200) : '(not found)'}" present=${!!(_merchantInput && _offerInput)}`,
                {
                    merchantIDPresent: !!_merchantInput,
                    merchantIDValue: _merchantInput ? _merchantInput.value : null,
                    offerListingIDPresent: !!_offerInput,
                    offerListingIDValue: _offerInput ? _offerInput.value : null,
                });
        } catch (e) { /* swallow */ }

        if (CONFIG.debugMode) {
            console.log('[GBOT-AM] detectBuyBoxSeller =>', seller, 'forced=', isUrlForcedAmazon());
        }

        // ── 直販ヒット → 即 click(最速、HIRO 指示 v0.1.16.1) ──
        if (seller.isDirect) {
            try { localStorage.setItem('LB_AM_VERIFIED_DIRECT', String(Date.now())); } catch (e) {}
            try { logAm('info', 'attempt-purchase', '分岐: 直販ヒット → 即 click', { totalMs: Date.now() - _t0 }); } catch (e) {}

            // ★v0.3.8.51: Buy Box 直販ヒット時、form から offerListing.1 抽出 → 完成 URL を保存
            //   (TRANS-AM B方式用、click 前に即保存)
            try {
                const buyNowBtn = document.getElementById('buy-now-button') ||
                    document.querySelector('input[id*="buy-now"], button[id*="buy-now"]');
                const form = buyNowBtn && buyNowBtn.closest && buyNowBtn.closest('form');
                if (form) {
                    let olid = '';
                    const olidCandidates = form.querySelectorAll(
                        'input[name="offerListingID"], input[name="offerListingId"], ' +
                        'input[name="offering-id"], input[name="offering.0"], input[name="offering.1"], ' +
                        'input[name="offeringID"], input[name="offeringId"], ' +
                        'input[name*="offerListing"], input[name*="offeringID"]'
                    );
                    for (const inp of olidCandidates) {
                        const v = (inp.getAttribute('value') || inp.value || '');
                        if (v && v.length >= 20) { olid = v; break; }
                    }
                    if (olid) {
                        let asin = '';
                        const asinInputs = form.querySelectorAll('input[name="asin"], input[name="ASIN"], input[name="asin.1"]');
                        for (const ai of asinInputs) {
                            const v = (ai.getAttribute('value') || ai.value || '');
                            if (/^[A-Z0-9]{10}$/.test(v)) { asin = v; break; }
                        }
                        if (!asin) {
                            try { asin = extractAsinFromUrl(); } catch (e) {}
                        }
                        if (asin && /^[A-Z0-9]{10}$/.test(asin)) {
                            const addr = (function(){ try { return localStorage.getItem('LB_AM_ADDRESS_ID') || ''; } catch (e) { return ''; } })();
                            if (addr) {
                                const url = buildBuynowUrlFromAsinAndOffer(asin, olid, addr);
                                if (url) {
                                    const key = 'LB_AM_BUYNOW_URL_' + asin;
                                    const prev = localStorage.getItem(key) || '';
                                    if (prev !== url) {
                                        localStorage.setItem(key, url);
                                        try { localStorage.setItem(key + '_AT', String(Date.now())); } catch (e) {}
                                        try { localStorage.removeItem('LB_AM_ASIN_ONLY_' + asin); } catch (e) {}
                                        try {
                                            const title = extractProductTitle();
                                            if (title) localStorage.setItem('LB_AM_PRODUCT_NAME_' + asin, title);
                                        } catch (e) {}
                                        try { resetTransAmErrCount(); } catch (e) {}
                                        try {
                                            logAm('info', 'buynow-url-saved-from-buybox',
                                                '✅ Buy Box 直販ヒット → 完成 URL を保存 (TRANS-AM B方式用)',
                                                { asin: asin, olidLen: olid.length });
                                        } catch (e) {}
                                        try { toast('💾 直販 URL 保存: ' + asin + ' (Buy Box 経由)', BUY_GREEN, 3500); } catch (e) {}
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (e) {}
            // ★v0.3.8.15/16: 「今すぐ買う」フォーム DOM ダンプ (URL 組み立て検証用)
            //   click より前に出力 (click 後に DOM が変わるリスク回避)
            //   v0.3.8.16: input 1 個ごとに別ログに分割
            //   → Discord 1 通 2000 文字制限で切れず、全 input が個別に見える
            try {
                const dom = dumpBuyNowFormDom();
                // (1) フォーム全体のサマリログ (input 配列は除外、別ログに分割)
                if (dom && !dom.err) {
                    const summary = {
                        btnExists: dom.btnExists,
                        formExists: dom.formExists,
                        btnOuterHtmlHead: dom.btnOuterHtmlHead,
                        formAction: dom.formAction,
                        formMethod: dom.formMethod,
                        formId: dom.formId,
                        formClassName: dom.formClassName,
                        formDataAttrs: dom.formDataAttrs,
                        inputCount: dom.inputCount,
                    };
                    logAm('info', 'buynow-form-dom',
                        '「今すぐ買う」フォーム DOM ダンプ (サマリ)', summary);
                    // (2) input 1 個ごとに別ログ (Discord で切れない)
                    if (dom.inputs && dom.inputs.length) {
                        for (let i = 0; i < dom.inputs.length; i++) {
                            const inp = dom.inputs[i];
                            try {
                                logAm('info', 'buynow-form-input-' + i,
                                    '[' + i + '] name=' + (inp.name || '?') + ' valueLen=' + inp.valueLen,
                                    inp);
                            } catch (e2) {}
                        }
                    }
                } else if (dom && dom.err) {
                    logAm('warn', 'buynow-form-dom', 'dump 失敗', dom);
                }
            } catch (e) {}
            toast(`✓ 直販 → 即 click`, BUY_GREEN, 2000);
            await clickBuyNowOrAddToCart();
            return;
        }

        // ── ?m=AN1VRQENFRJN5 強制 URL に既にいる場合 = 直販オファー無し確定 ──
        // ★v0.3.1: ?m= フィルター下では AOD も Amazon-only に絞られ DOM が空。
        //   よって ①商品ページ DOM のインライン走査は事前 0 件確定の無駄、
        //   ②?m= を剥がした ?aod=1 ページに navigate して全 seller を見る方が正解。
        //   HIRO 確定ログ(B07R1LFX7P, 58 cycle scanned=0)で確認済み。
        if (isUrlForcedAmazon()) {
            // v0.3.8.14: v0.3.8.13 の fetchAodAjax(asin) 呼び出しを削除 (緊急ロールバック)
            //   理由: Amazon サーバへ「ユーザー操作起因ではない AJAX リクエスト」を
            //         毎サイクル送信していたため、bot 検知 + セッション汚染で
            //         Buy Box / AOD 両ルートが悪化した (HIRO 2026-05-17 報告)。
            //   関数 fetchAodAjax の定義そのものは将来用に残置 (未使用)。

            const _aodLabel = isAmazonDirectUnavailable() ? '?m= で Buy Box 空' : '?m= で直販判定できず';
            try {
                logAm('info', 'attempt-purchase', `${_aodLabel} → AOD(全seller) ナビ`, {
                    sellerText: seller.sellerText || '(取得失敗)',
                    method: seller.method, totalMs: Date.now() - _t0,
                });
            } catch (e) {}
            toast(`✗ ${_aodLabel} → AOD(全seller) で再確認`, '#1976d2', 2500);
            if (isStopped()) return;

            // ★v0.3.1 念のためインラインも 1 回だけ走らせる(運良く DOM に出てれば即捕獲)
            const foundInline = findAodAmazonOffer();
            if (foundInline.found) {
                try { logAm('info', 'attempt-purchase', `インライン AOD で発見 → click(?aod=1 navigate 省略)`, { price: foundInline.price }); } catch (e) {}
                toast(`✓ インライン AOD 直販発見 (${foundInline.price}) → click`, BUY_GREEN, 2500);
                await clickAodAmazonOffer(foundInline.cartButton, foundInline.price);
                return;
            }

            // インラインに無し → ?m= を剥がして ?aod=1 ページへ
            openAodPanel();
            return;
        }

        // ★v0.3.1: マケプレ判定(?m= 無し URL)では既に全 seller 見えている前提
        //   インライン走査 → 見つからなければ AOD ページに navigate
        try {
            logAm('info', 'attempt-purchase', '分岐: マケプレ → インライン AOD 走査', {
                sellerText: seller.sellerText, totalMs: Date.now() - _t0,
            });
        } catch (e) {}
        toast(
            `✗ Buy Box マケプレ → インライン AOD 走査\n` +
            `出品者: ${seller.sellerText || '?'}`,
            '#1976d2', 2500
        );
        if (isStopped()) return;
        await expandInlineAodIfPresent();
        if (isStopped()) return;
        const foundMp = findAodAmazonOffer();
        try {
            logAm('info', 'attempt-purchase', `インライン AOD 結果(マケプレ): found=${foundMp.found}`, {
                scanned: foundMp.scanned,
                usedSkipped: foundMp.usedSkipped,
                nonAmazonSkipped: foundMp.nonAmazonSkipped,
                method: foundMp.method,
            });
        } catch (e) {}
        if (foundMp.found) {
            toast(`✓ インライン AOD で Amazon 直販発見 (${foundMp.price}) → click`, BUY_GREEN, 2500);
            await clickAodAmazonOffer(foundMp.cartButton, foundMp.price);
            return;
        }
        // インラインで見つからなければ AOD ページ(全 seller)に navigate
        openAodPanel();
    };

    // ───────────────────────────────────────────────
    // 購入開始(🛒購入ボタン押下時)
    // ───────────────────────────────────────────────
    // ★v0.2.0: startPurchase は S.opStart で完全リセット & 開始
    //   - 既存 SESSION があれば破棄、新セッション作成
    //   - MODE=RUNNING に
    //   - タイマー interval をクリア
    const startPurchase = async () => {
        const prevSession = S.getSession();
        // PAUSED 状態に既存セッションがある場合、HIROさんの設定で確認
        if (S.isPaused() && prevSession && prevSession.reloadCount > 0 && !S.getSkipConfirm()) {
            const ok = confirm(
                `一時停止中のセッションがあります(${prevSession.reloadCount}回リロード済み)。\n\n` +
                `OK: 既存セッションを破棄して新規開始\n` +
                `キャンセル: 何もしない(▶再開で続行可)`
            );
            if (!ok) return;
        }

        // ★v0.3.8.84: 商品ページガード強化
        //   旧バグ: S.opStart() でセッション作成 → 後で screen チェック → toast + return
        //          → セッションが残り、非商品 URL (cart/検索結果等) が productUrl になる
        //   修正:   screen チェックを先に → 非商品ページなら **セッション作らず即 return**
        const _screenPre = detectScreen();
        if (_screenPre !== 'PRODUCT' && _screenPre !== 'PRODUCT_AOD') {
            try { logAm('warn', 'op',
                '🛒 開始 拒否: 非商品ページで押下 (セッション作成せず)', {
                    screen: _screenPre,
                    url: location.href.slice(0, 200),
                }); } catch (e) {}
            toast('⚠️ 商品ページ (/dp/...) を開いてから 🛒 を押してください\n' +
                  '現在のページ: ' + _screenPre,
                  STOP_RED, 5000);
            return;
        }

        // ★v0.3.8.98: 新規開始した時点で、その商品を「📦商品データ」に候補登録
        //   HIRO 指摘: TRANS-AM URL がまだ取れていなくても、🛒を押した商品は
        //   商品データに残るべき(後で URL が取れれば自動で「⚡TRANS-AM 可」に昇格)。
        //   直販 URL 未取得 = ASIN_ONLY 仮登録(listSavedProducts が「🔒 URL未取得」で表示)。
        try {
            const _asinNew = extractAsinFromUrl();
            if (_asinNew && /^[A-Z0-9]{10}$/.test(_asinNew)) {
                // 既に完成 URL があるなら ASIN_ONLY は付けない(昇格済みを維持)
                if (!hasSavedTransAmUrl(_asinNew) && !localStorage.getItem('LB_AM_ASIN_ONLY_' + _asinNew)) {
                    localStorage.setItem('LB_AM_ASIN_ONLY_' + _asinNew, String(Date.now()));
                    try { logAm('info', 'products-auto-add',
                        '🛒新規開始 → 商品データに候補登録 (ASIN_ONLY)', { asin: _asinNew }); } catch (e) {}
                }
            }
        } catch (e) {}

        S.opStart(location.href);
        try {
            if (timerCheckIntervalId) clearInterval(timerCheckIntervalId);
            if (timerCountdownIntervalId) clearInterval(timerCountdownIntervalId);
        } catch (e) {}
        S.clearTimerFired();

        const screen = detectScreen();

        // ★v0.2.3: PRODUCT_AOD URL (?aod=1) でも開始可能にする
        //   HIRO 報告 2026-05-11: AOD URL で🛒押下しても無反応問題の修正
        //   handler がすでに実行終了してるので、URL から ?aod=1 を削除してリロード
        //   → 通常 PRODUCT として handleProductPage が再実行される
        if (screen === 'PRODUCT_AOD') {
            try {
                logAm('info', 'op', '🛒 開始: PRODUCT_AOD URL → ?aod=1 削除 → 通常 URL でリロード');
            } catch (e) {}
            toast('▶ AOD URL から通常購入フロー開始(リダイレクト)', '#1976d2', 2500);
            try {
                const url = new URL(location.href);
                url.searchParams.delete('aod');
                if (CONFIG.autoForceAmazon && !url.searchParams.get('m')) {
                    url.searchParams.set('m', AMAZON_SELLER_ID);
                }
                url.searchParams.set('_pageRefresh', String(Date.now()));
                url.searchParams.set('_sw', String(Date.now()));
                setTimeout(() => {
                    if (S.shouldHalt()) return;
                    location.href = url.toString();
                }, 200);
            } catch (e) {
                location.reload();
            }
            return;
        }

        if (screen !== 'PRODUCT') {
            toast('⚠️ 商品ページではありません', STOP_RED, 4000);
            return;
        }

        toast(`▶ 購入開始`, BUY_GREEN, 2000);
        // ?m= 未付与なら ?m= URL に切替してから(切替後 attemptPurchase はリロード後に動く)
        if (CONFIG.autoForceAmazon && !isUrlForcedAmazon()) {
            forceAmazonDirectUrl();
            return;
        }
        await attemptPurchase();
    };

    // ★v0.3.8.16: ⚡TRANS-AM⚡ モード起動 (URL 直撃モード)
    //   既存 startPurchase と排他、ボタンも別、handleProductPage 入口でも別ルートに分岐
    const startPurchaseTransAm = async () => {
        const prevSession = S.getSession();
        if (S.isPaused() && prevSession && prevSession.reloadCount > 0 && !S.getSkipConfirm()) {
            const ok = confirm(
                `一時停止中のセッションがあります(${prevSession.reloadCount}回リロード済み)。\n\n` +
                `OK: 既存セッションを破棄して⚡TRANS-AM⚡新規開始\n` +
                `キャンセル: 何もしない(▶再開で続行可)`
            );
            if (!ok) return;
        }

        S.opStartTransAm(location.href);   // ← バリア 3: フラグ強制セット + clean session
        try {
            if (timerCheckIntervalId) clearInterval(timerCheckIntervalId);
            if (timerCountdownIntervalId) clearInterval(timerCountdownIntervalId);
        } catch (e) {}
        S.clearTimerFired();

        const screen = detectScreen();

        // PRODUCT_AOD URL なら ?aod=1 削除 (既存 startPurchase と同じ前処理)
        if (screen === 'PRODUCT_AOD') {
            try { logAm('info', 'op', '⚡ TRANS-AM 起動: PRODUCT_AOD URL → ?aod=1 削除 → 通常 URL でリロード'); } catch (e) {}
            toast('⚡ TRANS-AM 発動 (AOD URL から切替)', '#c41e9e', 2500);
            try {
                const url = new URL(location.href);
                url.searchParams.delete('aod');
                if (CONFIG.autoForceAmazon && !url.searchParams.get('m')) {
                    url.searchParams.set('m', AMAZON_SELLER_ID);
                }
                url.searchParams.set('_pageRefresh', String(Date.now()));
                url.searchParams.set('_sw', String(Date.now()));
                setTimeout(() => {
                    if (S.shouldHalt()) return;
                    location.href = url.toString();
                }, 200);
            } catch (e) {
                location.reload();
            }
            return;
        }

        if (screen !== 'PRODUCT') {
            toast('⚠️ 商品ページではありません', STOP_RED, 4000);
            S.opFullStop();   // 開始失敗時はフラグ含めて完全クリーンアップ
            return;
        }

        toast(`⚡ TRANS-AM 発動中`, '#c41e9e', 2500);
        // ?m= 未付与なら ?m= URL に切替 (既存と同じ)
        if (CONFIG.autoForceAmazon && !isUrlForcedAmazon()) {
            forceAmazonDirectUrl();
            return;
        }
        // handleProductPage は TRANS-AM フラグを検知して tryInstantBuyTransAm に分岐する
        await handleProductPage();
    };

    // ───────────────────────────────────────────────
    // 各画面ハンドラ(v0.1.0 は枠だけ。実装は後続)
    // ───────────────────────────────────────────────
    const handleProductPage = async () => {
        renderStartButton();

        const session = S.getSession();
        const mode = S.getMode();

        try {
            logAm('info', 'handler', 'handleProductPage 入室', {
                mode: mode,
                step: S.getStep(),
                hasSession: !!session,
                forcedM: isUrlForcedAmazon(),
            });
        } catch (e) {}

        // ★v0.3.8.52: パッシブ Buy Box 捕捉
        //   STOPPED 状態でも商品ページ訪問だけで offerListing.1 を自動保存。
        //   HIRO 要件「私は開始またはトランザムしか押さない、情報収集は自動化」対応。
        //   1500ms 後に実行 (Amazon DOM 安定待ち、Buy Box hidden input の遅延ロード対策)。
        try {
            setTimeout(() => { try { passiveSaveBuyBoxOlid(); } catch (e) {} }, 1500);
            // 3500ms 後にもう 1 回 (遅延 DOM 注入対策、Amazon は ?m=AN1VRQENFRJN5 で
            //   後から hidden input を差し替えることがある)
            setTimeout(() => { try { passiveSaveBuyBoxOlid(); } catch (e) {} }, 3500);
        } catch (e) {}

        // ★v0.2.0: autoForceAmazon 自動切替(HIRO Q1 で「残す」確定)
        //   MODE 関係なく、商品ページ到達 + ?m= 未付与 + マケプレ判定なら自動で URL 切替
        //   ただし SESSION も MODE も触らない(STOPPED のまま、HIRO が🛒押すまで動かない原則)
        //   → リダイレクト後は URL に ?m= が付くだけ、購入は HIRO の🛒押下時のみ
        if (CONFIG.autoForceAmazon && !isUrlForcedAmazon()) {
            try {
                await sleep(800); // DOM 落ち着き待ち
                const sellerInit = detectBuyBoxSeller();
                if (!sellerInit.isDirect && sellerInit.sellerText) {
                    toast(`🔄 マケプレ検出 → Amazon直販URLに自動切替\n(出品者: ${sellerInit.sellerText.slice(0, 30)})`,
                        '#1976d2', 3000);
                    try {
                        logAm('info', 'auto-force-url', 'マケプレ判定 → ?m= 自動切替', {
                            sellerText: sellerInit.sellerText.slice(0, 60),
                            mode: mode,
                        });
                    } catch (e) {}
                    await sleep(800);
                    const sep = location.search ? '&' : '?';
                    const newUrl = location.pathname + (location.search || '') +
                                   sep + 'm=' + AMAZON_SELLER_ID + (location.hash || '');
                    location.href = newUrl;
                    return;
                }
            } catch (e) {}
        }

        // ★v0.2.0: タイマー機能(STOPPED でも起動可能、時刻になったら opStart で自動開始)
        //   STOPPED + timerEnabled の状態で、HIRO さんが事前予約購入する用途
        if (CONFIG.timerEnabled && !S.isTimerFired() && !S.isPaused()) {
            try { startTimer(); } catch (e) {}
        }

        // ★v0.2.0: STOPPED/PAUSED → 何もしない(HIROさんが操作するまで待機)
        //   これが「停止が効かない」「勝手に動く」の根治
        if (S.shouldHalt()) {
            if (S.isPaused() && session) {
                toast(`⏸ 一時停止中(${session.reloadCount || 0}回リロード済み)\n▶再開ボタンで続行可`, '#666', 5000);
            }
            return;
        }

        // ★v0.2.0/v0.2.2: 別商品検出ガード(モバイル /gp/aw/d/ 対応)
        //   RUNNING 中、SESSION の productUrl と現在 URL が違う商品なら自動 PAUSED
        // ★v0.3.8.49 緊急修正: TRANS-AM 中はこのガードを **必ずスキップ**
        //   理由: TRANS-AM では Line 9011 で「URL 書き換え継続」処理に進ませる必要がある
        //   このガードが先に発動すると opPause + return で TRANS-AM 処理が動かない
        if (session && session.productUrl && !S.isTransAmMode()) {
            try {
                const sessionAsin = extractAsin(session.productUrl);
                const currentAsin = extractAsin(location.pathname);
                if (sessionAsin && currentAsin && sessionAsin !== currentAsin) {
                    if (isRotationOn()) {
                        // ★巡回中:別商品でも停止せず、監視対象を現在の商品に更新して継続
                        try { S.updateSession({ productUrl: location.href }); } catch (e) {}
                        try { logAm('info', 'rotation', '🔄 巡回:別商品ページ → 対象を更新して継続', { sessionAsin, currentAsin }); } catch (e) {}
                    } else {
                        try {
                            logAm('warn', 'different-product', '別商品ページ検出 → 自動 PAUSED', {
                                sessionAsin, currentAsin,
                                sessionUrl: session.productUrl.slice(0, 100),
                                currentUrl: location.href.slice(0, 100),
                            });
                        } catch (e) {}
                        toast(`⚠ 別商品検出\n旧: ${sessionAsin}\n新: ${currentAsin}\n→ ⏸自動停止しました\n🛒で新規開始 / ▶で旧商品復帰`,
                            '#f57c00', 12000);
                        S.opPause();
                        return;
                    }
                }
            } catch (e) {}
        }

        // ★v0.1.15.15: Express Checkout 監視起動(RUNNING のみ)
        startExpressCheckoutWatch();

        // ★v0.3.8.16: ⚡TRANS-AM⚡ モード判定 (バリア 2: 排他性)
        //   if/else + return で物理的に二重実行不可。
        //   TRANS-AM フラグ ON → tryInstantBuyTransAm のみ走る (attemptPurchase は呼ばれない)
        //   TRANS-AM フラグ OFF → 既存 attemptPurchase ルート (これまで通り無変更)
        if (S.isTransAmMode() && session) {
            // ★v0.3.8.46 修正: TRANS-AM 中の別商品ページ検出 → session.productUrl を書き換えて続行
            //   HIRO 指示 (2026-05-18): 「URL を書き換えて TRANS-AM 継続」
            //   → 商品 A → 商品 B に遷移しても、bot は自動的に対象を商品 B に更新
            try {
                const currentAsin = extractAsinFromUrl();
                const sessionUrl = (session && session.productUrl) || '';
                const sessionAsinMatch = sessionUrl.match(/\/(?:dp|gp\/aw\/d|gp\/product)\/([A-Z0-9]{10})/);
                const sessionAsin = sessionAsinMatch ? sessionAsinMatch[1] : null;
                if (currentAsin && sessionAsin && currentAsin !== sessionAsin) {
                    try {
                        logAm('info', 'different-product',
                            '🔄 別商品ページ検出 (TRANS-AM 中) → session.productUrl 書き換え [継続]', {
                            sessionAsin: sessionAsin,
                            currentAsin: currentAsin,
                            sessionUrl: sessionUrl.slice(0, 120),
                            currentUrl: (location.href || '').slice(0, 120),
                        });
                    } catch (e) {}
                    try {
                        S.updateSession({ productUrl: location.href });
                        toast('🔄 対象商品を切替: ' + currentAsin + ' (TRANS-AM 継続)', BUY_GREEN, 5000);
                    } catch (e) {}
                }
            } catch (e) {}

            try { logAm('info', 'handler', '⚡ TRANS-AM ルート → tryInstantBuyTransAm 呼び出し', {
                sid: session.sid.slice(0, 6), reloadCount: session.reloadCount,
            }); } catch (e) {}
            if (S.shouldHalt()) return;
            const result = await tryInstantBuyTransAm();
            if (result && result.navigated) return;   // ← URL navigate 済 → 戻る
            // 失敗 (情報未取得 等) → リロードガチャ継続
            scheduleReloadForWait('TRANS-AM: 情報未取得');
            return;
        }

        // ★v0.2.0: RUNNING + SESSION あり → 自動再開(リロード後の継続)
        //   ↑ TRANS-AM フラグ ON ではない場合のみここに到達 (バリア 2 で排他)
        if (session) {
            try { logAm('info', 'handler', 'RUNNING → attemptPurchase 呼び出し', {
                sid: session.sid.slice(0, 6), reloadCount: session.reloadCount,
            }); } catch (e) {}
            if (S.shouldHalt()) return;
            // ★v0.3.5: ここの sleep(500) を削除 (リロードサイクル短縮)
            //   理由: 直後に呼ばれる attemptPurchase 内のループ (line 3107) に
            //   同じ目的の sleep(500) があり、保護が二重化していた。
            //   片方削除しても DOM 安定待ちは attemptPurchase 側で機能継続。
            //   効果: 1 サイクル -500ms
            await attemptPurchase();
            return;
        }

        // ★v0.2.0: RUNNING だが SESSION なし → 異常状態、完全停止
        try { logAm('warn', 'handler', 'RUNNING だがセッションなし → 完全停止'); } catch (e) {}
        S.opFullStop();
        toast(`⚠️ 状態異常 → 完全停止\n🛒 ボタンで開始してください`, STOP_RED, 5000);
    };

    // v0.1.3/v0.2.0/v0.2.1: AOD 画面ハンドラ
    const handleProductAod = async () => {
        renderStartButton();
        const step = S.getStep();
        const mode = S.getMode();
        // ★v0.2.1: STOPPED で AOD URL に居る時のノイズログ抑制(debugMode 時のみ記録)
        if (mode === MODE_STOPPED && !CONFIG.debugMode) {
            // log なし、toast のみ(下で出す)
        } else {
            try {
                logAm('info', 'handler', 'handleProductAod 入室', { step: step, mode: mode });
            } catch (e) {}
        }

        // ★v0.3.8.52: パッシブ AOD 捕捉
        //   STOPPED 状態でも AOD ページ訪問だけで offerListing.1 を自動保存。
        //   HIRO 要件「私は開始またはトランザムしか押さない、情報収集は自動化」対応。
        //   findAodAmazonOffer 内部で直販判定 + form から olid 抽出 + 保存。
        //   1800ms 後 (AOD オファーリストの遅延ロード対策) + 4000ms 後 (再試行)
        try {
            setTimeout(() => { try { passiveSaveAodOlid(); } catch (e) {} }, 1800);
            setTimeout(() => { try { passiveSaveAodOlid(); } catch (e) {} }, 4000);
        } catch (e) {}

        // ★v0.3.8.10: AOD 環境フィンガープリント (セッション内 1 回出力)
        //   localStorage 永久キャッシュ廃止、in-memory フラグ aodEnvSnapshotLogged で制御。
        //   セッション開始 (mode: STOPPED→RUNNING) 時にフラグがリセットされる前提。
        //   HIRO 環境特有の AOD UI 種別 (form 数、input 種別) を毎セッション記録。
        try {
            if (!aodEnvSnapshotLogged) {
                aodEnvSnapshotLogged = true;
                const snap = collectAodEnvSnapshot();
                try {
                    logAm('info', 'aod-env-snapshot',
                        'AOD 環境フィンガープリント (セッション内 1 回目)', snap);
                } catch (e) {}
            }
        } catch (e) {}

        // ★v0.2.0: RUNNING + STEP_AOD_OPEN なら自動走査
        if (S.isRunning() && step === STEP_AOD_OPEN) {
            toast(`📂 AOD パネル開いた → 走査開始`, '#1976d2', 3000);
            await handleAodScreen();
            return;
        }
        // 手動アクセス or リロード後 step 切れ → 走査せず toast のみ
        toast(`📂 AOD URL 検出(step=${step}, mode=${S.getMode()}, 自動走査せず)`, '#1976d2', 3000);
    };

    // ───────────────────────────────────────────────
    // v0.1.5: smart-wagon 画面ハンドラ
    //   /cart/smart-wagon に到達した時、「レジに進む」ボタンを single click。
    //   実機調査(2026-05-07 デスクトップ B00O869KJE)で確認した DOM:
    //     - URL: /cart/smart-wagon?newItems={UUID},{qty}&ref_=sw_refresh
    //     - title: "Amazon.co.jpショッピングカート"
    //     - heading "カートに入れました"
    //     - 商品サムネ + 商品名 + 価格 + 数量
    //     - button "Proceed to checkout" / 表示テキスト "レジに進む (1個)" ← これを click
    //     - link "カートに移動" → /gp/cart/view.html
    //
    //   ★ 単発 click(駿河屋 v0.1.6 教訓)
    //   ★ 失敗時は停止(リロード待機ではない、smart-wagon は「ボタンが必ずある」前提)
    // ───────────────────────────────────────────────
    const findSmartWagonProceedButton = () => {
        const candidates = [
            // aria-label ベース(英語固定)
            () => document.querySelector('button[aria-label="Proceed to checkout"]'),
            () => document.querySelector('input[aria-label="Proceed to checkout"]'),
            () => document.querySelector('a[aria-label="Proceed to checkout"]'),
            // name 属性
            () => document.querySelector('button[name*="proceedToRetailCheckout"]'),
            () => document.querySelector('input[name*="proceedToRetailCheckout"]'),
            // テキストマッチ「レジに進む」
            () => findByText('button, input[type="submit"], a', 'レジに進む'),
            // Smart Wagon 固有の id
            () => document.querySelector('#sw-ptc-button button, #sw-ptc-button input'),
            () => document.querySelector('[data-action="sw-checkout"]'),
            () => document.querySelector('button[type="submit"][data-feature-id*="checkout"]'),
        ];
        // ★v0.3.8.59: 自分のパネル誤マッチ防止 (findClassicCartProceedButton と同様)
        const isOwnPanel = (el) => {
            try { return el && el.closest && el.closest('#lb-am-panel'); }
            catch (e) { return false; }
        };
        for (const fn of candidates) {
            try {
                const el = fn();
                if (el && !isOwnPanel(el) && isElementVisible(el)) return el;
            } catch (e) {}
        }
        return null;
    };

    // v0.1.9.2: smart-wagon ではカート確定を 3 秒待つ(早期 navigate でカート追加が
    //   キャンセルされるのを防ぐ)
    // ★v0.3.8.54: 3 秒固定 → polling 方式 (HIRO 指摘「もっさり」対応)
    // ★v0.3.8.56: polling 間隔短縮 (250ms → 100ms) で発見が更に高速化
    //   smart-wagon ページに「カートに入れました」テキストが出たら即 navigate。
    //   ベスト 200ms / 平均 400ms / 最悪 1500ms (従来 3000ms 固定から ~1/2〜1/15 短縮)。
    const handleSmartWagon = async () => {
        if (isStopped()) return;
        try { logAm('info', 'handler', 'handleSmartWagon 入室 → cart page へ'); } catch (e) {}
        setState(ST_CART_DONE);
        toast(
            `▶ smart-wagon 到達 → cart page へ (Observer)`,
            null, 2000
        );
        // ★v0.3.8.70: polling → MutationObserver で「カートに入れました」テキスト出現を即検知
        //   旧: 100ms × 12 polling (1200ms max)
        //   新: MutationObserver で 0ms 遅延検知、tail-end は humanReactionDelay()
        const startWs = Date.now();
        const cartConfirmed = await waitForText(
            /カートに入れました|Added to cart|カートに追加されました/,
            1500,
            { earlyExitFn: () => isStopped() }
        );
        const waitedMs = Date.now() - startWs;
        if (isStopped()) return;
        // 安定待ち + 人間反応 (BOT 検知対策)
        const hrDelay = humanReactionDelay();
        await sleep(hrDelay);
        try { logAm('info', 'handler', 'smart-wagon: cart page へ navigate', {
            cartConfirmed: cartConfirmed,
            observerWaitMs: waitedMs,
            humanReactionMs: Math.round(hrDelay),
            totalMs: waitedMs + Math.round(hrDelay),
        }); } catch (e) {}
        if (isStopped()) return;
        location.href = 'https://www.amazon.co.jp/gp/cart/view.html';
    };
    // ───────────────────────────────────────────────
    // v0.1.9.0: classic cart ハンドラ実装(★HIRO 報告で実装漏れ判明)
    //   /gp/cart/view.html に到達した時の自動進行。
    //   「レジに進む」(input[name="proceedToRetailCheckout"])を nativeTap で
    //   発火 → SPC 別ページに遷移。
    // ───────────────────────────────────────────────
    const findClassicCartProceedButton = () => {
        // ★v0.3.8.59: HIRO 緊急報告 (2026-05-18 21:51 ログ):
        //   findByText('span, div', 'レジに進む') がトースト履歴メッセージに誤マッチし、
        //   スクリプトのパネル本体 <div id="lb-am-panel"> を click 投入 → 事故発生。
        //   対策:
        //     ① 'span, div' テキスト一致は完全削除 (誤マッチの温床、ボタン以外を返すのは危険)
        //     ② 結果が #lb-am-panel 配下なら必ず除外 (findByText 側の防御に加えた二重防御)
        //     ③ 緩和版 (visible 不問) でも同じ除外を適用
        const candidates = [
            // 標準セレクタ
            () => document.querySelector('input[name="proceedToRetailCheckout"]'),
            () => document.querySelector('button[name="proceedToRetailCheckout"]'),
            () => document.querySelector('#sc-buy-box-ptc-button'),
            () => document.querySelector('#sc-buy-box-ptc-button input'),
            () => document.querySelector('#sc-buy-box-ptc-button button'),
            () => document.querySelector('[id*="ptc-button"] input[type="submit"]'),
            () => document.querySelector('[id*="ptc-button"] button[type="submit"]'),
            // ★v0.1.9.6: モバイル UI の追加セレクタ
            () => document.querySelector('a[href*="/checkout/p/"]'),  // モバイルではリンク
            () => document.querySelector('[data-feature-id*="proceed"]'),
            () => document.querySelector('[data-csa-c-action*="proceed"]'),
            // テキストマッチ「レジに進む」(ボタン・リンク限定、span/div は除外)
            () => findByText('button, input[type="submit"], a, [role="button"]', 'レジに進む'),
            () => findByText('button, input[type="submit"], a, [role="button"]', 'Proceed to checkout'),
            () => findByText('button, input[type="submit"], a, [role="button"]', '購入手続きに進む'),
            // ★v0.3.8.59 削除: findByText('span, div', 'レジに進む')
            //   理由: トースト履歴がマッチ → パネル本体を click する事故が発生
        ];
        const isOwnPanel = (el) => {
            try { return el && el.closest && el.closest('#lb-am-panel'); }
            catch (e) { return false; }
        };
        for (const fn of candidates) {
            try {
                const el = fn();
                if (el && !isOwnPanel(el) && isElementVisible(el)) return el;
            } catch (e) {}
        }
        // 緩和版: visible でなくても返す(画面外の要素も対応)、ただしパネル除外は厳守
        for (const fn of candidates) {
            try {
                const el = fn();
                if (el && !isOwnPanel(el)) return el;
            } catch (e) {}
        }
        return null;
    };

    const handleClassicCart = async () => {
        // ★v0.3.8.31: STOPPED 状態でもカート画面なら「あとで買う」を自動スキャン
        //   (副作用なし、純粋に観測 + 保存。bot 動作中じゃなくても発動)
        // ★v0.3.8.32: アコーディオン展開検知用の MutationObserver も起動
        try { collectFromCartSaveForLater(); } catch (e) {}
        try { startCartSflObserver(); } catch (e) {}
        if (isStopped()) return;
        // ★v0.1.16.8: cart page 入室ログ
        try { logAm('info', 'handler', 'handleClassicCart 入室'); } catch (e) {}

        setState(ST_CART_DONE);

        // ★v0.1.9.2: カートが空なら停止(カート追加が失敗していた場合の安全装置)
        // ★v0.3.8.54: 800ms → 300ms 短縮 (HIRO 指摘「もっさり」対応)
        // ★v0.3.8.56: 300ms → 150ms 更に短縮 (HIRO「競り負けてる」対応)
        //   smart-wagon の polling で「カートに入れました」確認済 + cart page navigate 後
        //   の安定待ちなので、150ms で bodyText 読み取り可能。
        await sleep(150);
        const bodyText = safeInnerText(document);
        if (/Amazonカートは空です/.test(bodyText) || /カートに何も入っていません/.test(bodyText)) {
            // ★v0.3.8.79: カート空表示でも、AOD カート追加 API 200 で TRANS-AM URL を
            //   保存していれば、それで Express Checkout に直行できる可能性が高い。
            //   iOS Safari の cookie 不整合で /cart/view.html だけ空に見えるケースがあるため、
            //   即停止せず TRANS-AM URL ルートで再試行する。
            try {
                const session = S.getSession && S.getSession();
                let asin = null;
                if (session && session.productUrl) {
                    try {
                        const m = session.productUrl.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/);
                        if (m && m[1]) asin = m[1];
                    } catch (e) {}
                }
                const savedTransAmUrl = asin ? getSavedTransAmUrl(asin) : null;
                if (savedTransAmUrl && S.isRunning && S.isRunning()) {
                    try { logAm('warn', 'cart',
                        '⚠ カート空表示 but TRANS-AM URL あり → 直行で復旧試行 (停止せず)', {
                        asin: asin,
                        bodyTextSample: bodyText.slice(0, 200),
                        urlHead: savedTransAmUrl.slice(0, 80),
                    }); } catch (e) {}
                    try { toast(
                        '⚠ カート空表示検出 → TRANS-AM URL で復旧試行\n' +
                        '(iOS Safari の cookie 不整合の可能性、停止せず継続)',
                        '#f57c00', 6000
                    ); } catch (e) {}
                    location.href = savedTransAmUrl;
                    return;
                }
            } catch (e) {}
            // ★v0.1.16.8: カート空は致命的(カート追加が機能してない)→ error (Discord push)
            try {
                logAm('error', 'cart', 'カートが空 → カート追加失敗の可能性、停止 (TRANS-AM URL も無し)', {
                    bodyTextSample: bodyText.slice(0, 200),
                });
            } catch (e) {}
            toast(
                `❌ カートが空です\n` +
                `「カートに入れる」が実行されてない可能性\n` +
                `→ 商品ページから手動でカートに入れて再試行してください`,
                STOP_RED, 15000
            );
            clearState();
            setStopped(true);
            return;
        }

        toast(`▶ cart page 到達。「レジに進む」を探しています…`, '#1976d2', 1500);

        // ★v0.3.8.70: polling → MutationObserver で「レジに進む」ボタン即検知
        //   旧: 80ms × 62 polling (5秒 max)
        //   新: Observer で 0ms 遅延検知、5秒 タイムアウト維持
        //   findClassicCartProceedButton は #lb-am-panel 除外 + 多段 fallback ありなので
        //   Observer のコールバックで直接呼ぶ
        let proceedBtn = null;
        const proceedFoundFlag = { found: null };
        // 初回確認
        proceedBtn = findClassicCartProceedButton();
        if (!proceedBtn) {
            // MutationObserver で出現待ち
            await new Promise((resolve) => {
                let resolved = false;
                const root = document.body || document.documentElement;
                if (!root) return resolve();
                let timer = null;
                const cleanup = () => {
                    if (resolved) return;
                    resolved = true;
                    try { obs.disconnect(); } catch (e) {}
                    if (timer) { try { clearTimeout(timer); } catch (e) {} }
                };
                const obs = new MutationObserver(() => {
                    if (resolved) return;
                    if (isStopped()) { cleanup(); return resolve(); }
                    const el = findClassicCartProceedButton();
                    if (el) { proceedBtn = el; cleanup(); return resolve(); }
                });
                try { obs.observe(root, { childList: true, subtree: true, attributes: true }); }
                catch (e) { cleanup(); return resolve(); }
                timer = setTimeout(() => {
                    // タイムアウト時最終確認
                    if (!proceedBtn) proceedBtn = findClassicCartProceedButton();
                    cleanup();
                    resolve();
                }, 5000);
            });
        }
        if (isStopped()) return;

        if (!proceedBtn) {
            // ★v0.1.16.8: cart の「レジに進む」未検出は error (Discord push)
            try {
                logAm('error', 'cart', '「レジに進む」ボタン未検出 → 停止');
            } catch (e) {}
            toast(
                `❌ classic cart の「レジに進む」ボタン未検出\n` +
                `→ 手動で押してください`,
                STOP_RED, 12000
            );
            clearState();
            setStopped(true);
            return;
        }

        toast(
            `▶ 「レジに進む」をクリック(1回のみ)\n` +
            `次画面: SPC 注文確認(別ページ)`,
            BUY_GREEN, 2000
        );
        // ★v0.3.8.70: humanReactionDelay (中央値 200ms 正規分布 + 10% ヒッカップ)
        //   旧 v0.3.8.56: 15-45ms 一様分布 (BOT バレリスク)
        //   新: BOT 検知対策強化 (HIRO 指示「警告出たら見直し、まず人間ぽく」)
        await sleep(humanReactionDelay());
        if (isStopped()) return;

        setState(ST_CHECKOUT);

        // ★v0.3.8.57 緊急修正: HIRO 報告「レジに進む 押してくれない」(21:19 ログ)
        //   現象: handleClassicCart で proceedBtn 検出 → click() → 同 URL のまま停滞
        //         button タグの場合 fallback がなく、Amazon が click を無視すると進まない
        //   修正:
        //     ① click 前ログ追加 (どの要素を click したか可視化)
        //     ② click 後の URL 変化 polling (1.5秒、100ms 刻み)
        //     ③ URL 変化なしなら 3 段階 fallback:
        //        a. A タグ → href へ navigate
        //        b. button が form 内 → form.requestSubmit(submitter=proceedBtn)
        //        c. それでも駄目 → form.action へ手動 navigate
        try {
            logAm('info', 'cart-proceed-click', '「レジに進む」 click 投入', {
                tag: proceedBtn.tagName,
                id: proceedBtn.id || '',
                name: proceedBtn.getAttribute('name') || '',
                href: proceedBtn.href ? proceedBtn.href.slice(0, 100) : '',
                text: (proceedBtn.innerText || proceedBtn.value || '').slice(0, 40),
            });
        } catch (e) {}

        try {
            proceedBtn.click();
        } catch (e) {
            try { logAm('error', 'cart-proceed-click', `click 例外: ${e.message}`); } catch (er) {}
            toast(`❌ 「レジに進む」 click 失敗: ${e.message}`, STOP_RED, 8000);
            clearState();
            setStopped(true);
            return;
        }

        // click 後の URL 変化 polling (1.5秒、100ms 刻み)
        const clickedAt = Date.now();
        let navigated = false;
        for (let i = 0; i < 15; i++) {
            if (isStopped()) return;
            const p = location.pathname;
            if (!p.startsWith('/cart') && !p.startsWith('/gp/cart')) {
                navigated = true;
                break;
            }
            await sleep(100);
        }

        if (navigated) {
            try { logAm('info', 'cart-proceed-click', '✅ click 後 URL 遷移確認', {
                elapsedMs: Date.now() - clickedAt,
                newPath: location.pathname.slice(0, 80),
            }); } catch (e) {}
        } else {
            // URL 未変化 → fallback
            try { logAm('warn', 'cart-proceed-click',
                '⚠ click 後 URL 未変化 → fallback 開始', {
                elapsedMs: Date.now() - clickedAt,
                btnTag: proceedBtn.tagName, btnId: proceedBtn.id || '',
            }); } catch (e) {}

            // fallback A: A タグ → href へ navigate
            if (proceedBtn.tagName === 'A' && proceedBtn.href) {
                try { logAm('info', 'cart-proceed-fallback', 'fallback-A: href へ navigate', {
                    href: proceedBtn.href.slice(0, 100),
                }); } catch (e) {}
                location.href = proceedBtn.href;
                return;
            }

            // fallback B: button が form 内 → form.requestSubmit(submitter=proceedBtn)
            try {
                const form = proceedBtn.closest && proceedBtn.closest('form');
                if (form) {
                    try { logAm('info', 'cart-proceed-fallback', 'fallback-B: form.requestSubmit', {
                        formAction: (form.action || '').slice(0, 100),
                        formMethod: form.method || '',
                    }); } catch (e) {}
                    try {
                        if (typeof form.requestSubmit === 'function') {
                            form.requestSubmit(proceedBtn);
                        } else {
                            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                        }
                    } catch (e) {
                        try { logAm('warn', 'cart-proceed-fallback',
                            'requestSubmit 失敗 → form.action 手動 navigate', {
                            err: String(e && e.message || e),
                        }); } catch (er) {}
                        // fallback C: form.action へ手動 navigate
                        if (form.action) {
                            location.href = form.action;
                        }
                    }
                    return;
                }
            } catch (e) {}

            // fallback C 最終手段: SPC URL 直行
            try { logAm('warn', 'cart-proceed-fallback',
                'fallback-C 最終手段: SPC URL 直行', {}); } catch (e) {}
            location.href = 'https://www.amazon.co.jp/gp/buy/spc/handlers/display.html?hasWorkingJavascript=1';
        }

        if (CONFIG.debugMode) {
            console.log('[GBOT-AM] handleClassicCart: clicked proceed');
        }
    };

    // ───────────────────────────────────────────────
    // ★v0.3.0(HIRO 設計): 「他に何か必要ですか?」画面ハンドラ
    //   フロー: カート画面 →「レジに進む(1個)(税込)」→ ★この画面 → 注文確定画面
    //   動作: 「レジに進む」完全一致のみ click(「カートに戻る」絶対除外)
    //   失敗時は完全停止ではなく一時停止 → HIRO 手動操作可
    // ───────────────────────────────────────────────
    const findAddOnUpsellProceedButton = () => {
        // ★v0.3.4 [フェーズ 0 = 最優先]: ID/class セレクタで確実に取得
        //   /checkout/byg/ の「レジに進む」は #checkout-byg-ptc-button が一意 ID
        //   SPAN ベースなので内部 <a class="a-button-text"> を返す方が click 安定
        let bygBtn = document.querySelector('#checkout-byg-ptc-button');
        if (bygBtn && isElementVisible(bygBtn)) {
            const inner = bygBtn.querySelector('a.a-button-text, a');
            return inner || bygBtn;
        }
        bygBtn = document.querySelector('.byg-ptc');
        if (bygBtn && isElementVisible(bygBtn)) {
            const inner = bygBtn.querySelector('a.a-button-text, a');
            return inner || bygBtn;
        }

        // ★以下は v0.3.3 既存ロジック (フェーズ1 + フェーズ2) を完全維持
        // ★v0.3.8.59: 自分のパネル誤マッチ防止
        const isOwnPanel = (el) => {
            try { return el && el.closest && el.closest('#lb-am-panel'); }
            catch (e) { return false; }
        };
        const candidates = Array.from(document.querySelectorAll(
            'button, input[type="submit"], a, [role="button"], span'
        )).filter(el => !isOwnPanel(el));   // ★v0.3.8.59: パネル配下を最初に除外
        // フェーズ1: visible + 完全一致を最優先
        for (const el of candidates) {
            if (!isElementVisible(el)) continue;
            const t = (el.innerText || el.textContent || el.value || '').trim();
            if (!t) continue;
            // ★絶対除外
            if (/カートに戻る/.test(t)) continue;
            // ★完全一致(カート画面「レジに進む (1個の商品) (税込)」は除外される)
            if (/^レジに進む\s*$/.test(t)) {
                // span/div は親の clickable 要素を探す
                if (el.tagName === 'SPAN' || el.tagName === 'DIV') {
                    let parent = el.parentElement;
                    let depth = 0;
                    while (parent && depth < 5) {
                        const tag = parent.tagName;
                        if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' ||
                            parent.getAttribute('role') === 'button') {
                            return parent;
                        }
                        parent = parent.parentElement;
                        depth++;
                    }
                }
                return el;
            }
        }
        // フェーズ2: 緩和版(visible でなくても完全一致なら拾う)
        for (const el of candidates) {
            const t = (el.innerText || el.textContent || el.value || '').trim();
            if (!t) continue;
            if (/カートに戻る/.test(t)) continue;
            if (/^レジに進む\s*$/.test(t)) return el;
        }
        return null;
    };

    const handleAddOnUpsell = async () => {
        if (S.shouldHalt()) return;
        try {
            logAm('info', 'handler', 'handleAddOnUpsell 入室(他に何か必要ですか?画面)');
        } catch (e) {}

        S.setStep(STEP_CHECKOUT);  // SPC 直前の中間相当

        toast(`▶ 「他に何か必要?」画面検出 → 「レジに進む」探索中…`, '#1976d2', 1500);

        // ★v0.3.8.70: polling → MutationObserver で「レジに進む」ボタン即検知
        let proceedBtn = findAddOnUpsellProceedButton();
        if (!proceedBtn) {
            await new Promise((resolve) => {
                let resolved = false;
                const root = document.body || document.documentElement;
                if (!root) return resolve();
                let timer = null;
                const cleanup = () => {
                    if (resolved) return;
                    resolved = true;
                    try { obs.disconnect(); } catch (e) {}
                    if (timer) { try { clearTimeout(timer); } catch (e) {} }
                };
                const obs = new MutationObserver(() => {
                    if (resolved) return;
                    if (S.shouldHalt()) { cleanup(); return resolve(); }
                    const el = findAddOnUpsellProceedButton();
                    if (el) { proceedBtn = el; cleanup(); return resolve(); }
                });
                try { obs.observe(root, { childList: true, subtree: true, attributes: true }); }
                catch (e) { cleanup(); return resolve(); }
                timer = setTimeout(() => {
                    if (!proceedBtn) proceedBtn = findAddOnUpsellProceedButton();
                    cleanup();
                    resolve();
                }, 5000);
            });
        }
        if (S.shouldHalt()) return;

        if (!proceedBtn) {
            try {
                logAm('error', 'addon-upsell', '「レジに進む」ボタン未検出 → 一時停止');
            } catch (e) {}
            toast(
                `❌ 「他に何か必要?」画面の「レジに進む」未検出\n` +
                `→ 手動で押してください(▶再開で続行可)`,
                STOP_RED, 12000
            );
            // ★完全停止ではなく一時停止: HIRO さんが手動で先に進められるように
            try { S.opPause(); } catch (e) {}
            return;
        }

        toast(`▶ 「レジに進む」 click(1回のみ)\n次画面: 注文確定`, BUY_GREEN, 2500);

        // ★v0.3.8.70: humanReactionDelay (中央値 200ms + ヒッカップ 10%、BOT 検知対策)
        await sleep(humanReactionDelay());
        if (S.shouldHalt()) return;

        try {
            logAm('info', 'addon-upsell', '「レジに進む」 click 実行', {
                tag: proceedBtn.tagName,
                id: proceedBtn.id || '',
                text: (proceedBtn.innerText || proceedBtn.value || '').slice(0, 30),
            });
            proceedBtn.click();
        } catch (e) {
            toast(`❌ 「レジに進む」 click 失敗: ${e.message}`, STOP_RED, 8000);
            try { logAm('error', 'addon-upsell', `click 失敗: ${e.message}`); } catch (er) {}
            try { S.opPause(); } catch (er) {}
            return;
        }

        // a タグで JS ハンドラが効かない場合のフォールバック
        // ★v0.3.8.56: 1500ms → 600ms 短縮 (HIRO「競り負け」対応)
        if (proceedBtn.tagName === 'A' && proceedBtn.href) {
            await sleep(600);
            if (!S.shouldHalt() && detectAddOnUpsellByText()) {
                try {
                    logAm('warn', 'addon-upsell', 'click 後も同画面 → href で遷移', {
                        href: proceedBtn.href.slice(0, 200),
                    });
                } catch (e) {}
                location.href = proceedBtn.href;
            }
        }

        // ★v0.3.0 追加(私): button タグでも click 後 同画面なら一時停止
        // ★v0.3.8.56: 1500ms → 600ms 短縮
        if (proceedBtn.tagName !== 'A') {
            await sleep(600);
            if (!S.shouldHalt() && detectAddOnUpsellByText()) {
                try {
                    logAm('warn', 'addon-upsell', 'click 後も同画面 → 一時停止');
                } catch (e) {}
                toast(`⚠ click 後も「他に何か必要?」画面のまま → 一時停止`, STOP_RED, 10000);
                S.opPause();
            }
        }
    };

    // ───────────────────────────────────────────────
    // v0.1.6: SPC 注文確認画面 + Express Checkout モーダル + failsafe + 注文確定
    //
    //   実機調査(2026-05-07/08)で判明した 2 系統:
    //     系統1: smart-wagon → 「レジに進む」 → /checkout/p/.../spc 別ページ
    //     系統2: 「今すぐ買う」 → 商品ページ上に Express Checkout モーダル(URL は /dp/...)
    //   どちらも DOM に「お届け先」「ご請求額」「注文を確定する」がある。
    //
    //   ★failsafe 5項目(全部 OK でないと注文しない):
    //     1. 「Amazon Japan G.K.から発送」を含む
    //     2. 「販売元: Amazon.co.jp」を含む
    //     3. 中古表記なし(中古/Used/コレクター商品/再生品)
    //     4. 商品行が 1 件のみ(「あとで買う」混入防止)
    //     5. ご請求額 ≤ CONFIG.maxPrice(maxPrice=0 なら無制限、HIRO デフォルト)
    //
    //   ★単発 click(駿河屋 v0.1.6 教訓:二重押下絶対禁止)
    // ───────────────────────────────────────────────

    // ★v0.1.8.2: document.innerText は undefined を返す JS仕様のため、
    //   document が渡された場合は document.body.innerText を使う共通ヘルパー
    const safeInnerText = (rootEl) => {
        const root = rootEl || document;
        if (root.body && typeof root.body.innerText === 'string') return root.body.innerText;
        if (typeof root.innerText === 'string') return root.innerText;
        return '';
    };

    // ★v0.1.15.8: HIRO 報告 2026-05-09「確定ボタン押されない」 → v0.1.7 から復活
    //   v0.1.15.0 の削除が誤りだった(bot が自動押下していた状態が動作必須だった)

    // 注文確認画面 or Express Checkout モーダルから請求額を抽出
    const extractCheckoutTotal = (rootEl) => {
        const txt = safeInnerText(rootEl);
        const patterns = [
            /ご請求額[\s:：]+[¥￥]\s*([\d,]+)/,
            /合計[\s:：]+[¥￥]\s*([\d,]+)/,
            /注文合計[\s:：]+[¥￥]\s*([\d,]+)/,
        ];
        for (const p of patterns) {
            const m = txt.match(p);
            if (m) {
                const n = parseInt(m[1].replace(/,/g, ''), 10);
                if (n > 0) return n;
            }
        }
        return null;
    };

    const countCheckoutItems = (rootEl) => {
        const root = rootEl || document;
        const itemImgs = root.querySelectorAll(
            'img[data-feature-name*="item"], .item-row img, [id*="orderSummary"] img, [id*="line-item"] img'
        );
        if (itemImgs.length > 0) return itemImgs.length;
        const txt = safeInnerText(root);
        const qtyMatches = txt.match(/数量[\s:：]+\d+/g) || [];
        if (qtyMatches.length > 0) return qtyMatches.length;
        return 1;
    };

    const verifyCheckoutSafety = (rootEl) => {
        const root = rootEl || document;
        const txt = safeInnerText(root);
        const issues = [];
        const checks = { hasAmazonShipper:false, hasAmazonSeller:false, singleItem:true, withinMaxPrice:true, noNonAmazonSeller:true };

        if (/Amazon Japan G\.K\.から発送/.test(txt) ||
            /Amazonによる発送/.test(txt) ||
            /出荷元[\s:：]*Amazon(?:\.co\.jp)?(?:\s|$|\n)/.test(txt)) {
            checks.hasAmazonShipper = true;
        } else { issues.push('Amazon発送の表示なし'); }

        if (/販売元[\s:：]*Amazon\.co\.jp/.test(txt)) {
            checks.hasAmazonSeller = true;
        } else { issues.push('販売元 Amazon.co.jp の表示なし'); }

        // ★v0.3.8.47: マケプレ販売元の明示的検出 (Amazon でない販売元が出てたら絶対 NG)
        //   HIRO 強い指摘 (2026-05-18): 直販のみ動作中なのにマケプレが出てくるなら問題
        //   既存の hasAmazonSeller=false だけだと「販売元が DOM で見えなかった」とも区別不能
        //   なので「販売元: <Amazon 以外>」を明示検出して別チェック化
        let detectedSellerName = '';
        try {
            const sellerMatches = txt.match(/販売元[\s:：]*([^\n\r、,]+?)(?:[\s\n\r,、]|$)/g);
            if (sellerMatches) {
                for (const m of sellerMatches) {
                    const nameMatch = m.match(/販売元[\s:：]*(.+?)(?:[\s\n\r,、]|$)/);
                    if (!nameMatch) continue;
                    const name = nameMatch[1].trim().slice(0, 80);
                    if (!name) continue;
                    detectedSellerName = name;
                    if (!/^Amazon(?:\.co\.jp|\s*Japan)/.test(name)) {
                        // Amazon 以外の販売元名を検出
                        checks.noNonAmazonSeller = false;
                        issues.push(`⚠️ 販売元が Amazon でない: 「${name}」`);
                        break;
                    }
                }
            }
        } catch (e) {}

        const itemCount = countCheckoutItems(root);
        if (itemCount !== 1) {
            checks.singleItem = false;
            issues.push(`商品行 ${itemCount} 件(1 件のみが期待)`);
        }

        const total = extractCheckoutTotal(root);
        if (CONFIG.maxPrice > 0) {
            if (total === null) {
                checks.withinMaxPrice = false;
                issues.push('ご請求額が読み取れない(maxPrice 設定時は安全のため停止)');
            } else if (total > CONFIG.maxPrice) {
                checks.withinMaxPrice = false;
                issues.push(`ご請求額 ¥${total.toLocaleString()} > maxPrice ¥${CONFIG.maxPrice.toLocaleString()}`);
            }
        }
        const ok = checks.hasAmazonShipper && checks.hasAmazonSeller && checks.singleItem && checks.withinMaxPrice && checks.noNonAmazonSeller;
        return { ok, checks, issues, total, itemCount, detectedSellerName: detectedSellerName };
    };

    // ★v0.1.15.20: form 要素が return されたら内部 submit に置き換える共通処理
    //   HIRO 報告 2026-05-09: tag=FORM が click 対象になっていて click 効かなかった
    const resolveToSubmitButton = (el) => {
        if (!el) return null;
        if (el.tagName === 'FORM') {
            const sub = el.querySelector('input[type="submit"], button[type="submit"], button');
            if (sub && isElementVisible(sub)) return sub;
            // submit が無い form は form 自体を返す(後で requestSubmit で submit する)
            return el;
        }
        return el;
    };

    // ★v0.1.16.0: 動作確定セレクタを最優先(v0.1.15.21 で実機確定)
    //   #place-order-form input[type="submit"] が正解パス
    //   それ以外は念のため fallback として残す(汎用 button、aria-label、テキスト一致)
    const findPlaceOrderButton = (rootEl) => {
        const root = rootEl || document;
        const candidates = [
            // ★最優先: Amazon Express Checkout 正規セレクタ
            () => root.querySelector('#place-order-form input[type="submit"]'),
            () => root.querySelector('#place-order-form button[type="submit"]'),
            () => root.querySelector('form[name="place-order"] input[type="submit"]'),
            () => root.querySelector('form[name="place-order"] button[type="submit"]'),
            // form 自体(submit 子なしケース、resolveToSubmitButton で内部探索)
            () => root.querySelector('#place-order-form'),
            () => root.querySelector('form[name="place-order"]'),
            // 旧 Amazon SPC ID(年代によって変わる)
            () => root.querySelector('#submitOrderButtonId input[type="submit"]'),
            () => root.querySelector('#submitOrderButtonId button'),
            () => root.querySelector('input[name*="placeYourOrder"]'),
            () => root.querySelector('button[name*="placeYourOrder"]'),
            // aria-label / data-* fallback
            () => root.querySelector('button[aria-label*="注文を確定"]'),
            () => root.querySelector('input[aria-label*="注文を確定"]'),
            () => root.querySelector('[data-action*="place-order"]'),
            // テキスト一致 fallback
            () => {
                const els = root.querySelectorAll('button, input[type="submit"], a[role="button"]');
                for (const el of els) {
                    const t = (el.innerText || el.value || '').trim();
                    if (t === '注文を確定する' && isElementVisible(el)) return el;
                }
                return null;
            },
        ];
        for (const fn of candidates) {
            try {
                const el = fn();
                if (el && isElementVisible(el)) return resolveToSubmitButton(el);
            } catch (e) {}
        }
        return null;
    };

    // ★v0.1.16.0: 「注文を確定する」発火 - 動作確定パスのみ残す(最適化)
    //   HIRO 検証 2026-05-09 v0.1.15.21 で確定: form.requestSubmit(submitter=input) 単発が正解
    //   多重発火は submit data を壊して不正 URL に飛ぶので絶対に使わない
    const aggressiveClickBtn = async (placeBtn) => {
        const fired = [];
        const parentForm = placeBtn.closest && placeBtn.closest('form');
        const isPlaceOrderForm = parentForm &&
            (parentForm.id === 'place-order-form' ||
             (parentForm.id || '').includes('place-order') ||
             parentForm.name === 'place-order');

        // パス 1: 正規 input/button[type=submit] in #place-order-form → form.requestSubmit
        if (isPlaceOrderForm && (placeBtn.tagName === 'INPUT' || placeBtn.tagName === 'BUTTON')) {
            // ★v0.3.8.74: 案C 速度復元 - sleep(100) → sleep(300)
            //   v0.3.8.70-73 で速度を上げすぎ Amazon bot 検知が反応(404・CAPTCHA・
            //   ダウンロード popup・不測のトラフィック)。300ms は人間反応速度上限内、
            //   かつ Amazon の hidden input 動的注入を確実に待ち切る安全マージン。
            // ★v0.3.8.73: HIRO 報告「確定 click 時にダウンロードポップアップ」対応
            //   v0.3.8.70 で sleep 完全削除 → Amazon の JS が hidden input を動的注入する
            //   前に submit してしまい、不完全な form data → サーバが JSON エラー → Safari
            //   が「ファイル保存?」と判定してダウンロードポップアップを表示する事象が発生
            await sleep(300);
            // ★v0.3.8.73 案B: click 投入直前 form 詳細ダンプ (原因特定用)
            try {
                const _hiddens = parentForm.querySelectorAll('input[type="hidden"]');
                const _hiddenNames = [];
                for (const inp of _hiddens) {
                    const nm = inp.getAttribute('name') || '';
                    const val = inp.value || '';
                    if (nm) _hiddenNames.push(nm + '(' + val.length + ')');
                }
                logAm('info', 'order-confirm-debug', 'click 投入直前 form 詳細ダンプ', {
                    formId: parentForm.id || '',
                    formAction: parentForm.action || '',
                    formActionResolved: (function(){ try { return new URL(parentForm.action || '', document.baseURI).href; } catch (e) { return '(parse err)'; } })(),
                    formTarget: parentForm.target || '_self',
                    formMethod: parentForm.method || 'get',
                    inIframe: window !== window.top,
                    btnId: placeBtn.id || '',
                    btnName: placeBtn.name || '',
                    btnValue: placeBtn.value || '',
                    hiddenInputCount: _hiddens.length,
                    hiddenInputNames: _hiddenNames.slice(0, 50).join(','),
                });
            } catch (e) {}
            try {
                if (typeof parentForm.requestSubmit === 'function') {
                    parentForm.requestSubmit(placeBtn);  // submitter 指定が必須
                    fired.push('form.requestSubmit(submitter)');
                } else {
                    placeBtn.click();
                    fired.push('click()-no-requestSubmit');
                }
            } catch (e) {
                fired.push('err:' + e.message);
                try { placeBtn.click(); fired.push('click-fallback'); } catch (e2) {}
            }
            return fired;
        }

        // パス 2: FORM 要素直接 — 内部 submit を submitter として注入 (v0.3.8.78)
        //   v0.3.8.77 ログ精査: 引数なし form.requestSubmit() は POST に submitter 情報
        //   (placeYourOrder1=...) を載せず Amazon が「不審 submission」と判定 → 応答変則
        //   → Safari ダウンロード popup → Chewbacca ルーティング。
        //   修正: form 内部の submit input/button を visibility 関係なく探して submitter
        //   引数に渡す。これで POST が正規形式になり、Safari が thankyou に遷移する。
        if (placeBtn.tagName === 'FORM') {
            if (isPlaceOrderForm) {
                // submitter 候補を探索 (visibility 無視、display:none でも valid form submitter)
                let submitter = null;
                try {
                    submitter =
                        placeBtn.querySelector('input[type="submit"][name*="placeYourOrder"]') ||
                        placeBtn.querySelector('button[type="submit"][name*="placeYourOrder"]') ||
                        placeBtn.querySelector('input[name*="placeYourOrder"]') ||
                        placeBtn.querySelector('button[name*="placeYourOrder"]') ||
                        placeBtn.querySelector('input[type="submit"][name]') ||
                        placeBtn.querySelector('button[type="submit"][name]') ||
                        placeBtn.querySelector('input[type="submit"]') ||
                        placeBtn.querySelector('button[type="submit"]');
                } catch (e) {}
                // ★v0.3.8.78: submitter 注入の診断ログ (パス2 経由でも見える)
                try {
                    logAm('info', 'order-confirm-debug', '[FORM-path] submitter 候補探索結果', {
                        formId: placeBtn.id || '',
                        submitterFound: !!submitter,
                        submitterTag: submitter ? submitter.tagName : null,
                        submitterName: submitter ? submitter.name : null,
                        submitterValue: submitter ? (submitter.value || '').slice(0, 60) : null,
                        submitterType: submitter ? submitter.type : null,
                    });
                } catch (e) {}
                try {
                    if (typeof placeBtn.requestSubmit === 'function') {
                        if (submitter) {
                            placeBtn.requestSubmit(submitter);  // ★submitter 注入
                            fired.push('form.requestSubmit(submitter-injected)');
                        } else {
                            // 最終 fallback: submitter なし (旧挙動)
                            placeBtn.requestSubmit();
                            fired.push('form.requestSubmit(no-submitter-fallback)');
                        }
                    } else {
                        placeBtn.submit();
                        fired.push('form.submit()');
                    }
                } catch (e) {
                    fired.push('err:' + e.message);
                }
            } else {
                fired.push('FORM-non-safe-skip');
            }
            return fired;
        }

        // パス 3: それ以外の click 可能要素 — click() 単発のみ(多重発火は禁止)
        try { placeBtn.click(); fired.push('click()'); }
        catch (e) { fired.push('err:' + e.message); }
        return fired;
    };

    const performOrderConfirm = async (rootEl, contextLabel) => {
        if (isStopped()) return false;

        // ★v0.3.8.74: click 投入前に「数量更新」メッセージを最終チェック
        //   confirm 画面到達後にこのメッセージが出ているケース (TRANS-AM 多発タイミング)
        //   qtyStop=true (デフォルト): 完全停止 + Discord 通知
        //   qtyStop=false: 警告だけ出してそのまま click 続行 (リストック 2 段階リリース対応)
        try {
            const _bodyText = (rootEl && rootEl.body ? rootEl.body.innerText :
                              (document.body && document.body.innerText) || '');
            const _qtyHit = /リクエストされた数量は入手できなくなりました|入手可能な最大数に数量を更新しました/.test(_bodyText);
            if (_qtyHit) {
                if (getEffectiveQtyStop()) {
                    try { logAm('error', 'qty-update',
                        '「数量更新」検出 (confirm 画面) + qtyStop=ON → 完全停止', {
                        context: contextLabel,
                        url: location.href.slice(0, 200),
                    }); } catch (e) {}
                    toast('🛑 「数量更新」メッセージ検出 → 完全停止\n' +
                          '(qty_stop=ON のため、リストック初日なら OFF 推奨)',
                          STOP_RED, 15000);
                    try { S.opFullStop(); } catch (e) {}
                    return false;
                } else {
                    try { logAm('warn', 'qty-update',
                        '「数量更新」検出 (confirm 画面) + qtyStop=OFF → 警告だけで続行 (2段階リリース想定)',
                        { context: contextLabel }); } catch (e) {}
                    try { toast('⚠ 「数量更新」検出 (qty_stop=OFF) → 続行', '#f57c00', 4000); } catch (e) {}
                }
            }
        } catch (e) {}

        const verify = verifyCheckoutSafety(rootEl);
        if (CONFIG.debugMode) console.log('[GBOT-AM] verifyCheckoutSafety =>', verify);

        // ★v0.1.15.10: 商品ページで直販確認済みなら failsafe NG でも続行
        //   理由: SPC/モーダルで Amazon の DOM 変化や全角/半角差で出荷元/販売元検出失敗するケースあり
        //   商品ページで isDirect=true 確認済 = 直販オファーで進んでいる前提
        let verifiedDirectAt = 0;
        try { verifiedDirectAt = parseInt(localStorage.getItem('LB_AM_VERIFIED_DIRECT') || '0', 10); } catch (e) {}
        const verifiedRecent = verifiedDirectAt > 0 && (Date.now() - verifiedDirectAt) < 5 * 60 * 1000;

        if (!verify.ok) {
            const isMarketplaceSeller = !!(verify.checks && verify.checks.noNonAmazonSeller === false);
            const detectedSeller = (verify.detectedSellerName || '').slice(0, 60);

            // ★v0.3.8.50: マケプレ検出時の挙動を「完全停止」→「商品ページに戻ってループ継続」に変更
            //   HIRO 指示: 「直販のみで動く、止まるまでループ」
            //   マケプレモーダルが画面に固定されると HIRO が「機能していない」と認識
            //   商品ページに戻ることで HIRO に「動いた」感を与える + 在庫待ちループ継続
            if (isMarketplaceSeller) {
                try {
                    logAm('warn', 'order-confirm',
                        '⛔ マケプレ販売元検出 → click 拒否、商品ページに戻ってループ継続', {
                        context: contextLabel,
                        detectedSeller: detectedSeller,
                        issues: verify.issues,
                    });
                } catch (e) {}
                toast(
                    `⛔ マケプレ販売元検出 → click 拒否\n` +
                    `(${detectedSeller})\n` +
                    `→ 商品ページに戻って直販在庫待ちループ`,
                    STOP_RED, 8000
                );
                // 商品ページに戻る (session.productUrl)
                try {
                    const session = S.getSession();
                    if (session && session.productUrl) {
                        setTimeout(() => {
                            try {
                                if (isStopped()) return;
                                const url = new URL(session.productUrl);
                                url.searchParams.set('_pageRefresh', String(Date.now()));
                                if (CONFIG.autoForceAmazon) {
                                    url.searchParams.set('m', AMAZON_SELLER_ID);
                                }
                                location.href = url.toString();
                            } catch (e) {
                                try { location.href = session.productUrl; } catch (e2) {}
                            }
                        }, 1200);
                        return false;  // click せず終了、ループ継続
                    }
                } catch (e) {}
                // session URL が取れなければ仕方なく完全停止 (異常状態)
                clearState(); setStopped(true); return false;
            }

            // マケプレでない failsafe NG → 既存の verifiedRecent ロジック
            toast(
                `⚠️ failsafe NG: ${contextLabel}\n` +
                verify.issues.slice(0, 4).map(i => `・${i}`).join('\n') +
                (verifiedRecent ? '\n→ 商品ページで直販確認済 → 続行' : '\n→ 直販未確認 → 停止'),
                verifiedRecent ? '#f57c00' : STOP_RED,
                verifiedRecent ? 6000 : 15000
            );
            if (!verifiedRecent) {
                clearState(); setStopped(true); return false;
            }
            // verifiedRecent=true && マケプレでない → 続行
        }

        const placeBtn = findPlaceOrderButton(rootEl);
        if (!placeBtn) {
            // ★v0.1.15.10: 検出失敗時の詳細(button 候補数とテキストサンプル)
            const allBtns = (rootEl || document).querySelectorAll('button, input[type="submit"], input[type="button"]');
            const samples = [];
            for (let i = 0; i < Math.min(allBtns.length, 8); i++) {
                const b = allBtns[i];
                const t = (b.innerText || b.value || '').trim().slice(0, 25);
                if (t) samples.push(`${b.tagName}#${b.id || '?'}n=${b.name || '?'}"${t}"`);
            }
            toast(
                `❌ 「注文を確定する」検出失敗 (${contextLabel})\n` +
                `button 候補: ${allBtns.length}件\n` +
                samples.slice(0, 4).join('\n'),
                STOP_RED, 15000
            );
            clearState(); setStopped(true); return false;
        }

        const totalDisp = verify.total !== null ? `¥${verify.total.toLocaleString()}` : '?';
        toast(`✓ ${verify.ok ? 'failsafe 全 OK' : '直販確認済→続行'} / ご請求額:${totalDisp}\n▶ 全方式 click 投入`,
            BUY_GREEN, 4000);
        // ★v0.3.8.70: 「注文を確定する」 click は ★即押し★ (HIRO 指示「確定はいらない、即押したい」)
        //   旧 v0.3.8.67: await sleep(200) で bot 検知対策の最小限維持
        //   新 v0.3.8.70: ★sleep 削除★ → DOM 安定 + verify 済の確定 click は最速
        //   bot 検知対策はカートに入れる/レジに進む 段階で十分人間ぽさを演じている。
        //   最後の注文確定の瞬間だけ「即」でも、人間も競り合いで同様の挙動を取る。
        if (isStopped()) return false;
        setState(ST_ORDER_PLACED);
        // ★v0.1.15.19: 全方式一気投入 click + 最大詳細ログ
        const beforeUrl = location.href;
        const buttonDump = dumpButtonInfo(placeBtn);
        logAm('info', 'order-confirm', 'click 投入直前', { context: contextLabel, button: buttonDump, verify: verify });

        // ★v0.3.8.78 修正 C: click 投入時刻を localStorage に記録
        //   後続サイクルで qty_update を検出した時に「直近の click による重複防止メッセージ
        //   = 注文成功証拠」と判定するため。
        try { localStorage.setItem('LB_AM_LAST_ORDER_CLICK_TS', String(Date.now())); } catch (e) {}

        // ★v0.3.8.73 案C: place-order POST レスポンス監視を 10 秒間 起動
        //   HIRO 報告「確定 click でダウンロードポップアップ」の原因特定用
        //   Content-Type が HTML 以外なら place-order-non-html-response error ログ + body 先頭出力
        try { observePlaceOrderResponse(10000); } catch (e) {}

        const fired = await aggressiveClickBtn(placeBtn);
        toast(`▶ click 投入: ${fired.join(' / ')}`, BUY_GREEN, 8000);

        // 1秒後に結果観察
        // ★v0.1.16.12: urlChanged:false 時の追加情報を取得(submit 成否の手がかり)
        const beforeIframeUrls = [];
        try {
            for (const f of document.querySelectorAll('iframe')) {
                try { beforeIframeUrls.push((f.contentDocument || f.contentWindow.document).URL); }
                catch (e) { beforeIframeUrls.push('cross-origin'); }
            }
        } catch (e) {}

        // ★v0.3.8.67: 観察タイミングを 1 秒 → 3 秒に変更 (HIRO 過去ログ精査で発見)
        //   v0.3.8.66 では 1 秒で「空発火」と判定してリカバリ起動していたが、
        //   過去ログ (18:05:46-48 成功例) では click 後 ~2.2 秒で thankyou 遷移していた。
        //   1 秒判定では「成功シナリオ」も「空発火」と誤認 → 多重発火 →
        //   submit data 壊して不正 URL に飛ぶリスク (HIRO MEMORY 警告事項)。
        //   3 秒に延長することで、Amazon サーバー処理時間 (~2.2 秒) を待ってから判定。
        setTimeout(async () => {
            const afterUrl = location.href;
            const urlChanged = afterUrl !== beforeUrl;
            const stillVisible = isElementVisible(placeBtn);
            // ★v0.1.16.12: button の disabled 状態と form 詳細を追加取得
            let btnDisabled = null, btnAriaDisabled = null, formAction = '', hiddenCount = 0;
            let parentForm = null;
            try {
                btnDisabled = placeBtn.disabled;
                btnAriaDisabled = placeBtn.getAttribute('aria-disabled');
                parentForm = placeBtn.closest && placeBtn.closest('form');
                if (parentForm) {
                    formAction = (parentForm.action || '').slice(0, 150);
                    hiddenCount = parentForm.querySelectorAll('input[type="hidden"]').length;
                }
            } catch (e) {}
            // iframe URL 変化を取る
            const afterIframeUrls = [];
            try {
                for (const f of document.querySelectorAll('iframe')) {
                    try { afterIframeUrls.push((f.contentDocument || f.contentWindow.document).URL); }
                    catch (e) { afterIframeUrls.push('cross-origin'); }
                }
            } catch (e) {}
            const iframeUrlChanged = JSON.stringify(beforeIframeUrls) !== JSON.stringify(afterIframeUrls);

            logAm('info', 'order-confirm', 'click 投入後 5 秒観察', {
                fired: fired,
                urlChanged: urlChanged,
                beforeUrl: beforeUrl,
                afterUrl: afterUrl,
                buttonStillVisible: stillVisible,
                buttonDisabled: btnDisabled,
                buttonAriaDisabled: btnAriaDisabled,
                formAction: formAction,
                hiddenFieldCount: hiddenCount,
                iframeUrlChanged: iframeUrlChanged,
                beforeIframeUrls: beforeIframeUrls,
                afterIframeUrls: afterIframeUrls,
            });

            // ★v0.3.8.74: 案C 速度復元 - リカバリ単純化
            //   v0.3.8.66-73 では D-1 (dispatchEvent) → D-2 (placeBtn.click) → D-3 (戻り)
            //   の多段リカバリを実装していたが、これは「多重発火による submit data 破壊」
            //   のリスク(HIRO MEMORY 警告事項)+ bot 検知に「不自然な連続発火」と
            //   判定される可能性があった。
            //   v0.3.8.65 と同じく form.requestSubmit(submitter) 単発のみ、
            //   失敗時は即 D-3 (商品ページに戻ってループ継続) に直行する。
            //
            //   判定:
            //     A. urlChanged=true → 成功 (何もしない)
            //     B. urlChanged=false + iframeUrlChanged=true → 確定 iframe 経由で進行中 (待機)
            //     C. urlChanged=false + buttonStillVisible=false → ボタンは消えた (進行中、待機)
            //     D. それ以外 → 空発火と判定、商品ページに戻ってループ継続
            try {
                if (urlChanged) return;
                if (iframeUrlChanged) return;
                if (!stillVisible) return;

                // D: 空発火 → 商品ページに戻ってループ継続 (再発火しない)
                try { logAm('warn', 'order-confirm-recovery',
                    '⚠ click 空発火検知 → 商品ページに戻ってループ継続 (再発火せず)', {
                    formId: parentForm ? parentForm.id : '(no form)',
                    afterUrl: location.href.slice(0, 150),
                }); } catch (e) {}
                toast('⛔ 確定 click が空振り → 商品ページに戻ってループ継続', STOP_RED, 6000);
                try {
                    const session = S.getSession();
                    if (session && session.productUrl) {
                        // step を IDLE に戻して新サイクル開始
                        try { S.setStep(STEP_IDLE); } catch (e) {}
                        setTimeout(() => {
                            try {
                                if (isStopped()) return;
                                const u = new URL(session.productUrl);
                                u.searchParams.set('_pageRefresh', String(Date.now()));
                                u.searchParams.set('_sw', String(Date.now()));
                                if (CONFIG.autoForceAmazon) {
                                    u.searchParams.set('m', AMAZON_SELLER_ID);
                                }
                                u.searchParams.delete('aod');
                                location.href = u.toString();
                            } catch (e) {
                                try { location.href = session.productUrl; } catch (e2) {}
                            }
                        }, 1200);
                    } else {
                        // session URL が取れなければ仕方なく opPause (異常状態)
                        toast('⚠ session URL 取れず手動介入待ち (▶再開で続行可)', STOP_RED, 15000);
                        try { S.opPause(); } catch (e) {}
                    }
                } catch (e) {
                    try { S.opPause(); } catch (e2) {}
                }
            } catch (recErr) {
                try { logAm('error', 'order-confirm-recovery',
                    '⛔ リカバリ処理で例外', { err: String(recErr && recErr.message || recErr) }); } catch (e) {}
            }
        }, 5000);   // ★v0.3.8.78: 3000 → 5000ms (Safari download popup の表示中は JS 停止する可能性、判定猶予拡大)

        try { localStorage.removeItem('LB_AM_VERIFIED_DIRECT'); } catch (e) {}
        return true;
    };

    const handleCheckout = async (opts) => {
        if (isStopped()) return;
        // ★v0.3.8.43: skipInitialSleep オプション (HIRO 要望: 確定 click までの短縮)
        //   handleStockOutBuyNow からの呼び出しは、既にモーダル描画を 1.5 秒 polling
        //   で確認済みなので、ここで重ねて 1.5 秒待つのは無駄 → スキップ可能
        const skipInitialSleep = !!(opts && opts.skipInitialSleep);
        try { logAm('info', 'handler', 'handleCheckout (SPC) 入室' + (skipInitialSleep ? ' [初期 sleep スキップ]' : '')); } catch (e) {}
        if (!skipInitialSleep) await sleep(1500);
        let placeBtn = null;
        let waitMs = 0;
        for (let i = 0; i < 10; i++) {
            if (isStopped()) return;
            placeBtn = findPlaceOrderButton(document);
            if (placeBtn) { waitMs = i * 500; break; }
            await sleep(500);
        }
        if (!placeBtn) {
            // ★v0.1.16.8: SPC ボタン未検出は error
            try {
                logAm('error', 'checkout', 'SPC: 「注文を確定する」が現れません(10秒)→ 停止');
            } catch (e) {}
            toast('❌ SPC: 「注文を確定する」が現れません(10秒)', STOP_RED, 10000);
            clearState(); setStopped(true); return;
        }
        try {
            logAm('info', 'checkout', `SPC: 「注文を確定する」検出(待機 ${waitMs}ms)`);
        } catch (e) {}
        await performOrderConfirm(document, 'SPC 注文確認画面');
    };

    // ★v0.1.15.16: iframe も含めて全部探す(modal が同一オリジン iframe 内のケース対応)
    const findPlaceOrderButtonAnywhere = () => {
        let btn = findPlaceOrderButton(document);
        if (btn) return { btn, root: document, where: 'top' };
        // 全 iframe を再帰的に探す(同一オリジンのみアクセス可)
        const iframes = document.querySelectorAll('iframe');
        for (const f of iframes) {
            try {
                const doc = f.contentDocument || (f.contentWindow && f.contentWindow.document);
                if (!doc) continue;
                btn = findPlaceOrderButton(doc);
                if (btn) return { btn, root: doc, where: 'iframe[' + (f.id || f.name || f.src.slice(-30)) + ']' };
            } catch (e) {}
        }
        return null;
    };

    let expressCheckoutHandled = false;
    let _modalDiagShown = false;
    const watchExpressCheckoutModal = () => {
        if (expressCheckoutHandled) return;
        if (isStopped()) return;
        // ★v0.1.15.16: iframe 内も含めて検索
        const found = findPlaceOrderButtonAnywhere();
        if (found) {
            expressCheckoutHandled = true;
            // ★v0.1.16.8: モーダル button 検出ログ(top/iframe どちらで見つかったか記録)
            try {
                logAm('info', 'express-modal', `モーダル button 検出 at ${found.where}`, {
                    where: found.where, btnTag: found.btn && found.btn.tagName,
                    btnId: found.btn && found.btn.id,
                });
            } catch (e) {}
            if (CONFIG.debugMode) console.log('[GBOT-AM] Express Checkout modal: button detected at', found.where);
            // root = document or iframe.contentDocument
            performOrderConfirm(found.root, 'Express Checkout モーダル (' + found.where + ')');
            return;
        }
        // ★v0.1.15.17/v0.1.16.9/v0.2.1/v0.2.2: 診断 warn の誤検出抑制を更に強化
        //   v0.2.2 変更点:
        //     - pageAge 閾値 3000 → 5000ms に延長(stock-out 画面遷移を待つ余裕)
        //     - stock-out 検出後は expressCheckoutHandled=true で完全停止
        //     - screen 検査を二段階(発火前 + 発火直前)で実施
        if (_modalDiagShown) return;
        let stateNow = '';
        try { stateNow = getState() || ''; } catch (e) {}
        if (stateNow !== ST_PURCHASING) return;
        try {
            const scrNow = detectScreen();
            if (scrNow !== 'PRODUCT' && scrNow !== 'PRODUCT_AOD' && scrNow !== 'CHECKOUT') {
                return;
            }
        } catch (e) {}
        let ifrAcc = 0;
        const iframes = document.querySelectorAll('iframe');
        for (const f of iframes) {
            try {
                const doc = f.contentDocument || (f.contentWindow && f.contentWindow.document);
                if (doc) ifrAcc++;
            } catch (e) {}
        }
        // ★v0.2.2: ページ初動 < 5秒(旧 3 秒)はまだ stock-out 画面遷移待ちの可能性 → スキップ
        //   click → stock-out までは通常 3-4 秒、5 秒待てば stock-out が確定
        const pageAge = Date.now() - (window.__gbot_am_page_start__ || Date.now());
        if (pageAge < 5000) return;
        // ★v0.2.2: 発火直前にもう一度 screen 確認(タイミング上のすり抜け防止)
        try {
            const scrFinal = detectScreen();
            if (scrFinal !== 'PRODUCT' && scrFinal !== 'PRODUCT_AOD' && scrFinal !== 'CHECKOUT') {
                return;
            }
        } catch (e) {}
        _modalDiagShown = true;
        // 画面上 + iframe 内 の visible な button-like 要素を 5 件サンプリング
        const collectSamples = (root, label) => {
            const out = [];
            try {
                const els = root.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a[role="button"]');
                for (const e of els) {
                    if (!isElementVisible(e)) continue;
                    const t = (e.innerText || e.value || e.getAttribute('aria-label') || '').trim().slice(0, 25);
                    if (!t) continue;
                    out.push(`${label}${e.tagName.toLowerCase()}#${e.id || '?'}"${t}"`);
                    if (out.length >= 4) break;
                }
            } catch (e) {}
            return out;
        };
        let samples = collectSamples(document, '');
        for (const f of iframes) {
            try {
                const doc = f.contentDocument || (f.contentWindow && f.contentWindow.document);
                if (doc) samples = samples.concat(collectSamples(doc, '[ifr]'));
            } catch (e) {}
            if (samples.length >= 8) break;
        }
        // ★v0.1.16.8: モーダル検出失敗診断は warn (Discord push) — 原因特定の手がかり
        // ★v0.3.8.35: 各 iframe の src / origin / sandbox / name を全部出力
        //   cross-origin iframe で UserScript が動いていない原因の切り分け用
        const iframeDetails = [];
        try {
            for (let i = 0; i < iframes.length && i < 8; i++) {
                const f = iframes[i];
                let origin = '?';
                try { const u = new URL(f.src, location.href); origin = u.origin; } catch (e) {}
                let sameOrigin = false;
                try { sameOrigin = !!(f.contentDocument || (f.contentWindow && f.contentWindow.document)); } catch (e) { sameOrigin = false; }
                iframeDetails.push({
                    idx: i,
                    id: f.id || '',
                    name: f.name || '',
                    title: f.title || '',
                    src: (f.src || '').slice(0, 300),
                    srcOrigin: origin,
                    sandbox: f.getAttribute('sandbox') || '',
                    visible: !!(f.offsetWidth && f.offsetHeight),
                    sameOrigin: sameOrigin,
                });
            }
        } catch (e) {}
        try {
            logAm('warn', 'express-modal', '「注文を確定」検出失敗 (3秒経過)', {
                iframeCount: iframes.length,
                sameOriginIframeCount: ifrAcc,
                samples: samples.slice(0, 8),
                pageAge: pageAge,
                iframeDetails: iframeDetails,
                pageOrigin: location.origin,
            });
        } catch (e) {}
        toast(
            `🔍 「注文を確定」検出失敗\n` +
            `iframe ${iframes.length}件(同一オリジン ${ifrAcc}件)\n` +
            samples.slice(0, 8).join('\n'),
            '#7b1fa2', 60000
        );
    };

    let expressCheckoutObserver = null;
    // ★v0.3.8.63: 死コード _modalPollerInterval を削除 (宣言のみで setInterval/clearInterval 共に未使用)
    const startExpressCheckoutWatch = () => {
        if (expressCheckoutObserver) return;
        try {
            expressCheckoutObserver = new MutationObserver(() => {
                if (expressCheckoutHandled || isStopped()) return;
                watchExpressCheckoutModal();
            });
            // ★v0.1.16.5: body 観察に変更 + 90 秒で自動停止(CPU 負荷削減)
            const tryObserve = () => {
                const target = document.body || document.documentElement;
                if (target) {
                    try { expressCheckoutObserver.observe(target, { childList: true, subtree: true }); } catch(e){}
                    // 90 秒後に自動停止(モーダルは早期に開く想定)
                    setTimeout(() => {
                        try {
                            if (expressCheckoutObserver) expressCheckoutObserver.disconnect();
                        } catch(e){}
                    }, 90000);
                } else {
                    setTimeout(tryObserve, 100);
                }
            };
            tryObserve();
        } catch (e) {}
        // ★v0.1.16.5: 1 秒 polling 削除 — CPU 負荷削減(HIRO「もっさり」報告)
        //   MutationObserver で十分(モーダル DOM 追加を即座に検知)
        //   setTimeout で初期取りこぼし対策のみ実施
        const slots = [300, 1500, 5000];
        slots.forEach(ms => setTimeout(() => {
            if (!expressCheckoutHandled && !isStopped()) watchExpressCheckoutModal();
        }, ms));
    };

    // ★v0.1.15.12: iframe 内 UserScript 経路を復活(v0.1.9.8 実装)
    //   Express Checkout モーダルがクロスオリジン iframe で表示される場合、
    //   親フレームから button にアクセス不能。iframe 内 UserScript が直接 submit する。
    // ★v0.1.16.12: aggressive submit ロジックに統一 + 入室即 post + thankyou 検知
    const handleInIframe = async () => {
        const FLAG = '__gbot_am_iframe_handled__';
        if (window[FLAG]) return;
        window[FLAG] = true;
        const post = (data) => {
            try { window.parent.postMessage(Object.assign({ __gbot_am: 1 }, data), '*'); } catch (e) {}
        };

        // ★v0.1.16.12: 入室即 post(親が「iframe 内 UserScript 動いてる」を即確認可能に)
        post({
            kind: 'iframe-loaded',
            url: location.href,
            pathname: location.pathname,
            ts: Date.now(),
            ua: navigator.userAgent.slice(0, 100),
        });

        // ★v0.1.16.12: thankyou 画面到達検知(submit 成功証拠)
        //   iframe 内で /gp/buy/thankyou/ や /buy/thankyou/ や order-completion に
        //   遷移したら親に通知 → 親は order-complete 扱い
        const checkThankyou = () => {
            const p = location.pathname || '';
            if (p.includes('/buy/thankyou/') || p.includes('/order-completion/') ||
                p.includes('/checkout/thankyou')) {
                post({ kind: 'iframe-thankyou', url: location.href });
                return true;
            }
            return false;
        };
        if (checkThankyou()) return;
        // iframe 内 navigation 監視(SPC は SPA 的に遷移するケースあり)
        try {
            const obsTarget = document.body || document.documentElement;
            if (obsTarget) {
                const navObs = new MutationObserver(() => {
                    if (checkThankyou()) navObs.disconnect();
                });
                navObs.observe(obsTarget, { childList: true, subtree: true });
                setTimeout(() => { try { navObs.disconnect(); } catch(e){} }, 60000);
            }
        } catch (e) {}

        let placeBtn = null;
        const start = Date.now();
        while (Date.now() - start < 30000) {
            placeBtn = findPlaceOrderButton(document);
            if (placeBtn) break;
            await sleep(500);
        }
        if (!placeBtn) { post({ kind: 'iframe-place-not-found' }); return; }

        // iframe 内では failsafe 簡易チェック
        const verify = verifyCheckoutSafety(document);
        post({
            kind: 'iframe-verify',
            ok: verify.ok,
            total: verify.total,
            issues: verify.issues,
            btnTag: placeBtn.tagName,
            btnId: placeBtn.id || null,
            btnDisabled: placeBtn.disabled,
        });

        // ★v0.1.16.12: aggressive submit ロジック(親と同一の動作確定パス)
        //   旧: placeBtn.click() のみ → 親フレーム側の post から動かないなら iframe 内も click だけだと弱い
        //   新: form#place-order-form.requestSubmit(submitter=input) を最優先(HIRO 検証済 v0.1.15.21)
        const fired = [];
        let firedOk = false;
        let firedErr = '';

        // ★v0.3.8.73 案C: iframe 内でも place-order レスポンス監視を起動
        //   iframe 内 fetch context は top と独立、別途 hook 必要
        try { observePlaceOrderResponse(10000); } catch (e) {}

        try {
            const parentForm = placeBtn.closest && placeBtn.closest('form');
            const isPlaceOrderForm = parentForm &&
                (parentForm.id === 'place-order-form' ||
                 (parentForm.id || '').includes('place-order') ||
                 parentForm.name === 'place-order');

            if (isPlaceOrderForm && (placeBtn.tagName === 'INPUT' || placeBtn.tagName === 'BUTTON')) {
                // ★最優先パス: form.requestSubmit(submitter)
                // ★v0.3.8.74: 案C 速度復元 sleep(100) → sleep(300) (bot 検知回避マージン拡大)
                //   handleStockOutBuyNow → handleCheckout → このパス経由の場合も同じ
                await sleep(300);
                // ★v0.3.8.73 案B: form 詳細ダンプ
                try {
                    const _hiddens = parentForm.querySelectorAll('input[type="hidden"]');
                    const _hiddenNames = [];
                    for (const inp of _hiddens) {
                        const nm = inp.getAttribute('name') || '';
                        const val = inp.value || '';
                        if (nm) _hiddenNames.push(nm + '(' + val.length + ')');
                    }
                    logAm('info', 'order-confirm-debug', '[iframe] click 投入直前 form 詳細ダンプ', {
                        formId: parentForm.id || '',
                        formAction: parentForm.action || '',
                        formActionResolved: (function(){ try { return new URL(parentForm.action || '', document.baseURI).href; } catch (e) { return '(parse err)'; } })(),
                        formTarget: parentForm.target || '_self',
                        formMethod: parentForm.method || 'get',
                        inIframe: window !== window.top,
                        btnId: placeBtn.id || '',
                        btnName: placeBtn.name || '',
                        btnValue: placeBtn.value || '',
                        hiddenInputCount: _hiddens.length,
                        hiddenInputNames: _hiddenNames.slice(0, 50).join(','),
                    });
                } catch (e) {}
                try {
                    if (typeof parentForm.requestSubmit === 'function') {
                        parentForm.requestSubmit(placeBtn);
                        fired.push('iframe-form.requestSubmit(submitter)');
                        firedOk = true;
                    } else {
                        placeBtn.click();
                        fired.push('iframe-click()-no-requestSubmit');
                        firedOk = true;
                    }
                } catch (e) {
                    firedErr = e.message;
                    // fallback: click
                    try { placeBtn.click(); fired.push('iframe-click()-fallback'); firedOk = true; }
                    catch (e2) { firedErr = e.message + ' / ' + e2.message; }
                }
            } else if (placeBtn.tagName === 'FORM' && isPlaceOrderForm) {
                // ★v0.3.8.78: iframe 内でも submitter 注入 (top と同じ修正)
                let submitter = null;
                try {
                    submitter =
                        placeBtn.querySelector('input[type="submit"][name*="placeYourOrder"]') ||
                        placeBtn.querySelector('button[type="submit"][name*="placeYourOrder"]') ||
                        placeBtn.querySelector('input[name*="placeYourOrder"]') ||
                        placeBtn.querySelector('button[name*="placeYourOrder"]') ||
                        placeBtn.querySelector('input[type="submit"][name]') ||
                        placeBtn.querySelector('button[type="submit"][name]') ||
                        placeBtn.querySelector('input[type="submit"]') ||
                        placeBtn.querySelector('button[type="submit"]');
                } catch (e) {}
                try {
                    logAm('info', 'order-confirm-debug', '[iframe-FORM-path] submitter 候補探索結果', {
                        formId: placeBtn.id || '',
                        submitterFound: !!submitter,
                        submitterTag: submitter ? submitter.tagName : null,
                        submitterName: submitter ? submitter.name : null,
                        submitterValue: submitter ? (submitter.value || '').slice(0, 60) : null,
                    });
                } catch (e) {}
                if (typeof placeBtn.requestSubmit === 'function') {
                    if (submitter) {
                        placeBtn.requestSubmit(submitter);
                        fired.push('iframe-form.requestSubmit(submitter-injected)');
                    } else {
                        placeBtn.requestSubmit();
                        fired.push('iframe-form.requestSubmit(no-submitter-fallback)');
                    }
                } else {
                    placeBtn.submit();
                    fired.push('iframe-form.submit()');
                }
                firedOk = true;
            } else {
                // 想定外パス
                placeBtn.click();
                fired.push('iframe-click()-unsafe-form');
                firedOk = true;
            }
        } catch (e) {
            firedErr = e.message;
        }

        post({
            kind: 'iframe-fired',
            ok: firedOk,
            method: fired.join(','),
            fired: fired,
            err: firedErr,
        });

        // ★v0.1.16.12: submit 後 1.5 秒で結果を post(URL 変化や button 状態を観察)
        setTimeout(() => {
            try {
                const stillVisible = placeBtn && isElementVisible(placeBtn);
                const newUrl = location.href;
                post({
                    kind: 'iframe-after',
                    urlChanged: newUrl !== (start && location.href),  // ※ closure simple compare
                    nowUrl: newUrl,
                    btnDisabled: placeBtn ? placeBtn.disabled : null,
                    btnAriaDisabled: placeBtn ? placeBtn.getAttribute('aria-disabled') : null,
                    btnStillVisible: stillVisible,
                });
                checkThankyou();
            } catch (e) {}
        }, 1500);
    };

    const setupIframeMessageListener = () => {
        try {
            window.addEventListener('message', (ev) => {
                const d = ev.data;
                if (!d || typeof d !== 'object' || !d.__gbot_am) return;
                // ★v0.1.16.12: 全種類の post を logAm にも記録 + 詳細表示
                if (d.kind === 'iframe-loaded') {
                    toast(`📥 iframe 注入: ${(d.url || '').slice(-40)}`, '#1976d2', 4000);
                    try { logAm('info', 'iframe-postmsg', 'iframe-loaded', { url: d.url, pathname: d.pathname }); } catch (e) {}
                } else if (d.kind === 'iframe-verify') {
                    toast(d.ok ? `✅ iframe failsafe OK` : `⚠ iframe failsafe NG (続行)`, d.ok ? BUY_GREEN : '#f57c00', 5000);
                    try { logAm('info', 'iframe-postmsg', `iframe-verify ok=${d.ok}`, d); } catch (e) {}
                } else if (d.kind === 'iframe-fired') {
                    toast(d.ok ? `✅ iframe 内 submit 成功 (${d.method})` : `❌ iframe submit 失敗: ${d.err}`,
                        d.ok ? BUY_GREEN : STOP_RED, 12000);
                    try { logAm(d.ok ? 'info' : 'error', 'iframe-postmsg', `iframe-fired ok=${d.ok}`, d); } catch (e) {}
                } else if (d.kind === 'iframe-after') {
                    // ★v0.1.16.12: submit 後 1.5 秒の iframe 状況
                    try {
                        logAm('info', 'iframe-postmsg', 'iframe-after (1.5秒後観察)', d);
                    } catch (e) {}
                } else if (d.kind === 'iframe-thankyou') {
                    // ★v0.1.16.12/v0.2.0: iframe 内で完了画面に遷移 = 確定成功
                    toast(`🎉 iframe 内で注文完了画面に到達! 成功!`, BUY_GREEN, 15000);
                    try {
                        logAm('warn', 'order-complete', 'iframe 内で /thankyou/ 到達 → 完全停止', { url: d.url });
                    } catch (e) {}
                    // ★v0.2.0: 完全停止(SESSION クリア、二重発注防止)
                    try { S.setStep(STEP_ORDER_PLACED); S.opFullStop(); } catch (e) {}
                } else if (d.kind === 'iframe-place-not-found') {
                    toast(`🔍 iframe 内に確定ボタンなし(30秒)`, '#7b1fa2', 8000);
                    try { logAm('warn', 'iframe-postmsg', 'iframe-place-not-found'); } catch (e) {}
                }
            }, false);
        } catch (e) {}
    };

    // ★v0.2.0: 注文完了 → 完全停止(SESSION クリア)
    //   理由: 二重発注防止。次の購入は HIRO さんが新規🛒で開始
    const handleOrderComplete = async () => {
        try {
            logAm('warn', 'order-complete', '✅ 注文完了画面到達 → 完全停止', {
                url: location.href.slice(0, 200),
            });
        } catch (e) {}
        S.setStep(STEP_ORDER_PLACED);
        toast('✅ 注文完了!\n(自動停止しました、次回は🛒で新規開始)', BUY_GREEN, 10000);
        S.opFullStop();
    };

    // ★v0.2.0: サインイン誘導 → 一時停止(再開可能)
    //   ログイン後に▶再開でそのまま続行できる
    const handleSigninPage = async () => {
        try {
            logAm('warn', 'signin', 'サインイン画面に遷移 → 一時停止');
        } catch (e) {}
        toast('⚠️ サインイン要求 → 一時停止\nログイン後に▶再開で続行', '#f57c00', 10000);
        S.opPause();
    };

    // ★v0.1.16.13/v0.2.0: 「カート追加失敗」検出時のハンドラ
    //   Amazon 側がカート機能を一時的に止めてる状態(レート制限・セッション破損)。
    //   bot 自動回復は逆効果なので完全停止 → HIRO さんに手動対処を促す。
    const handleCartAddFail = async () => {
        if (S.shouldHalt()) return;
        const session = S.getSession();
        try {
            logAm('error', 'cart-add-fail', '「カート追加失敗」検出 → 完全停止', {
                url: location.href.slice(0, 200),
                screen: 'CART_ADD_FAIL',
                reloadCount: session ? session.reloadCount : 0,
            });
        } catch (e) {}
        toast(
            '⚠️ Amazon「カート追加失敗」検出 → 完全停止\n\n' +
            '【復旧手順】\n' +
            '① 上の「カートを見る」をタップ\n' +
            '② カート内全商品を削除\n' +
            '③ 5〜10 分待つ(レート制限解除)\n' +
            '④ 商品ページに戻って🛒押下',
            STOP_RED, 30000
        );
        S.opFullStop();
    };

    // 在庫切れ Express Checkout 画面(/checkout/entry/buynow)からの復帰
    const handleStockOutBuyNow = async () => {
        if (S.shouldHalt()) return;

        // ★v0.3.8.76 修正 A: 数量更新メッセージを Promise.race の前に最優先で同期チェック
        //   v0.3.8.74 で Promise.race の qtyUpdateText を追加したが、race の登録順で
        //   stockOutText (4番目) が qtyUpdateText (5番目) より先に勝ってしまい qty 分岐に
        //   入らなかった (waitForText の initial check() で両方同時 synchronous resolve)。
        //   解決策: race に入る前に同期 textContent 検査で qty を最優先判定。
        //   検出時は qty_stop に従って即完全停止 or 警告継続 (race を回避)。
        try {
            const _bodyText = (document.body && document.body.innerText) || '';
            const _qtyHit = /リクエストされた数量は入手できなくなりました|入手可能な最大数に数量を更新しました/.test(_bodyText);
            if (_qtyHit) {
                try { expressCheckoutHandled = true; } catch (e) {}
                // ★v0.3.8.78 修正 C: 直近 60 秒以内に order-confirm click を撃っていれば
                //   この qty_update は「重複防止メッセージ = 注文成功証拠」と昇格判定
                let recentClickAgo = -1;
                try {
                    const lastTs = parseInt(localStorage.getItem('LB_AM_LAST_ORDER_CLICK_TS') || '0', 10) || 0;
                    if (lastTs > 0) recentClickAgo = Date.now() - lastTs;
                } catch (e) {}
                const wasRecentClick = recentClickAgo >= 0 && recentClickAgo < 60000;
                // ★v0.3.8.99: 注文成功検出を qty_stop の外(最優先)へ
                //   直近 click + 数量更新 = 注文が通った事実 → qty_stop=ON/OFF どちらでも停止。
                //   旧: この判定が if(getEffectiveQtyStop()) の中だったため OFF だと素通りし、
                //       成功後もループ継続(「確定前で止まる」誤解 + 二重購入リスク)になっていた。
                if (wasRecentClick) {
                    try { logAm('warn', 'order-complete',
                        '✅ 注文成功確認 (直近 click 後の数量更新検出 = 重複防止) → 完全停止', {
                        url: location.href.slice(0, 200),
                        clickAgoMs: recentClickAgo,
                        qtyStop: getEffectiveQtyStop(),
                    }); } catch (e) {}
                    try {
                        toast('✅ 注文成功!\n(直近 click 後の重複防止メッセージで成功確認)\n' +
                              '自動停止しました、次は🛒で新規開始',
                              BUY_GREEN, 15000);
                    } catch (e) {}
                    try { S.setStep(STEP_ORDER_PLACED); } catch (e) {}
                    try { localStorage.removeItem('LB_AM_LAST_ORDER_CLICK_TS'); } catch (e) {}
                    try { S.opFullStop(); } catch (e) {}
                    return;
                }
                if (getEffectiveQtyStop()) {
                    try { logAm('error', 'qty-update',
                        '「数量更新」検出 (handleStockOutBuyNow 同期チェック) + qtyStop=ON → 完全停止', {
                        url: location.href.slice(0, 200),
                        override: getQtyStopOverride(),
                        configDefault: !!CONFIG.qtyStop,
                        clickAgoMs: recentClickAgo,
                    }); } catch (e) {}
                    try {
                        toast('🛑 「数量更新」メッセージ検出 → 完全停止\n' +
                              '(qty_stop=ON のため、リストック初日なら OFF に切替推奨)',
                              STOP_RED, 15000);
                    } catch (e) {}
                    try { S.opFullStop(); } catch (e) {}
                    return;
                }
                // qty_stop=OFF: 警告だけ、商品ページに戻ってループ継続
                try { logAm('warn', 'qty-update',
                    '「数量更新」検出 (handleStockOutBuyNow 同期チェック) + qtyStop=OFF → ループ継続', {
                    url: location.href.slice(0, 200),
                }); } catch (er) {}
                try {
                    toast('⚠ 「数量更新」検出 (qty_stop=OFF) → ループ継続\n(2 段階リリース想定)',
                          '#f57c00', 6000);
                } catch (e) {}
                // ループ継続: 商品ページに戻る処理は下のフォールスルー
                const session = S.getSession();
                if (session && session.productUrl) {
                    try { S.setStep(STEP_PURCHASING); } catch (e) {}
                    await sleep(500);
                    if (S.shouldHalt()) return;
                    try {
                        const url = new URL(session.productUrl);
                        url.searchParams.set('_pageRefresh', String(Date.now()));
                        url.searchParams.set('_sw', String(Date.now()));
                        if (CONFIG.autoForceAmazon) url.searchParams.set('m', AMAZON_SELLER_ID);
                        url.searchParams.delete('aod');
                        location.href = url.toString();
                    } catch (e) {
                        try { location.href = session.productUrl; } catch (e2) {}
                    }
                }
                return;
            }
        } catch (e) {}

        // ★v0.3.8.40: HIRO 指摘「見つかってからリロードが早すぎる」対応
        //   /checkout/entry/buynow URL は「在庫あり (Express Checkout モーダル)」と
        //   「在庫切れ画面」の両方で着地する。即座に在庫切れ判定すると、モーダル
        //   描画前に商品ページに戻してしまう。
        //   対策: 5 秒間 polling して Express Checkout モーダル DOM / 「注文を確定」
        //   テキストを探す。見つかれば在庫切れ判定をキャンセル、既存 modal watcher に委ねる
        // ★v0.3.8.72: 500ms × 10 polling → 4 並列 MutationObserver + Promise.race
        //   HIRO ログ精査 (232406): 3 回目 polling (1500ms) で検出 = 1000ms 無駄
        //   新: 出現の瞬間 (~500ms 前後) に即発火、約 1 秒短縮
        // ★v0.3.8.74: 「数量更新」メッセージ + 「犬画面 (404)」検出を Promise.race に追加
        let isCheckoutModal = false;
        let earlyStockOut = false;
        let qtyUpdateDetected = false;
        let dog404Detected = false;
        const stockOutStartTs = Date.now();
        try {
            const earlyExit = () => S.shouldHalt();
            const racable = (label, p) => new Promise((resolve) => {
                Promise.resolve(p).then((v) => {
                    if (v !== null && v !== false && v !== undefined) {
                        resolve({ label: label, value: v });
                    }
                }).catch(() => {});
            });

            const result = await Promise.race([
                // ① Express Checkout モーダル iframe 出現 → 確定処理へ
                racable('modalFrame', waitForVisible(
                    'iframe[id*="turbo-checkout"], iframe[name*="turbo"], iframe.turbo-checkout-bottom-sheet-frame, ' +
                    'iframe[id*="bottom-sheet"], iframe[src*="checkout"]',
                    5000, { earlyExitFn: earlyExit })),
                // ② place-order-form 出現 → 確定処理へ
                racable('placeOrderForm', waitForVisible(
                    '#place-order-form, form[id*="place-order"], form[name*="place-order"]',
                    5000, { earlyExitFn: earlyExit })),
                // ③ 「注文を確定」テキスト出現 → 確定処理へ
                racable('confirmText', waitForText(/注文を確定|注文確定する/, 5000, { earlyExitFn: earlyExit })),
                // ④ 「在庫切れ」テキスト出現 → 商品ページ戻し
                //   ★v0.3.8.76: `商品を更新する` を除外 (Amazon の項目編集ボタン UI、
                //   Chewbacca SPC レビュー画面の通常 UI にも出るため誤検出する)
                racable('stockOutText', waitForText(
                    /在庫切れ|お取り扱いできません|取り扱いできません/,
                    5000, { earlyExitFn: earlyExit })),
                // ⑤ ★v0.3.8.74★ 「数量更新」テキスト → qty_stop パラメータで分岐
                //   「リクエストされた数量は入手できなくなりました」
                //   「入手可能な最大数に数量を更新しました」
                racable('qtyUpdateText', waitForText(
                    /リクエストされた数量は入手できなくなりました|入手可能な最大数に数量を更新しました/,
                    5000, { earlyExitFn: earlyExit })),
                // ⑥ ★v0.3.8.74★ 犬画面 (404) → ループ継続 (商品ページに戻る)
                //   kailey-kitty._TTD_.gif 画像 / 「ページが見つかりません」+「何かお探しですか」
                racable('dog404', (async () => {
                    // image check (immediate)
                    const hasKitty = () => !!document.querySelector('img[src*="kailey-kitty"]');
                    if (hasKitty()) return 'kailey-kitty-img';
                    // text-based via MutationObserver
                    const t = await waitForText(/ページが見つかりません|お探しのページが見つかりませんでした/, 5000,
                        { earlyExitFn: earlyExit });
                    if (!t) return null;
                    // 「何かお探しですか」も併存している場合のみ 404 確定 (偽陽性防止)
                    try {
                        const body = (document.body && document.body.innerText) || '';
                        if (/何かお探しですか|入力されたウェブアドレスは当社サイト/.test(body) || hasKitty()) {
                            return 'dog-404-text';
                        }
                    } catch (e) {}
                    return null;
                })()),
                // ⑦ タイムアウト 5 秒
                new Promise((resolve) => setTimeout(() => resolve({ label: 'timeout', value: null }), 5000)),
            ]);

            const detectedAtMs = Date.now() - stockOutStartTs;
            const hitLabel = result ? result.label : 'unknown';

            if (S.shouldHalt()) return;
            if (hitLabel === 'modalFrame' || hitLabel === 'placeOrderForm' || hitLabel === 'confirmText') {
                isCheckoutModal = true;
                try { logAm('info', 'stock-out',
                    `Express Checkout モーダル検出 (${detectedAtMs}ms 後 / hit=${hitLabel}) → 在庫切れ判定キャンセル、modal watcher に委ねる`, {
                    hitLabel: hitLabel,
                    detectedAtMs: detectedAtMs,
                    hasModalFrame: !!document.querySelector('iframe[id*="turbo-checkout"], iframe[name*="turbo"]'),
                    hasPlaceOrderForm: !!document.querySelector('#place-order-form'),
                }); } catch (e) {}
            } else if (hitLabel === 'stockOutText') {
                earlyStockOut = true;
                try { logAm('info', 'stock-out',
                    `在庫切れテキスト確定 (${detectedAtMs}ms 後) - URL は保持`, { detectedAtMs: detectedAtMs }); } catch (e) {}
            } else if (hitLabel === 'qtyUpdateText') {
                qtyUpdateDetected = true;
                try { logAm('warn', 'qty-update',
                    `「数量更新」メッセージ検出 (${detectedAtMs}ms 後) qtyStop=${getEffectiveQtyStop()}`, {
                    detectedAtMs: detectedAtMs, qtyStop: getEffectiveQtyStop(),
                    override: getQtyStopOverride(), configDefault: !!CONFIG.qtyStop,
                }); } catch (e) {}
            } else if (hitLabel === 'dog404') {
                dog404Detected = true;
                try { logAm('info', 'stock-out-dog-page',
                    `犬画面 (404) 検出 (${detectedAtMs}ms 後 / hit=${result.value}) → リストック前扱い、商品ページに戻ってループ継続`, {
                    detectedAtMs: detectedAtMs,
                    matchType: result.value,
                }); } catch (e) {}
            } else {
                // タイムアウト → どちらも見つからず (Amazon 重い時など)
                try { logAm('info', 'stock-out',
                    `[timeout 5000ms] モーダルも在庫切れテキストも見えず → 在庫切れ扱い`, {
                    detectedAtMs: detectedAtMs,
                }); } catch (e) {}
            }
        } catch (pollErr) {
            try { logAm('warn', 'stock-out',
                `[observer error] ${String(pollErr && pollErr.message || pollErr)}`, {}); } catch (e) {}
        }

        // ★v0.3.8.74/75: 数量更新メッセージ検出 → 実効 qtyStop (CONFIG + override) で分岐
        if (qtyUpdateDetected) {
            try { expressCheckoutHandled = true; } catch (e) {}
            if (getEffectiveQtyStop()) {
                // qty_stop=ON: 完全停止 + Discord 通知
                try {
                    toast('🛑 「数量更新」メッセージ検出 → 完全停止\n' +
                          '(qty_stop=ON のため、リストック初日なら OFF に切替推奨)',
                          STOP_RED, 15000);
                } catch (e) {}
                try { logAm('error', 'qty-update',
                    '「数量更新」検出 + qtyStop=ON → 完全停止', {
                    url: location.href.slice(0, 200),
                }); } catch (er) {}
                try { S.opFullStop(); } catch (er) {}
                return;
            }
            // qty_stop=OFF: 警告だけ、商品ページに戻ってループ継続
            // (リストック初日 2 段階リリース対応)
            try {
                toast('⚠ 「数量更新」検出 (qty_stop=OFF) → ループ継続\n' +
                      '(2 段階リリース想定)', '#f57c00', 6000);
            } catch (e) {}
            try { logAm('warn', 'qty-update',
                '「数量更新」検出 + qtyStop=OFF → 商品ページに戻ってループ継続 (2段階リリース想定)',
                { url: location.href.slice(0, 200) }); } catch (er) {}
            // fall-through: 下の「商品ページに戻る」処理に流す
        }

        // ★v0.3.8.74: 犬画面 (404) 検出 → 商品ページに戻ってループ継続
        //   リストック前の暫定 404 として扱う (bot 検知ではないので opFullStop しない)
        if (dog404Detected) {
            try { expressCheckoutHandled = true; } catch (e) {}
            try {
                toast('🐕 犬画面 (404) 検出 → リストック前扱い、商品ページに戻ってループ継続',
                      '#7b1fa2', 6000);
            } catch (e) {}
            // fall-through: 下の「商品ページに戻る」処理に流す
        }

        // ★v0.3.8.42: Express Checkout モーダル検出 → handleCheckout を呼んで確定 click まで走らせる
        // ★v0.3.8.43: skipInitialSleep=true で 1.5秒 sleep をスキップ (HIRO 要望: 確定までの短縮)
        if (isCheckoutModal) {
            try { expressCheckoutHandled = true; } catch (e) {}
            try { toast('✅ Express Checkout モーダル検出 → 確定 click 開始', BUY_GREEN, 4000); } catch (e) {}
            try {
                logAm('info', 'stock-out', '→ handleCheckout 呼び出し (確定 click 実行、初期 sleep スキップ)', {});
            } catch (e) {}
            try { await handleCheckout({ skipInitialSleep: true }); } catch (e) {
                try { logAm('error', 'stock-out', 'handleCheckout 例外', { err: e && e.message }); } catch (er) {}
            }
            return;
        }

        // ★v0.2.2: stock-out 検出 = express modal は出ない確定 → watcher 無効化
        try { expressCheckoutHandled = true; } catch (e) {}
        if (S.shouldHalt()) return;

        // ★v0.3.8.82: ループフロー最適化 — TRANS-AM URL 直接再 navigate
        //   旧: oos → sleep 500ms → 商品ページに戻る → 連投ガードで無駄リロード × 2-3
        //        → 計 4 navigate / 3.4秒、無駄が多い + ページちらつき
        //   新: oos → ランダム 300-700ms (人間っぽい "読み" 時間) → TRANS-AM URL 直接 navigate
        //        → 計 2 navigate / ~2秒、人間最速ペース、検知シグナル除去
        //   ただし 10% の確率で「偽装サイクル」(商品ページ経由) を挿入して機械パターン排除
        //
        //   検知シグナル除去のポイント:
        //     ・oos 検出から navigate まで 14ms (機械的) → 300-700ms (人間的)
        //     ・navigate 回数半減 → アクセス頻度減
        //     ・たまに商品ページ経由 → 人間が「戻る」押した風

        const session = S.getSession();
        const productUrl = session && session.productUrl;
        const asin = (function(){
            try {
                if (!productUrl) return null;
                const m = productUrl.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/);
                return m && m[1] ? m[1] : null;
            } catch (e) { return null; }
        })();
        const transAmUrl = asin ? getSavedTransAmUrl(asin) : null;

        // ★ 人間っぽい "在庫切れ画面を読む時間" (900-1300ms ランダム) ★
        //   v0.3.8.83: 300-700ms → 900-1300ms に拡大
        //   navigate 所要 ~750ms と合算で平均 1.85 秒/サイクル (人間最速 ~2秒 寄り)
        const readingDelayMs = 900 + Math.floor(Math.random() * 400);

        // ★ 10% の確率で偽装サイクル (商品ページ経由) ★
        const useDecoyCycle = Math.random() < 0.10;

        try {
            logAm('warn', 'stock-out',
                useDecoyCycle
                    ? '在庫切れ → 商品ページ戻し (偽装サイクル、人間ぽい挙動)'
                    : '在庫切れ → TRANS-AM URL 直接再 navigate (高速ループ)',
                {
                    fromUrl: location.href.slice(0, 200),
                    earlyDetected: earlyStockOut,
                    readingDelayMs: readingDelayMs,
                    useDecoyCycle: useDecoyCycle,
                    hasTransAmUrl: !!transAmUrl,
                });
        } catch (e) {}

        toast(useDecoyCycle
            ? '🕐 在庫切れ → 商品ページに戻ってリトライ'
            : '🔁 在庫切れ → TRANS-AM 即リトライ',
            '#7b1fa2', 3000);

        if (!productUrl) {
            // ★v0.3.8.84: 原因究明用に詳細 dump
            try {
                logAm('error', 'stock-out',
                    'SESSION に productUrl がない → 完全停止 (詳細 dump)', {
                        currentUrl: location.href.slice(0, 200),
                        currentPath: location.pathname,
                        sessionExists: !!session,
                        sessionSid: session ? (session.sid || null) : null,
                        sessionProductUrl: session
                            ? (session.productUrl === '' ? '(empty string)' : (session.productUrl || '(null/undefined)'))
                            : '(no session)',
                        sessionLastUpdate: session && session.lastUpdate
                            ? new Date(session.lastUpdate).toISOString()
                            : null,
                        sessionAgeMs: session && session.lastUpdate
                            ? (Date.now() - session.lastUpdate)
                            : null,
                        modeBefore: (function(){ try { return S.getMode(); } catch (e) { return '?'; } })(),
                        stepBefore: (function(){ try { return S.getStep(); } catch (e) { return '?'; } })(),
                        wasStopped: isStopped(),
                        pageLoadAgeMs: Date.now() - (window.__gbot_am_page_start__ || Date.now()),
                        earlyDetected: earlyStockOut,
                    });
            } catch (e) {}
            toast('❌ 元の商品 URL が不明 → 停止\n' +
                  '(ログに詳細記録、次回再現時に解析可)',
                  STOP_RED, 12000);
            S.opFullStop();
            return;
        }
        S.setStep(STEP_PURCHASING);

        // 人間っぽい読み時間
        await sleep(readingDelayMs);
        if (S.shouldHalt()) return;

        // 分岐: TRANS-AM URL あり + 偽装サイクルじゃない → 直接 TRANS-AM URL
        //       それ以外 → 商品ページに戻す (従来動作)
        if (transAmUrl && !useDecoyCycle) {
            // ★v0.3.8.82: TRANS-AM URL 直行 (商品ページ経由廃止)
            //   TRANS-AM URL は offerListing.1 込みなので Amazon が在庫判定を直接実行
            //   Amazon が「もう在庫ない」と返せば oos → 再ループ
            //   Amazon が「在庫あり」と返せば placeOrderForm → 確定 click
            try { logAm('info', 'stock-out', '→ TRANS-AM URL 直接 navigate (商品ページ経由廃止)', {
                asin: asin, urlLen: transAmUrl.length,
            }); } catch (e) {}
            try {
                location.href = transAmUrl;
            } catch (e) {
                // フォールバック: 商品ページ
                try { location.href = productUrl; } catch (e2) {}
            }
            return;
        }

        // 偽装サイクル or TRANS-AM URL 未保存 → 従来動作 (商品ページ戻し)
        try {
            const url = new URL(productUrl);
            url.searchParams.set('_pageRefresh', String(Date.now()));
            url.searchParams.set('_sw', String(Date.now()));
            if (CONFIG.autoForceAmazon) {
                url.searchParams.set('m', AMAZON_SELLER_ID);
            }
            url.searchParams.delete('aod');
            location.href = url.toString();
        } catch (e) {
            location.href = productUrl;
        }
    };

    // ★v0.3.8.37: Amazon 汎用エラー画面 (/errors/500 等) → 段階的減速ループ
    //   HIRO 要望 (2026-05-18):
    //     「連続 4 回で完全停止」じゃなく、もう少し速度落としてループ継続
    //   設計:
    //     - errCount 1-3: 500ms sleep (通常速度)
    //     - errCount 4-6: 2000ms sleep (4倍減速)
    //     - errCount 7-9: 5000ms sleep (10倍減速)
    //     - errCount 10+: 10000ms sleep (20倍減速、bot 検知保護)
    //     - 完全停止しない、HIRO が手動停止するまでループ継続
    //   errCount は 60 秒経過でリセット (resetTransAmErrCount 経由)
    // ★v0.3.8.81: Amazon 混雑待機室 (/checkout/entry/waiting)
    //   HIRO 報告 2026-05-26: GP02 リストックで「ゲージ + トラフィック」画面に弾かれた
    //   仕様:
    //     ・順番待ち中なので bot は何も操作しない (Amazon の自動進行を尊重)
    //     ・60 秒間 URL 変化を polling (進んだら main 再実行で適切な handler に)
    //     ・60 秒経っても /entry/waiting のままなら商品ページに戻ってループ継続
    //     ・toast で HIRO さんに「待機室です、bot は静かに待ちます」を明示
    //     ・画面内容を warn でダンプ (将来の解析用)
    const handleWaitingRoom = async () => {
        if (S.shouldHalt()) return;
        try { expressCheckoutHandled = true; } catch (e) {}

        // 画面内容ダンプ (1回だけ、初回着地時)
        try {
            const bodyText = (document.body && document.body.innerText) || '';
            logAm('warn', 'waiting-room',
                '🕐 Amazon 混雑待機室着地 → 順番待ちで bot は静か', {
                    url: location.href.slice(0, 200),
                    title: (document.title || '').slice(0, 120),
                    bodyHead: bodyText.slice(0, 500),
                    bodyLen: bodyText.length,
                    hasTraffic: /トラフィック|traffic/i.test(bodyText),
                    hasCongestion: /混雑|お待ち|順番/.test(bodyText),
                });
        } catch (e) {}
        try {
            toast('🕐 Amazon 混雑待機室\n' +
                  '・順番が来るまで bot は手を出さず待機\n' +
                  '・60 秒経過で商品ページに戻ってリトライ',
                  '#1976d2', 60000);
        } catch (e) {}

        // 60 秒、URL 変化を 2 秒ごとに polling
        const startTs = Date.now();
        const initialPath = location.pathname;
        while (Date.now() - startTs < 60000) {
            if (S.shouldHalt()) return;
            await sleep(2000);
            if (S.shouldHalt()) return;
            // URL が waiting じゃなくなった → Amazon が順番回した
            //   main() は document-start で次のページ上で再実行されるので、ここでは何もしなくて OK
            //   (この while ループは現ページ上の polling、ページ navigate で context ごと消える)
            if (location.pathname !== initialPath) {
                try { logAm('info', 'waiting-room',
                    '✅ 順番到達: URL 変化検出 → 次ページに自動進行', {
                        from: initialPath,
                        to: location.pathname,
                        waitedMs: Date.now() - startTs,
                    }); } catch (e) {}
                return;  // main() の再実行に任せる
            }
        }

        // 60 秒経過 → 商品ページに戻ってループ継続
        try { logAm('warn', 'waiting-room',
            '⏱ 60 秒経過、待機室から進めず → 商品ページに戻ってループ継続', {
                url: location.href.slice(0, 200),
            }); } catch (e) {}
        try {
            toast('⏱ 60 秒経過、待機室から進めず\n商品ページに戻ってリトライします',
                  '#f57c00', 8000);
        } catch (e) {}
        const session = S.getSession && S.getSession();
        if (session && session.productUrl) {
            try { S.setStep(STEP_PURCHASING); } catch (e) {}
            try {
                const u = new URL(session.productUrl);
                u.searchParams.set('_pageRefresh', String(Date.now()));
                u.searchParams.set('_sw', String(Date.now()));
                if (CONFIG.autoForceAmazon) u.searchParams.set('m', AMAZON_SELLER_ID);
                u.searchParams.delete('aod');
                location.href = u.toString();
            } catch (e) {
                try { location.href = session.productUrl; } catch (e2) {}
            }
        }
    };

    const handleAmazonError = async () => {
        try { expressCheckoutHandled = true; } catch (e) {}
        if (S.shouldHalt()) return;

        const errCount = incrementTransAmErrCount();
        const session = S.getSession();
        const productUrl = session && session.productUrl;

        // ★v0.3.8.39: HIRO 要望 (2026-05-18) 1秒/3秒の 2 段階
        //   errCount 1-3: 1000ms (通常、最大スピード)
        //   errCount 4+ : 3000ms (3秒、軽い減速)
        let sleepMs = 1000;
        let speedLabel = '通常 (1秒)';
        if (errCount >= 4) { sleepMs = 3000; speedLabel = '減速 (3秒)'; }

        try {
            logAm('warn', 'amazon-error',
                `⚠️ Amazon エラー画面検出 (${errCount}回目, ${speedLabel}) → 商品ページに戻ってループ継続`, {
                fromUrl: location.href.slice(0, 200),
                errCount: errCount,
                sleepMs: sleepMs,
                hasProductUrl: !!productUrl,
            });
        } catch (e) {}

        if (!productUrl) {
            // ★v0.3.8.84: 原因究明用に詳細 dump (handleStockOutBuyNow と同等)
            try {
                logAm('error', 'amazon-error',
                    'SESSION に productUrl がない → 完全停止 (詳細 dump)', {
                        currentUrl: location.href.slice(0, 200),
                        currentPath: location.pathname,
                        sessionExists: !!session,
                        sessionSid: session ? (session.sid || null) : null,
                        sessionProductUrl: session
                            ? (session.productUrl === '' ? '(empty string)' : (session.productUrl || '(null/undefined)'))
                            : '(no session)',
                        sessionLastUpdate: session && session.lastUpdate
                            ? new Date(session.lastUpdate).toISOString()
                            : null,
                        sessionAgeMs: session && session.lastUpdate
                            ? (Date.now() - session.lastUpdate)
                            : null,
                        modeBefore: (function(){ try { return S.getMode(); } catch (e) { return '?'; } })(),
                        stepBefore: (function(){ try { return S.getStep(); } catch (e) { return '?'; } })(),
                        wasStopped: isStopped(),
                        errCount: errCount,
                    });
            } catch (e) {}
            toast('❌ Amazon エラー画面 + 元 URL 不明 → 停止\n' +
                  '(ログに詳細記録、次回再現時に解析可)',
                  STOP_RED, 12000);
            S.opFullStop();
            return;
        }

        toast(`⚠ Amazon エラー ${errCount}回目 (${speedLabel})\n${sleepMs}ms 待機 → 商品ページに戻る`, '#d32f2f', 5000);
        S.setStep(STEP_PURCHASING);
        await sleep(sleepMs);
        if (S.shouldHalt()) return;
        try {
            const url = new URL(productUrl);
            url.searchParams.set('_pageRefresh', String(Date.now()));
            url.searchParams.set('_sw', String(Date.now()));
            if (CONFIG.autoForceAmazon) {
                url.searchParams.set('m', AMAZON_SELLER_ID);
            }
            url.searchParams.delete('aod');
            location.href = url.toString();
        } catch (e) {
            location.href = productUrl;
        }
    };

    // ───────────────────────────────────────────────
    // ルーター(main)
    // ───────────────────────────────────────────────
    const main = async () => {
        try { window.__gbot_am_page_start__ = Date.now(); } catch (e) {}

        // iframe コンテキスト判定
        let isInIframe = false;
        try { isInIframe = window.top !== window.self; } catch (e) { isInIframe = true; }
        if (isInIframe) {
            handleInIframe();
            return;
        }

        // ★v0.3.8.62: stale TRANS-AM フラグ クリーンアップ (panel 生成の前に実行)
        //   HIRO 指摘 (2026-05-18 22:52): 「フラグがうまく動いてなくてピンクを表示してる可能性」
        // ★v0.3.8.63: 同時に LB_AM_VERIFIED_DIRECT もセッション越境チェック
        //   Claude 自発検査 (2026-05-18): 同じ脆弱性パターンを他キーで発見:
        //     LB_AM_VERIFIED_DIRECT (直販確認済タイムスタンプ) は注文完了時にしか削除されない。
        //     ブラウザ閉じる → 5 分以内に再起動 → 別商品で開始しても古い時刻が残り、
        //     verifiedRecent=true で「failsafe NG でも続行」される潜在リスク。
        //   対策: panel 生成より先に以下を実行:
        //     ① TRANS-AM フラグ: mode と矛盾あれば必ず削除
        //     ② VERIFIED_DIRECT: mode === STOPPED または session なしならクリア
        //                        (新セッションで前回確認は無効化)
        try {
            const mode = S.getMode && S.getMode();
            const session = S.getSession && S.getSession();

            // ① TRANS-AM フラグの整合性
            const taFlag = (function(){
                try { return localStorage.getItem('LB_AM_TRANS_AM_MODE') === '1'; }
                catch (e) { return false; }
            })();
            let cleanReason = '';
            if (taFlag) {
                if (mode === MODE_STOPPED) {
                    cleanReason = 'STOPPED with stale TA flag';
                } else if (mode === MODE_PAUSED && !session) {
                    cleanReason = 'PAUSED + no session, stale TA flag';
                }
            }
            if (cleanReason) {
                try { localStorage.removeItem('LB_AM_TRANS_AM_MODE'); } catch (e) {}
                try { logAm('warn', 'transam-stale-cleanup',
                    '⚠ stale TRANS-AM フラグ検出 → クリア (UI ピンク誤表示の原因)', {
                    reason: cleanReason, mode: mode, hasSession: !!session,
                }); } catch (e) {}
            }

            // ② LB_AM_VERIFIED_DIRECT のセッション越境チェック (v0.3.8.63)
            const verifiedRaw = (function(){
                try { return localStorage.getItem('LB_AM_VERIFIED_DIRECT'); }
                catch (e) { return null; }
            })();
            if (verifiedRaw) {
                let verifiedReason = '';
                if (mode === MODE_STOPPED) {
                    verifiedReason = 'STOPPED with stale VERIFIED_DIRECT';
                } else if (mode === MODE_PAUSED && !session) {
                    verifiedReason = 'PAUSED + no session, stale VERIFIED_DIRECT';
                } else {
                    // RUNNING / 有効 PAUSED でも、verifiedDirectAt が 5 分以上経過していれば無効
                    const at = parseInt(verifiedRaw, 10) || 0;
                    if (at && (Date.now() - at) > 5 * 60 * 1000) {
                        verifiedReason = 'expired (>5min ago)';
                    }
                }
                if (verifiedReason) {
                    try { localStorage.removeItem('LB_AM_VERIFIED_DIRECT'); } catch (e) {}
                    try { logAm('warn', 'verified-direct-cleanup',
                        '⚠ stale LB_AM_VERIFIED_DIRECT 検出 → クリア (failsafe 抜け穴防止)', {
                        reason: verifiedReason, mode: mode, hasSession: !!session,
                        verifiedAge: verifiedRaw ? (Date.now() - parseInt(verifiedRaw, 10) || 0) : 0,
                    }); } catch (e) {}
                }
            }
        } catch (e) {}

        // 最優先: panel を出す
        ensurePanel();

        // body 出現後にやる処理は body 出現を待つ
        if (!document.body) {
            await new Promise((r) => {
                const check = () => document.body ? r() : setTimeout(check, 50);
                check();
            });
        }

        // ★v0.2.0: skip_confirm 設定を CONFIG から S に反映(再インストール時の上書き)
        try { S.setSkipConfirm(!!CONFIG.skipConfirm); } catch (e) {}

        // ★v0.2.0: マイグレーション(初回のみ)
        //   旧 Cookie + 旧 localStorage キーを削除し、MODE=STOPPED でクリーンスタート
        const migrated = S.migrateFromV1();
        if (migrated) {
            // 初回起動時の通知 toast(進行中購入があったらリセットされた旨)
            setTimeout(() => {
                try {
                    toast(
                        '🆕 v0.2.0 にアップデート完了\n' +
                        '・状態管理が一新されました(停止が確実に効くように)\n' +
                        '・進行中の購入セッションはリセットされました\n' +
                        '・🛒で新規開始してください',
                        '#1976d2', 12000
                    );
                } catch (e) {}
            }, 500);
        }

        // 親フレーム側で iframe からの postMessage を受信
        setupIframeMessageListener();

        // 旧版の浮き要素削除(残存していた場合のみ)
        ['lb-am-version-badge', 'lb-am-toast-panel', 'lb-am-stop-btn', 'lb-am-start-btn', 'lb-am-settings-btn']
            .forEach(id => { try { const e = document.getElementById(id); if (e) e.remove(); } catch (er) {} });

        if (CONFIG.debugMode) {
            try { toast(`▶ v${SCRIPT_VERSION}`, BUY_GREEN, 2000); } catch (e) {}
        }

        renderStopButton();
        renderSettingsButton();
        startBadgeUpdater();

        // ★v0.2.0: モード変更検知ポーリング(1500ms 周期、ボタン即時更新は別途)
        // ★v0.3.8.3: ID 保存して完全停止時に clearInterval できるように
        let _lastMainMode = S.getMode();
        if (_modeWatchIntervalId) clearInterval(_modeWatchIntervalId);
        _modeWatchIntervalId = setInterval(() => {
            try {
                const cur = S.getMode();
                if (cur !== _lastMainMode) {
                    _lastMainMode = cur;
                    updatePanelButtons();
                }
            } catch (e) {}
        }, 1500);

        let screen = detectScreen();

        // ★v0.2.0: main エントリログ
        try {
            const session = S.getSession();
            logAm('info', 'main', `v${SCRIPT_VERSION} 起動 (screen=${screen})`, {
                screen: screen,
                profile: CONFIG.profileName || '',
                url: location.href.slice(0, 200),
                mode: S.getMode(),
                step: S.getStep(),
                hasSession: !!session,
                reloadCount: session ? session.reloadCount : 0,
                forcedM: isUrlForcedAmazon(),
                autoForceAmazon: CONFIG.autoForceAmazon,
                buyNowPriority: CONFIG.buyNowPriority,
                reloadInterval: CONFIG.reloadInterval,
                reloadMax: CONFIG.reloadMax,
                timerEnabled: CONFIG.timerEnabled,
                timerHHMM: CONFIG.timerHHMM,
                hasWebhook: !!getDiscordWebhook(),
            });
        } catch (e) {}

        // ═════════════════════════════════════════════════
        // ★v0.3.8.87/.92: #gta=1 ホームアイコン自動発火 (TRANS-AM 優先 → 新規開始フォールバック)
        //   document-start で捕捉した window.__gbot_gta_requested__ を判定。
        //   共通の前提条件:
        //     ① #gta=1 フラグあり (ホームアイコン経由)
        //     ② 商品ページ (PRODUCT / PRODUCT_AOD)
        //     ③ mode === STOPPED (進行中セッションを横取りしない)
        //     ④ このページ load で未発火 (window.__gbot_gta_fired__)
        //   発火分岐 (★v0.3.8.92 HIRO 指示「TRANS-AM 優先、条件なければ新規開始」):
        //     ・保存 TRANS-AM URL あり → startPurchaseTransAm() (⚡最速ルート)
        //     ・保存 URL なし          → startPurchase() (通常購入 = 新規開始にフォールバック)
        //   どちらも即発動 (誤タップは🛑で停止)。mode≠STOPPED の時だけ横取り防止でスキップ。
        try {
            if (window.__gbot_gta_requested__ && !window.__gbot_gta_fired__) {
                if (screen === 'PRODUCT' || screen === 'PRODUCT_AOD') {
                    const _gtaMode = S.getMode();
                    const _gtaAsin = extractAsinFromUrl();
                    const _gtaHasUrl = _gtaAsin ? hasSavedTransAmUrl(_gtaAsin) : false;
                    if (_gtaMode !== MODE_STOPPED) {
                        // 既に RUNNING/PAUSED → 横取りしない (リロードで #gta 残存時など)
                        window.__gbot_gta_fired__ = true;
                        try { logAm('info', 'gta-autostart',
                            '🏠 #gta 検知だが mode≠STOPPED → 自動発火スキップ (横取り防止)', {
                                mode: _gtaMode, asin: _gtaAsin,
                            }); } catch (e) {}
                    } else if (_gtaHasUrl) {
                        // ★TRANS-AM 優先 (URL記録済)
                        window.__gbot_gta_fired__ = true;
                        try { logAm('info', 'gta-autostart',
                            '🏠 #gta=1 → TRANS-AM 自動発火 (URL記録済・優先)', {
                                asin: _gtaAsin, url: location.href.slice(0, 150),
                            }); } catch (e) {}
                        try { toast('⚡ ホームアイコンから TRANS-AM 自動発動', '#c41e9e', 2500); } catch (e) {}
                        try { startPurchaseTransAm(); } catch (e) {}
                        return;  // 自動発火したら main の通常ルーティングはスキップ
                    } else {
                        // ★TRANS-AM URL 未記録 → 新規開始(通常購入)にフォールバック
                        window.__gbot_gta_fired__ = true;
                        try { logAm('info', 'gta-autostart',
                            '🏠 #gta=1 → TRANS-AM URL 未記録 → 新規開始(通常購入)にフォールバック', {
                                asin: _gtaAsin, url: location.href.slice(0, 150),
                            }); } catch (e) {}
                        try { toast('🛒 TRANS-AM URL 未記録 → 通常購入(新規開始)で発動', '#1976d2', 3000); } catch (e) {}
                        try { startPurchase(); } catch (e) {}
                        return;  // 自動発火したら main の通常ルーティングはスキップ
                    }
                }
            }
        } catch (e) {}

        // v0.3.8.9: cookie-snapshot-product 呼出を削除
        //   v0.3.8.8 ログから session-id / x-main は HttpOnly cookie (JS から不可視) と判明。
        //   ダンプし続けても情報的価値ゼロなので削除。
        //   dumpCookieSnapshot() の関数定義自体は将来再利用余地のため残置。

        // v0.3.8.10: 旧バージョンの localStorage キャッシュをクリア (新方式は in-memory)
        //   v0.3.8.4〜v0.3.8.9 で書き込まれた永久キャッシュキーを起動時に除去。
        //   削除しなくても動作には影響しないが、古いキーが残るのを防ぐ整理。
        try { localStorage.removeItem('LB_AM_AOD_ENV_SIG'); } catch (e) {}

        // ★v0.3.8.94: 誤取得した商品画像 (LB_AM_PRODUCT_IMG_*) を 1 回だけ全クリア
        //   v0.3.8.91〜.92 は og:image 空ページで「最初の /images/I/ = ブランドロゴ
        //   (青いバンダイのアイコン)」を誤保存していた。.93 で抽出ロジックは修正済みだが、
        //   既に保存された誤画像は 🏠 ダイアログが優先表示するため直らない。
        //   → 一度全消去 → 次に 🏠 / 商品ページ訪問で修正済みロジックが正画像を取り直す。
        //   画像は飾り用データのみ・再取得は軽量なので全消去で安全。1 回限り (フラグ管理)。
        try {
            if (!localStorage.getItem('LB_AM_MIG_IMG_V93')) {
                const imgKeys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith('LB_AM_PRODUCT_IMG_')) imgKeys.push(k);
                }
                for (const k of imgKeys) { try { localStorage.removeItem(k); } catch (e) {} }
                localStorage.setItem('LB_AM_MIG_IMG_V93', String(Date.now()));
                if (imgKeys.length > 0) {
                    try { logAm('info', 'migration',
                        'v0.3.8.94: 誤取得の商品画像を全クリア → 次回 🏠 で正画像を取り直し',
                        { cleared: imgKeys.length }); } catch (e) {}
                }
            }
        } catch (e) {}

        // ★v0.3.8.48: 既存の完成 URL データを ASIN_ONLY 仮登録に自動変換 (B方式凍結)
        //   - LB_AM_BUYNOW_URL_<ASIN> をすべて検出
        //   - 対応する LB_AM_ASIN_ONLY_<ASIN> マーカーを作成 (なければ)
        //   - 完成 URL データを削除 (B方式凍結に伴い使わない)
        //   1 回限り実行 (LB_AM_MIG_V48 フラグ)
        try {
            if (!localStorage.getItem('LB_AM_MIG_V48')) {
                const keysToConvert = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (!k) continue;
                    if (k.startsWith('LB_AM_BUYNOW_URL_') && !k.endsWith('_AT')) {
                        const a = k.slice('LB_AM_BUYNOW_URL_'.length);
                        if (/^[A-Z0-9]{10}$/.test(a)) keysToConvert.push({ asin: a, key: k });
                    }
                }
                let converted = 0;
                for (const it of keysToConvert) {
                    try {
                        if (!localStorage.getItem('LB_AM_ASIN_ONLY_' + it.asin)) {
                            const atStr = localStorage.getItem(it.key + '_AT') || String(Date.now());
                            localStorage.setItem('LB_AM_ASIN_ONLY_' + it.asin, atStr);
                        }
                        localStorage.removeItem(it.key);
                        localStorage.removeItem(it.key + '_AT');
                        converted++;
                    } catch (e) {}
                }
                localStorage.setItem('LB_AM_MIG_V48', String(Date.now()));
                if (converted > 0) {
                    try { logAm('info', 'migration', `v0.3.8.48 マイグレーション: 完成 URL ${converted} 件 → ASIN_ONLY に変換`, { converted: converted }); } catch (e) {}
                }
            }
        } catch (e) {}

        // ★v0.3.8.23: STOPPED で起動した場合、TRANS-AM フラグの残骸をクリア
        //   (前回 TRANS-AM 押下後に完全停止せず Safari が閉じた等で残ったとき、
        //    待機中なのにマゼンタ HUD が出続けるバグの根本対策)
        try {
            if (S.getMode && S.getMode() === MODE_STOPPED) {
                localStorage.removeItem('LB_AM_TRANS_AM_MODE');
            }
        } catch (e) {}

        // ★v0.3.8.16: addressID を URL から自動抽出して localStorage に保存
        //   既存の通常ルート (今すぐ買う click → /checkout/entry/buynow?addressID=xxx)
        //   で navigate した先で起動した時、URL から addressID を抜いて保存。
        //   次回以降 TRANS-AM モードがこの保存値を使う。
        // ★v0.3.8.20: 同じタイミングで「今すぐ買う」URL 全体を ASIN ごとに保存
        //   HIRO 検証: 過去取得した URL は在庫があれば 1 日以上後でも動作する。
        //   TRANS-AM はこの保存 URL を読んで Buy Box 描画待たずに即 navigate する。
        try {
            const fullUrl = location.href || '';
            if (/\/checkout\/entry\/buynow/.test(fullUrl)) {
                // (a) addressID 保存 (v0.3.8.16 と同じ)
                const m = fullUrl.match(/[?&]addressID=([^&#]+)/);
                if (m && m[1] && m[1].length >= 6) {
                    const decoded = decodeURIComponent(m[1]);
                    const prev = localStorage.getItem('LB_AM_ADDRESS_ID');
                    if (prev !== decoded) {
                        localStorage.setItem('LB_AM_ADDRESS_ID', decoded);
                        try {
                            logAm('info', 'address-id-saved',
                                'addressID を URL から抽出 → localStorage 保存',
                                { addressID: decoded, prev: prev || '(none)', from: fullUrl.slice(0, 200) });
                        } catch (e) {}
                    }
                }
                // (b) ★v0.3.8.20: 今すぐ買う URL 全体を ASIN ごとに保存
                //   URL に asin.1=<ASIN> と offerListing.1=<...> 両方含まれる時のみ
                //   (誤って別画面の URL を保存しないようガード)
                try {
                    const asinMatch = fullUrl.match(/[?&]asin\.1=([A-Z0-9]{10})/);
                    const offerMatch = fullUrl.match(/[?&]offerListing\.1=([^&#]+)/);
                    if (asinMatch && asinMatch[1] && offerMatch && offerMatch[1] && offerMatch[1].length >= 20) {
                        const savedAsin = asinMatch[1];
                        const key = 'LB_AM_BUYNOW_URL_' + savedAsin;
                        const prevUrl = localStorage.getItem(key) || '';
                        if (prevUrl !== fullUrl) {
                            localStorage.setItem(key, fullUrl);
                            // 保存時刻も別キーに記録 (有効期限管理は将来の余地)
                            try { localStorage.setItem(key + '_AT', String(Date.now())); } catch (e) {}
                            // ★v0.3.8.23: URL を正常保存できたら連続エラーカウンタリセット
                            //   (HIRO さんが通常 🛒 で URL 取り直したら TRANS-AM 再有効化)
                            try { resetTransAmErrCount(); } catch (e) {}
                            try {
                                logAm('info', 'buynow-url-saved',
                                    '今すぐ買う URL を localStorage 保存 (TRANS-AM 用)',
                                    {
                                        asin: savedAsin,
                                        urlLen: fullUrl.length,
                                        urlHead: fullUrl.slice(0, 200),
                                        prevExisted: !!prevUrl,
                                    });
                            } catch (e) {}
                        }
                    }
                } catch (e) {}
            }
        } catch (e) {}

        // ★v0.3.8.23: 商品ページ到達時に商品名を localStorage に自動保存
        // ★v0.3.8.28: 抽出ロジックを extractProductTitle にヘルパー化 (モバイル対応)
        //   保存済み URL がある商品のみ更新、複数タイミング (1.5s, 4s) で試して取り逃しを防止
        if (screen === 'PRODUCT' || screen === 'PRODUCT_AOD') {
            try {
                const asin = extractAsinFromUrl();
                if (asin && hasSavedTransAmUrl(asin)) {
                    // ★v0.3.8.89: 商品画像 URL も併せて保存 (ホームアイコン画像用)
                    const tryGrabImg = () => {
                        try {
                            const img = extractProductImage();
                            if (!img) return false;
                            const imgKey = 'LB_AM_PRODUCT_IMG_' + asin;
                            if (localStorage.getItem(imgKey) === img) return true;
                            localStorage.setItem(imgKey, img);
                            try { logAm('info', 'product-img-saved', '商品画像 URL を localStorage 保存', { asin: asin, imgLen: img.length }); } catch (e) {}
                            return true;
                        } catch (e) { return false; }
                    };
                    const tryGrabTitle = () => {
                        try {
                            const title = extractProductTitle();
                            if (!title) return false;
                            const nameKey = 'LB_AM_PRODUCT_NAME_' + asin;
                            const prev = localStorage.getItem(nameKey) || '';
                            if (prev === title) return true;
                            localStorage.setItem(nameKey, title);
                            try {
                                logAm('info', 'product-name-saved',
                                    '商品名を localStorage 保存',
                                    { asin: asin, title: title, prevExisted: !!prev });
                            } catch (e) {}
                            return true;
                        } catch (e) { return false; }
                    };
                    setTimeout(() => {
                        if (!tryGrabTitle()) setTimeout(tryGrabTitle, 2500);
                        if (!tryGrabImg()) setTimeout(tryGrabImg, 2500);
                    }, 1500);
                }
            } catch (e) {}
        }

        // ★v0.1.12.3: URL パターンで在庫切れを検出できなかった時のテキストベース再判定
        //   HIRO 2026-05-09: スクショで screen=OTHER のまま「商品を更新する」が表示
        //   → URL パターン外の在庫切れ画面が存在 → 画面文言で検出
        // ★v0.3.8.76: qty メッセージは在庫切れ扱いせず qty_stop パスへ。
        //   `商品を更新する && 数量:0` 条件も廃止 (Chewbacca SPC レビュー画面で誤検出)
        if (screen === 'OTHER') {
            try {
                // DOM が出来てない可能性があるので少し待つ
                await sleep(800);
                const txt = (document.body && document.body.innerText) || '';

                // ★v0.3.8.76 修正 C: qty メッセージを最優先で分岐 (STOCK_OUT_BUYNOW より先)
                const isQtyUpdate =
                    /リクエストされた数量は入手できなくなりました/.test(txt) ||
                    /入手可能な最大数に数量を更新しました/.test(txt);
                if (isQtyUpdate) {
                    try { expressCheckoutHandled = true; } catch (e) {}
                    // ★v0.3.8.78 修正 C: 直近 60 秒以内 click → 注文成功証拠
                    let recentClickAgo = -1;
                    try {
                        const lastTs = parseInt(localStorage.getItem('LB_AM_LAST_ORDER_CLICK_TS') || '0', 10) || 0;
                        if (lastTs > 0) recentClickAgo = Date.now() - lastTs;
                    } catch (e) {}
                    const wasRecentClick = recentClickAgo >= 0 && recentClickAgo < 60000;
                    // ★v0.3.8.99: 注文成功検出を qty_stop の外(最優先)へ(2箇所目)
                    //   直近 click + 数量更新 = 注文が通った事実 → qty_stop=ON/OFF どちらでも停止。
                    if (wasRecentClick) {
                        try { logAm('warn', 'order-complete',
                            '✅ 注文成功確認 (直近 click 後の数量更新検出 = 重複防止) → 完全停止', {
                            url: location.href.slice(0, 200),
                            clickAgoMs: recentClickAgo,
                            qtyStop: getEffectiveQtyStop(),
                        }); } catch (e) {}
                        try {
                            toast('✅ 注文成功!\n(直近 click 後の重複防止メッセージで成功確認)\n' +
                                  '自動停止しました、次は🛒で新規開始',
                                  BUY_GREEN, 15000);
                        } catch (e) {}
                        try { S.setStep(STEP_ORDER_PLACED); } catch (e) {}
                        try { localStorage.removeItem('LB_AM_LAST_ORDER_CLICK_TS'); } catch (e) {}
                        try { S.opFullStop(); } catch (e) {}
                        return;
                    }
                    if (getEffectiveQtyStop()) {
                        try { logAm('error', 'qty-update',
                            '「数量更新」検出 (OTHER 同期チェック) + qtyStop=ON → 完全停止', {
                            url: location.href.slice(0, 200),
                            screen: screen,
                            override: getQtyStopOverride(),
                            configDefault: !!CONFIG.qtyStop,
                            clickAgoMs: recentClickAgo,
                        }); } catch (e) {}
                        try {
                            toast('🛑 「数量更新」メッセージ検出 → 完全停止\n' +
                                  '(qty_stop=ON のため、リストック初日なら OFF に切替推奨)',
                                  STOP_RED, 15000);
                        } catch (e) {}
                        try { S.opFullStop(); } catch (e) {}
                        return;
                    }
                    // qty_stop=OFF: 警告だけ、商品ページに戻ってループ継続
                    try { logAm('warn', 'qty-update',
                        '「数量更新」検出 (OTHER 同期チェック) + qtyStop=OFF → ループ継続', {
                        url: location.href.slice(0, 200),
                    }); } catch (er) {}
                    try {
                        toast('⚠ 「数量更新」検出 (qty_stop=OFF) → ループ継続\n(2 段階リリース想定)',
                              '#f57c00', 6000);
                    } catch (e) {}
                    const session = S.getSession();
                    if (session && session.productUrl) {
                        try { S.setStep(STEP_PURCHASING); } catch (e) {}
                        await sleep(500);
                        if (S.shouldHalt()) return;
                        try {
                            const url = new URL(session.productUrl);
                            url.searchParams.set('_pageRefresh', String(Date.now()));
                            url.searchParams.set('_sw', String(Date.now()));
                            if (CONFIG.autoForceAmazon) url.searchParams.set('m', AMAZON_SELLER_ID);
                            url.searchParams.delete('aod');
                            location.href = url.toString();
                        } catch (e) {
                            try { location.href = session.productUrl; } catch (e2) {}
                        }
                    }
                    return;
                }

                // qty 以外の在庫切れシグナル (qty msg のフレーズは除外済み)
                const isStockOut =
                    /ご注文いただいた商品のいくつかに問題がありました/.test(txt) ||
                    /お取り扱いできません/.test(txt) ||
                    /取り扱いできません/.test(txt) ||
                    /この商品は在庫切れのため購入できません/.test(txt);
                if (isStockOut) {
                    if (CONFIG.debugMode) {
                        console.log('[GBOT-AM] OTHER → STOCK_OUT_BUYNOW (text-based detection)');
                    }
                    screen = 'STOCK_OUT_BUYNOW';
                }
            } catch (e) {}
        }

        // ★v0.3.8.23: エラーカウンタは localStorage 永続化 (resetTransAmErrCount)
        //   STOCK_OUT_BUYNOW = 正規の在庫切れ画面 = URL は valid = エラーカウンタリセット
        //   PRODUCT / CHECKOUT / COMPLETE は HIRO 通常運用ルートで正常画面
        //   ただし HIRO 設計上、buynow URL 保存タイミング (main 内) でリセットされるので、
        //   ここでは念のため STOCK_OUT_BUYNOW のみリセットしておく
        if (screen === 'STOCK_OUT_BUYNOW') {
            try { resetTransAmErrCount(); } catch (e) {}
        }

        switch (screen) {
            case 'CART_ADD_FAIL': await handleCartAddFail(); break;  // ★v0.1.16.13
            case 'PRODUCT':     await handleProductPage();   break;
            case 'PRODUCT_AOD': await handleProductAod();    break;
            case 'SMART_WAGON': await handleSmartWagon();    break;
            case 'CART':        await handleClassicCart();   break;
            case 'ADDON_UPSELL': await handleAddOnUpsell();  break;  // ★v0.3.0
            case 'CHECKOUT':    await handleCheckout();      break;  // ★v0.1.15.8: 復活
            case 'STOCK_OUT_BUYNOW': await handleStockOutBuyNow(); break;
            case 'WAITING_ROOM': await handleWaitingRoom();  break;  // ★v0.3.8.81
            case 'AMAZON_ERROR': await handleAmazonError();  break;  // ★v0.3.8.22
            case 'COMPLETE':    await handleOrderComplete(); break;
            case 'SIGNIN':      await handleSigninPage();    break;
            default:
                /* ★v0.3.8.81: OTHER 画面に着地時、body テキスト先頭を必ずダンプ
                   未知の URL の正体を後追いできるように。
                   主要キーワード自動検出: トラフィック/混雑/お待ち/ロボット/captcha/不測 */
                try {
                    if (S.isRunning && S.isRunning()) {
                        const bodyText = (document.body && document.body.innerText) || '';
                        const titleText = document.title || '';
                        const headSnippet = bodyText.slice(0, 500);
                        const hasTraffic = /トラフィック|traffic/i.test(bodyText);
                        const hasCongestion = /混雑|お待ち|順番|お並びください/.test(bodyText);
                        const hasBotCheck = /ロボット|robot|captcha|不測|もう一度お試し/i.test(bodyText);
                        const hasErrorPage = /申し訳|エラー|問題|失敗/.test(bodyText.slice(0, 300));
                        logAm('warn', 'unknown-screen',
                            '⚠ OTHER 画面に着地 → 内容ダンプ (未知 URL の原因究明用)', {
                                url: location.href.slice(0, 200),
                                title: titleText.slice(0, 120),
                                bodyHead: headSnippet,
                                bodyLen: bodyText.length,
                                hasTraffic: hasTraffic,
                                hasCongestion: hasCongestion,
                                hasBotCheck: hasBotCheck,
                                hasErrorPage: hasErrorPage,
                            });
                        // 危険シグナル (anti-bot 検知) を即 toast 表示
                        if (hasBotCheck) {
                            try {
                                toast('🚨 「ロボット/CAPTCHA」検知 → 注意:アンチボット\n' +
                                      'URL: ' + location.pathname,
                                      STOP_RED, 30000);
                            } catch (e) {}
                        } else if (hasTraffic || hasCongestion) {
                            try {
                                toast('🕐 「混雑/トラフィック」検出 (' + location.pathname + ')\n' +
                                      'Amazon の混雑制御の可能性、画面確認してください',
                                      '#1976d2', 12000);
                            } catch (e) {}
                        }
                    }
                } catch (e) {}
                break;
        }

        // ★v0.2.0: OTHER 画面で遅延 DOM 更新の在庫切れ再判定(LITE 分岐削除)
        //   標準動作として setTimeout 3 回(2/8/20 秒)で軽量化
        // ★v0.3.8.76: qty メッセージは別経路 (qty_stop) で判定するため、ここでは
        //   qty フレーズを除外。handleStockOutBuyNow の冒頭で同期 qty チェックが走るので
        //   ここで qty msg 検出 → handleStockOutBuyNow 呼出で qty 分岐に入る。
        if (screen === 'OTHER' && S.isRunning()) {
            try {
                let detected = false;
                const checkText = () => {
                    if (detected || S.shouldHalt()) return false;
                    const txt = (document.body && document.body.innerText) || '';
                    if (/ご注文いただいた商品のいくつかに問題がありました/.test(txt) ||
                        /リクエストされた数量は入手できなくなりました/.test(txt) ||
                        /入手可能な最大数に数量を更新しました/.test(txt) ||
                        /お取り扱いできません/.test(txt) ||
                        /取り扱いできません/.test(txt) ||
                        /この商品は在庫切れのため購入できません/.test(txt)) {
                        detected = true;
                        handleStockOutBuyNow();
                        return true;
                    }
                    return false;
                };
                [2000, 8000, 20000].forEach(ms => setTimeout(checkText, ms));
            } catch (e) {}
        }
    };

    // ★v0.1.15.3: DOMContentLoaded 待ちを削除(HIRO 指摘 2026-05-09)
    //   旧: readyState=loading なら DOMContentLoaded まで待つ → 数百ms〜数秒の真空
    //   新: 即 main() 実行。documentElement は @run-at document-start で必ず存在
    //   main 内部で document.body 出現を待つ部分は維持(副次処理用)
    //   panel 表示は ensurePanel が documentElement に直接追加 → 即時可視
    main();
})();
