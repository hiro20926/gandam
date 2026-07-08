// ==UserScript==
// @name         PB-CART (プレバンカート支援)
// @namespace    https://github.com/hiro/pb-cart
// @version      v2.3.45 2026-07-09 05:29 #1aebea JST
// @description  プレミアムバンダイ カート投入支援ツール v2 (UserScript完結型)
// @match        *://p-bandai.jp/*
// @match        *://www.p-bandai.jp/*
// @include      *://p-bandai.jp/*
// @include      *://www.p-bandai.jp/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // =================================================================
  // ★★★ 変更厳禁ブロック (2026-05-11 凍結) ★★★
  // =================================================================
  // 以下の設計核心は HIROさんとの過去の協業で痛い目を見て確定したもの。
  // 「効率化」「速度改善」 等の理由で触ると過去の事故が再発する。
  //
  // [A] cartAddViaFormSubmit (セクション 7. カート操作)
  //     - 親 document に form clone + iframe.target で submit
  //     - iframe に sandbox 属性は付けない
  //       (sandbox=allow-same-origin で iframe navigation 阻害
  //        → timeout 連発の前歴 2026-05-10 22:11)
  //     - form は display:none + 5重防御 + 一意 id
  //     - iframe.onload で about:blank はスキップ
  //
  // [B] attempt loop (セクション 10. メインループ内) — 2026-05-12 Phase 9-0' 改訂
  //     - 全 i (0〜9) で buttonState() を確認、 青のみ POST
  //     - grey 化したら break (押さない、 次サイクルへ reload)
  //     - force_first_attempt_post は廃止 (BAN 主因のため旧事故 4 の判断を撤回)
  //     - 連打前と各 attempt 直前に isSiteBusy() ガード (混雑メッセージ表示中は POST しない)
  //     - 各 attempt で getCartItemIds → 件数増 + targetOrderId 一致で SUCCESS
  //     - cart fetch を attempt 内から廃止しない (前歴 2026-05-10)
  //
  // [C] キャッシュ完全回避 (/cart/ fetch、 セクション 7 の getCartItemIds)
  //     - ?_t=Date.now() + cache:'no-store' + Cache-Control 三重防御
  //     - 手動カート削除即反映のため、絶対に外さない
  //
  // [D] 複数タブ並行 (セクション 4. 設定の読み書き内 paused 関連)
  //     - paused は sessionStorage、各タブ独立
  //     - saveState で paused を delete してから localStorage に書く
  //     - localStorage に paused を書くと全タブ伝播の前歴 (2026-05-11)
  //
  // [E] Watchdog (セクション 10 冒頭) — 2026-05-12 Phase 9-8 改訂
  //     - 30 秒 heartbeat なし → location.reload() で完全リロード
  //     - visibilitychange で 5 秒以上 heartbeat なしなら → location.reload()
  //     - 設定モーダル open 中、 paused 中、 商品ページ外は監視外
  //     - リロード上限なし、 Discord 通知なし (HIROさん 監視運用前提)
  //
  // [F] メモリ削減 (iOS Safari kill 対策)
  //     - LOG_MAX 100件、ls 8KB 以下
  //     - saveLogBufferThrottled 3 秒間隔
  //     - recordMainLoopHeartbeat 5 秒サンプリング
  //     - memory_release_every_cycles 7 サイクル毎
  //
  // [G] mainLoop ↔ keepalive 排他 (セクション 11. キープアライブ冒頭)
  //     - _cartOpLock で同時 cart_add を防ぐ
  //     - 並行追加による「件数増の誤検知」 を防止
  //
  // [H] 混雑メッセージガード (セクション 7. カート操作内、 isSiteBusy 関数) — 2026-05-12 Phase 9-3 追加
  //     - isCurrentPageAccessControl() (ページ全体) OR
  //       bodyText に ACCESS_CONTROL_KEYWORDS が含まれる (オーバーレイ等の 2 層構造) → true
  //     - true なら全 POST を停止 (リロードは継続)
  //     - サーバが画面で「リロードするな」 と警告中に POST する bot 行動を回避
  //
  // [I] 配布時の Webhook 動的埋込 (2026-05-13 Phase 9-W 追加)
  //     - 開発用 pb-cart.user.js には HIROさん の Webhook を直接記述 (テスト時の通知用)
  //     - 配布用は assets/pb-cart_template.user.js に  プレースホルダー
  //     - Netlify Functions (netlify/functions/userscript.js) で動的置換
  //     - 各ユーザーは自分の Webhook を埋め込んだ user.js を取得
  //     - 1 人 1 Webhook 運用、 Webhook 共有はしない (プライバシー保護)
  //
  // [J] 警告ログの上部パネル記録強化 (2026-05-22 Phase 9-L 追加)
  //     旧仕様の問題: 5/21 発売解析で判明、 重要警告がイベントログ 100 件で流れて事後検証不能
  //     - 混雑検知 (isSiteBusy ガード / boot 時混雑検知) を pbLog → pbError('warn','site-busy',...)
  //     - 異常セッション遷移 (/logout/ /login/) を pbError('warn','session-anomaly',...) で記録
  //     - accessControlStreak は state.lastAccessControlAt を併用し、 最終発火から 10 分超で
  //       boot 時に自動 0 リセット (POST 経路依存の旧リセット条件で古い累積値が残るバグ解消)
  //     上部パネル ERROR_BUFFER (最大 8 件) は同 message を ts 更新で圧縮するため、 連発しても溢れない
  //
  // [K] CSV ログ強化 (2026-05-22 Phase 9-C → 2026-06-03 Phase 9-M で全面再設計)
  //     旧仕様の問題: 画面表示用 LOG_BUFFER (100 件) しかなく、 隠れたエラーや傾向が見えない
  //     Phase 9-C (5/22): LOG_BUFFER_FULL (5000) + LOG_BUFFER_CRITICAL (1000) を localStorage に
  //       「上書き」 保存。 → 全タブ共有キーを上書きする設計が致命的で、 複数タブ運用時に
  //       タブ B が boot 時にタブ A の履歴を継承 → 上書き合戦でログ混線 (6/2 解析 事故 10)。
  //       事故 5 (paused localStorage 共有) と同じ構造のバグだった。
  //     Phase 9-M (6/3): 全タブ統合ログに再設計 (LOG_KEY_MERGED 単一キー、 マージ書込)
  //       - 各ログ行に t(epoch)+tab(タブID)+uid(一意ID) を付与
  //       - 「上書きではなくマージ (union by uid)」 で全タブのログを 1 キーに統合
  //       - cap 3000 (CRITICAL_TAGS は優先保持)、 throttle 2s、 critical は即時 flush
  //       - reload 速度維持: beforeunload では統合ストアを触らず軽量 flush のみ (RR2 の改善維持)
  //         critical は即時 flush 済み → reload で失うのは非 critical の直近 <2s のみ (許容)
  //       - TAB_ID は sessionStorage (タブ独立、 reload 跨ぎ安定)。 sessionStorage.clear() でも
  //         clearSessionKeepTabId() で TAB_ID を保持 (タブ識別が途中で切り替わらない)
  //       - CSV: 全タブを t(epoch) 順にソート、 datetime_jst 列 (iPhone TZ 非依存で必ず JST) +
  //         tab 列でどのタブの何時のイベントか完全把握。 重要のみ抽出も可能
  //       - 既存 pbLog/pbError は無修正で動く (4 番目 data 引数は optional)
  //       - 画面表示用 LOG_BUFFER (100 件) は据え置き (overlay / Discord 用)
  //     注意: 統合ストアは localStorage 1〜1.6MB 占有。 ls=8KB ルールは診断ストアを除いた値で再解釈
  //
  // [L] 反応駆動 attempt loop (2026-05-28 Phase 9-RR 追加、 2026-05-29 RR2 で改訂)
  //     旧仕様の問題: attempt 間の遅延が固定 (await sleep(intervalFn) = 100-220ms ランダム) のため、
  //                  HTTP レスポンス完了直後にサイト JS のポップアップ描画より早く次の POST を投入する。
  //                  「サーバの反応を見ないで連射」 は人にはできない動作 → BotManager が bot 判定し
  //                  そのユーザーのアクセスを絞る (発売直後に青ボタンが返らない / 応答遅延)。
  //
  //     Phase 9-RR 初版 (5/28、 機能不全): waitForPopupOrTimeout で親 body 監視 → iframe submit の
  //                   特性 (popup が iframe 内に閉じる) を理解しておらず、 常に timeout 5 秒待ち。
  //                   結果 hard timeout 30 秒で 5/10 break する副作用、 grey→reload +450ms 遅延も発生。
  //
  //     Phase 9-RR2 (5/29 改訂): waitForPopupOrTimeout 撤回。 attemptCartAddOnce が返す
  //                   r.hadPopupMarker (iframe 内 HTML に POPUP_TRIGGER_WORDS が含まれるか) で判定。
  //                   true (サーバが反応) → 50-150ms 即時遅延 → 次の POST
  //                   false (反応なし、 /error/4/ 等) → 200-500ms ランダム遅延 → 次の POST
  //     - リズム: HTTP レスポンス (1-9 秒) + 反応判定 + 短い遅延 = サーバ駆動 + ランダム性
  //     - 1 attempt 約 2-2.5 秒 → 10 attempts 約 20-25 秒 → hard timeout 30 秒に余裕で収まる
  //     - grey 判定経路 (line 2076-2174) は無変更 — HIROさん「グレーは即リロードでよい」
  //     - PB の青ボタン 10 回ルール (11 回目以降は無効) は既存 RETRY_LIMIT で対応済み
  //
  // [M] アクセス制御連発時の長め待機 (2026-05-29 Phase 9-RR2 追加)
  //     5/29 12:00 シュピーゲル発売解析で、 access-control が 7 回連続発火 → 36 秒の停滞を確認。
  //     即リロードを連発すると BotManager に絞られ続ける状態が判明。
  //     対策: accessControlStreak >= 5 で reload 前に 15-30 秒ランダム待機。
  //          Akamai に「人らしいリズム」 と見せて絞りを緩和する狙い。
  //     場所: attempt loop 内 r.result === 'ACCESS_CONTROL' の分岐 (line 2296 付近)
  //
  // [N] Phase 10 (2026-06-04 UX + 安全 + 自己診断) — 購入の核心 [A][B][C][H] は無変更
  //     N-1 自己診断: safeRun/safeRunAsync で新コードを囲み、 例外を pbError('error','phase10',...) で
  //         統合ログ (CSV) に必ず残す。 UI 描画失敗でもボタン/購入ループは止めない。
  //     N-2 停止即応答: interruptibleSleep(ms) を新設 (250ms 刻みで paused 確認)。 長い待機
  //         (access-control 15-30s / throttle 30-60s / cooldown 5s / alert jitter 5-10s) を置換。
  //         → 「⏸ 停止」 を押すとどこでも 0.25 秒以内に止まる。 POST/SUCCESS 判定は無変更
  //     N-3 watchdog 抑制: watchdog / vis-recovery に「findTargetProduct が null なら skip」 を追加。
  //         登録外/確保済み商品ページでの 30秒ごと無駄リロード (6/2 事故、 BAN リスク) を停止
  //     N-4 アコーディオン ライブパネル: FAB を details/summary 化。 summary 1 行 (●モード ⏰mm:ss 🛒動作)
  //         を 1 秒ごとライブ更新 (diff-update)。 展開で全詳細 (画面/ボタン検知/カウントダウン等)。
  //         既存 .status/.target/.schedule/.counter は .pb-detail 内に温存 → updateUI 互換。
  //         ボタンは details 外 = 開閉に関わらず常時クリック可能
  //     N-5 ログ強化: CRITICAL_TAGS に attempt-result/attempt/phase10 追加、 dead な post-detail/post-fail 削除
  //
  // [O] Phase 11 (2026-06-05 リロード/即押し高速化 — 6/4 ログ実測に基づく)
  //     実測: 1 リロードサイクル 3714ms。 うち手動でも同じページロード(Akamai) 2078ms は削れない。
  //          ツール固有の overhead = ①青検知後の pre-POST /cart/ fetch ②pagehide の重い統合 flush。
  //     O-A 即押し: 青検知 (bsEarly polling OK) 後の pre-POST /cart/ fetch を撤廃 → knownCartIds=[] で
  //         即ループへ。 1発目を「検知した青」 のうちに POST。 fetch 待ち (数百ms〜1s) で青→grey に
  //         なって空振り (95%) していた主因を除去。 押すのは青のときだけ (i=0 buttonState 再チェックは維持)。
  //         成功判定は cartAddViaFormSubmit の targetOrderId 照合 + 応答 afterIds で担保 (knownCartIds 不要)。
  //         二重発注防止は bsEarly の ALREADY_IN_CART/LIMIT、 混雑は isSiteBusy() で担保。
  //         ※トレードオフ: SAFE モード判定 (cartHasOther) は初回 knownCartIds=[] のため効きにくくなる
  //     O-B リロード高速化: location.reload() が発火する pagehide で毎回 ~1MB の統合 flush をしていた
  //         のを、 _pbReloading フラグ (beforeunload で立つ) で「reload 時は軽量 flush のみ」 に。
  //         タブ kill/裏遷移 (beforeunload 来ない) は従来どおり完全 flush で保全。
  //     計測: ⚡phase11 ログ + 連打開始の boot後Nms + boot sinceNav で次回 CSV から短縮を実測
  //
  // [P] Phase 12 (2026-06-05 Akamai 合格証 Cookie 温存)
  //     6/4-6/5 ログで「Cookie 削除直後のタブが /error/4/ 連発 → 強制ログアウト」 を確認。
  //     原因仮説: Cookie 全削除で Akamai BotManager の合格証 (_abck 等) も捨てている →
  //              毎回「合格証のない新顔」 として再審査 → 遅延 + cart_add 拒否 (/error/4/)。
  //     対策: clearCookiesPreserveConfig は Akamai Cookie (_abck/bm_sz/ak_bmsc/bm_sv/bm_mi/_cf_bm)
  //          を削除対象から除外 (前方一致)。 「継続中の人間セッション」 として速く通す狙い。
  //          PB のカート/セッション Cookie は従来どおり削除。
  //     例外: nukeAllSiteData (アクセス制御からの緊急脱出) だけは includeAkamai=true で全消し。
  //     計測: 🍪cookie ログに「削除N個 / Akamai M個温存 [名前]」 を残す → /error/4/ 率・強制ログアウトの減少を次回 CSV で確認
  //     ※6/5 検証で「Akamai 0個温存」 = Akamai Cookie は HttpOnly で JS から不可視 → Phase 12 は実質 no-op と判明
  //
  // [Q] Phase 13 (2026-06-05 診断強化 + flush 過多削減)
  //     6/5 ログで判明: 1発目 POST は 91% が /error/4/ で弾かれ、 成功は 2発目以降 (ページ読込直後は
  //     PB/Akamai のセッション検証前で cart_add が拒否される疑い)。 原因究明のため計測を強化:
  //     Q-1 post-diag: POST 直前に cart_add フォームの hidden input (名前:値長) + perf 経過 + cookie 数を
  //         記録。 1発目(弾かれ)と2発目(通る)で「トークンが空か / 経過時間」 を CSV で diff できる。
  //     Q-2 reload-diag: safeReload で reload() 呼出時刻をマーカー保存 → 次 boot で reloadToBoot を計測。
  //         sinceNav (Akamai ページロード) と引き算して「ツール側 overhead」 を分離。 グレーリロード遅延の
  //         真因 (ツール側 か Akamai か) を数値で切り分ける。
  //     Q-3 flush 合体: critical タグ (boot/attempt-result 等) の immediate flush が 1 サイクルで多発し
  //         毎回 ~1MB 同期書込 → 体感遅延の疑い。 直近 400ms 以内に flush 済なら同期実行せず throttle に
  //         まとめる (critical ログ自体は in-memory 即記録なので失わない)。
  //
  // [R] Phase 14 (2026-06-05 「1発目が効かない」 の根治 — order 充填待ち)
  //     Phase 13 の post-diag で確定: cart_add フォームの hidden input `order`(注文ID) が
  //     ★空(長さ0)のまま POST されると 100% /error/4/ に弾かれる★ (6/5 ログ 6サンプル相関100%)。
  //     order はページ読込後にプレバン JS が遅れて充填 (perf 2-4s)。 「1発目最速の即押し」 は
  //     perf~2.2s で order 空のまま撃つため必ず無効化されていた = 「1発目のカートインが機能しない」 正体。
  //     対策 (waitForCartOrderFilled + mainLoop 連打開始直前):
  //       - 青検知後、 POST 前に order 欄が非空になるまで 50ms ポーリング (上限 wait_order_fill_max_ms=4000ms)。
  //       - 埋まった瞬間に連打ループへ → 「有効な1発目」 を撃つ。 待ち時間は phase14 ログに記録。
  //       - 上限まで空 → POST せずリロード (空POST は弾かれるだけで BotManager 警戒を招く無駄撃ち)。
  //       - 待ち中に grey 化 → 即離脱しループ i=0 の buttonState() に委譲 (在庫切れ/確保済みを従来通り処理)。
  //     ★購入核心 [A][B][C] のロジック (form submit / 青のみ POST / SUCCESS 検知) は無変更。
  //       本フェーズは「POST を撃つタイミングを order 充填後にずらす」 だけ。
  //     オプション wait_order_fill_before_post=false で旧動作 (即 POST) に即時ロールバック可能。
  //
  // [S] Phase 15 (2026-06-07 配布先を Netlify → GitHub Pages 静的配信へ移行)
  //     背景: 配布先を GitHub (hiro20926/gandam, Public) に変更。 GitHub は静的配信で
  //     Netlify Function が動かない → 従来の「ページで webhook 入力 → ?webhook= でサーバ側
  //     埋込」 が原理的に不可。 かつ Public + 多人数配布なので、 ファイルに特定 webhook を
  //     焼き込むのは禁止 (全員の通知が1宛先に飛ぶ / URL 露出で悪用)。
  //     対応:
  //       - 配布物 (pb_mobile_github/pb-cart.user.js) は webhook 既定値を空で出荷。
  //         各ユーザーは ⚙設定 → Discord Webhook 欄に自分の URL を入力 (この欄は既存実装)。
  //       - notifyDiscord に形式ガード: Discord webhook 形式の URL でなければ送信しない
  //         (空 / プレースホルダー / 誤入力で無駄 POST しない)。 ★通知のみ、 購入核心は無変更。
  //       - index.html: webhook 入力欄を撤去し「インストール後 ⚙設定で入力」 案内に変更、
  //         install ボタンは素の ./pb-cart.user.js (相対) を指す。
  //       - 開発用 pb-cart.user.js は HIROさん の webhook を既定値に保持 (HIROさん 自身用)。
  //         build_zip_v2.sh が pb_mobile_github/ を生成する際にテンプレ経由で空に置換する。
  //
  // [T] Phase 16 (2026-06-09 実験中 / silver-cat 限定): 2発目以降を「本物ボタン+小窓待ち」に
  //     背景: 6/9 ログで 同一ページ iframe 連打は 2発目以降ほぼ全部 /error/4/(bot拒否)、 1発目だけクリーン。
  //     HIROさんの手動フロー(押す→小窓確認→次を押す)を再現する実験。
  //       - 1発目: 従来 iframe (無変更、 凍結核心[A]を守る)
  //       - 2発目以降: realButtonAttemptOnce = 本物ボタン #buy を click() → 小窓(detectCartAddedPopup /
  //         既存エラー文言)を待つ → 入った=order照合でSUCCESS / 在庫なし等=dismiss して次 /
  //         90秒完全沈黙=DEAD_PAGE(ページ死亡)としてリロード救出。 早い見切りリロードはしない(HIROさん指示)。
  //       - real-button モード時はループ全体の 30秒 hard-timeout を無効化(小窓を待ち切るため。 各押下が
  //         iframe~10s / real-button~90s で自己完結するのでループは発散しない)。
  //     ★オプション realbutton_retry (既定 true=実験用) / realbutton_popup_wait_ms (90000)。
  //       ⚙設定の「🧪 2発目以降は本物ボタン」 チェックで即 OFF=従来連打に復帰。
  //     ★★ これは silver-cat 実験専用。 GitHub 本番(#7f2443)は凍結。 本番へ push する前に必ず
  //        実販売ログで弾かれ減少を確認し、 既定値の是非を HIROさんと再判断すること。 ★★
  //
  // [U] Phase 17 (2026-06-10 HIROさん要望): iOS 表示中タブのみ稼働 (設計核心[D]の複数タブ並行を反転)
  //     背景: iOS Safari で複数 p-bandai タブを開くと裏タブも動く → 表示中の1枚だけにしたい。
  //       - mainLoopBody 冒頭: foreground_only=true(既定) かつ document.hidden なら 投入もリロードもせず待機、
  //         一度きりの visibilitychange リスナーで表示復帰時に mainLoop 再開(二重起動ガードで安全)。
  //       - watchdog: 表示中タブのみモードでは hidden タブを 30秒 reload しない(heartbeat は生かす)。
  //     ★オプション foreground_only (既定 true)。 ⚙設定「📱 表示中のタブだけ動かす」 で OFF=全タブ並行(旧[D])。
  //     ※ 過去 事故 5(localStorage paused 全タブ伝播) とは別物。 paused は従来どおり sessionStorage のまま。
  //       本機能は「各タブが自分の表示状態で自律的に止まる/動く」 だけで、 タブ間に状態を伝播しない。
  //     ★2026-06-10: 既定を false に変更(本番安全側)。 Phase16/17 は実験のため ⚙設定の opt-in に統一。
  //
  // [V] Phase 18 (2026-06-10 緊急修正): FAB 自己修復 — p-bandai の「読込後DOM丸ごと差し替え」 対策。 ★全バージョン必須★
  //     実測(ブラウザ調査 2026-06-10): p-bandai が薄い初期ページ(body 3要素)を出し、 直後に DOM を丸ごと
  //     差し替える(body 77-84要素 / documentElement ごと差替、 window 変数は生存)ように変わった。 ツールは
  //     document-end でFABを注入するが直後に消し去られ「モニターが商品ページで消える」状態になった(#7f2443含む全版)。
  //     対策: ensureFloatingUI を 700ms 間隔で回し、 #pb-fab が DOM から消えていたら _uiInjected を戻して
  //     再注入 + mainLoop 再起動。 実ページで wipe を再現し自己修復が復活させることを実証済み。
  //     ★これはオプション無しの常時ON(純粋な修復、 副作用なし)。 #pb-fab 健在時は getElementById チェックのみで即return。
  //     ★injectFloatingUI のイベントは全て FAB ローカル(.onclick on 新要素)なので再実行で document リスナー重複なし。
  //
  // [W] Phase 19 (2026-06-10 緊急修正・[V]の続き): 遅延描画待ち — 「白い画面のままリロード地獄」 の根治。 ★全版必須★
  //     [V]で FAB は残るようになったが、 p-bandai の遅延描画(白いシェル→2〜5秒後に商品DOM)により #buy が
  //     document-end 時点で存在せず、 ツールが NO_BUTTON→即リロードと誤判定 → 描画前に ~500ms でリロード連発
  //     → 商品が永遠に描画されない(実機ログ 562 boots / grey-mid 333)。
  //     対策(mainLoopBody, bsEarly 直前): #buy も #buy_side も無い=未描画なら、 描画(ボタン出現)を
  //     render_wait_max_ms(既定8000ms)まで 200ms ポーリングで待つ。 出たら即抜け、 上限なら続行。
  //     ★#buy が在れば(grey でも)待たない → 発売時の青検知の速さ・攻め戦略は不変。
  //     ※ [V]自己修復 と [W]描画待ち は p-bandai の「読込後DOM丸ごと再描画」 という同一原因の両輪。
  //
  // [X] Phase 25 (2026-06-11 HIROさん要望2件):
  //     (1) 軽量ポーリング廃止 → 監視を「実リロード+描画待ち([W])」に一本化。 ★デフォルト変更だが死コード排除のため例外★
  //         理由: p-bandai 全面SPA化で refreshBuyButton の fetch が空シェルしか取れず #buy が無い → 毎回
  //               refresh-failed リロードに落ちていた(実機ログ 223625: refresh-failed 183回 = 無駄fetch+リロード)。
  //               軽量ポーリングは機能しておらず、リロード頻度は実質 旧方式と同じ。 無駄fetch だけ消す。
  //         実装: loadConfig() で lightweight_polling を常に false に強制(保存済み true も上書き)+ default も false。
  //               UIトグルは disabled + 「無効・廃止」表示に。 refreshBuyButton/pollViaIframe は呼ばれず死コード化(削除はしない=安全)。
  //         ★連打10回は不変(RETRY_LIMIT は cartHasOther=false のため MAX_RETRY_PER_CYCLE=10 のまま)。
  //     (2) FAB がサイト側モーダル(「注文できる商品がございません」等)に覆われて見えなくなる事象を修復。
  //         ensureFloatingUI: FAB中心の最前面要素が FAB(orその子)でなければ覆われている → body末尾へ再append +
  //         z-index 2147483647 で最前面へ復帰(z-index値に依存せず確実)。 700ms 自己修復タイマーで自動。
  //
  // [Y] Phase 26 (2026-06-24 HIROさん指摘で確定・購入核心): 1発目を 6/11 反応駆動に揃える。 ★フリーズ根治★
  //     原因(本日6/24実機確定): p-bandai SPA は描画直後 #buy が一瞬 enabled「カートに入れる」→ 直後に
  //       disabled「在庫がありません」へ落ち着く。 旧来は buttonState の「攻め」(2026-05-09)+ phase11/14 の
  //       「青で即POST/order充填で1発目」(iframe-POST時代の遺物)が、 この transient 青を掴んで1発目を即 click。
  //       非オーダー品の押下は サイト新挙動で 35〜90秒フリーズ(検証ブラウザで click 一発90秒以上停止を再現)。
  //       ※フリーズするのは必ず「1発目」。 2発目以降は元から各反復の buttonState() で grey なら撃たない。
  //       ※在庫切れ品でも cart_add の order は充填済(例 order=2560670000004)→ phase14 の order ゲートは
  //         在庫切れを弾けず無意味化していた。
  //     対策(mainLoopBody, 連打ループ直前):
  //       - settle 確認: stable_blue_settle_ms(既定600ms)の間 buttonState を監視。 grey/already/limit に
  //         落ちたら transient と確定して break → 押す/リロード/成功の判断はループ i=0 の buttonState に委譲。
  //         青のまま持続したら本物の在庫あり(発売開始の青は持続する=攻めは実質維持。 1発目が settle 分だけ遅れる)。
  //       - 旧 phase14(order 充填待ち)は realButton では撤去、 iframe フォールバック時のみ実行。
  //     confirm_stable_blue_before_first=false で旧動作(即押し)に即ロールバック可。 settle 窓は調整可。
  //
  // [Z] Phase 27 (2026-06-25 緊急修正・購入核心): 成功誤判定(カート未投入なのにカート確保と報告)の根治。
  //     原因: CART_ADDED_RE(成功小窓判定)に「商品数変更が出来ない|個数に不足」 が入っていた(Phase 21/6-11 追加)。
  //       6/11 は「在庫不足で個数を減らして入った=成功」と解釈したが、 6/25 実機で ★この小窓が出ても
  //       カート未投入(ボタンは青「カートに入れる」のまま)★ を確認 = 成功とは限らない曖昧文言。 在庫ありの
  //       リックディアス(クワトロ機)で4件中3件 偽の「カート確保」を報告(realbtn-added)。
  //     対策: 「商品数変更が出来ない|個数に不足」 を CART_ADDED_RE(成功) から ERR_RE(非成功・小窓を閉じて継続) へ移動。
  //       成功は明確な文言(カートに商品が追加されました 等)のみに限定。 真にカート入りなら buttonState の
  //       ALREADY_IN_CART/LIMIT(リロード後)で確実に検知される(偽陰性も残らない)。
  //
  // [AA] Phase 29 (2026-06-25 HIROさん指摘で確定・購入核心): 判定の土台を「ボタン表示」から「在庫データ」へ。 ★フリーズ根治の本筋★
  //     経緯: 在庫切れ品の#buyは描画直後 一瞬「カートに入れる」+enabled になり、 本物の青と 文字・色・disabled 全て一致。
  //       色は :disabled 由来(有効時は常に青 rgb(69,156,225)/無効時のみ灰 rgb(153,153,153))→ 色でも見分け不可(Phase28失敗)。
  //       時間窓(Phase26)も殺到時はAkamai遅延で取り逃す(HIROさん却下)。 ＝ボタン表示からは原理的に判定不能。
  //     発見(2026-06-25 実機): ページに server-rendered の在庫データが <script> として入っている:
  //       orderstock_list={"<order>":"○"/"△"/"×"}  ○=在庫あり △=残りわずか ×=在庫無し / all_stock_out=""or"全て在庫無し"
  //       / ecv_non_stock_mark="×"。 在庫あり(○/△)・在庫切れ(×)とも実データで確認済み。
  //     対策(stockJudge + mainLoopBody 1発目ゲート): <script> の textContent を正規表現で読み(iOS Userscriptsの
  //       サンドボックス/CSP に非依存)、 ★在庫あり(×以外)と確証できた時だけ★ 連打ループへ。 在庫切れ/未取得は
  //       押さずリロード。 ＝在庫切れ品を押す→フリーズ が構造的に消える。 時間・色・Akamai遅延に非依存。
  //       単一バリエーションは orderstock_list の唯一キーで即判定(order欄の充填待ち不要=攻めも速い)。
  //     ロールバック: data_stock_judge=false で旧 Phase26/28(settle/色)方式に戻る(else節として温存)。 連打/成功検知は無変更。
  //
  // 過去の事故ログは HISTORY.md、 設計詳細は CLAUDE.md を参照。
  // 動いている仕組みを壊さないための鉄則:
  //   1. 動作中の機能を絶対に触らない
  //   2. デフォルト動作の変更は禁止
  //   3. SUCCESS 検知経路 (cart fetch、 件数判定、 targetOrderId 照合) を消さない
  //   4. キャッシュ動作・状態分離 (sessionStorage paused 等) には意味がある
  //   5. パッチ重ねでなく根本を直す。直前の壊した変更は議論せず巻き戻す
  // =================================================================

  // =================================================================
  // 1. 定数 & ストレージキー
  // =================================================================
  const CONFIG_KEY = 'pb_cart_v2_config';
  const STATE_KEY = 'pb_cart_v2_state';
  const META_KEY = 'pb_cart_v2_meta';

  // ★PREMIUM BANDAI ロゴ画像 (base64 PNG, 240x44, ~20KB)
  const PB_LOGO_B64 = 'data:image/png;base64,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';

  const MAX_RETRY_PER_CYCLE = 10;
  const SAFE_MAX_RETRY_PER_CYCLE = 3;
  const SAFE_RETRY_INTERVAL_MIN_MS = 500;
  const SAFE_RETRY_INTERVAL_MAX_MS = 900;
  const RETRY_INTERVAL_MIN_MS = 100;   // 試行間隔(通常)
  const RETRY_INTERVAL_MAX_MS = 220;
  const POST_LOAD_WAIT_MS = 200;       // 起動遅延
  const ACCESS_CONTROL_ALERT_THRESHOLD = 3;

  // ===== ★Safari WebKit セーフガード対策パラメータ =====
  // 短時間に連続リロードすると iOS Safari が「問題が繰り返し起きました」で強制終了する
  // 30回ごとに 5秒の小休止を入れて検知閾値を下回らせる(常時遅らせるよりHIROさんの体感を優先)
  // ★Safari WebKit セーフガード対策: 連続リロード回数が多いと「問題が繰り返し起きました」が出る
  //   新方式ではリロード頻度が低い(連打10回失敗時のみ)ので、閾値を上げて小休止の発動回避
  const SAFARI_GUARD_RELOAD_THRESHOLD = 80;  // 30→80(新方式運用ではほぼ発動しない)
  const SAFARI_GUARD_PAUSE_MS = 3000;        // 5秒→3秒(発動した時の影響軽減)

  // ===== タイミング・パラメータ(調整はここを編集) =====
  // 大きく2つの方式があり、それぞれに最適化されたパラメータを持つ:
  //   ・新方式(軽量ポーリング): fetch HTMLでDOM部分更新、画面リロードなし、bot検知リスク低
  //   ・旧方式(実リロード): 画面ごとリロード、サイト本来のJS全フロー
  // 各方式に「通常」と「低負荷モード」のセットがある
  const NORMAL_PARAMS = {
    // ★新方式専用: ポーリング(fetch HTML)間隔(短いほど在庫復活に早く反応)
    //   2026-05-10 HIROさん要望「もう少し早く」→ 250→150 に短縮
    //   humanSleep の ±50% ジッターで実値 75〜225ms に揺れる(規則性は維持)
    poll_interval_ms: 150,
    // ★旧方式専用: 実リロード前 sleep(リロード過多でSafariセーフガード回避)
    grey_reload_sleep_ms: 200,         // グレー → 実リロード前
    grey_mid_reload_sleep_ms: 60,      // 連打中グレー化 → 実リロード前(2026-05-10 100→60 に短縮)
    // 共通: アクセス制限・auto_nuke・連打失敗のリロード前 sleep
    access_reload_sleep_ms: 100,       // アクセス制限検知 → リロード前
    auto_nuke_reload_sleep_ms: 200,    // auto_nuke 後 → リロード前
    retry_fail_reload_sleep_ms: 100,   // 10回失敗 → リロード前(青ボタン10回直後にスムーズに)
    // 発売直前リロード戦略
    pre_release_lead_ms: 700,          // 残りNms前に実リロード発射
    // 起動遅延
    post_load_wait_ms: POST_LOAD_WAIT_MS,
    // ★最速仕様(2026-05-09 HIROさん要望: 新発売狙いモードでBAN回避が構造的に成立した前提)
    //   cooldown は保険程度に薄く、 攻めの速度を最優先
    //   2026-05-10 クラッシュ対策: メモリ解放を頻繁に(10→7サイクル)→ iOS Safari の kill 予防
    memory_release_every_cycles: 7,    // 7サイクル毎に Cookie+Cache 解放(2026-05-10 10→7)
    cooldown_every_cycles: 50,         // 50サイクル毎に cooldown(稀に発動)
    cooldown_sleep_ms: 3000,           // 3秒休止(短く、攻めの速度維持)
  };

  // ===== ★低負荷モード用パラメータ(iPhone 11 Pro / 13 Pro 等の古い端末向け) =====
  const LOW_POWER_PARAMS = {
    poll_interval_ms: 300,             // 低負荷時のfetchポーリング間隔(2026-05-10 500→300、通常:150)
    retry_interval_min_ms: 180,        // 試行間隔下限(通常:100)
    retry_interval_max_ms: 320,        // 試行間隔上限(通常:220)
    grey_reload_sleep_ms: 400,         // グレー → 実リロード前(通常:200)
    grey_mid_reload_sleep_ms: 120,     // 連打中グレー化 → 実リロード前(2026-05-10 200→120、通常:60)
    access_reload_sleep_ms: 200,       // アクセス制限 → リロード前(通常:100)
    auto_nuke_reload_sleep_ms: 400,    // auto_nuke 後 → リロード前(通常:200)
    retry_fail_reload_sleep_ms: 200,   // 10回失敗 → リロード前(通常:100)
    pre_release_lead_ms: 900,          // 発売直前リロード(通常:700)
    post_load_wait_ms: 0,              // 起動遅延 mainLoop(通常:0、低負荷でも0:JS未実行窓を捕捉)
    // ★低負荷モード(iPhone 13 Pro 等): 保険として頻度上げるが控えめに
    memory_release_every_cycles: 5,    // 5サイクル毎に解放(通常:10)
    cooldown_every_cycles: 30,         // 30サイクル毎にcooldown(通常:50)
    cooldown_sleep_ms: 5000,           // 5秒休止(通常:3秒)
  };

  const ACCESS_CONTROL_KEYWORDS = [
    'サイト閲覧状況に関するお知らせ',
    'ただいまサイトは大変混雑し',
    '過度なクリックやリロードはさらに混雑する原因',
    // ★Phase 22 (2026-06-11): Akamai(CDN) のエッジエラー/ブロック画面(発売殺到で防御強化時)
    'An error occurred while processing your request',
    'errors.edgesuite.net',
  ];
  const CART_FAIL_KEYWORDS = [
    '大変混み合っているため、カートに入れることができませんでした',
  ];
  const STOCK_OUT_KEYWORDS = [
    'ご希望の商品は在庫がございません',
  ];

  // =================================================================
  // 2. ユーティリティ
  // =================================================================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // ★人間操作風のランダム sleep(bot 検知の主要因「時間間隔の規則性」を排除)
  //   base ms ± jitter%(デフォルト ±50%、 例: 100ms → 50-150ms ランダム)
  //   さらに 5% の確率で 1-3秒の「考える時間」を追加(人間が画面を見る時間を模す)
  function humanSleep(baseMs, jitterRatio) {
    const j = jitterRatio == null ? 0.5 : jitterRatio;
    const min = Math.max(0, baseMs * (1 - j));
    const max = baseMs * (1 + j);
    let actual = min + Math.random() * (max - min);
    // 5% の確率で 「考える時間」を追加(1-3秒)
    if (Math.random() < 0.05) actual += 1000 + Math.random() * 2000;
    return sleep(Math.round(actual));
  }

  // ★Phase 10 (2026-06-04): 中断可能 sleep — 停止ボタンの即応答化
  //   旧問題: 長い await sleep(N) (access-control 15-30s, throttle 30/60s, cooldown 5s 等) の
  //          途中で「⏸ 停止」 を押しても、 sleep が終わるまで paused を見ない → 最大 N 秒止まらない
  //   新: 250ms 刻みで paused を確認し、 true になった瞬間に中断。 戻り値 true=中断された
  //   使い方: if (await interruptibleSleep(ms)) { updateUI(); return; }
  async function interruptibleSleep(ms) {
    const STEP = 250;
    let elapsed = 0;
    while (elapsed < ms) {
      // paused チェック (sessionStorage、 タブ独立)
      try { if (loadState().paused === true) return true; } catch (_) {}
      const chunk = Math.min(STEP, ms - elapsed);
      await sleep(chunk);
      elapsed += chunk;
    }
    // 最後にもう一度確認 (sleep 中に押されたケース)
    try { if (loadState().paused === true) return true; } catch (_) {}
    return false;
  }

  // ★iOS Safari で fetch が応答しないまま hang する問題の対策
  //   AbortController + Promise.race の二重防護で確実に脱出
  //   旧: fetch hang → withCartOpLock が _cartOpLock=true で永久 → mainLoop 全停止
  //   新: 10秒タイムアウト + 12秒の race でどちらか早い方で reject
  const FETCH_TIMEOUT_MS = 10000;
  function fetchWithTimeout(url, options, timeoutMs) {
    const ctrl = new AbortController();
    const timeout = timeoutMs || FETCH_TIMEOUT_MS;
    let tid;
    const abortPromise = new Promise((_, reject) => {
      tid = setTimeout(() => {
        try { ctrl.abort(); } catch (_) {}
        reject(new Error('fetch-timeout'));
      }, timeout);
    });
    const fetchPromise = fetch(url, { ...(options || {}), signal: ctrl.signal });
    return Promise.race([fetchPromise, abortPromise])
      .finally(() => { if (tid) clearTimeout(tid); });
  }
  // ★fetch + body 読み取りまでまとめて total timeout 管理
  //   res.arrayBuffer() が hang するケースも捕捉する
  async function fetchAndReadBuffer(url, options, totalTimeoutMs) {
    const total = totalTimeoutMs || FETCH_TIMEOUT_MS;
    return Promise.race([
      (async () => {
        const res = await fetchWithTimeout(url, options, total);
        const buf = await res.arrayBuffer();
        return { res, buf };
      })(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('fetch-and-read-timeout')), total + 2000))
    ]);
  }

  // 設定モーダル開いてる間はリロード/遷移を止める(編集途中で消えないように)
  function isSettingsModalOpen() {
    const m = document.getElementById('pb-modal');
    return !!(m && m.classList.contains('open'));
  }
  async function waitWhileSettingsOpen(label) {
    let waited = false;
    while (isSettingsModalOpen()) {
      if (!waited) {
        try { updateUI({ status: '⏸ 設定編集中(保存後に再開)' }); } catch(e){}
        try { pbLog('⏸','gate','settings modal open → defer ' + (label||'reload')); } catch(e){}
        waited = true;
      }
      await sleep(500);
    }
    if (waited) try { pbLog('▶','gate','settings modal closed → resume ' + (label||'reload')); } catch(e){}
  }
  // ★iOS Safari セーフガード対策: 「短時間内のリロード回数」ベースのスロットル
  //   実機検証で iPhone 13 Pro が「問題が繰り返し起きました」を発動したケースの分析結果:
  //     - 連打10回(1〜2秒)→ retry_fail_reload(100ms) → reload → boot → STOCK_OUT
  //       → 偽陽性で青検知 → 連打10回 → reload ... の高速サイクル
  //     - サイクルあたり 2〜3秒 × 3〜5回 = 10秒以内に複数リロード → セーフガード発動
  //   旧: 「累計N回ごとに3秒小休止」(回数ベース)…サイクル時間を制御できない
  //   新: 「直近10秒の reload 回数」を localStorage で追跡し、3回目以降は強制スリープで
  //       「10秒に2回以下」を保証する(セーフガード発動条件を構造的に回避)
  const SAFARI_RELOAD_WINDOW_MS = 10000;     // 監視窓: 10秒
  const SAFARI_RELOAD_MAX_IN_WINDOW = 5;     // 窓内に許容する最大 reload 回数(2→5に緩和: 攻めモード撤廃で頻度激減のため)
  const SAFARI_RELOAD_HISTORY_KEY = 'pb_cart_v2_reload_hist';
  function _loadReloadHist() {
    try {
      const arr = JSON.parse(localStorage.getItem(SAFARI_RELOAD_HISTORY_KEY) || '[]');
      const cutoff = Date.now() - SAFARI_RELOAD_WINDOW_MS * 2;
      return arr.filter(t => t > cutoff);  // 古いエントリは破棄
    } catch (e) { return []; }
  }
  function _saveReloadHist(arr) {
    try { localStorage.setItem(SAFARI_RELOAD_HISTORY_KEY, JSON.stringify(arr.slice(-10))); } catch(e) {}
  }
  async function safeReload(label) {
    await waitWhileSettingsOpen(label || 'reload');
    try {
      const now = Date.now();
      const hist = _loadReloadHist();
      const inWindow = hist.filter(t => now - t < SAFARI_RELOAD_WINDOW_MS);
      if (inWindow.length >= SAFARI_RELOAD_MAX_IN_WINDOW) {
        // ★既に窓内に2回以上リロード済 → 3回目を発射するとセーフガード発動の可能性大
        //   最古のエントリが10秒経過するまで待機(=次のリロードで窓内が再度2回になる)
        const oldest = inWindow[0];
        const waitMs = (oldest + SAFARI_RELOAD_WINDOW_MS) - now + 200;  // +200ms 余裕
        if (waitMs > 0 && waitMs < 15000) {
          try { pbLog('💤','guard',`Safari保護: 直近${SAFARI_RELOAD_WINDOW_MS/1000}秒に${inWindow.length}回リロード → ${waitMs}ms 待機 (label=${label})`); } catch(e){}
          try { updateUI({ status: `💤 セーフガード回避のため ${Math.round(waitMs/1000)}秒待機…` }); } catch(e){}
          await sleep(waitMs);
        }
      }
      // ★2026-07-07 (人間リロード間隔 / HIROさん「カート無効化=リロードが速すぎ」):
      //   前回リロードから最低 human target(既定3.0-5.5秒, ランダム揺らぎ付き)空ける。 BotManager に
      //   「2.5秒台/1秒未満連発」の機械的リズムを読ませない。 描画待ちで既に空いていれば追加待ちゼロ=遅くならない。
      try {
        const _opts = (loadConfig().options || {});
        const _hMin = _opts.human_reload_min_ms != null ? _opts.human_reload_min_ms : 3000;
        const _hJit = _opts.human_reload_jitter_ms != null ? _opts.human_reload_jitter_ms : 2500;
        const _lastReload = hist.length ? hist[hist.length - 1] : 0;
        if (_lastReload && _hMin > 0) {
          const _sinceLast = Date.now() - _lastReload;
          const _target = _hMin + Math.random() * _hJit;
          if (_sinceLast < _target) {
            const _wait = Math.round(_target - _sinceLast);
            try { pbLog('🚶','human-reload',`人間リロード間隔: 前回から${_sinceLast}ms → +${_wait}ms待機(目標${Math.round(_target)}ms, label=${label||''})`); } catch(_){}
            try { updateUI({ status: `🚶 人間ペース待機 ${(_wait/1000).toFixed(1)}秒 → リロード` }); } catch(_){}
            if (await interruptibleSleep(_wait)) { return; }  // 停止押下で中断(リロードしない)
          }
        }
      } catch (_) {}
      // 履歴に今回の reload を追加
      hist.push(Date.now());
      _saveReloadHist(hist);
    } catch (e) {}
    // ★リロード直前にログを flush(直前のログが localStorage に書き込まれずに消えるのを防ぐ)
    try { flushLogBuffer(); } catch (e) {}
    // ★Phase 13 (2026-06-05): reload() 呼び出し時刻を記録 → 次 boot で「reload()→boot」 を計測
    //   sinceNav (ナビ開始→boot=Akamaiページロード) と引き算すれば「ツール側 overhead」 が分離できる
    try { localStorage.setItem('pb_cart_v2_reload_marker', JSON.stringify({ t: Date.now(), label: label || '' })); } catch (_) {}
    location.reload();
  }
  async function safeNavigate(url, label) {
    await waitWhileSettingsOpen(label || 'navigate');
    // 別URLへの遷移はリロードと違いセーフガードの対象外なので履歴クリア
    try { localStorage.removeItem(SAFARI_RELOAD_HISTORY_KEY); } catch (e) {}
    try { flushLogBuffer(); } catch (e) {}
    location.href = url;
  }
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  const uuid = () => 'pb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  function getKind(p) {
    if (p.kind === 'new' || p.kind === 'restock') return p.kind;
    return p.release_time ? 'new' : 'restock';
  }
  // ★低負荷モード判定(古いiPhone向け、安定性優先)
  //   ON時: 試行間隔↑・リロード間隔↑ で iPhone のメモリ・通信負荷を軽減
  //   ※連打回数(青ボタン時)は通常通り10回維持
  let _LOW_POWER_CACHE = false;
  function refreshLowPower() {
    try { _LOW_POWER_CACHE = !!(loadConfig().options || {}).low_power_mode; }
    catch (e) { _LOW_POWER_CACHE = false; }
  }
  function isLowPower() { return _LOW_POWER_CACHE; }
  // 現在のモードに応じた timing parameter を取得
  function timing() { return _LOW_POWER_CACHE ? LOW_POWER_PARAMS : NORMAL_PARAMS; }

  // ★軽量ポーリング(差分更新方式・最適化版):
  //   fetch HTML → 正規表現で最小限の情報だけ抽出 → 変化があればピンポイント更新
  //   高速化: DOMParserフルパースを廃止、innerHTML 全置換も廃止
  //   省CPU: 前回と同じ状態ならDOM操作スキップ(変化検知)
  //   bot対策: HTML 1リクエストのみ、画像/CSS/JSの再ロードなし
  let _lastPollSignature = '';  // 前回のポーリング結果(変化検知用)
  async function refreshBuyButton() {
    try {
      const res = await fetchWithTimeout(location.href, { credentials: 'include', cache: 'no-cache' });
      if (!res.ok) return { ok: false, status: res.status };
      const buf = await res.arrayBuffer();
      const html = decodeHtmlBuffer(buf, res.headers.get('content-type'));
      if (detectAccessControl(html)) return { ok: false, accessControl: true };

      // ★軽量解析: 正規表現で必要部分だけ抽出(DOMParser 不要)
      const btnMatch = html.match(/<button[^>]*\bid=["']buy["'][^>]*>([\s\S]*?)<\/button>/);
      if (!btnMatch) return { ok: false, noBuyButton: true };
      const btnOuter = btnMatch[0];
      const btnText = btnMatch[1].replace(/<[^>]+>/g, '').trim();
      const btnDisabled = /\bdisabled\b/i.test(btnOuter);

      // form 部分(hidden inputs 含む)を抽出
      const formMatch = html.match(/<form[^>]*\baction=["'][^"']*\/cart_add\/[^"']*["'][^>]*>([\s\S]*?)<\/form>/);
      const formInner = formMatch ? formMatch[1] : null;
      const formText = formInner ? formInner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500) : '';
      const fullText = btnText + ' ' + formText;

      // ★HTMLパース由来の判定(サーバから来た生HTMLが本物の在庫状態を持つ)
      //   ★方針(2026-05-09 HIROさん指示): JS書き換え後のDOMは信用しない。
      //     ガンダムベース店舗系の商品は JS で「在庫がありません」表示を出すが、
      //     ★サーバ側のセッションには本当に在庫が戻る瞬間がある★
      //     その瞬間を捉えるには「生HTML が青 → cart_add 連打」が必要。
      //     HIROさん運用の「攻め」戦略 = 表示が在庫切れでも、生HTMLが青なら連打する。
      //     リロードサイクルが高頻度になる問題は、
      //     safeReload の「直近10秒2回まで」スロットルで構造的に防止済み。
      // ★判定順序: 「攻め」を有効にするため BLUE を STOCK_OUT より先に判定する
      //   buttonState() と整合性をとる(2026-05-09 HIROさん指示で旧来挙動に戻す)
      //   ガンダムベース系の商品は form内 500文字に「在庫がありません」が含まれている場合があり、
      //   STOCK_OUT を先に判定すると常時 STOCK_OUT で攻めモードに突入しない
      //   = HIROさんが見ている「画面据え置き、poll数値だけ動く」現象の原因
      let bs;
      if (CART_DONE_KEYWORDS.some(k => fullText.includes(k))) {
        bs = { clickable: false, reason: 'ALREADY_IN_CART', text: btnText };
      } else if (BLUE_BTN_PATTERN.test(btnText) && !btnDisabled) {
        // ★青パターン+!disabled → OK(攻めモード突入のスイッチ)
        bs = { clickable: true, reason: 'OK', text: btnText };
      } else if (STOCK_OUT_BTN_KEYWORDS.some(k => fullText.includes(k))) {
        bs = { clickable: false, reason: 'STOCK_OUT', text: btnText };
      } else if (LIMIT_BTN_KEYWORDS.some(k => fullText.includes(k))) {
        bs = { clickable: false, reason: 'LIMIT', text: btnText };
      } else if (btnDisabled) {
        bs = { clickable: false, reason: 'DISABLED', text: btnText };
      } else {
        bs = { clickable: false, reason: 'TEXT', text: btnText };
      }

      // ★変化検知
      const sig = `${btnText}|${btnDisabled}|${bs.reason}|${formInner ? formInner.length : 0}`;
      const noChange = (sig === _lastPollSignature);
      _lastPollSignature = sig;

      if (!noChange) {
        // ★差分更新: hidden inputs/select は form 送信のため必須で更新
        if (formInner) {
          const curForm = document.querySelector('form[action*="/cart_add/"]');
          if (curForm) {
            const inputRegex = /<input\b[^>]*\bname=["']([^"']+)["'][^>]*\bvalue=["']([^"']*)["'][^>]*>/g;
            let m;
            while ((m = inputRegex.exec(formInner)) !== null) {
              const inp = curForm.querySelector(`input[name="${m[1]}"]`);
              if (inp && inp.type === 'hidden' && inp.value !== m[2]) {
                inp.value = m[2];
              }
            }
            const newUnitMatch = formInner.match(/<select[^>]*\bname=["']unit["'][^>]*>([\s\S]*?)<\/select>/);
            if (newUnitMatch) {
              const curSel = curForm.querySelector('select[name="unit"]');
              if (curSel && curSel.innerHTML !== newUnitMatch[1]) {
                curSel.innerHTML = newUnitMatch[1];
              }
            }
          }
        }
      }

      return { ok: true, bs, changed: !noChange };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  function applyQuantityCap(p) {
    const cap = getKind(p) === 'new' ? 1 : 3;
    let q = Math.max(1, Math.min(p.quantity || 1, cap));
    // ★商品ページの数量select(unit)が許す最大値で自動頭打ち
    //   通常商品(qty=[1])で「個数3」設定でも unit=1 を送る
    //   再販で既にカート1個入り(残2個)で「個数3」設定でも unit=2 を送る
    try {
      const sel = (typeof document !== 'undefined') ? document.querySelector('select[name="unit"]') : null;
      if (sel && sel.options && sel.options.length > 0) {
        const max = Math.max(0, ...Array.from(sel.options).map(o => parseInt(o.value, 10) || 0));
        if (max > 0 && max < q) {
          try { pbLog('🔧','quantity',`設定${q}個 → サーバ上限${max}個に自動調整`); } catch(_) {}
          q = max;
        }
      }
    } catch (e) {}
    return q;
  }

  // =================================================================
  // 3. ログシステム
  // =================================================================
  const LOG_KEY = 'pb_cart_v2_logs';
  // ★500件: 1サイクル≒18ログなので 約27サイクル分。
  //   メモリ解放(5/30サイクル毎)の発火履歴を白画面解析時に追えるよう拡張
  // ★2026-05-10 HIROさん iOS Safari クラッシュ対策: メモリ削減のため 500→100 に縮小
  //   500件保持時 localStorage ls=40KB → 100件で約 8KB に削減
  //   Discord送信の slice(-100) も対応済み(同じく100件以下)
  // ★2026-05-22 Phase 9-C: 画面表示用バッファ(LOG_BUFFER)は 100 件のまま据え置き、
  //   診断/分析用に LOG_BUFFER_FULL / LOG_BUFFER_CRITICAL を別 key で新設(Amazon bot for iOS と同方式)
  const LOG_MAX = 100;
  // ★リロード跨ぎでログを保持(白画面後の原因解析用)
  //   旧: window 変数のみ → リロードで全消滅 → 落ちる前のログが見えない
  //   新: localStorage に throttle 保存 + boot 時に復元 → 直前N件が常に取れる
  const LOG_BUFFER = (() => {
    try {
      const raw = localStorage.getItem(LOG_KEY);
      if (raw) return JSON.parse(raw).slice(-LOG_MAX);
    } catch (e) {}
    return [];
  })();
  let _logSaveTimer = null;
  function saveLogBufferThrottled() {
    if (_logSaveTimer) return;
    _logSaveTimer = setTimeout(() => {
      _logSaveTimer = null;
      try { localStorage.setItem(LOG_KEY, JSON.stringify(LOG_BUFFER)); } catch (e) {}
    }, 3000);  // ★2026-05-10 1秒→3秒(localStorage 書き込み頻度削減 → iOS Safari 圧迫軽減)
  }
  function flushLogBuffer() {
    if (_logSaveTimer) { clearTimeout(_logSaveTimer); _logSaveTimer = null; }
    try { localStorage.setItem(LOG_KEY, JSON.stringify(LOG_BUFFER)); } catch (e) {}
  }

  // =================================================================
  // ★Phase 9-C (2026-05-22): 構造化ログ + 大容量バッファ + CSV エクスポート
  // =================================================================
  // 目的: 5/21 発売解析で判明、 重要警告 (アクセス制御等) が 100 件制限で流れて検証不能。
  //       Amazon bot for iOS (v0.3.8.78) と同方式で、 全イベント網羅 + 重要タグ別保護を実装。
  //
  // 設計:
  // - LOG_BUFFER_FULL (5000 件): 全イベントを構造化エントリで保存。 CSV 主出力源
  // - LOG_BUFFER_CRITICAL (1000 件): CRITICAL_TAGS だけ別バッファに重複保存 (主溢れ対策)
  // - 書込 throttle 500ms (毎ログ JSON.stringify する I/O コスト集約)
  // - beforeunload / pagehide / visibilitychange で flush (取りこぼし防止)
  // - 構造化エントリ形式: { ts, perfMs, level, emoji, category, message, data? }
  //   既存 pbLog/pbError は無修正で動く (4 番目 data 引数は optional)
  // =================================================================
  // ★Phase 9-M (2026-06-03): 全タブ統合ログ (localStorage、 マージ書込)
  // =================================================================
  // 旧仕様 (Phase 9-C) の致命的問題: LOG_BUFFER_FULL を全タブ共有 localStorage キーに
  //   「上書き」 保存していた。 タブ B が boot 時にタブ A の履歴を継承 → 上書き合戦で混線。
  //   6/2 解析で ts ジャンプ (08:29→10:20)、 「00時台 2511件」 等の混線を確認 (事故 10)。
  //   → 事故 5 (paused localStorage 共有) と同じ構造。
  //
  // 新仕様: 各ログ行に t(epoch)+tab(タブID)+uid(一意ID) を付与し、
  //   「上書きではなくマージ(union by uid)」 で全タブのログを 1 キーに統合する。
  //   - 全タブのログが時刻順 (t) に統合される → どのタブで何が起きたか CSV で完全把握
  //   - タブごとに自分の recent を保持し、 flush 時に毎回 union → 他タブの clobber に強い
  //   - cap 3000、 critical タグは優先保持 (flood で重要イベントが消えない)
  //   - throttle 2s、 critical タグは即時 flush (success/access-control 等は絶対残す)
  //   - reload 速度維持: beforeunload では重い統合 flush をしない (RR2 の改善を維持)。
  //     critical は即時 flush 済み、 非 critical の直近 <2s のみ reload で取りこぼす可能性 (許容)
  const LOG_KEY_MERGED = 'pb_cart_v2_logs_merged';
  const LOG_MAX_MERGED = 3000;   // 全タブ合計、 約 1.6MB (localStorage 5-10MB に余裕)
  const LOG_MAX_MINE = 1500;     // このタブが in-memory で保持する自分のログ (clobber 対策)
  // 重要タグ — cap 時に優先保持 + 即時 flush
  // ★Phase 10 (2026-06-04): attempt-result / attempt を追加 (BAN 解析の生命線、 finalPath や markers が消えると困る)
  //   + phase10 (自己診断の例外) を追加。 dead だった post-detail / post-fail は削除。
  const CRITICAL_TAGS = new Set([
    'access-control', 'site-busy', 'session-anomaly', 'session', 'cart-err',
    'cart', 'success',
    'boot', 'recovery', 'nuke', 'protect',
    'attempt-result', 'attempt',   // ★POST 結果 (finalPath / markers / timings) — 最重要診断
    'phase10', 'phase11',          // ★Phase 10/11 新コードの例外・計測 (即テストの不具合追跡用)
    'post-diag', 'reload-diag',    // ★Phase 13 診断 (1発目究明 / リロード時間計測)
    'phase14',                     // ★Phase 14 order 充填待ち (有効1発目の核心計測)
    'phase26',                     // ★Phase 26 1発目settle確認 (transient青の誤爆=フリーズ防止)
    'phase29',                     // ★Phase 29 在庫データ判定 (orderstock_listで在庫あり確証してから押下)
    'popup-struct',                // ★Phase 30b 注文不可アラートの実構造ログ (本物の閉じるボタン特定用)
    'native-alert',                // ★Phase 31 ネイティブalert()横取り (抑止した文言の記録=フリーズ根治)
    'settings-open',               // ★2026-07-06 設定描画時間の計測(数秒フリーズの原因究明)
    'human-reload',                // ★2026-07-07 人間リロード間隔(BotManager絞り/カート無効化回避)
    'phase16',                     // ★Phase 16 本物ボタン+小窓待ち (実験の核心計測)
    'foreground',                  // ★Phase 17 表示中タブのみ稼働 (裏タブ停止/再開)
    'ui-heal',                     // ★Phase 18 FAB自己修復 (DOM差し替えで消えたFABの再注入)
    'ui-front',                    // ★Phase 25 FAB最前面復帰 (サイトモーダルに覆われたFABを前面へ)
    'render',                      // ★Phase 19 遅延描画待ち (白いシェル→商品描画の待機計測)
    'akamai-block',                // ★Phase 22 Akamai防御強化検知→クールダウン
  ]);
  // ★タブ ID (sessionStorage、 タブ独立 + reload 跨ぎで安定。 事故 5 paused と同じ流儀)
  const TAB_ID = (() => {
    try {
      let id = sessionStorage.getItem('pb_cart_v2_tab_id');
      if (!id) {
        id = 'T' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5);
        sessionStorage.setItem('pb_cart_v2_tab_id', id);
      }
      return id;
    } catch (e) { return 'T0'; }
  })();
  const _LOG_BOOT_ID = Date.now().toString(36).slice(-4);  // boot 毎の uid 衝突回避
  let _logSeq = 0;
  // このタブの recent ログ (in-memory)。 boot 時に統合ストアから自分の分を復元
  const LOG_MERGED_MINE = (() => {
    try {
      const raw = localStorage.getItem(LOG_KEY_MERGED);
      if (raw) return JSON.parse(raw).filter(e => e && e.tab === TAB_ID).slice(-LOG_MAX_MINE);
    } catch (e) {}
    return [];
  })();
  // cap: critical を優先保持しつつ全体を LOG_MAX_MERGED に収める
  function _capMerged(arr) {
    if (arr.length <= LOG_MAX_MERGED) return arr;
    const crit = arr.filter(e => e && CRITICAL_TAGS.has(e.category));
    const non = arr.filter(e => !(e && CRITICAL_TAGS.has(e.category)));
    const room = Math.max(0, LOG_MAX_MERGED - crit.length);
    let result = crit.concat(non.slice(-room));
    result.sort((a, b) => (a.t || 0) - (b.t || 0));
    if (result.length > LOG_MAX_MERGED) result = result.slice(-LOG_MAX_MERGED);
    return result;
  }
  // 統合ストアにこのタブの recent をマージ (union by uid) して書き戻す
  let _mergedSaveTimer = null;
  let _lastMergedFlushMs = 0;  // ★Phase 11: 計測用 (直近 flush の所要 ms)
  function flushMergedLog() {
    if (_mergedSaveTimer) { clearTimeout(_mergedSaveTimer); _mergedSaveTimer = null; }
    try {
      const _t0 = Date.now();
      let store = [];
      try { const raw = localStorage.getItem(LOG_KEY_MERGED); if (raw) store = JSON.parse(raw); } catch (_) {}
      const map = new Map();
      for (const e of store) { if (e && e.uid) map.set(e.uid, e); }
      for (const e of LOG_MERGED_MINE) { if (e && e.uid) map.set(e.uid, e); }  // 自分のが最新 (level 更新反映)
      let merged = Array.from(map.values());
      merged.sort((a, b) => (a.t || 0) - (b.t || 0));
      merged = _capMerged(merged);
      localStorage.setItem(LOG_KEY_MERGED, JSON.stringify(merged));
      _lastMergedFlushMs = Date.now() - _t0;  // ★Phase 11: flush コスト計測
    } catch (_) {}
  }
  // ★Phase 13 (2026-06-05): immediate flush の連続実行を合体 (グレーリロード遅延対策)
  //   問題: boot / attempt-result / post-diag 等 critical タグが 1 サイクルで何度も発火 →
  //         そのたびに ~1MB の同期 flush が走り、 リロード/ループの体感を遅くしていた疑い。
  //   対策: immediate でも「直近 400ms 以内に flush 済みなら同期実行せず throttle に回す」。
  //         critical ログ自体は in-memory には即入るので失わない。 書込みコストだけ間引く。
  let _lastFlushAt = 0;
  function scheduleMergedFlush(immediate) {
    if (immediate) {
      const since = Date.now() - _lastFlushAt;
      if (since >= 400) {
        flushMergedLog();
        _lastFlushAt = Date.now();
        return;
      }
      // 直近に flush 済 → 同期実行を避けて短い throttle にまとめる
      if (_mergedSaveTimer) return;
      _mergedSaveTimer = setTimeout(() => { flushMergedLog(); _lastFlushAt = Date.now(); }, 500);
      return;
    }
    if (_mergedSaveTimer) return;
    _mergedSaveTimer = setTimeout(() => { flushMergedLog(); _lastFlushAt = Date.now(); }, 2000);
  }
  // ★Phase 9-RR2 (2026-05-29) 継続: reload 直前は軽量 flush のみ (LOG_BUFFER 8KB)。
  //   統合ストア (重い) は beforeunload で触らない → reload 速度維持。
  //   critical は即時 flush 済みなので reload で失うのは非 critical の直近 <2s のみ。
  function flushLogBuffersLight() {
    if (_logSaveTimer) { clearTimeout(_logSaveTimer); _logSaveTimer = null; }
    try { localStorage.setItem(LOG_KEY, JSON.stringify(LOG_BUFFER)); } catch (e) {}
  }
  // タブ kill / 裏遷移時は統合ストアも flush (取りこぼし防止)
  function flushAllLogBuffers() {
    flushLogBuffersLight();
    flushMergedLog();
  }
  // ★Phase 11 (2026-06-05): reload と「タブ離脱(kill/裏遷移)」 を区別して flush を出し分ける
  //   問題: location.reload() は pagehide を発火 → 旧実装は毎リロードで重い統合 flush (~1MB) →
  //         「リロード判断→ナビ開始」 に数百ms上乗せ = 手動より遅い一因
  //   対策: reload/navigate は beforeunload が必ず先に発火するので _pbReloading=true を立てる →
  //         pagehide/visibilitychange はそれを見て「軽量 flush のみ」 (統合ストアは throttle+即時flushで担保)。
  //         タブ kill/バックグラウンド (beforeunload が来ない iOS のケース) は従来どおり完全 flush で保全。
  let _pbReloading = false;
  function _onBeforeUnload() {
    _pbReloading = true;            // 意図的な reload/navigate の印
    flushLogBuffersLight();         // 軽量のみ → reload 高速
  }
  function _onPageHideOrHidden() {
    if (_pbReloading) {
      flushLogBuffersLight();       // reload 中 → 軽量 (統合は throttle+critical即時で担保)
    } else {
      flushAllLogBuffers();         // タブ kill/裏遷移 → 完全保全
    }
  }
  try {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', _onBeforeUnload, { capture: true });
      window.addEventListener('pagehide', _onPageHideOrHidden, { capture: true });
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') _onPageHideOrHidden();
      }, { capture: true });
    }
  } catch (e) {}

  // ★Phase 9-M (2026-06-03): CSV エクスポート (全タブ統合ログ)
  //   scope: 'full' = 統合ストア全件 / 'critical' = CRITICAL_TAGS だけ抽出
  //   出力前にこのタブの recent を sync flush → 統合ストアを読む → t(epoch) 順ソート
  //   → どのタブ (tab 列) で何が起きたかを時刻順 (datetime_jst 列) で完全把握できる
  //   形式: BOM 付き UTF-8、 列 = datetime_jst,t,tab,ts,perfMs,level,emoji,category,message,data
  function _csvEscape(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1 || s.indexOf('\r') !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }
  // epoch(ms) → JST 文字列 (iPhone TZ 設定に依存せず必ず日本時間)
  function _epochToJst(t) {
    if (!t) return '';
    try {
      const d = new Date(t + 9 * 3600 * 1000);  // UTC + 9h
      const p = (n) => String(n).padStart(2, '0');
      return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' +
        p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()) + '.' +
        String(d.getUTCMilliseconds()).padStart(3, '0');
    } catch (_) { return ''; }
  }
  function exportLogToCsv(scope) {
    const useScope = (scope === 'critical') ? 'critical' : 'full';
    // ★出力前にこのタブの最新を統合ストアに反映
    try { flushMergedLog(); } catch (_) {}
    // 統合ストアを読む (全タブ分)
    let store = [];
    try { const raw = localStorage.getItem(LOG_KEY_MERGED); if (raw) store = JSON.parse(raw); } catch (_) {}
    store.sort((a, b) => (a.t || 0) - (b.t || 0));  // 全タブ時刻順
    const buffer = (useScope === 'critical')
      ? store.filter(e => e && CRITICAL_TAGS.has(e.category))
      : store;
    const header = 'datetime_jst,t,tab,ts,perfMs,level,emoji,category,message,data';
    const rows = buffer.map((e) => {
      let dataJson = '';
      if (e && e.data !== undefined && e.data !== null) {
        try { dataJson = JSON.stringify(e.data); } catch (_) { dataJson = String(e.data); }
      }
      return [
        _csvEscape(_epochToJst(e ? e.t : 0)),
        _csvEscape(e ? e.t : ''),
        _csvEscape(e ? e.tab : ''),
        _csvEscape(e ? e.ts : ''),
        _csvEscape(e && e.perfMs !== null && e.perfMs !== undefined ? e.perfMs : ''),
        _csvEscape(e ? e.level : ''),
        _csvEscape(e ? e.emoji : ''),
        _csvEscape(e ? e.category : ''),
        _csvEscape(e ? e.message : ''),
        _csvEscape(dataJson),
      ].join(',');
    });
    const csvBody = '﻿' + header + '\n' + rows.join('\n');

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fname = 'pb-cart-log-' +
      now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' +
      pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()) +
      (useScope === 'critical' ? '-critical' : '') + '.csv';

    try {
      const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fname;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try { document.body.removeChild(a); } catch (_) {}
        try { URL.revokeObjectURL(url); } catch (_) {}
      }, 500);
      return { ok: true, fname: fname, count: buffer.length, scope: useScope };
    } catch (e) {
      return { ok: false, fname: fname, count: buffer.length, scope: useScope, error: e && e.message };
    }
  }
  // 設定モーダル等から呼べるよう window に登録
  try {
    if (typeof window !== 'undefined') {
      window._pbExportLogCsv = exportLogToCsv;
    }
  } catch (e) {}
  const ERROR_KEY = 'pb_cart_v2_errors';
  const ERROR_MAX = 8;
  // 起動時に localStorage から復元(リロードを跨いで残す)
  const ERROR_BUFFER = (() => {
    try {
      const raw = localStorage.getItem(ERROR_KEY);
      if (raw) {
        // info は表示しない仕様変更に伴い、起動時に古い info を一掃
        const parsed = JSON.parse(raw).filter(e => e.level !== 'info');
        return parsed.slice(-ERROR_MAX);
      }
    } catch (e) {}
    return [];
  })();
  function saveErrorBuffer() {
    try { localStorage.setItem(ERROR_KEY, JSON.stringify(ERROR_BUFFER)); } catch(e) {}
  }
  // 起動直後に書き戻し(過去 info エントリ掃除を localStorage に反映)
  saveErrorBuffer();
  function pbLog(emoji, category, message, data) {
    const t = new Date();
    const ts = String(t.getHours()).padStart(2,'0') + ':' +
               String(t.getMinutes()).padStart(2,'0') + ':' +
               String(t.getSeconds()).padStart(2,'0') + '.' +
               String(t.getMilliseconds()).padStart(3,'0');
    const entry = `[${ts}] ${emoji} ${category}: ${message}`;
    LOG_BUFFER.push(entry);
    if (LOG_BUFFER.length > LOG_MAX) LOG_BUFFER.shift();
    console.log('[PB-CART]', entry);
    saveLogBufferThrottled();  // ★リロード跨ぎ保存(throttle で1秒に1回まで)
    // ★Phase 9-M (2026-06-03): 構造化ログを全タブ統合ストアに保存
    //   各行に t(epoch)+tab+uid を付与 → マージ書込で混線しない (事故 10 対策)
    try {
      const nowMs = Date.now();
      const perfMs = (typeof window !== 'undefined' && window._pbBootAt)
        ? (nowMs - window._pbBootAt) : null;
      const mEntry = {
        t: nowMs,                               // 絶対時刻 (epoch、 TZ 非依存 → 全タブ時刻順ソート可)
        tab: TAB_ID,                            // どのタブか
        uid: TAB_ID + '-' + _LOG_BOOT_ID + '-' + (_logSeq++),  // 一意 ID (マージ dedup 用)
        ts: ts,
        perfMs: perfMs,
        level: 'info',                          // pbError 経由なら後段で上書き
        emoji: emoji || '',
        category: category || '',
        message: message || '',
      };
      if (data !== undefined && data !== null) mEntry.data = data;
      LOG_MERGED_MINE.push(mEntry);
      if (LOG_MERGED_MINE.length > LOG_MAX_MINE) LOG_MERGED_MINE.shift();
      // critical タグは即時 flush (success/access-control 等は絶対残す)、 他は 2s throttle
      scheduleMergedFlush(CRITICAL_TAGS.has(category));
    } catch (_e) {}
    // 診断オーバーレイが開いていれば最新ログをそこに反映(スナップショットを最新に)
    const el = (typeof document !== 'undefined') ? document.getElementById('pb-diag-log') : null;
    if (el && !el.dataset.expanded) {
      el.textContent = LOG_BUFFER.slice(-30).join('\n');
      el.scrollTop = el.scrollHeight;
    }
  }
  // 上部パネルに記録: error/warn/success は表示、info はログのみ
  function pbError(level, category, message, data) {
    const t = new Date();
    const ts = String(t.getHours()).padStart(2,'0') + ':' +
               String(t.getMinutes()).padStart(2,'0') + ':' +
               String(t.getSeconds()).padStart(2,'0');
    const icMap = { error:'❌', warn:'⚠', success:'✅', info:'ℹ' };
    const ic = icMap[level] || 'ℹ';
    pbLog(ic, category, message, data);
    // ★Phase 9-M (2026-06-03): 統合ログの直前エントリの level を上書き
    //   pbLog はデフォルト 'info' で push するので、 pbError 経由なら正しい level に直す
    //   (同じ参照なので flush 時に正しい level で書かれる)
    try {
      const lastMine = LOG_MERGED_MINE[LOG_MERGED_MINE.length - 1];
      if (lastMine && lastMine.category === category && lastMine.message === message) {
        lastMine.level = level;
        // level が warn/error/success に変わった = critical 相当 → 即時 flush で確実に残す
        if (level !== 'info') { try { scheduleMergedFlush(true); } catch (_) {} }
      }
    } catch (_e) {}
    if (level === 'info') return;  // info はログのみ
    // 直前と同一(category+message)なら追加しない(リロード毎の同エラー連発防止)
    const last = ERROR_BUFFER[ERROR_BUFFER.length - 1];
    if (last && last.category === category && last.message === message) {
      last.ts = ts;
      saveErrorBuffer();
      try { renderErrorPanel(); } catch(e) {}
      return;
    }
    ERROR_BUFFER.push({ ts, level, category, message });
    if (ERROR_BUFFER.length > ERROR_MAX) ERROR_BUFFER.shift();
    saveErrorBuffer();
    try { renderErrorPanel(); } catch(e) {}
  }

  // ★Phase 10 (2026-06-04): 自己診断ラッパー
  //   HIROさん 要望「即テストするので、 不具合があればログで原因が分かるように」 に応える。
  //   新規 Phase 10 コード (停止 sleep / watchdog / アコーディオン UI 等) を safeRun で囲み、
  //   例外を握りつぶさず統合ログ (pbError → merged CSV) に必ず残す。
  //   UI 描画失敗などで例外が出ても、 ツール本体 (購入ループ) は止めない。
  function safeRun(label, fn, fallback) {
    try {
      return fn();
    } catch (e) {
      try {
        pbError('error', 'phase10', `${label} で例外: ${(e && e.message) || e}`,
          { stack: (e && e.stack) ? String(e.stack).substring(0, 300) : null });
      } catch (_) {}
      return fallback;
    }
  }
  async function safeRunAsync(label, fn, fallback) {
    try {
      return await fn();
    } catch (e) {
      try {
        pbError('error', 'phase10', `${label} で例外(async): ${(e && e.message) || e}`,
          { stack: (e && e.stack) ? String(e.stack).substring(0, 300) : null });
      } catch (_) {}
      return fallback;
    }
  }

  // =================================================================
  // 4. 設定の読み書き
  // =================================================================
  function defaultConfig() {
    return {
      version: 2,
      products: [],
      options: {
        post_success_action: 'stop', // 'stop' | 'safe' | 'normal'
        auto_nuke_when_empty: true,
        periodic_cleanup_enabled: true,    // 定期キャッシュクリア(アクセス制限予防)
        periodic_cleanup_minutes: 10,      // 何分ごと
        low_power_mode: false,             // ★古いiPhone(13Pro/11Pro等)向け低負荷モード
        lightweight_polling: false,        // ★Phase 25 (2026-06-11): SPA化で軽量ポーリングは死亡(fetchが空シェルを返し #buy が取れず常に refresh-failed リロードに落ちる)。実リロード+描画待ち監視に一本化。loadConfig で常に false に強制(下記参照)。
        new_release_only_mode: false,      // ★新発売狙いモード: ON時 release_time あり商品のみ監視 / OFF時 再販品も監視(デフォルト OFF: HIROさんは再販品も欲しい)
        new_release_grace_minutes: 30,     // 発売時刻から N分経過したら自動停止(モード ON 時のみ)
        // ★Phase 9-7: 発売後 N 分は警戒モード(連打 3 回 + リロード 5〜10 秒)。 0=無効
        alert_mode_minutes_after_release: 0,
        // ★Phase 14 (2026-06-05): cart_add の order(注文ID)が埋まるまで POST を待つ
        //   6/5 ログで判明: order 空のまま POST → 100% /error/4/ で弾かれ「1発目が無効」化。
        //   order はページ読込後に JS が遅れて充填(perf 2-4s)。 埋まってから撃てば 1発目が有効。
        //   true=order 充填を待ってから POST(新方式・推奨/デフォルト) / false=即 POST(旧動作)
        wait_order_fill_before_post: true,
        // 充填上限: 6/5 実測で order 充填は perf 2-4s に分布 → 遅い端(4s 近辺)も拾えるよう 4000ms。
        //   2500ms だと遅い端で空タイムアウト→リロードを繰り返す恐れがあるため余裕を持たせる。
        //   実際の充填時間は phase14 ログ(待ちNms)に残るので、 運用データで再調整可能。
        wait_order_fill_max_ms: 4000,      // order 充填待ちの上限。 超えたら POST せずリロード
        // ★Phase 26 (2026-06-24): 1発目を撃つ前に「青が settle して持続しているか」を確認(6/11反応駆動を1発目に適用)。
        //   SPA描画直後の transient「カートに入れる」を掴んで押すと、非オーダー品の押下でサイトが35〜90秒
        //   フリーズする(本日実機確定)。 settle窓の間に grey 化したら transient と確定して撃たない。
        confirm_stable_blue_before_first: true,  // true=settle確認してから1発目(推奨) / false=旧動作(即押し・フリーズ再発の恐れ)
        stable_blue_settle_ms: 600,              // settle確認の窓(ms)。 本物の在庫青はこの間も持続。 フリーズ再発時は増やす(攻め速度とのトレードオフ)
        // ★Phase 29 (2026-06-25): 在庫データ判定。 ボタン表示でなくサイトの在庫データ(orderstock_list/×○△)で
        //   在庫ありを確証してから押す。 在庫切れは原理的に押さない=フリーズ根絶。 時間・色・Akamaiに非依存。
        //   ★ロールバック: false にすると上の confirm_stable_blue(Phase26/28)の旧動作に戻る。
        data_stock_judge: true,                  // true=在庫データ判定(新・推奨) / false=旧settle方式に戻す
        data_stock_wait_ms: 4000,                // 在庫データが揃うまで待つ上限(ms)。 揃わなければ押さずリロード
        // ★Phase 29b (2026-06-27): 在庫切れ監視のリロード間隔(人らしいゆらぎ)。 proven(6-11)分布の1-4秒帯に合わせ
        //   <1秒の機械的連続を排除。 在庫あり(○/△)は即押下で不変(ここは在庫切れ監視のみ)。 値は運用で調整可。
        stock_recheck_min_ms: 1000,              // 在庫切れ時の再確認リロード間隔・下限
        stock_recheck_max_ms: 4000,              // 同・上限(min〜max のランダム)
        // ★Phase 16 (2026-06-09 実験): 2発目以降を「本物のカートボタン実クリック+小窓待ち」にする
        //   6/9 ログで判明: 同一ページ上の iframe 連打は 2発目以降ほぼ全部 /error/4/(bot拒否)。
        //   HIROさんの手動フロー(押す→小窓を確認→次を押す)を再現するため、 2発目以降は実ボタンを click し
        //   サイト本来の小窓(モーダル)が出るのを待って判定する。 1発目は従来 iframe のまま(無変更)。
        //   ★Phase 21 (2026-06-11): 既定 true に変更。 p-bandai SPA 化で旧 iframe 投入は空シェル/error4 で死亡
        //     → 全押下を本物ボタン+小窓確認の人間フローに統一(押す→小窓→閉じる→0.5秒→次、 成功小窓で即停止)。
        //     false で旧 iframe 方式にフォールバック可(ただし現状の p-bandai では機能しない)。
        realbutton_retry: true,
        // ★Phase 21: 本物ボタン反応駆動の押下間隔(小窓を閉じ切った後にあける人間間隔)。 HIROさん指定 0.5秒。
        realbtn_press_gap_ms: 500,
        // ★2026-07-06 (4fix-④ HIROさん): 嫌がらせポップアップを閉じた後、 青ボタンの活性復帰をこの時間だけ待つ。
        //   混雑/一瞬グレーではリロードせず青の復帰を待って押す。 確定在庫切れ(×)の時だけ即リロード。
        blue_wait_ms: 1500,
        grey_recheck_gap_ms: 400,
        // ★2026-07-07 (二重カートイン修正): 押下後、 曖昧な小窓が出ても「カートに商品が追加されました」の
        //   描画をこの時間だけ待ってから error 断定する。 成功小窓の閉じるボタン先行描画による誤判定→二重を防ぐ。
        added_popup_grace_ms: 700,
        // ★2026-07-07 (HIROさん「人が触れる部分だけで判定・背後の/cart/裏フェッチ廃止」):
        //   false=監視ホットループで /cart/ 裏フェッチをしない。 成功は"見える"ポップアップ「カートに商品が
        //   追加されました」＋再ロード後の ALREADY_IN_CART(見えるボタン)で判定。 サーバから見える無駄GETを消す。
        //   true=旧動作(件数増検知/二重確認/ポップアップ再照合で /cart/ を叩く)。
        background_cart_check: false,
        // ★2026-07-07 (人間リロード間隔 / HIROさん「カート無効化=リロードが速すぎ」): 前回リロードから
        //   最低 human_reload_min_ms + 0〜human_reload_jitter_ms(=1.5〜2.5秒)空ける。 サブ秒の機械的連発だけ潰す。
        //   描画待ちで既に空いていれば追加待ち無し=遅くならない。 0にすると無効化。
        //   ★HIROさん指定(2026-07-07): min1.5秒＋揺らぎ0〜1秒(速さ優先、 1秒未満連発の撲滅が主目的)。
        human_reload_min_ms: 1500,
        human_reload_jitter_ms: 1000,
        // 小窓が出るまで待つ上限(=死んだページ救出のみ)。 遅いだけの応答はこの範囲で待ち切る。
        //   90秒 完全沈黙 = "遅い"ではなく"壊れている" と判断してリロード (HIROさん指定)。
        realbutton_popup_wait_ms: 90000,
        // ★Phase 17 (2026-06-10): iOS 表示中タブのみ稼働。 裏(hidden)のタブはカート投入・リロードを止める。
        //   背景: HIROさん iOS Safari で複数 p-bandai タブを開くと裏タブも動いてしまう → 表示中の1枚だけにしたい。
        //   true=表示中タブのみ / false=従来どおり全タブ並行(設計核心[D]の旧動作)。
        //   ★既定 false (本番安全側 — iOS 実機未検証のため)。 HIROさん要望機能だが ⚙設定「📱」で ON にして検証。
        //   ※ 旧来の「複数タブ並行監視」 を反転する設定。 HIROさん 明示要望(2026-06-10)。
        foreground_only: false,
        // ★Phase 19 (2026-06-10): p-bandai 遅延描画(白いシェル→数秒後に商品DOM)対応。
        //   #buy が未描画なら最大この時間まで描画を待ってから判定(描画前リロード地獄を防ぐ)。
        render_wait_max_ms: 8000,
        // ★Phase 22 (2026-06-11): Akamai 防御強化(発売殺到時のブロック/ホーム弾き返し)検知時のクールダウン。
        //   即リロードせずこの時間待ってから再確認(まだ弾かれていればまた待つ / 解けていれば即購入再開)。
        //   ★HIROさん要望(6/11): ブロックが途中で解けても買い逃さないよう短め=15秒で「こまめに再確認」。
        //   ハンマー連打ではない(15秒に1回)のでAkamaiを刺激せず、 かつ解除に速く追従する。 停止ではなく自動再開。
        akamai_cooldown_ms: 15000,
      },
      keepalive: {
        enabled: false,
        dummy_products: [],
        interval_minutes: 50,
      },
      notify: {
        discord_webhook: '',
        device_tag: '📱',
      },
    };
  }
  function loadConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return defaultConfig();
      const c = JSON.parse(raw);
      const def = defaultConfig();
      return {
        ...def, ...c,
        // ★Phase 25 (2026-06-11): 軽量ポーリングは SPA化で死亡 → 保存済みで true でも常に false に強制。
        //   監視は「実リロード+描画待ち(Phase 19)」に一本化。無駄fetch/refresh-failed churn を排除。
        options: { ...def.options, ...(c.options || {}), lightweight_polling: false },
        keepalive: { ...def.keepalive, ...(c.keepalive || {}) },
        notify: { ...def.notify, ...(c.notify || {}) },
        products: Array.isArray(c.products) ? c.products : [],
      };
    } catch (e) { return defaultConfig(); }
  }
  function saveConfig(c) {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); }
    catch (e) { pbLog('❌','config','save error: '+e.message); }
    // 状態が変わったら上部パネルの古いエラーも整合化
    try { cleanupStaleErrors(c); } catch(e) {}
    // ★低負荷モードのキャッシュも更新
    try { _LOW_POWER_CACHE = !!(c.options || {}).low_power_mode; } catch(e) {}
  }

  // 上部パネルの古いエラーを現在の状態に対して整合化(自動掃除)
  function cleanupStaleErrors(cfg) {
    if (!Array.isArray(ERROR_BUFFER) || ERROR_BUFFER.length === 0) return;
    cfg = cfg || (typeof loadConfig === 'function' ? loadConfig() : null);
    if (!cfg) return;
    const before = ERROR_BUFFER.length;
    for (let i = ERROR_BUFFER.length - 1; i >= 0; i--) {
      const e = ERROR_BUFFER[i];
      // 商品が登録された後の「商品リストが空です」は古い
      if (e.category === 'config' && cfg.products && cfg.products.length > 0) {
        ERROR_BUFFER.splice(i, 1); continue;
      }
      // boot系の page/target/done エラーも、状態が変わったら掃除
      if (e.category === 'page' || e.category === 'target' || e.category === 'done') {
        ERROR_BUFFER.splice(i, 1); continue;
      }
    }
    if (ERROR_BUFFER.length !== before) {
      saveErrorBuffer();
      try { renderErrorPanel(); } catch(_) {}
      pbLog('🧹','cleanup',`stale errors removed: ${before - ERROR_BUFFER.length}件`);
    }
  }

  function defaultState() {
    return {
      paused: false,
      doneIds: [],
      productAttempts: {},
      lastSuccessAt: 0,
      lastKeepaliveAt: 0,
      keepaliveDummyIdx: 0,
      accessControlStreak: 0,
      accessControlAlertSent: false,
      // ★Phase 9-L (2026-05-22): 最終アクセス制御検知時刻 (boot 時の自動リセット用)
      lastAccessControlAt: 0,
    };
  }
  // ★Phase 9-L (2026-05-22): boot 時の自動リセット閾値 (10 分)
  //   旧仕様: accessControlStreak のリセット条件が POST 経路依存だったため
  //          POST せず連打スキップだけ続くと古い累積値が残り続けるバグ
  //   新仕様: 最終発火から 10 分超なら 0 リセット (本来の「直近の連続検出」 の意味に戻す)
  const ACCESS_CONTROL_RESET_AFTER_MS = 10 * 60 * 1000;
  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      const s = raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
      // ★paused は sessionStorage から(タブごと独立、 2026-05-11 HIROさん複数タブ対応)
      s.paused = getTabPaused();
      return s;
    } catch (e) {
      const s = defaultState();
      s.paused = getTabPaused();
      return s;
    }
  }
  // ★paused は sessionStorage でタブ独立 (HISTORY.md 事故 5 / DESIGN.md [D] 参照)
  const TAB_PAUSED_KEY = 'pb_cart_v2_tab_paused';
  // ★Phase 9-M (2026-06-03): sessionStorage.clear() で TAB_ID を消さない
  //   nuke/cooldown で sessionStorage を全消去すると、 タブ ID が変わってログのタブ識別が
  //   途中で切り替わってしまう。 TAB_ID だけ退避して復元する。
  function clearSessionKeepTabId() {
    let id = null;
    try { id = sessionStorage.getItem('pb_cart_v2_tab_id'); } catch (_) {}
    try { sessionStorage.clear(); } catch (_) {}
    try { if (id) sessionStorage.setItem('pb_cart_v2_tab_id', id); } catch (_) {}
  }
  function getTabPaused() {
    try { return sessionStorage.getItem(TAB_PAUSED_KEY) === 'true'; } catch (e) { return false; }
  }
  function setTabPaused(value, reason) {
    try { sessionStorage.setItem(TAB_PAUSED_KEY, value ? 'true' : 'false'); } catch (e) {}
    if (reason) {
      pbLog(value ? '🛑' : '▶','tab-paused',`タブ paused=${value}${reason ? ` (reason=${reason})` : ''}`);
    }
  }

  function saveState(s) {
    // ★paused は localStorage に書かず sessionStorage に分離(タブ独立)
    if (s && typeof s.paused === 'boolean') {
      const prev = getTabPaused();
      if (s.paused !== prev) {
        // saveState 経由で paused が変わった瞬間 sessionStorage に反映 + ログ
        setTabPaused(s.paused, s.paused ? 'auto-pause' : 'auto-resume');
      }
    }
    // localStorage に書く時は paused を含めない(他タブに伝播させない)
    const sCopy = { ...s };
    delete sCopy.paused;
    try { localStorage.setItem(STATE_KEY, JSON.stringify(sCopy)); } catch (e) {}
  }
  // ★pauseToolWithReason: 自動停止のエントリーポイント(reason を必ずログ記録)
  function pauseToolWithReason(reason) {
    if (getTabPaused()) return;
    setTabPaused(true, reason);
  }

  function loadMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function saveMeta(m) {
    try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  }
  function effectiveName(p) {
    if (p.name && p.name.trim()) return p.name.trim();
    const m = loadMeta()[p.url];
    return (m && m.name) || p.id;
  }
  function effectiveReleaseTime(p) {
    if (p.release_time) return p.release_time;
    const m = loadMeta()[p.url];
    return (m && m.release_time) || null;
  }

  // =================================================================
  // 5. 検知関数
  // =================================================================
  const detectAccessControl = (t) => ACCESS_CONTROL_KEYWORDS.some(k => t.includes(k));
  const detectCartFailBusy = (t) => CART_FAIL_KEYWORDS.some(k => t.includes(k));
  const detectStockOut = (t) => STOCK_OUT_KEYWORDS.some(k => t.includes(k));

  // ★Phase 22 (2026-06-11): Akamai(CDN) の「発売殺到時の防御強化」 ブロック/弾き返しを検知する。
  //   6/11発売ログで判明: 発売直後に Akamai が item ページ要求を / (ホーム) や /tbdlp/ に弾き返し、
  //   一部を edgesuite エラー画面(「An error occurred while processing your request」 + Reference #)にし、
  //   応答を15〜22秒に激遅化していた。 ツールはこれを認識せず描画待ち→リロードを繰り返し、 混雑にリクエストを
  //   ぶつけ続けてブロックを長引かせるリスクがあった。 検知できたら即リロードせずクールダウンする。
  //   返り値: 'edge'(エッジエラー画面) / 'bounce'(商品監視中なのにホーム弾き返し) / null
  function detectAkamaiBlock() {
    try {
      const text = (document.body && document.body.innerText || '').slice(0, 2000);
      if (/An error occurred while processing your request|errors\.edgesuite\.net|Reference #\s*\d/i.test(text)) {
        return 'edge';
      }
      // ホーム弾き返し: リロードで来たのに商品ページでなく / または /tbdlp/ に着地 + 監視対象あり
      const p = (location.pathname || '');
      if (p === '/' || /^\/tbdlp\//.test(p)) {
        let isReload = false;
        try { const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0]; isReload = !!(nav && nav.type === 'reload'); } catch (_) {}
        let hasTargets = false;
        try { const c = loadConfig(); hasTargets = (c.products || []).some(pr => pr.url && !pr.acquired); } catch (_) {}
        if (isReload && hasTargets) return 'bounce';
      }
    } catch (_) {}
    return null;
  }

  function normalizeProductUrl(u) {
    if (!u) return null;
    try {
      const x = new URL(u, location.href);
      // ★商品ID(/item/item-NNNN)までで切り詰める
      //   /fjdfjs/ や ?promo=xxx 等の余分があっても登録URLと照合可能に
      const m = x.pathname.match(/^(\/item\/item-\d+)/);
      if (m) return x.origin + m[1] + '/';
      const path = x.pathname.replace(/\/+$/, '') + '/';
      return x.origin + path;
    } catch (e) { return null; }
  }
  function isProductPage() {
    // ★寛容化: 末尾に余分パス(/fjdfjs/ 等)があっても商品ページとみなす
    return /\/item\/item-\d+/.test(location.pathname);
  }
  function currentProductUrl() {
    // ★商品ID(/item/item-NNNN)までで切り詰める
    const m = location.pathname.match(/^(\/item\/item-\d+)/);
    if (m) return location.origin + m[1] + '/';
    const path = location.pathname.replace(/\/+$/, '') + '/';
    return location.origin + path;
  }
  // ★Phase 9-7: 発売後 N 分以内かを判定 (警戒モード)
  //   minutes=0 で無効、 minutes>0 かつ target.release_time から N 分以内なら true
  function isAlertMode(cfg, target) {
    const minutes = (cfg && cfg.options && cfg.options.alert_mode_minutes_after_release) || 0;
    if (minutes <= 0) return false;
    if (!target || !target.release_time) return false;
    const releaseMs = new Date(target.release_time).getTime();
    if (isNaN(releaseMs)) return false;
    const elapsedMs = Date.now() - releaseMs;
    return elapsedMs >= 0 && elapsedMs < minutes * 60 * 1000;
  }
  function findTargetProduct(cfg, state) {
    if (!isProductPage()) return null;
    const cur = currentProductUrl();
    // ★acquired を「真の状態」とみなす(HIROさんが手動で外したら再投下する)
    //   doneIds はランタイム追跡用。acquired=false なら doneIds の内容に関係なく対象にする。
    const product = cfg.products.find((p) =>
      p.url && normalizeProductUrl(p.url) === cur && !p.acquired
    ) || null;
    if (!product) return null;
    // ★新発売狙いモード(2026-05-09 HIROさん要望: BAN回避):
    //   - release_time 未設定の商品 → 監視外(在庫切れリピート監視で BAN されないため)
    //   - release_time 経過後 N分以上 → 監視外(発売後しばらくは可、 長時間放置は停止)
    if ((cfg.options || {}).new_release_only_mode) {
      const rt = effectiveReleaseTime(product);
      if (!rt) return null;  // release_time 未設定 → 監視外
      const releaseMs = new Date(rt).getTime();
      const elapsedMin = (Date.now() - releaseMs) / 60000;
      const grace = (cfg.options.new_release_grace_minutes != null) ? cfg.options.new_release_grace_minutes : 30;
      if (elapsedMin > grace) {
        // 発売時刻 から N分以上経過 → 在庫切れリピート監視を避けるため監視外
        return null;
      }
    }
    return product;
  }

  // =================================================================
  // 6. 自動取得(同origin fetch — CORSなし、文字化けなし、地域判定なし)
  // =================================================================
  // 文字コード自動判定で HTML を decode(複数エンコーディング試行)
  function decodeHtmlBuffer(buf, contentType) {
    // 1. ヘッダから charset を取得
    let headerCharset = null;
    const ct = contentType || '';
    const ctMatch = ct.match(/charset=([\w-]+)/i);
    if (ctMatch) headerCharset = ctMatch[1].toLowerCase().trim();

    // 2. ヘッダになければ meta charset を sniff
    let metaCharset = null;
    {
      const peek = new Uint8Array(buf.slice(0, 4096));
      let asciiHead = '';
      for (let i = 0; i < peek.length; i++) asciiHead += String.fromCharCode(peek[i]);
      const m = asciiHead.match(/<meta[^>]+charset=["']?([\w-]+)/i);
      if (m) metaCharset = m[1].toLowerCase().trim();
    }

    // 表記揺れ吸収
    const normalize = (c) => {
      if (!c) return null;
      const m = {
        'shift-jis':'shift_jis', 'shift_jis':'shift_jis', 'sjis':'shift_jis',
        'windows-31j':'shift_jis', 'ms_kanji':'shift_jis', 'cp932':'shift_jis',
        'eucjp':'euc-jp', 'euc-jp':'euc-jp',
        'utf-8':'utf-8', 'utf8':'utf-8',
      };
      return m[c] || c;
    };

    // 3. 試行候補(優先順): header > meta > shift_jis > utf-8
    const tryList = [];
    [headerCharset, metaCharset, 'shift_jis', 'utf-8'].forEach((c) => {
      const n = normalize(c);
      if (n && tryList.indexOf(n) < 0) tryList.push(n);
    });

    // 4. 各エンコーディングで decode → 文字化け率が低いものを採用(ログは省略、最終結果のみ)
    let best = { text: null, replacementRatio: 1, encoding: null };
    for (const enc of tryList) {
      try {
        const td = new TextDecoder(enc, { fatal: false });
        const text = td.decode(buf);
        const replacements = (text.match(/�/g) || []).length;
        const ratio = replacements / Math.max(1, text.length);
        if (ratio < best.replacementRatio) {
          best = { text, replacementRatio: ratio, encoding: enc };
        }
        if (ratio < 0.001) return text;  // クリーンならログなしで確定
      } catch (e) { /* skip */ }
    }
    if (best.text) {
      // 文字化けがある時のみログ(問題発覚用)
      if (best.replacementRatio > 0.001) {
        pbLog('⚠','decode',`文字化けあり ${best.encoding} ratio=${(best.replacementRatio*100).toFixed(2)}%`);
      }
      return best.text;
    }
    // 全部失敗 → utf-8 強制
    return new TextDecoder('utf-8', { fatal: false }).decode(buf);
  }

  async function fetchProductMeta(productUrl) {
    // pbLog('📡','fetch','start: '+productUrl.substring(0,50));  // 冗長なため省略(エラー時のみ表示)
    try {
      const res = await fetchWithTimeout(productUrl, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) {
        pbLog('❌','fetch','HTTP '+res.status);
        return { error: 'HTTP_'+res.status };
      }
      // arrayBuffer 取得 → charset 判定 → TextDecoder で decode
      const buf = await res.arrayBuffer();
      const html = decodeHtmlBuffer(buf, res.headers.get('content-type'));
      // pbLog('📡','fetch','got '+html.length+' chars');  // 冗長なため省略
      if (detectAccessControl(html)) {
        pbLog('🚨','fetch','ACCESS_CONTROL detected');
        return { error: 'ACCESS_CONTROL' };
      }

      // 商品名抽出 — 確実な順序: title 先頭 > og:title 先頭 > h1 全部
      // ※iPhone UA時のプレバンHTMLは <h1>[0]="この情報をシェアする", <h1>[1]=商品名 という構造
      const candidates = [];
      // 1. title の先頭(プレバンは "商品名 | カテゴリ | サイト名" 形式で 100% 商品名)
      const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (tm) {
        const c = tm[1].split(/\s*[|｜]\s*/)[0].replace(/<[^>]+>/g,'').trim();
        if (c) candidates.push({ src: 'title', text: c });
      }
      // 2. og:title の先頭
      const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
      if (og) {
        const c = og[1].split(/\s*[|｜]\s*/)[0].trim();
        if (c) candidates.push({ src: 'og', text: c });
      }
      // 3. h1 を全部
      const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
      for (const m of h1Matches) {
        const c = m[1].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
        if (c) candidates.push({ src: 'h1', text: c });
      }
      // フィルタ: 5-200文字 + 不要キーワード(部分一致で除外)
      const SHARE_RE = /シェア|sharing|share|メニュー|menu|閉じる|close|エラー|error|404|この情報|この商品の|お気に入り|フォロー/i;
      const valid = candidates.filter(c =>
        c.text.length >= 5 && c.text.length <= 200 && !SHARE_RE.test(c.text)
      );
      const name = valid[0] ? valid[0].text : null;
      pbLog('🔍','extract',`name="${name||'(なし)'}" src=${valid[0]?valid[0].src:'-'} candidates=${candidates.length}`);

      // 発売時刻抽出
      let release_time = null;
      const flat = html
        .replace(/<script[\s\S]*?<\/script>/gi,' ')
        .replace(/<style[\s\S]*?<\/style>/gi,' ')
        .replace(/<[^>]+>/g,' ')
        .replace(/&nbsp;/g,' ')
        .replace(/\s+/g,' ');
      const patterns = [
        /予約受付開始[^年]{0,40}?(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日.{0,30}?(\d{1,2})時/,
        /受注開始[^年]{0,40}?(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日.{0,30}?(\d{1,2})時/,
        /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日(?:\([日月火水木金土]\))?\s*(\d{1,2})時受注開始/,
      ];
      for (const re of patterns) {
        const m = flat.match(re);
        if (m) {
          const dt = new Date(Date.UTC(+m[1], +m[2]-1, +m[3], +m[4]-9, 0, 0));
          if (!isNaN(dt.getTime())) { release_time = dt.toISOString(); break; }
        }
      }
      // ★★★ Phase 20 (2026-06-10): JS描画ページ対応 — サーバHTMLが空でも描画済みDOMから補完 ★★★
      //   2026-06-10 実測: p-bandai は title/og/h1 を JS 描画にした → fetch した生HTMLは <title> 空・og無し・h1=0。
      //   そのため title/og/h1 由来の name が null になり「商品名取得失敗」になる。
      //   対策: 登録対象が「今表示中のページ」 なら、 描画済みの document.title(=商品名が入っている)から補完する。
      //   release_time も同様に、 取れなければ描画済み本文から再抽出する。
      let _name = name;
      let _release = release_time;
      try {
        const _cur = (typeof currentProductUrl === 'function') ? currentProductUrl() : null;
        const _tgt = (typeof normalizeProductUrl === 'function') ? normalizeProductUrl(productUrl) : productUrl;
        const _isCurrentPage = !!(_cur && _tgt && _cur === _tgt);
        if (_isCurrentPage && (!_name || !_release)) {
          if (!_name) {
            const _dt = (document.title || '').split(/\s*[|｜]\s*/)[0].replace(/<[^>]+>/g,'').trim();
            if (_dt && _dt.length >= 5 && _dt.length <= 200 && !SHARE_RE.test(_dt)) {
              _name = _dt;
              pbLog('🔍','extract',`描画DOM(document.title)から商品名を補完: "${_dt}" (JS描画ページ対応)`);
            }
          }
          if (!_release) {
            const _bodyFlat = ((document.body && document.body.innerText) || '').replace(/&nbsp;/g,' ').replace(/\s+/g,' ');
            for (const re of patterns) {
              const m = _bodyFlat.match(re);
              if (m) { const _d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3], +m[4]-9, 0, 0)); if (!isNaN(_d.getTime())) { _release = _d.toISOString(); pbLog('🔍','extract',`描画DOM本文から発売時刻を補完: ${_release}`); break; } }
            }
          }
        }
      } catch (_e) {}
      // 商品名に「【再販】」「再販」を含めば再販扱いの示唆
      const isRestockHinted = !!(_name && /【再販】|再販分|再販予約|\(再販\)/.test(_name));
      pbLog('📝','fetch',`name=${(_name||'').substring(0,40)} release=${_release||'なし'} restockHint=${isRestockHinted}`);
      return { name: _name, release_time: _release, isRestockHinted };
    } catch (e) {
      pbLog('❌','fetch','exception: '+e.message);
      return { error: 'NETWORK: '+e.message };
    }
  }

  // =================================================================
  // 7. カート操作
  // =================================================================
  // ★cart 確認 fetch 専用 timeout(2026-05-10 HIROさん「7秒空く」報告対応)
  //   PBサーバ側で /cart/ が 5秒以上応答しない事象あり。 速度優先で短く設定。
  //   timeout 時は ids=[] で返し、 UNCONFIRMED 扱い → 即 reload に進む(取り逃しは keepalive と次サイクルでカバー)
  const CART_FETCH_TIMEOUT_MS = 2500;
  // ★mainLoop 冒頭の initialCart 用、 さらに短い timeout(2026-05-10 sinceBoot=2700ms 跳ね対策)
  //   サーバ詰まり時に 2500ms 待たされる → サイクル時間が 5-6秒に跳ねる
  //   → 1000ms で諦めて POST に進む(timeout 時は ids=[] = 「カート空」 とみなす)
  //   二重発注リスク: 万一前サイクルで実は入っていても、 buttonState が ALREADY_IN_CART/LIMIT を表示するので boot() の判定で停止する設計
  const CART_FETCH_FAST_TIMEOUT_MS = 1000;
  async function getCartItemIds(timeoutMs) {
    const t = timeoutMs || CART_FETCH_TIMEOUT_MS;
    try {
      // ★キャッシュ完全回避 三重防御 (DESIGN.md [C] 参照、 絶対に外さない)
      const cacheBuster = `?_t=${Date.now()}`;
      const res = await fetchWithTimeout('/cart/' + cacheBuster, {
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      }, t);
      const buf = await res.arrayBuffer();
      const html = decodeHtmlBuffer(buf, res.headers.get('content-type'));
      if (detectAccessControl(html)) return { error: 'ACCESS_CONTROL', ids: null };
      const ids = [...html.matchAll(/cart_del\/(\d+)\//g)].map((m) => m[1]);
      return { error: null, ids, html };
    } catch (e) {
      // ★fetch-timeout の場合: ids=[] で返す(件数変化なし扱い → UNCONFIRMED → 次 reload)
      //   network エラーも同様
      const isTimeout = e && (e.message === 'fetch-timeout' || e.name === 'AbortError');
      return { error: isTimeout ? 'TIMEOUT' : 'NETWORK', ids: [] };
    }
  }
  async function isCartNonEmpty() {
    const r = await getCartItemIds();
    return Array.isArray(r.ids) && r.ids.length > 0;
  }
  function findCartFormOnPage() {
    const forms = $$('form');
    for (const f of forms) {
      const action = (f.getAttribute('action') || '').replace(/[?#].*/, '');
      if (action === '/cart_add/') return f;
    }
    return null;
  }

  // ★Phase 14 (2026-06-05): cart_add フォームの order(注文ID) が埋まるまで待つ
  //   6/5 ログで判明: order 空のまま POST すると 100% /error/4/ に弾かれる。
  //   order はページ読込後に JS が遅れて埋める (perf 2-4s)。 これを待ってから撃てば 1発目が有効。
  //   戻り値: { ok:true, orderId } 充填済 / { ok:false, reason } タイムアウト等
  //   maxMs 上限まで 50ms 間隔でポーリング。 paused / grey 化 / 設定モーダルで即離脱。
  async function waitForCartOrderFilled(maxMs) {
    const limit = maxMs || 4000;
    const t0 = Date.now();
    let polls = 0;
    while (Date.now() - t0 < limit) {
      if (loadState().paused === true) return { ok: false, reason: 'paused' };
      if (isSettingsModalOpen && isSettingsModalOpen()) return { ok: false, reason: 'modal' };
      const f = findCartFormOnPage();
      if (!f) return { ok: false, reason: 'no-form' };
      // grey 化したら待つ意味なし (在庫切れ)
      const bs = buttonState();
      if (!bs.clickable && bs.reason !== 'OK') return { ok: false, reason: 'grey:' + bs.reason };
      const oi = f.querySelector('input[name="order"]');
      const v = oi ? (oi.value || '') : '';
      if (v.trim().length > 0) {
        return { ok: true, orderId: v, waitedMs: Date.now() - t0, polls };
      }
      polls++;
      await sleep(50);
    }
    return { ok: false, reason: 'timeout', waitedMs: Date.now() - t0, polls };
  }

  // 「カートに商品が追加されました」成功ポップアップを検知 → 成功シグナル
  // ★Phase 27 (2026-06-25 緊急修正): 「商品在庫がご希望個数に不足したため商品数変更が出来ない商品が御座いました。
  //   カートページにてご確認下さい。」 を成功判定から除外(商品数変更が出来ない|個数に不足 を削除)。
  //   理由: Phase 21(6/11)では「在庫不足で個数を減らして入った=成功」と判断したが、 6/25 実機で
  //   ★この小窓が出てもカート未投入(ボタンは青「カートに入れる」のまま)★ のケースを確認 → 成功とは限らない曖昧文言。
  //   在庫ありの商品(リックディアス クワトロ機)で この小窓を成功誤判定し「カート確保」を4件中3件 誤報告
  //   (HIROさん 6/25 緊急指摘)。 → 成功は明確な文言のみに限定。 この曖昧文言は ERR_RE 側(非成功・小窓を閉じて継続)
  //   で扱う。 真にカート入りなら buttonState の ALREADY_IN_CART(リロード後)で別途確実に検知される。
  // ★Phase 32 (2026-07-01): 予約成功アラート「✅ 商品を登録しました」を成功文言に追加。
  //   予約商品(予約する)の成功は「商品を登録しました」(カート商品の追加とは別文言)。 これが辞書に無く、
  //   かつ Phase 31 で native alert 抑止 → 成功を検知できず「カートに入っても止まらない」(HIROさん 7/1 指摘)。
  const CART_ADDED_RE = /カートに商品が追加されました|カートに追加しました|カートインしました|商品を登録しました|ご予約を受け付けました|予約を受け付けました/;
  function detectCartAddedPopup() {
    if (document.body && CART_ADDED_RE.test(document.body.innerText || '')) return true;
    // ★Phase 32: 成功はネイティブ alert() で来て Phase 31 が抑止する場合がある → 直近の抑止alert文言も見る。
    try {
      const la = window._pbLastAlert;
      if (la && (Date.now() - la.at < 4000) && CART_ADDED_RE.test(la.msg || '')) return true;
    } catch (_) {}
    // ★2026-07-08 撤回(v2.3.45): v2.3.43で入れた「.direct_cart_inner に カートを見る リンク → 成功」判定は
    //   偽成功(空打ち)を出した。 原因: この枠は成功でもエラーでも表示され、「カートを見る」リンクは非表示でも
    //   DOMに存在するため、 注文不可アラートの時も成功と誤判定していた(HIROさん 7/8 至急指摘)。
    //   偽成功は「確保済み扱いで監視停止→本当のチャンスを逃す」最悪の失敗なので、 見える文言(上の CART_ADDED_RE
    //   / 抑止alert)のみで判定する安全側に戻す。 個数不足の無音追加の確保検知は、 誤判定しない確実な方法を別途検討。
    return false;
  }

  // ポップアップを自動で閉じる
  // ・エラー: 「大変混み合っているため」「在庫がございません」 → 閉じて連打続行
  // ・成功: 「カートに商品が追加されました」 → 閉じて次商品へ
  //   ★動作モードA(stop)の場合は HIROさん目視用に閉じない(opts.keepSuccess=true)
  function dismissAnyPopup(opts) {
    opts = opts || {};
    let dismissed = 0;
    const SUCCESS_WORDS = /カートに商品が追加されました|カートに追加しました|カートインしました/;
    // keepSuccess=true なら成功ポップアップは閉じない
    // ★2026-07-06 (4fix-③ HIROさん): サーバの嫌がらせポップアップ文言を辞書に追加。
    //   スクショの「商品数変更が出来ない」「カートに入れることが出来ませんでした」「(ご希望)個数に不足」等が
    //   旧辞書に無く、 閉じる対象として認識されず放置 → カートインの阻害になっていた。
    const _HARASS = '大変混み合っているため|在庫がございません|追加できません|エラーが発生|注文できる商品がございません|販売(を|が)?終了|受付(を|が)?終了|完売|商品数変更が出来ない|変更が出来ない商品|個数に不足|カートに入れることが出来|カートに入れることができ|ご指定の商品をカート';
    const TRIGGER_WORDS = opts.keepSuccess
      ? new RegExp(_HARASS)
      : new RegExp(_HARASS + '|カートに商品が追加されました|カートに追加しました');
    // 1. 「閉じる」「✕」「×」テキストを持つボタン
    const closeCandidates = $$('button, a, span, div').filter(e => {
      const t = (e.innerText || '').trim();
      return t === '閉じる' || t === '✕' || t === '×' || t === 'OK';
    });
    for (const c of closeCandidates) {
      let p = c, depth = 0;
      while (p && depth < 8) {
        const t = p.innerText || '';
        if (TRIGGER_WORDS.test(t) && t.length < 500) {
          try { c.click(); dismissed++; break; } catch (_) {}
        }
        p = p.parentElement;
        depth++;
      }
    }
    // 2. CSSクラスに close を含む要素(ツールチップ用)
    const tipCloses = $$('[class*="close"], [aria-label*="close" i], [aria-label*="閉じる"]');
    for (const c of tipCloses) {
      let p = c, depth = 0;
      while (p && depth < 6) {
        const t = p.innerText || '';
        if (TRIGGER_WORDS.test(t) && t.length < 300) {
          try { c.click(); dismissed++; break; } catch (_) {}
        }
        p = p.parentElement;
        depth++;
      }
    }
    // ★Phase 30b (2026-06-30 HIROさん: 3回直して閉じない件): アラートの「実構造」をログ採取 + 枠内の閉じるを直接click。
    //   旧 Phase30 は page全体の '閉じる' を文言祖先<500 で探したが実体を掴めず、 "dismissed 3" でも閉じなかった(空振り)。
    //   私の検証ブラウザはトリガーで毎回フリーズし生捕獲できないため、 ★HIROさんの実セッションのログで
    //   本物の閉じるボタンの正体(tag/class/text)を記録★ し、 次で精密に直す。 同時に枠内の閉じるを狙ってclickも試す。
    //   ※dismissed の値に関係なく常に実行(旧 dismissed===0 ゲートだと既存の空振り3クリックで skip されていた)。
    try {
      const _body = document.body ? (document.body.innerText || '') : '';
      // ★2026-07-06 (4fix-③): 枠内の閉じる(×)を掴む対象を、 注文不可アラートだけでなく
      //   嫌がらせ系ポップアップ全般(商品数変更不可/カートに入れられない/個数不足/混雑)に拡張。
      const _BOXRE = /注文できる商品がございません|商品数変更が出来ない|変更が出来ない商品|カートに入れることが出来|カートに入れることができ|個数に不足|ご指定の商品をカート|大変混み合っているため/;
      if (_BOXRE.test(_body)) {
        // 文言を own-text に持つ最小要素 → クリック要素を含む祖先「枠」を特定
        let _txtEl = null;
        for (const e of $$('*')) {
          const own = Array.from(e.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('');
          if (_BOXRE.test(own)) { _txtEl = e; break; }
        }
        let _scope = _txtEl, _up = 0;
        while (_scope && _up < 6) {
          if (_scope.querySelectorAll && _scope.querySelectorAll('button, a, input, [role=button], [onclick]').length > 0) break;
          _scope = _scope.parentElement; _up++;
        }
        _scope = _scope || _txtEl;
        const _btns = _scope ? Array.from(_scope.querySelectorAll('button, a, input, [role=button], [onclick]')) : [];
        // ★構造ログ(本物の閉じる特定用): 枠内クリック要素を tag.class'text'表示/非表示 で記録(URLは出さない=フィルタ回避)
        const _desc = _btns.slice(0, 8).map(b =>
          `${b.tagName}.${(b.className || '').toString().replace(/\s+/g, '.').slice(0,18)}'${((b.innerText || b.value || '').trim()).slice(0,10)}'${b.offsetParent !== null ? 'v' : 'h'}`
        ).join(' ');
        pbLog('🔎', 'popup-struct', `注文不可アラート 枠=${_scope ? _scope.tagName + '.' + (_scope.className || '').toString().slice(0,18) : '?'} btns[${_btns.length}]: ${_desc}`);
        // ★枠内の「閉じる/✕/×/close/exit」を直接click(page全体でなく枠内に限定 → 実体に当たりやすい)
        let _clicked = 0;
        for (const b of _btns) {
          const t = (b.innerText || b.value || '').trim();
          const cl = (b.className || '').toString();
          if (/閉じ|^✕$|^×$|close/i.test(t) || /close|exit|dismiss/i.test(cl)) { try { b.click(); _clicked++; dismissed++; } catch (_) {} }
        }
        if (_clicked > 0) pbLog('🗙', 'popup', `注文不可アラート: 枠内の閉じる ${_clicked} 個をclick`);
      }
    } catch (_) {}
    if (dismissed > 0) pbLog('🗙','popup','dismissed '+dismissed+' popup(s)');
    return dismissed;
  }

  // ★Phase 9-RR2 (2026-05-29): waitForPopupOrTimeout は撤回。
  //   旧設計 (親 body 監視) は iframe form.submit の特性 (popup が iframe 内に閉じる) を
  //   理解していなかったため機能不全だった。 代わりに attemptCartAddOnce の戻り値 r.hadPopupMarker
  //   (iframe 内 HTML に POPUP_TRIGGER_WORDS が含まれるか) で判定する方式に変更。
  //   POPUP_TRIGGER_WORDS は attemptCartAddOnce 内の _markers 計算で使われている。

  // ★カート確保済みのボタンテキスト・周辺UIキーワード(fetchなしで判定)
  const CART_DONE_KEYWORDS = [
    'カートに追加済み',
    'カートに入っています',
    'カートに入れています',
    'すでにカートに',
    '予約済み',
    '申込済み',
    '購入済み',
  ];
  // グレーボタンの理由を細かく分類するキーワード(fetch なしで判定)
  const STOCK_OUT_BTN_KEYWORDS = ['在庫がありません', '在庫なし', '販売終了', '予約受付終了', '受付終了', '販売停止'];
  const LIMIT_BTN_KEYWORDS = ['購入制限', '制限数を超過', '購入上限'];

  // ★青ボタン(クリック可能)のテキストパターン
  //   プレバン本体: 「予約する」「カートに入れる」
  //   ガンダムベースオンラインショップ: 「ショッピングカートに入れる」
  //   先頭のみ「ショッピング」が付くので、末尾「カートに入れる」を含む形でマッチさせる
  const BLUE_BTN_PATTERN = /^(予約する|(?:ショッピング)?カートに入れる)$/;
  // 「予約する」「カートに入れる」ボタンの状態判定
  // 青(clickable=true) = 投入試行可能
  // ★Phase 9-3: 混雑表示中ガード (2026-05-12 追加)
  //   画面に混雑メッセージが出てる間は POST しない (青も grey も)
  //   サーバが「混雑です」 と画面で警告してる中で POST するのは BAN 主因
  function isSiteBusy() {
    // (1) ページ全体が混雑画面 (既存検知)
    if (isCurrentPageAccessControl()) return true;
    // (2) 商品ページ内に混雑キーワードが表示されている (オーバーレイ等、 2 層構造対応)
    const bodyText = (document.body && document.body.innerText) || '';
    if (ACCESS_CONTROL_KEYWORDS.some(k => bodyText.includes(k))) return true;
    return false;
  }

  // グレー reason別:
  //   ALREADY_IN_CART = カート確保済み(成功扱い、fetchなしで判定)
  //   STOCK_OUT       = 在庫切れ(リロードで復活待ち)
  //   LIMIT           = 購入上限超過(リロード意味なし)
  //   DISABLED / TEXT = その他(リロード)
  function buttonState() {
    const btn = document.getElementById('buy') || document.getElementById('buy_side');
    if (!btn) return { clickable: false, reason: 'NO_BUTTON', text: '' };
    const text = (btn.innerText || btn.value || '').trim();
    // ボタン周辺UI(親フォーム/セクション)も検査して「追加済み」表示を拾う
    const parent = btn.closest('form, section, div');
    const surrounding = parent ? (parent.innerText || '').slice(0, 500) : '';
    const fullText = text + ' ' + surrounding;
    // ★判定順序(2026-05-09 HIROさん指示で旧来の「攻め」戦略に戻す):
    //   ガンダムベース店舗系の商品はリロード直後のJS未実行タイミングで
    //   ボタン text="ショッピングカートに入れる" + disabled=false の状態が一瞬発生する。
    //   旧来の挙動: その瞬間「青」と判定 → 連打10回 → サーバの本当の在庫を試す
    //   = HIROさんの「攻め」戦略 (リロードスロットルで Safari セーフガード防止)
    // ★1) カート確保済み判定(ボタン文字 or 周辺メッセージ)
    if (CART_DONE_KEYWORDS.some(k => fullText.includes(k))) {
      return { clickable: false, reason: 'ALREADY_IN_CART', text };
    }
    // 2) 青(クリック可能) ← STOCK_OUT より先に判定して「攻め」を有効化
    if (BLUE_BTN_PATTERN.test(text) && !btn.disabled) {
      return { clickable: true, reason: 'OK', text };
    }
    // 3) グレー理由を分類
    if (STOCK_OUT_BTN_KEYWORDS.some(k => fullText.includes(k))) {
      return { clickable: false, reason: 'STOCK_OUT', text };
    }
    if (LIMIT_BTN_KEYWORDS.some(k => fullText.includes(k))) {
      return { clickable: false, reason: 'LIMIT', text };
    }
    if (btn.disabled) return { clickable: false, reason: 'DISABLED', text };
    return { clickable: false, reason: 'TEXT', text };
  }

  // ★★★ Phase 29 (2026-06-25): 在庫データ判定 ★★★
  //   ボタンの見た目(optimistic青/灰色/disabled)や時間ではなく、 サイト自身が在庫切れ判定に使う
  //   インラインJS変数を読む = 在庫の真実。 ボタン描画・時間・Akamai遅延に依存しない。
  //   実機確認(2026-06-25): ページに以下が server-rendered の <script> として入っている:
  //     orderstock_list = {"<order>":"○"/"△"/"×"}   ○=在庫あり △=残りわずか ×=在庫無し
  //     all_stock_out   = ""(在庫あり) / "全て在庫無し"(全滅)
  //     ecv_non_stock_mark = "×"  ← サイトが定義する「在庫無しマーク」
  //   iOS の Userscripts は window 変数を直接読めない可能性があるため、 <script> の textContent
  //   (DOM文字列)を正規表現で読む = サンドボックス/CSP 無関係で確実。
  function readStockData() {
    const out = { orderstock: null, allOut: '', haveAllOut: false, nsMark: '×', haveData: false };
    // (1) window 直読(サンドボックスでなければ最速・確実)。 iOS Userscripts は読めない可能性 → (2) にフォールバック
    try {
      if (window.orderstock_list && typeof window.orderstock_list === 'object') { out.orderstock = window.orderstock_list; out.haveData = true; }
      if (typeof window.all_stock_out !== 'undefined' && window.all_stock_out !== null) { out.allOut = String(window.all_stock_out); out.haveAllOut = true; out.haveData = true; }
      if (typeof window.ecv_non_stock_mark !== 'undefined' && window.ecv_non_stock_mark) { out.nsMark = String(window.ecv_non_stock_mark); }
    } catch (_) {}
    // (2) インライン <script> のテキストから(DOM文字列読取=サンドボックス/CSP 非依存)
    try {
      const scripts = document.querySelectorAll('script:not([src])');
      for (const s of scripts) {
        const t = s.textContent || '';
        if (!out.orderstock && t.indexOf('orderstock_list') >= 0) {
          const m = t.match(/orderstock_list\s*=\s*(\{[\s\S]*?\})\s*;/);
          if (m) {
            const obj = {}; const re = /["']([^"']+)["']\s*:\s*["']([^"']*)["']/g; let mm;
            while ((mm = re.exec(m[1])) !== null) { obj[mm[1]] = mm[2]; }
            if (Object.keys(obj).length) { out.orderstock = obj; out.haveData = true; }
          }
        }
        if (!out.haveAllOut) {
          const m = t.match(/all_stock_out\s*=\s*["']([^"']*)["']/);
          if (m) { out.allOut = m[1]; out.haveAllOut = true; out.haveData = true; }
        }
        const mk = t.match(/ecv_non_stock_mark\s*=\s*["']([^"']*)["']/);
        if (mk) out.nsMark = mk[1];
      }
    } catch (_) {}
    return out;
  }
  // 在庫判定: { ready, soldOut, mark, src }  ready=false は「データ未取得=確証できない」
  function stockJudge() {
    const sd = readStockData();
    const NS = sd.nsMark || '×';
    // (a) 全て在庫無し = 確実に売切(最優先)
    if (sd.haveAllOut && sd.allOut && sd.allOut.length > 0) return { ready: true, soldOut: true, mark: 'allOut:' + sd.allOut, src: 'allout' };
    if (!sd.orderstock) return { ready: false, soldOut: false, mark: '', src: 'no-stocklist' };
    const keys = Object.keys(sd.orderstock);
    // (b) 単一バリエーション(HIROのガンプラ): その1つの在庫マークが全て。 order欄の充填を待たず即判定
    if (keys.length === 1) {
      const mk = sd.orderstock[keys[0]];
      return { ready: true, soldOut: mk === NS, mark: mk, src: 'single' };
    }
    // (c) 多バリエーション: cart_add フォームの order 欄で対象を照合
    const cf = findCartFormOnPage();
    const oi = cf ? cf.querySelector('input[name="order"]') : null;
    const oid = oi ? (oi.value || '').trim() : '';
    if (oid && Object.prototype.hasOwnProperty.call(sd.orderstock, oid)) {
      const mk = sd.orderstock[oid];
      return { ready: true, soldOut: mk === NS, mark: mk, src: 'order' };
    }
    return { ready: false, soldOut: false, mark: '', src: 'order-pending' };
  }

  // ★cart_add 密度 throttle: Akamai/プレバン bot 検知を構造的に避ける
  //   HIROさん 2026-05-09 観察: /cart_err/ にリダイレクト = サーバ側 bot 検知反応
  //   累積 cart_add POST が短時間に多すぎると bot 判定されてカート無効化される
  //   → 直近 N分間の cart_add 数を localStorage 追跡し、 閾値超えで自動休止
  const ATTEMPT_HIST_KEY = 'pb_cart_v2_attempt_hist';
  function _recordAttempt() {
    try {
      const arr = JSON.parse(localStorage.getItem(ATTEMPT_HIST_KEY) || '[]');
      arr.push(Date.now());
      const cutoff = Date.now() - 600000;  // 10分以内
      const filtered = arr.filter(t => t > cutoff);
      localStorage.setItem(ATTEMPT_HIST_KEY, JSON.stringify(filtered.slice(-300)));
    } catch (e) {}
  }
  async function _checkAttemptThrottle() {
    try {
      const arr = JSON.parse(localStorage.getItem(ATTEMPT_HIST_KEY) || '[]');
      const now = Date.now();
      const last1m = arr.filter(t => now - t < 60000).length;
      const last5m = arr.filter(t => now - t < 300000).length;
      // 直近1分 60回以上 → 30秒休止(発売瞬間の連打10回×複数商品でも発動しない閾値)
      if (last1m >= 60) {
        pbLog('💤','throttle',`直近1分:${last1m}回 cart_add → 30秒休止 (bot検知回避)`);
        try { updateUI({ status: `💤 直近1分で ${last1m}回試行 → 30秒休止(連打過多回避)` }); } catch(_){}
        await interruptibleSleep(30000);  // ★Phase 10: 停止押下で即中断 (中断されても return true で次サイクル、 paused は呼び元で確認)
        return true;
      }
      // 直近5分 200回以上 → 60秒休止(複数商品同時運用でも発動しない)
      if (last5m >= 200) {
        pbLog('💤','throttle',`直近5分:${last5m}回 cart_add → 60秒休止 (bot検知回避)`);
        try { updateUI({ status: `💤 直近5分で ${last5m}回試行 → 60秒休止(連打過多回避)` }); } catch(_){}
        await interruptibleSleep(60000);  // ★Phase 10: 停止押下で即中断
        return true;
      }
    } catch (e) {}
    return false;
  }

  // ★2026-05-10 HIROさん「手動なら入るのに ツールだと入らない」 報告への抜本対策
  //   問題: fetch() POST は Sec-Fetch-Mode: cors / Sec-Fetch-Dest: empty / Sec-Fetch-User: なし
  //         → Akamai BotManager が「人間操作ではない」 と判定 → カート登録を内部で reject
  //   対策: iframe + form.submit() でブラウザの form 送信と同等の HTTP 挙動に変更
  //         → Sec-Fetch-Mode: navigate / Dest: document / User: ?1 で送信される
  //         → 手動操作と区別不可能になり bot 検知突破の本命
  //   副次効果: PB は cart_add 後にカート画面へ redirect するので、 iframe.contentDocument で
  //             その HTML を取得 → 件数判定可能 = POST と cart 件数取得が 1往復で完了(速度↑)
  async function cartAddViaFormSubmit(cartForm, qty, timeoutMs) {
    return new Promise((resolve) => {
      const iframeName = 'pb_cart_post_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
      const ifr = document.createElement('iframe');
      ifr.name = iframeName;
      // ★display:none + 隠し位置: 親画面に絶対干渉しない
      ifr.style.cssText = 'display:none;position:absolute;width:0;height:0;left:-9999px;top:-9999px;border:0;visibility:hidden;';
      // ★sandbox 属性は付けない (HISTORY.md 事故 1 / DESIGN.md 設計核心 [A] 参照)
      document.body.appendChild(ifr);

      // ★親 document に form clone + iframe.target で submit (HISTORY.md 事故 2 参照)
      const form = cartForm.cloneNode(true);
      form.target = iframeName;
      const unitInput = form.querySelector('input[name="unit"]');
      if (unitInput) unitInput.value = String(qty);
      // ★display:none で DOM ごと描画停止 + position 隠し + size 0 + visibility hidden の 5重防御
      form.style.cssText = 'display:none !important;position:absolute;left:-9999px;top:-9999px;width:0;height:0;visibility:hidden;pointer-events:none;';
      // ★PB 画面 JS が誤反応しないよう id を一意にする(同じ id があると JS が混乱する可能性)
      form.id = 'pb_cart_form_' + iframeName;
      document.body.appendChild(form);

      let resolved = false;
      let timeoutId;

      const cleanup = (result) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        // ★setTimeout 0ms で削除(onload の同期削除は iOS Safari でクラッシュ報告あり)
        setTimeout(() => {
          try { if (form.parentNode) form.parentNode.removeChild(form); } catch (e) {}
          try { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); } catch (e) {}
        }, 0);
        resolve(result);
      };

      ifr.addEventListener('load', () => {
        try {
          const win = ifr.contentWindow;
          // about:blank の初回 load を無視(submit 前のロード)
          //   submit 後は p-bandai.jp の URL になっているはず
          let url = '';
          try { url = (win && win.location && win.location.href) || ''; } catch (e) {}
          if (!url || url === 'about:blank') return;
          const doc = ifr.contentDocument || (win && win.document);
          if (!doc) return cleanup({ error: 'no-doc' });
          const html = doc.documentElement ? doc.documentElement.outerHTML : '';
          cleanup({ html, ok: true, finalUrl: url });
        } catch (e) {
          cleanup({ error: 'read-fail: ' + (e.message || e.name) });
        }
      });

      timeoutId = setTimeout(() => cleanup({ error: 'timeout' }), timeoutMs || 10000);

      // submit
      try {
        form.submit();
      } catch (e) {
        cleanup({ error: 'submit-fail: ' + (e.message || e.name) });
      }
    });
  }

  // knownCartIds: 直前の cart 状態(mainLoopで取得 or 前試行のafter)。before fetch 省略のため。
  async function attemptCartAddOnce(target, knownCartIds) {
    const cartForm = findCartFormOnPage();
    if (!cartForm) {
      const t = document.body ? document.body.innerText : '';
      if (detectAccessControl(t)) return { result: 'ACCESS_CONTROL' };
      return { result: 'NO_FORM' };
    }
    // ★cart_add 密度チェック: 多すぎる場合は休止して bot 検知回避
    await _checkAttemptThrottle();
    if (loadState().paused === true) return { result: 'PAUSED_DURING_THROTTLE' };
    _recordAttempt();
    // ★target の order ID を抽出(SUCCESS判定の照合用)
    const orderInput = cartForm.querySelector('input[name="order"]');
    const targetOrderId = orderInput ? orderInput.value : null;
    // ★before fetch を省略(knownCartIds を使う) → 試行ごとの fetch 1回削減
    const beforeIds = knownCartIds || [];
    const qty = applyQuantityCap(target);
    // ★mainLoop と keepalive の相互排他: 同時 cart_add で件数増を誤検知することを防ぐ
    const lockResult = await withCartOpLock('cart-add', async () => {
    const _t0 = Date.now();
    // ★Phase 13 (2026-06-05): 1発目が /error/4/ で弾かれる原因究明の診断ログ
    //   POST 直前のフォーム中身 (hidden input の名前と値長) + ページ経過時間を記録。
    //   1発目(弾かれる) と 2発目(通る) で「トークンが空か」「経過時間」 を CSV で diff できる。
    try {
      const _perfMs = (typeof performance !== 'undefined' && performance.now) ? Math.round(performance.now()) : null;
      const _inputs = Array.from(cartForm.querySelectorAll('input,select,textarea')).map(el => {
        const nm = el.name || el.id || '(noname)';
        const v = (el.value || '');
        return `${nm}:${v.length}`;  // 値そのものは記録しない (名前:値長 のみ)
      });
      // Akamai 系の隠しフィールド/トークンらしきものを強調
      const _hasTokenLike = _inputs.some(s => /token|csrf|nonce|abck|sensor|_/.test(s.toLowerCase()));
      const _ck = (document.cookie || '').split(';').map(c=>c.split('=')[0].trim()).filter(Boolean);
      pbLog('🔬','post-diag',
        `POST直前 perf=${_perfMs}ms form入力[${_inputs.join(',')}] tokenLike=${_hasTokenLike} cookie数=${_ck.length}`,
        { perfMs: _perfMs, inputs: _inputs, cookieNames: _ck });
    } catch (_e) {}
    // ★iframe form.submit() でブラウザの手動操作と同等の POST(2026-05-10 BotManager 突破)
    const submitRes = await cartAddViaFormSubmit(cartForm, qty, 10000);
    const _t1 = Date.now();
    if (submitRes.error) {
      pbLog('⚠','attempt',`カート送信 中断: ${submitRes.error} (after ${_t1-_t0}ms) → 次試行へ`);
      return { result: 'NETWORK_ERROR', timings: { post: _t1-_t0, body: 0, decode: 0, cartFetch: 0, total: _t1-_t0 } };
    }
    const html = submitRes.html || '';
    const finalUrl = submitRes.finalUrl || '';
    // ★所要時間記録: form.submit 経由なので post に submit〜onload までを含む(cart fetch は 0、 redirect 先 HTML が同時取得済み)
    const _timings = { post: _t1-_t0, body: 0, decode: 0, cartFetch: 0, total: _t1-_t0 };

    // ★Phase 9-1: POST レスポンス詳細 (BAN 切り分けのため、 attempt-result ログに含める)
    const _respDetailParts = [];
    if (finalUrl) {
      try { _respDetailParts.push(`finalPath=${new URL(finalUrl).pathname.substring(0, 40)}`); }
      catch (_) { _respDetailParts.push(`finalUrl=${finalUrl.substring(0, 40)}`); }
    }
    _respDetailParts.push(`htmlLen=${html.length}`);
    const _markers = [];
    if (/class="[^"]*form-error/i.test(html)) _markers.push('form-error');
    if (/class="[^"]*cart-fail/i.test(html)) _markers.push('cart-fail');
    if (/カートに追加しました/.test(html)) _markers.push('added-msg');
    if (/ご希望の商品は在庫がございません/.test(html)) _markers.push('stock-out-msg');
    if (/大変混み合っている/.test(html)) _markers.push('busy-msg');
    if (/サイト閲覧状況に関するお知らせ/.test(html)) _markers.push('access-control-msg');
    if (_markers.length) _respDetailParts.push(`markers=[${_markers.join(',')}]`);
    const _respDetail = _respDetailParts.join(' ');
    // ★Phase 9-RR2 (2026-05-29): サーバ反応判定用フラグ
    //   markers が 1 個以上 = サーバが意味のあるレスポンス HTML を返した = ポップアップ相当の文字列あり
    //   これを attempt loop の遅延判定 (line 2288 周辺) で使う
    const _hadPopupMarker = _markers.length > 0;

    if (detectAccessControl(html)) return { result: 'ACCESS_CONTROL', detail: _respDetail, hadPopupMarker: _hadPopupMarker };
    // ★STOCK_OUT 確定パスは件数判定不要
    if (detectStockOut(html)) {
      return { result: 'STOCK_OUT', afterIds: beforeIds, timings: _timings, detail: _respDetail, hadPopupMarker: _hadPopupMarker };
    }
    // ★iframe の最終 URL がカート画面なら、 redirect 後の cart HTML が取れている
    //   cart_del/{id} を抽出して件数判定 → SUCCESS なら即 break
    //   PB の典型パターン: /cart_add/ → 302 → /cart/ もしくは /cart_complete/
    const cartIds = [...html.matchAll(/cart_del\/(\d+)\//g)].map((m) => m[1]);
    if (cartIds.length > beforeIds.length) {
      const newIds = cartIds.filter((x) => !beforeIds.includes(x));
      // ★order ID 照合: 真の SUCCESS は「target の orderId が新規IDに含まれる」のみ
      const isRealSuccess = targetOrderId && newIds.includes(targetOrderId);
      if (!isRealSuccess) {
        pbLog('🛒','attempt',`カート内に別商品あり(対象とは異なる order=${targetOrderId||'(空)'})→ 監視継続(既存カート維持)`);
        return { result: 'UNCONFIRMED', afterIds: cartIds, timings: _timings, detail: _respDetail, hadPopupMarker: _hadPopupMarker };
      }
      return { result: 'SUCCESS', newOrderIds: newIds, afterIds: cartIds, timings: _timings, detail: _respDetail, hadPopupMarker: _hadPopupMarker };
    }
    if (detectCartFailBusy(html)) return { result: 'BUSY', afterIds: cartIds, timings: _timings, detail: _respDetail, hadPopupMarker: _hadPopupMarker };
    // ★cartIds が取れなかった場合、 商品ページに留まっている可能性 → afterIds は beforeIds 維持
    //   (POST が 200 で同じ商品ページが返ったケース、 redirect 失敗ケース)
    return { result: 'UNCONFIRMED', afterIds: (cartIds.length > 0 ? cartIds : beforeIds), timings: _timings, detail: _respDetail, hadPopupMarker: _hadPopupMarker };
    });  // withCartOpLock end
    // ★ロック取得失敗(他で5秒以上 cart_add 実行中)時は UNCONFIRMED 扱いで次試行へ
    if (lockResult && lockResult.skipped === 'lock-timeout') {
      return { result: 'UNCONFIRMED' };
    }
    return lockResult;
  }

  // ★Phase 16 (2026-06-09 実験): 2発目以降を「本物のカートボタン実クリック + 小窓待ち」で行う
  //   背景: 6/9 ログで 同一ページ上の iframe 連打は 2発目以降ほぼ全部 /error/4/(bot拒否) と判明。
  //   HIROさんの手動フロー(押す→小窓を確認→次を押す)を再現する:
  //     - 本物ボタン(#buy / #buy_side)を click() → サイト本来の JS が小窓(モーダル)を出す
  //     - 小窓が出るまで待つ(遅い応答もそのまま待ち切る。 早い見切りリロードはしない)
  //     - 「入った」→ カート照合して SUCCESS / 「在庫なし・混雑・エラー」→ 閉じて次の押下へ
  //     - waitCapMs(既定90秒)完全沈黙 = ページが死んでいる と判断 → DEAD_PAGE 返却(呼び元でリロード救出)
  //   戻り値は attemptCartAddOnce 互換: { result, newOrderIds?, afterIds, timings, detail }
  async function realButtonAttemptOnce(target, knownCartIds, waitCapMs) {
    const t0 = Date.now();
    const beforeIds = knownCartIds || [];
    const cap = waitCapMs || 90000;
    // エラー/売り切れ系文言。 ★Phase 21b (2026-06-11): 実発売で「注文できる商品がございません」 が出て
    //   ERR_RE に無く realButtonAttemptOnce が約30-47秒スタックした(watchdog救出まで固まる)→ 追加。
    // ★Phase 27 (2026-06-25): 「商品数変更が出来ない|個数に不足」 を成功(CART_ADDED_RE)から非成功(ERR_RE)へ移動。
    //   この小窓はカート未投入でも出る曖昧文言で、 成功誤判定の主因だった(6/25 HIROさん緊急指摘)。
    //   ERR_RE 扱い = 小窓を閉じて連打継続。 真にカート入りなら buttonState の ALREADY_IN_CART/LIMIT で検知される。
    const ERR_RE = /大変混み合っているため|在庫がございません|追加できません|エラーが発生|注文できる商品がございません|販売(を|が)?終了|受付(を|が)?終了|完売|商品数変更が出来ない|個数に不足/;
    const btn = document.getElementById('buy') || document.getElementById('buy_side');
    const _mk = (result, extra) => Object.assign({ result, afterIds: beforeIds,
      timings: { post: Date.now()-t0, body:0, decode:0, cartFetch:0, total: Date.now()-t0 } }, extra || {});
    if (!btn) return _mk('UNCONFIRMED', { detail: 'realbtn-no-button' });
    // 本物ボタンを実クリック(サイト本来の add-to-cart JS を発火させる)
    try { btn.click(); } catch (e) { return _mk('UNCONFIRMED', { detail: 'realbtn-click-err:' + e.message }); }
    // 小窓(モーダル)が出るまで待つ。 遅い応答も待ち切る。 cap 完全沈黙のみ救出
    let outcome = null; // 'added' | 'error'
    // ★2026-07-07 (二重カートイン修正 / HIROさん案「カートに商品が追加されました で止める」):
    //   実障害(7/7 デナン): 1発目で成功小窓の「閉じる」ボタンが先に描画され、「カートに商品が追加されました」
    //   テキストが出る前の一瞬に「未知小窓=error」と50msで即断→再押下→2発目でもう1個追加(二重)。
    //   対策: 明確な未追加エラー(混雑/売切れ)以外の小窓は即 error 断定せず、成功小窓の描画を _graceMs 待つ。
    //   さらに猶予切れ時は「個数不足」等でテキスト無しに入る場合に備え、再押下の前に実カートを1回確認。
    const CLEAR_ERR_RE = /大変混み合っているため|在庫がございません|注文できる商品がございません|販売(を|が)?終了|受付(を|が)?終了|完売/;
    const _graceMs = (loadConfig().options || {}).added_popup_grace_ms || 700;
    const _bgCartCheck = (loadConfig().options || {}).background_cart_check === true;
    let _ambigSince = 0;
    while (Date.now() - t0 < cap) {
      if (loadState().paused === true) return _mk('PAUSED', { detail: 'realbtn-paused' });
      // ★成功小窓「カートに商品が追加されました」= 最優先で確定・停止(HIROさん指定の停止条件)
      if (detectCartAddedPopup()) { outcome = 'added'; break; }
      const bs = buttonState();
      if (bs.reason === 'ALREADY_IN_CART' || bs.reason === 'LIMIT') { outcome = 'added'; break; }
      const bodyText = (document.body && document.body.innerText) || '';
      // ★Phase 32: エラーもネイティブ alert() で来て Phase 31 が抑止する場合がある → 直近の抑止alert文言も見る
      let _laMsg = '';
      try { const _la = window._pbLastAlert; if (_la && (Date.now() - _la.at < 4000)) _laMsg = _la.msg || ''; } catch (_) {}
      // ★明確な「未追加」エラー(混雑/売切れ)は即 error(高速再試行、二重リスク無し)
      if (CLEAR_ERR_RE.test(bodyText) || CLEAR_ERR_RE.test(_laMsg)) { outcome = 'error'; break; }
      // ★それ以外の error文言/未知の閉じる小窓 = 曖昧 → すぐ error 断定せず成功小窓の描画を猶予待ち
      let _isErrLike = ERR_RE.test(bodyText) || ERR_RE.test(_laMsg);
      if (!_isErrLike) {
        try {
          const _cands = $$('button, a, span, div');
          for (const _e of _cands) {
            const _t = (_e.innerText || '').trim();
            if (_t === '閉じる' || _t === '✕' || _t === '×') {
              const _near = (((_e.closest && _e.closest('div,section,dialog,article')) || _e).innerText || '');
              if (_near.length > 0 && _near.length < 400 && !/Cookie|クッキー|同意|consent|許可する/i.test(_near)) { _isErrLike = true; break; }
            }
          }
        } catch (_) {}
      }
      if (_isErrLike) {
        if (!_ambigSince) _ambigSince = Date.now();
        if (Date.now() - _ambigSince >= _graceMs) {
          // ★猶予切れ: 成功小窓「カートに商品が追加されました」は出なかった → error(再押下)。
          //   ★background_cart_check=true の時だけ再押下前に実カート確認して二重を防ぐ(=/cart/裏フェッチ)。
          //     false(既定)は裏フェッチせず error(見える判定のみ)。 二重は成功小窓待ち(_graceMs)で防ぐ。
          if (_bgCartCheck) {
            try {
              const _cf = findCartFormOnPage();
              const _oi = _cf ? _cf.querySelector('input[name="order"]') : null;
              const _oid = _oi ? _oi.value : null;
              if (_oid) {
                const _cart = await getCartItemIds();
                if (_cart && _cart.ids && _cart.ids.includes(_oid)) {
                  const _tt = Date.now() - t0;
                  pbLog('✅','attempt',`エラー小窓だが実カートに商品あり → SUCCESS扱いで停止(二重防止) order=${_oid}`);
                  return { result: 'SUCCESS', newOrderIds: [_oid], afterIds: _cart.ids, timings: { post:_tt, body:0, decode:0, cartFetch:0, total:_tt }, detail: `realbtn-verified-in-cart(待ち${_tt}ms)` };
                }
              }
            } catch (_) {}
          }
          outcome = 'error'; break;
        }
        // 猶予内 → 継続(次ループで detectCartAddedPopup=追加されました を見張り続ける)
      }
      await sleep(150);
    }
    const total = Date.now() - t0;
    const timings = { post: total, body: 0, decode: 0, cartFetch: 0, total: total };
    if (outcome === 'added') {
      // ★Phase 21 (2026-06-11): 成功小窓(カート追加/在庫不足で入った/ALREADY_IN_CART)が出た時点で
      //   カート確保は確定。 getCartItemIds(p-bandai SPA 化で /cart/ も JS 描画 → 件数取得不能)に頼って
      //   照合すると成功が UNCONFIRMED に落ち、 取りこぼして連打を続けていた。 小窓そのものを確証として SUCCESS。
      const cf = findCartFormOnPage();
      const oi = cf ? cf.querySelector('input[name="order"]') : null;
      const oid = oi ? oi.value : null;
      return { result: 'SUCCESS', newOrderIds: oid ? [oid] : [], afterIds: beforeIds, timings, detail: `realbtn-added(待ち${total}ms)` };
    }
    if (outcome === 'error') {
      try { dismissAnyPopup(); } catch (_) {}
      return { result: 'UNCONFIRMED', afterIds: beforeIds, timings, detail: `realbtn-error-popup(待ち${total}ms)`, hadPopupMarker: true };
    }
    // cap 完全沈黙 = ページが死んでいる → 呼び元でリロード救出
    return { result: 'DEAD_PAGE', afterIds: beforeIds, timings, detail: `realbtn-no-popup(沈黙${total}ms)` };
  }

  // =================================================================
  // 8. 通知(Discord)
  // =================================================================
  async function notifyDiscord(payload) {
    const cfg = loadConfig();
    const url = (cfg.notify || {}).discord_webhook;
    // ★静的配信(GitHub)対応: webhook が未設定 / プレースホルダー / 不正形式なら送らない。
    //   配布物は webhook 空で出荷 → 各自 ⚙設定 で入力。 空や  のまま
    //   POST すると毎回「送信失敗」 ログが出るため、 Discord 形式の URL のみ送信する。
    if (!url || !/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url)) return;
    try {
      await fetchWithTimeout(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      pbLog('📨','notify','Discord 送信完了');
    } catch (e) { pbLog('❌','notify','Discord 送信失敗: '+e.message); }
  }
  async function notifyCartSuccess(target, newOrderIds) {
    const cfg = loadConfig();
    const tag = (cfg.notify || {}).device_tag || '📱';
    const kind = getKind(target) === 'new' ? '新発売' : '再販';
    const qty = applyQuantityCap(target);
    const cartUrl = location.origin + '/cart/';
    const name = effectiveName(target);
    const psa = (cfg.options || {}).post_success_action || 'stop';
    const psaLabel = {
      stop: 'A. 確保したら停止(決済を待つ)',
      safe: 'B. 控えめ続行(次商品へ)',
      normal: 'C. 続行(次商品へ)',
    }[psa] || psa;
    // ★現在ページと target が一致するか確認(動作モードB/Cの自動遷移検知)
    const curUrl = currentProductUrl();
    const tgtUrl = normalizeProductUrl(target.url);
    const onSamePage = (curUrl === tgtUrl);
    const headerNote = onSamePage
      ? `${tag} ✅ **カート確保** — ${name}`
      : `${tag} ⚠ **別商品ページから自動遷移して確保(動作モード ${psa})** — ${name}\n` +
        `(HIROさんが今見ているタブとは別の商品です)`;
    const fields = [
      { name: '種別', value: kind, inline: true },
      { name: '個数', value: String(qty), inline: true },
      { name: '端末', value: tag, inline: true },
      { name: '動作モード', value: psaLabel, inline: false },
      { name: '商品URL', value: target.url, inline: false },
      { name: '注文ID', value: (newOrderIds || []).join(', ') || '(不明)', inline: false },
      { name: 'カート', value: `[カートを開く](${cartUrl})`, inline: false },
    ];
    if (!onSamePage) {
      fields.unshift({ name: '📍 表示ページ vs 確保商品', value: `現在表示: ${curUrl}\n確保商品: ${tgtUrl}\n→ 動作モード ${psa} の自動遷移経由`, inline: false });
    }
    await notifyDiscord({
      content: headerNote,
      embeds: [{
        title: name, url: target.url,
        color: onSamePage ? 0x5fd47f : 0xff9933,  // 正常=緑 / 警告(自動遷移)=オレンジ
        fields,
        footer: { text: `PB-CART  ／  カート保持 60分(キープアライブで延長可)  ／  確保後の挙動: ${psaLabel}` },
        timestamp: new Date().toISOString(),
      }],
    });
  }

  // =================================================================
  // 9. Cookie全削除
  // =================================================================
  // PB-CART の設定 localStorage キーを保護(削除しない)
  const PB_RESERVED_KEYS = [CONFIG_KEY, STATE_KEY, META_KEY, ERROR_KEY, LOG_KEY, LOG_KEY_MERGED, 'pb_cart_v2_reload_marker'];

  // Cookie + Cache のみ削除(localStorage は保護 = 設定が消えない)
  // 定期実行向け: アクセス制限予防のための予防的クリア
  // ★Phase 12 (2026-06-05): Akamai BotManager の「合格証」 Cookie は削除しない
  //   理由: 6/4-6/5 ログで「Cookie 削除直後のタブが /error/4/ 連発 → 強制ログアウト」 を確認。
  //         _abck 等を消すと Akamai が「合格証のない新顔」 として毎回審査 → 遅延 + cart_add 拒否 (/error/4/)。
  //         人間は _abck を保持し続けるので、 温存する方が「継続中の人間セッション」 として速く通る。
  //   対象: Akamai BotManager 標準 Cookie 群 (前方一致)。 PB のカート/セッション Cookie は従来通り削除。
  const AKAMAI_COOKIE_PREFIXES = ['_abck', 'bm_sz', 'ak_bmsc', 'bm_sv', 'bm_mi', 'bm_s', '_cf_bm', 'ak_bmsc'];
  function _isAkamaiCookie(name) {
    const n = (name || '').toLowerCase();
    return AKAMAI_COOKIE_PREFIXES.some(p => n === p || n.startsWith(p));
  }
  //   includeAkamai=true の時だけ Akamai Cookie も削除 (nukeAllSiteData の緊急リセット用)
  function clearCookiesPreserveConfig(includeAkamai) {
    const cookies = document.cookie.split(';');
    const hosts = [location.hostname, '.' + location.hostname, '.p-bandai.jp', 'p-bandai.jp'];
    const paths = ['/', location.pathname, '/item/', '/cart/'];
    let deleted = 0;
    let kept = 0;
    const keptNames = [];
    for (const c of cookies) {
      const name = c.split('=')[0].trim();
      if (!name) continue;
      // ★Phase 12: Akamai 合格証 Cookie は温存 (削除しない)。 ただし includeAkamai=true なら消す
      if (!includeAkamai && _isAkamaiCookie(name)) { kept++; if (keptNames.length < 6) keptNames.push(name); continue; }
      for (const h of hosts) for (const p of paths) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${p}; domain=${h};`;
      }
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
      deleted++;
    }
    if (window.caches) caches.keys().then(k => k.forEach(c => caches.delete(c))).catch(()=>{});
    pbLog('🍪','cookie',`${deleted}個削除 / Akamai ${kept}個温存${keptNames.length?` [${keptNames.join(',')}]`:''} (PB-CART設定は保持)`);
    return deleted;
  }

  // 完全リセット(緊急時のみ、PB-CART設定も含めて全削除)
  //   ★Phase 12: アクセス制御からの脱出が目的なので、 ここだけは Akamai Cookie も消して出直す
  function nukeAllSiteData() {
    clearCookiesPreserveConfig(true);  // includeAkamai=true
    // localStorage は予約キー以外を削除
    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (!PB_RESERVED_KEYS.includes(k)) {
          try { localStorage.removeItem(k); } catch (_) {}
        }
      }
    } catch (e) {}
    clearSessionKeepTabId();  // ★Phase 9-M: TAB_ID は保持
    pbLog('💥','nuke','サイトデータ全削除完了(PB-CART 設定は保持)');
  }

  // 定期キャッシュクリアタイマー
  // 条件: カート空のときだけ実行(カートに何かあれば消えるからスキップ)
  let _cleanupTimer = null;
  function startPeriodicCleanup() {
    if (_cleanupTimer) clearInterval(_cleanupTimer);
    const cfg = loadConfig();
    const opts = cfg.options || {};
    if (!opts.periodic_cleanup_enabled) {
      pbLog('🍪','cleanup','disabled');
      return;
    }
    const intervalMin = Math.max(3, Math.min(60, opts.periodic_cleanup_minutes || 10));
    pbLog('🍪','cleanup',`定期実行: ${intervalMin}分間隔(カート空時のみ)`);
    _cleanupTimer = setInterval(async () => {
      const state = loadState();
      if (state.paused === true) return;
      const nonEmpty = await isCartNonEmpty();
      if (nonEmpty) {
        pbLog('🍪','cleanup','カート非空 → スキップ(商品が消えるため)');
        return;
      }
      pbLog('🍪','cleanup','カート空 → Cookie削除実行(予防的)');
      clearCookiesPreserveConfig();
    }, intervalMin * 60 * 1000);
  }

  // =================================================================
  // 10. メインループ(投入処理)
  // =================================================================
  // ★mainLoop の重複実行を防ぐミューテックス
  //   複数経路(setTimeout / 保険タイマー / 設定モーダル閉 等)から並列で呼ばれると
  //   試行ループのカウンタが交錯して UI 表示が「1, 5, 2, 6...」とバラバラに見える
  //   → 既に実行中なら新しい呼び出しはスキップ(最後に「再実行依頼」だけセット)
  let _mainLoopRunning = false;
  let _mainLoopRequested = false;
  // ★Watchdog: mainLoop の heartbeat を記録し、30秒以上脈なしなら強制再起動
  //   await fetch が iOS Safari でハングする等の事故から自動復旧する保険機構
  //   2026-05-10: localStorage にも heartbeat を書き込んで、 タブ kill 後の boot で復帰検知
  let _mainLoopHeartbeat = Date.now();
  let _lastHeartbeatPersist = 0;
  function recordMainLoopHeartbeat() {
    _mainLoopHeartbeat = Date.now();
    // ★永続化はサンプリング(5秒に1度のみ): localStorage 書き込み頻度を絞り iOS Safari 圧迫軽減
    //   タブ kill 検知の精度は 5秒粒度で十分(復帰時の判定閾値は 10秒以上)
    if (_mainLoopHeartbeat - _lastHeartbeatPersist > 5000) {
      _lastHeartbeatPersist = _mainLoopHeartbeat;
      try {
        const s = loadState();
        s.lastMainLoopHeartbeat = _mainLoopHeartbeat;
        saveState(s);
      } catch (e) {}
    }
  }
  let _mainLoopWatchdogTimer = null;
  function startMainLoopWatchdog() {
    if (_mainLoopWatchdogTimer) clearInterval(_mainLoopWatchdogTimer);
    _mainLoopWatchdogTimer = setInterval(() => {
      try {
        const st = loadState();
        if (st.paused === true) {
          // ★paused 中は heartbeat を生かしておく(2026-05-11 修正: 再開直後の誤発火防止)
          recordMainLoopHeartbeat();
          return;
        }
        // ★Phase 17 (2026-06-10): 表示中タブのみ稼働モードでは、 裏(hidden)タブを watchdog でリロードしない。
        //   旧来 watchdog は 30秒ごとに reload するため、 これを抑えないと裏タブが動き続けてしまう。
        if ((loadConfig().options || {}).foreground_only !== false && document.hidden) {
          recordMainLoopHeartbeat();  // 表示復帰時の誤発火を防ぐため heartbeat は生かす
          return;
        }
        // ★商品ページじゃない時(ホーム/カテゴリ等)も watchdog 監視外
        if (typeof isProductPage === 'function' && !isProductPage()) {
          recordMainLoopHeartbeat();
          return;
        }
        // ★Phase 10 (2026-06-04): 監視対象 (target) がない商品ページも watchdog 監視外
        //   旧バグ: 登録外/確保済み商品ページでも watchdog が 30秒ごとに reload し続けた
        //   (6/2 深夜 item-1000251844 で 31 連発 = BAN リスク + HIROさん のブラウジング妨害)
        //   target が無い = 復帰させる監視ループが無い → reload する意味がない
        try {
          if (typeof findTargetProduct === 'function') {
            const _wdTarget = findTargetProduct(loadConfig(), st);
            if (!_wdTarget) { recordMainLoopHeartbeat(); return; }
          }
        } catch (_) {}
        // ★設定モーダル開いてる時は mainLoop が defer されてるため監視外(2026-05-11 追加)
        //   モーダル開きっぱなし放置で 64〜66秒 watchdog 連発する事象の対策
        if (typeof isSettingsModalOpen === 'function' && isSettingsModalOpen()) {
          recordMainLoopHeartbeat();
          return;
        }
        // ★Phase 9-8 (2026-05-12): 60秒 → 30秒に短縮、 mainLoop 再起動 → location.reload() に変更
        //   理由: タブが半凍結 (mainLoop だけ停止) の場合、 mainLoop 再起動より完全リロードの方が確実
        //   HIROさん 監視運用前提、 Discord 通知やリロード上限は設けない
        const sinceMs = Date.now() - _mainLoopHeartbeat;
        if (sinceMs > 30000) {
          pbLog('🚨','watchdog',`mainLoop が ${Math.floor(sinceMs/1000)}秒間 heartbeat なし → 強制リロード`);
          recordMainLoopHeartbeat();
          try { location.reload(); } catch (e) {
            // reload 失敗時のフォールバック
            _mainLoopRunning = false;
            setTimeout(mainLoop, 0);
          }
        }
      } catch (e) {}
    }, 10000);  // 10秒ごとに監視
  }
  // ★visibilitychange ハンドラ(2026-05-10 クラッシュ復帰)
  //   iOS Safari がタブを suspend/kill して visible に戻ったら、
  //   mainLoop が止まったままになっていることがある → 強制再起動
  function startMainLoopVisibilityRecovery() {
    if (window._pbMainLoopVisHandler) return;
    window._pbMainLoopVisHandler = () => {
      try {
        if (document.visibilityState !== 'visible') return;
        const st = loadState();
        if (st.paused === true) return;
        // ★商品ページじゃない時は再起動不要
        if (typeof isProductPage === 'function' && !isProductPage()) return;
        // ★Phase 10 (2026-06-04): 監視対象がない商品ページも再起動不要 (watchdog と同じ理由)
        try {
          if (typeof findTargetProduct === 'function') {
            const _vrTarget = findTargetProduct(loadConfig(), st);
            if (!_vrTarget) return;
          }
        } catch (_) {}
        // ★設定モーダル開いてる時は再起動不要(モーダル閉じた時に再起動される)
        if (typeof isSettingsModalOpen === 'function' && isSettingsModalOpen()) return;
        // ★Phase 9-8 (2026-05-12): mainLoop 再起動 → location.reload() に変更
        //   理由: タブが suspend/kill から復帰した直後は、 mainLoop 再起動より完全リロードの方が確実
        //   HIROさん 監視運用前提、 タブを見た瞬間に必ず動き出す
        const sinceMs = Date.now() - _mainLoopHeartbeat;
        if (sinceMs > 5000) {
          pbLog('👁','vis-recovery',`タブ復帰: 直前 ${Math.floor(sinceMs/1000)}秒 heartbeat なし → 強制リロード`);
          recordMainLoopHeartbeat();
          try { location.reload(); } catch (e) {
            // reload 失敗時のフォールバック
            _mainLoopRunning = false;
            setTimeout(mainLoop, 0);
          }
        }
      } catch (e) {}
    };
    document.addEventListener('visibilitychange', window._pbMainLoopVisHandler);
  }
  async function mainLoop() {
    if (_mainLoopRunning) {
      _mainLoopRequested = true;
      return;
    }
    _mainLoopRunning = true;
    recordMainLoopHeartbeat();
    try {
      await mainLoopBody();
    } finally {
      _mainLoopRunning = false;
      recordMainLoopHeartbeat();
      // 実行中に別の呼び出しが来ていたら、1回だけ追加実行
      if (_mainLoopRequested) {
        _mainLoopRequested = false;
        setTimeout(mainLoop, 0);
      }
    }
  }
  async function mainLoopBody() {
    // 設定モーダルが開いている間は何もしない(閉じるまで待つ)
    await waitWhileSettingsOpen('mainLoop-entry');
    const cfg = loadConfig();
    const state = loadState();
    if (state.paused === true) { updateUI(); return; }

    // ★Phase 17 (2026-06-10): iOS 表示中タブのみ稼働。 裏(hidden)タブはカート投入もリロードもしない。
    //   foreground_only=true(既定) かつ タブが非表示なら、 何もせず待機 → 表示に戻ったら自動再開。
    //   既存 vis-recovery は heartbeat 失効(>5秒)時のみ reload するため、 短時間の切替も拾えるよう
    //   一度きりの visibilitychange リスナーで mainLoop を再開する(mainLoop の二重起動ガードで安全)。
    if ((cfg.options || {}).foreground_only !== false && document.hidden) {
      updateUI({ status: '🙈 裏のタブは停止中(このタブを表示すると再開)' });
      pbLog('🙈','foreground','タブ非表示 → 待機(表示で自動再開)');
      if (!window._pbFgResumeWaiting) {
        window._pbFgResumeWaiting = true;
        const _pbFgResume = () => {
          if (!document.hidden) {
            window._pbFgResumeWaiting = false;
            document.removeEventListener('visibilitychange', _pbFgResume);
            pbLog('👁','foreground','タブ表示 → 再開');
            mainLoop();
          }
        };
        document.addEventListener('visibilitychange', _pbFgResume);
      }
      return;
    }

    // ★Phase 22 (2026-06-11): Akamai(CDN) 防御強化(発売殺到時のブロック/ホーム弾き返し)を検知 → クールダウン。
    //   即リロードで混雑にリクエストをぶつけ続けると、 ブロックを長引かせ自滅する。 検知したら数十秒待ってから再開。
    //   edge=エッジエラー画面 / bounce=商品監視中なのにホームへ弾き返し。
    {
      const _akBlock = detectAkamaiBlock();
      if (_akBlock) {
        const _cd = (cfg.options || {}).akamai_cooldown_ms || 40000;
        pbError('warn','akamai-block',
          `Akamai防御強化を検知(${_akBlock==='edge'?'エッジエラー画面':'ホーム弾き返し'}) → ${Math.round(_cd/1000)}秒ごとに再確認(解けたら自動で購入再開・停止ではない)`);
        updateUI({ status: `🛡 Akamai防御強化を検知\n${Math.round(_cd/1000)}秒ごとに再確認 → 解け次第 自動で購入再開` });
        if (await interruptibleSleep(_cd)) { updateUI(); return; }   // 停止押下で即中断
        if (loadState().paused === true) { updateUI(); return; }
        await safeReload('akamai-cooldown');
        return;
      }
    }

    const target = findTargetProduct(cfg, state);
    if (!target) {
      // ★target=null だが商品ページ + 登録あり = 状況変化(release_time追加・モード切替等)で復帰可能
      //   30秒後に再評価して、 HIROさん が手動リロードしなくても自動で動き始めるように
      const cur = currentProductUrl();
      const registered = cfg.products.find(p => p.url && normalizeProductUrl(p.url) === cur);
      const releaseOnly = !!(cfg.options || {}).new_release_only_mode;
      if (registered && !registered.acquired && releaseOnly) {
        // 新発売狙いモードで対象外 → 状況把握できるステータス表示
        const rt = effectiveReleaseTime(registered);
        if (!rt) {
          updateUI({ status: `⏸ 対象外(release_time未設定)\n設定→「新発売狙いモード」OFF で監視可能` });
        } else {
          const elapsedMin = Math.floor((Date.now() - new Date(rt).getTime()) / 60000);
          const grace = cfg.options.new_release_grace_minutes != null ? cfg.options.new_release_grace_minutes : 30;
          if (elapsedMin > grace) {
            updateUI({ status: `⏸ 監視終了(発売${elapsedMin}分経過 > ${grace}分)\n設定で grace 延長 or モード OFF` });
          } else {
            updateUI({ status: '⏸ 対象外ページ' });
          }
        }
        // 30秒後に再評価(モード OFF にされたら自動復帰)
        setTimeout(() => mainLoop(), 30000);
      } else {
        updateUI({ status: '⏸ 対象外ページ' });
      }
      return;
    }

    if (!state.productAttempts[target.id]) {
      state.productAttempts[target.id] = { reloads: 0 };
      saveState(state);
    }

    // ★発売時刻待機(段階的ポーリング + 保険タイマー)
    const rt = effectiveReleaseTime(target);
    if (rt) {
      const releaseMs = new Date(rt).getTime();
      const remainMs = releaseMs - Date.now();

      // ★保険タイマー: 商品ごとの use_timer フラグで制御(設定モーダルでチェック可能)
      //   ON(デフォルト): 発売時刻ジャストに mainLoop強制再起動 → ポーリング失敗の保険
      //   OFF: ポーリングのみ
      const useTimer = target.use_timer !== false;
      const _timerKey = '_pbReleaseTimer_' + target.id;
      if (useTimer && remainMs > 100 && !window[_timerKey]) {
        window[_timerKey] = true;
        setTimeout(() => {
          pbLog('⏰','release-timer',`★発売時刻到達タイマー作動 → 投入処理開始: ${effectiveName(target)}`);
          window[_timerKey] = false;
          setTimeout(mainLoop, 0);
        }, remainMs);
        pbLog('⏰','release-timer',`タイマー予約: ${remainMs}ms 後(${new Date(rt).toLocaleTimeString('ja-JP')}) ジャストで発火`);
      }

      if (remainMs > 1500) {
        // まだ余裕あり → 段階的ポーリング(残り時間で間隔を変える)
        let pollMs;
        if (remainMs > 60000) pollMs = 5000;       // 60秒以上前: 5秒間隔
        else if (remainMs > 15000) pollMs = 1000;  // 15〜60秒前: 1秒間隔
        else pollMs = 200;                           // 1.5〜15秒前: 200ms間隔
        // 次回起動は 発売時刻800ms前 を超えないように
        const wakeMs = Math.min(pollMs, remainMs - 800);
        updateUI({ status: `⏰ 発売まで残り ${Math.ceil(remainMs/1000)}秒` });
        pbLog('⏰','main',`発売まで残り ${Math.ceil(remainMs/1000)}秒 / 次回 ${wakeMs}ms 後にポーリング`);
        setTimeout(mainLoop, Math.max(50, wakeMs));
        return;
      }
      if (remainMs > 0) {
        // ★新方式の場合: 実リロード不要、ポーリングが自動で発売時刻ジャストを検知
        //   サーバが返すHTMLが青に変わった瞬間にポーリングが拾う → 連打 → 確保
        //   画面切替・ページロード時間ゼロで確実
        const useLightPollEarly = !((cfg.options || {}).lightweight_polling === false);
        if (useLightPollEarly) {
          updateUI({ status: `⏰ 発売直前 残り${remainMs}ms(監視中)` });
          pbLog('⏰','main',`発売直前ポーリング監視中 (残り ${remainMs}ms)`);
          // ポーリング間隔で再起動 → グレー検知でポーリングルートに入る
          setTimeout(mainLoop, Math.min(timing().poll_interval_ms, remainMs));
          return;
        }
        // ★旧方式のみ: 残り700ms前(低負荷:1000ms前)に実リロード発射
        const preReleaseLead = timing().pre_release_lead_ms;
        const preReloadDelay = Math.max(0, remainMs - preReleaseLead);
        updateUI({ status: `⏰ 発売直前 残り${remainMs}ms / ${preReloadDelay}ms後にリロード` });
        pbLog('🚀','main',`発売直前リロード予約 (${preReloadDelay}ms 後 / 残り ${remainMs}ms)`);
        if (preReloadDelay > 0) await sleep(preReloadDelay);
        pbLog('🚀','main','★発売直前リロード発射');
        await safeReload('pre-release');
        return;
      }
      // remainMs <= 0: 既に発売時刻過ぎてる → そのまま投入処理へ進む
      pbLog('✅','main',`発売時刻到達済(${-remainMs}ms 経過) → 即投入`);
    }

    // ★最速ボタン判定 — fetch 一切なし(reason別に挙動を分岐)
    //   ALREADY_IN_CART / LIMIT  → fetch なしで成功扱い(カート入り済み)
    //   STOCK_OUT / DISABLED / TEXT / NO_BUTTON → 即リロード(復活待ち、無限)
    //   OK → 青、下に進む
    {
      // ★HIROさん 2026-05-09 観察に基づく根本再設計:
      //   ライブDOM の buttonState = OK のみが「本物の在庫あり」の指標
      //   旧来の「生HTML 青検知 → 攻めモードで強制連打」は SUCCESS 率 0% で疲弊するだけ
      //   ライブDOM評価のみで判定する(boot直後のJS未実行窓を捕捉する旧来動作が最強)
      //
      // ★さらに重要: ガンダムベース系商品はJS書き換えが超速(数十〜200ms)で
      //   1回だけ評価すると常に STOCK_OUT になり OK 窓を取り逃す
      //   → 50ms 毎に最大10回(= 500ms) ポーリング
      //   ★2026-06-04 HIROさん 指摘で 5→10 に戻す: HIROさん 成功例は 500-700ms 以内なので
      //     5回(250ms)では青ボタンが 300-700ms で出るケースを取り逃していた (過去に勝手に半減させた誤り)
      // ★★★ Phase 19 (2026-06-10): p-bandai 遅延描画対応 ★★★
      //   2026-06-10 実測: p-bandai は読込後にまず薄い「白いシェル」(body 3要素)を出し、 2〜5秒かけて
      //   商品DOMを丸ごと描画する方式に変わった。 #buy はこの描画後に出現する。
      //   旧来は document-end(=白いシェル段階)で #buy 無し→NO_BUTTON→即リロード判定 → 描画前にリロード連発
      //   → 商品が永遠に描画されず「白い画面のままリロード地獄」 になっていた(562 boots/log)。
      //   対策: #buy も #buy_side も無い=まだ描画前 なら、 描画(ボタン出現)を最大 render_wait_max_ms 待つ。
      //     - ボタンが出たら即抜けて通常判定へ(発売時の青検知の速さは維持: #buy が在れば待たない)
      //     - 上限まで出なければそのまま進む(本当にボタンの無いページ等)
      if (!document.getElementById('buy') && !document.getElementById('buy_side')) {
        const _rWaitCap = (cfg.options || {}).render_wait_max_ms || 8000;
        const _rt0 = Date.now();
        let _rendered = false;
        updateUI({ status: '🖼 商品ページ描画待ち(白いシェル検知)' });
        while (Date.now() - _rt0 < _rWaitCap) {
          if (loadState().paused === true) { updateUI(); return; }
          if (isSettingsModalOpen()) break;
          if (document.getElementById('buy') || document.getElementById('buy_side')) { _rendered = true; break; }
          await sleep(200);
        }
        pbLog(_rendered ? '🖼' : '⏳', 'render',
          _rendered ? `商品描画を確認(待ち${Date.now()-_rt0}ms) → ボタン判定へ`
                    : `${_rWaitCap}ms 待っても #buy 未描画 → そのまま判定へ(白いシェル/無ボタンページ)`);
      }
      let bsEarly = buttonState();
      if (!bsEarly.clickable) {
        for (let i = 0; i < 10; i++) {
          await sleep(50);
          if (loadState().paused === true) { updateUI(); return; }
          if (isSettingsModalOpen()) break;  // 設定モーダル開いたら即離脱
          const bsNow = buttonState();
          if (bsNow.clickable && bsNow.reason === 'OK') {
            pbLog('🎯','main',`★boot 直後 ${(i+1)*50}ms で青ボタン検知`);
            bsEarly = bsNow;
            break;
          }
          // ALREADY_IN_CART/LIMIT 検知も同じく即離脱(下のフローで成功扱い)
          if (bsNow.reason === 'ALREADY_IN_CART' || bsNow.reason === 'LIMIT') {
            bsEarly = bsNow;
            break;
          }
        }
      }
      // 成功扱いとなる reason(カートにすでに入っている事を示すボタン状態)
      const isCartDone = (bsEarly.reason === 'ALREADY_IN_CART' || bsEarly.reason === 'LIMIT');
      if (isCartDone) {
        const reasonLabel = bsEarly.reason === 'LIMIT' ? '購入制限超過' : 'カート追加済み表示';
        pbError('success','cart',`既にカート確保済み(${reasonLabel}): ${effectiveName(target)}`);
        const s = loadState();
        if (!s.doneIds.includes(target.id)) {
          s.doneIds.push(target.id);
          s.lastSuccessAt = Date.now();
          saveState(s);
        }
        const c = loadConfig();
        const idx = c.products.findIndex(p => p.id === target.id);
        if (idx >= 0 && !c.products[idx].acquired) {
          c.products[idx].acquired = true;
          saveConfig(c);
          pbLog('✅','main',`acquired=true 自動設定: ${effectiveName(target)} reason=${bsEarly.reason}`);
        }
        const psa0 = (c.options || {}).post_success_action || 'stop';
        if (psa0 === 'stop') {
          pauseToolWithReason(`isCartDone-${bsEarly.reason}`);
          updateUI({ status: `✅ カート確保済み(${reasonLabel}) — 決済を待つ` });
        } else {
          updateUI({ status: '✅ カート確保済み — 次商品へ' });
          const nextP = c.products.find(p => p.id !== target.id && !p.acquired && !s.doneIds.includes(p.id));
          if (nextP) { await sleep(500); await safeNavigate(nextP.url, 'next-product'); }
        }
        return;
      }
      if (!bsEarly.clickable) {
        const s = loadState();
        const at = s.productAttempts[target.id] || { reloads: 0 };
        at.reloads = (at.reloads || 0) + 1;
        s.productAttempts[target.id] = at;
        saveState(s);
        const reasonLabel = bsEarly.reason === 'STOCK_OUT' ? '在庫待ち' : `待機中(${bsEarly.reason})`;
        // ★方式切替: 軽量ポーリング(画面据え置き) or 旧来の実リロード
        const useLightPoll = !((cfg.options || {}).lightweight_polling === false);
        if (useLightPoll) {
          // 【新方式】軽量ポーリング: fetch HTML → 差分更新 → 画面据え置き
          updateUI({ status: `🔍 ${reasonLabel} #${at.reloads}(画面据え置きで監視)` });
          // ★ログ整理: 毎pollではなく10回ごとに記録(冗長化抑制)
          if (at.reloads % 10 === 1) {
            pbLog('🔍','poll',`#${at.reloads} reason=${bsEarly.reason}(以降10回ごとに記録)`);
          }
          // ★ポーリング専用 sleep 値を使用(リロードsleepと分離)
          await humanSleep(timing().poll_interval_ms);
          // ★sleep 中に停止された可能性を確認(HIROさんが「⏸ 停止」押した直後)
          if (loadState().paused === true) { updateUI(); return; }
          const result = await refreshBuyButton();
          // ★fetch 中に停止された可能性も確認
          if (loadState().paused === true) { updateUI(); return; }
          if (result.accessControl) {
            pbError('error','access-control','poll中にアクセス制限検知 → 実リロード');
            await safeReload('access-from-poll');
            return;
          }
          if (!result.ok) {
            pbLog('⚠','poll',`ポーリング応答 異常(${result.status||result.error||'unknown'}) → リロードで再取得`);
            await safeReload('refresh-failed');
            return;
          }
          const bs2 = result.bs;
          if (bs2.reason === 'OK') {
            // ★連打フロー突入直前にも停止確認(最後の砦)
            if (loadState().paused === true) { updateUI(); return; }
            // ★案B 2026-05-09: 生HTML青判定だけではガンダムベース系で偽陽性多発
            //   → iframe で JS実行後の真のライブDOM 状態を確認してからリロード判断
            pbLog('🎯','poll',`青ボタン候補検知 (text="${bs2.text}") → 真DOM 二重確認中`);
            updateUI({ status: '🔍 青ボタン候補 → 在庫を再確認中' });
            const ifr = await pollViaIframe();
            if (loadState().paused === true) { updateUI(); return; }
            if (ifr.ok && ifr.bs.reason === 'OK') {
              // 真にライブDOMでも OK = 本物の在庫あり → リロードして連打フローへ
              pbLog('🎯','poll',`★真DOM 二重確認 OK (text="${ifr.bs.text}") → 連打フローへリロード`);
              updateUI({ status: '🎯 在庫確定 → リロードしてカート投入準備' });
              await humanSleep(timing().grey_mid_reload_sleep_ms);
              if (loadState().paused === true) { updateUI(); return; }
              await safeReload('poll-real-blue');
              return;
            }
            if (!ifr.ok) {
              // ★iframe で真DOM 二重確認できなかった(no-btn 等)
              //   → 取り逃しを避けるため、 生HTML の青判定を信用して リロードへ進む(保守的判断)
              pbLog('🔍','poll',`真DOM 二重確認 不可(${ifr.fail}) → 青ボタン候補を信用してリロード(取り逃し防止)`);
              updateUI({ status: '🎯 青ボタン候補 → リロードしてカート投入準備(取り逃し防止)' });
              await humanSleep(timing().grey_mid_reload_sleep_ms);
              if (loadState().paused === true) { updateUI(); return; }
              await safeReload('poll-iframe-failed');
              return;
            }
            // ifr.ok && ifr.bs.reason !== 'OK' = 真DOM では grey = 生HTMLの青判定は偽陽性
            //   → リロードせず ポーリング継続(無駄リロードを回避)
            if (at.reloads % 10 === 1) {
              pbLog('🔍','poll',`生HTML=青 / 真DOM=${ifr.bs.reason}(偽陽性) → 監視継続(リロード保留)`);
            }
            // 次の poll サイクル(リロードなし)
            setTimeout(mainLoop, 0);
            return;
          }
          // ★診断ログ: refreshBuyButton の結果を 10poll ごとに出力(HIROさんが状況把握できるよう)
          //   bs2.reason が STOCK_OUT/LIMIT 等で連打不発火の場合、何が原因かここで分かる
          if (at.reloads % 10 === 1) {
            pbLog('🔍','poll-result',`bs2.reason=${bs2.reason} btnText="${(bs2.text||'').substring(0,30)}" (生HTML判定)`);
          }
          if (bs2.reason === 'ALREADY_IN_CART' || bs2.reason === 'LIMIT') {
            pbLog('✅','poll',`カート確保済み検知(reason=${bs2.reason})`);
            setTimeout(mainLoop, 0);
            return;
          }
          // まだグレー → 次の poll サイクル
          setTimeout(mainLoop, 0);
          return;
        } else {
          // 【旧方式】実リロード
          updateUI({ status: `🔘 ${reasonLabel} → リロード #${at.reloads}` });
          pbLog('🔄','reload',`#${at.reloads} reason=${bsEarly.reason}`);
          await humanSleep(timing().grey_reload_sleep_ms);
          await safeReload('grey-reload-legacy');
          return;
        }
      }
    }

    // ★Phase 11 (2026-06-05): pre-POST の /cart/ fetch を撤廃 → 青のうちに即 POST
    //   旧: 青検知 → /cart/ fetch (実測 中央値~数百ms、 詰まると1秒timeout) → 連打ループ
    //       この fetch 待ちの間にプレバン JS が青→grey に書き換え → i=0 で grey → 空振り (95%)
    //       かつ「手動より遅い」 主因 (手動は即タップ、 fetch しない)
    //   新: knownCartIds=[] で即ループへ。 1発目を「検知した青」 のうちに POST。
    //     - 既にカート入り = bsEarly の ALREADY_IN_CART/LIMIT で boot 時に検知済 (二重発注しない)
    //     - access-control = 直後の isSiteBusy() ガード + attemptCartAddOnce の応答で検知
    //     - 成功判定 = cartAddViaFormSubmit の targetOrderId 照合 + 応答の afterIds (knownCartIds不要)
    //     - knownCartIds は 1発目 POST 応答 (r.afterIds) で更新され、 2発目以降の件数判定に使われる
    pbLog('⚡','phase11',`pre-POST cart fetch スキップ → 青のうちに即 POST 開始 (boot後${window._pbBootAt ? Date.now()-window._pbBootAt : '?'}ms)`);
    let knownCartIds = [];

    // 既にターゲットがカートに入っているか確認(orderId 照合)
    //   ★Phase 11: knownCartIds=[] なので通常は素通り。 bsEarly の ALREADY_IN_CART が主防御
    {
      const cartForm = findCartFormOnPage();
      const orderInput = cartForm ? cartForm.querySelector('input[name="order"]') : null;
      const targetOrderId = orderInput ? orderInput.value : null;
      if (targetOrderId && knownCartIds.includes(targetOrderId)) {
        pbError('success','cart',`既にカート確保済み: ${effectiveName(target)} (order=${targetOrderId})`);
        const s = loadState();
        if (!s.doneIds.includes(target.id)) {
          s.doneIds.push(target.id);
          s.lastSuccessAt = Date.now();
          saveState(s);
        }
        const c = loadConfig();
        const idx = c.products.findIndex(p => p.id === target.id);
        if (idx >= 0 && !c.products[idx].acquired) {
          c.products[idx].acquired = true;
          saveConfig(c);
          pbLog('✅','main',`acquired=true 自動設定: ${effectiveName(target)}`);
        }
        const psa0 = (c.options || {}).post_success_action || 'stop';
        if (psa0 === 'stop') {
          pauseToolWithReason(`initialCart-already (order=${targetOrderId})`);
          updateUI({ status: '✅ カート確保済み — 決済を待つ' });
        } else {
          updateUI({ status: '✅ カート確保済み — 次商品へ' });
          const nextP = c.products.find(p => p.id !== target.id && !p.acquired && !s.doneIds.includes(p.id));
          if (nextP) { await sleep(500); await safeNavigate(nextP.url, 'next-product'); }
        }
        return;
      }
    }

    // 既存カート + 保護モード判定
    const cartHasOther = knownCartIds.length > 0;
    const psa = (cfg.options || {}).post_success_action || 'stop';
    const useSafeMode = cartHasOther && psa === 'safe';
    const lowPower = isLowPower();
    const useLightPoll = !((cfg.options || {}).lightweight_polling === false);
    // ★連打回数:
    //   新方式(軽量ポーリング): SAFE モードでも10回維持
    //                        (リロードしないからリソース要求過多にならない、回数を絞る意義薄)
    //   旧方式(実リロード): SAFE モードのみ3回(リロード負荷を抑える従来の意図)
    let RETRY_LIMIT = (useSafeMode && !useLightPoll)
      ? SAFE_MAX_RETRY_PER_CYCLE
      : MAX_RETRY_PER_CYCLE;
    // ★Phase 9-7: 警戒モード判定 (発売後 N 分以内なら連打上限を 3 回に制限 + grey-mid に 5〜10秒ジッター)
    const _alertMode = isAlertMode(cfg, target);
    if (_alertMode) {
      RETRY_LIMIT = Math.min(RETRY_LIMIT, 3);
      const alertMin = (cfg.options || {}).alert_mode_minutes_after_release || 0;
      pbLog('🛡','main',`警戒モード中 (発売後 ${alertMin}分以内): 連打上限 ${RETRY_LIMIT}回 / リロード前 5〜10秒待機`);
    }
    // 試行間隔: SAFE モードは緩める(アクセス制限リスク↓、既存カート保護)
    const intervalFn = useSafeMode
      ? () => SAFE_RETRY_INTERVAL_MIN_MS + Math.random()*(SAFE_RETRY_INTERVAL_MAX_MS-SAFE_RETRY_INTERVAL_MIN_MS)
      : (lowPower
          ? () => LOW_POWER_PARAMS.retry_interval_min_ms + Math.random()*(LOW_POWER_PARAMS.retry_interval_max_ms - LOW_POWER_PARAMS.retry_interval_min_ms)
          : () => RETRY_INTERVAL_MIN_MS + Math.random()*(RETRY_INTERVAL_MAX_MS-RETRY_INTERVAL_MIN_MS));

    // ★Phase 9-3: 連打開始前に混雑メッセージガード(画面で「混雑」 警告中は POST せず次サイクル)
    // ★Phase 9-L (2026-05-22): pbLog → pbError('warn',...) に格上げ
    //   理由: 上部パネルに残らず、 100 件制限で流れる → 販売開始時の警告が事後検証不能だった
    if (isSiteBusy()) {
      pbError('warn','site-busy','混雑メッセージ表示中 → POST せず次サイクルへ');
      updateUI({ status: '🚨 混雑メッセージ検知 → POST 控えてリロードのみ' });
      await humanSleep(timing().grey_mid_reload_sleep_ms);
      if (loadState().paused === true) { updateUI(); return; }
      await safeReload('site-busy-pre-attempt');
      return;
    }
    // ★boot から この時点までの経過時間(白画面前後の挙動診断用)
    const _sinceBootMs = (typeof window !== 'undefined' && window._pbBootAt) ? (Date.now() - window._pbBootAt) : null;
    pbLog('🛒','main',`青ボタン検知 → 連打開始 (safe=${useSafeMode} cart=${knownCartIds.length}件${_sinceBootMs!=null?` boot後${_sinceBootMs}ms`:''})`);
    // ★HIROさん 2026-05-09 観察: 連打フロー直前の再判定で OK 窓を取り逃すバグを修正
    //   旧: ここで buttonState() 再判定 → grey ならリロード
    //       cart fetch 等で時間消費する間に JS が書き換える → 直前再判定で grey →
    //       1回も POST せずにリロード = OK窓捕捉できたのに連打しない
    //   新: 直前再判定を撤廃。 mainLoop 入口で OK 検知済みなら無駄判定せず即 cart_add POST へ
    //       連打中の試行間チェックは残す(連打中に grey 化したら停止)

    // ★★★ Phase 26 (2026-06-24): 1発目を 6/11 反応駆動に揃える — 「青が settle して持続するか」を確認してから撃つ ★★★
    //   背景(本日6/24実機確定): p-bandai SPA は描画直後 #buy が一瞬 enabled「カートに入れる」→ 直後に
    //   disabled「在庫がありません」へ落ち着く。 この transient 青を掴んで本物ボタンを click すると、
    //   非オーダー品の押下でサイトが 35〜90秒フリーズする(検証ブラウザで click 一発90秒以上停止を再現)。
    //   対策: settle 窓の間 buttonState を監視 → grey/already/limit に落ちたら transient と確定して break。
    //   ★ここでは押す/リロード/成功の判断はしない(「落ち着くまで待つ」だけ)。 判定は従来どおりループ i=0 の
    //   buttonState() が行う(OK→押す / 在庫切れ→リロード / already・limit→成功)。 2発目以降が既にやっている
    //   「状態を見てから動く」を1発目にも適用するだけ = 6/11 反応駆動への整合。 false で旧動作(即押し)に戻せる。
    const _rbModeEarly = (cfg.options || {}).realbutton_retry !== false;
    // ★★★ Phase 29 (2026-06-25): 在庫データ判定で1発目をゲート(ボタン表示・時間に非依存) ★★★
    //   サイトの在庫データ(orderstock_list の ○/△/×)を読み、 在庫ありと確証できた時だけ連打ループへ。
    //   在庫切れ/未取得は押さずリロード=在庫切れ品の押下→フリーズが構造的に消える。
    //   ロールバック: data_stock_judge=false で下の Phase26/28(settle/色)方式に戻る。
    if ((cfg.options || {}).data_stock_judge !== false) {
      const _cap = (cfg.options || {}).data_stock_wait_ms || 4000;
      const _t0 = Date.now();
      let _sj = stockJudge();
      while (!_sj.ready && Date.now() - _t0 < _cap) {
        if (loadState().paused === true) { updateUI(); return; }
        await sleep(80);
        _sj = stockJudge();
      }
      pbLog('🎯','phase29',`在庫データ判定: ready=${_sj.ready} soldOut=${_sj.soldOut} mark=${_sj.mark||''} src=${_sj.src} (${Date.now()-_t0}ms)`);
      if (!_sj.ready || _sj.soldOut) {
        // 在庫無し or データ未取得(確証できない) → 押さずリロードで監視継続(フリーズ回避)
        const sDS = loadState();
        const atDS = sDS.productAttempts[target.id] || { reloads: 0 };
        atDS.reloads = (atDS.reloads || 0) + 1;
        sDS.productAttempts[target.id] = atDS;
        saveState(sDS);
        // ★Phase 33 (2026-07-01 HIROさん指摘): stock_recheck の1-4秒ランダムを撤去。
        //   「人がクリックするように動けばよい。描画待ちが大事」との判断。 #buy 出現待ち(描画待ち,~1-2秒・自然変動)が
        //   人らしい間隔・ゆらぎを担うので、 人為的な上乗せランダムは不要。 リロード前は最小sleepのみ、
        //   間隔は次boot時の描画待ちで自然に決まる。 (Phase29bの1-4秒ジッターは廃止)
        updateUI({ status: _sj.ready ? `🔍 在庫無し(${_sj.mark}) → 監視継続` : '🔍 在庫データ待ち → リロード' });
        await humanSleep(timing().grey_mid_reload_sleep_ms);
        if (loadState().paused === true) { updateUI(); return; }
        await safeReload(_sj.ready ? 'phase29-soldout' : 'phase29-no-data');
        return;
      }
      // 在庫あり(○/△)を確証 → 連打ループへ(本物ボタンを押す。 動作は従来どおり)
      pbLog('🎯','phase29',`在庫あり確証(mark=${_sj.mark}) → カート投入へ`);
    } else if ((cfg.options || {}).confirm_stable_blue_before_first !== false) {
      const _settleMs = (cfg.options || {}).stable_blue_settle_ms || 600;
      // ★Phase 28 (2026-06-25 HIROさん指摘『正しく青を認識すれば解決』): 文字だけでなく「色」で判定。
      //   実機調査で在庫切れ #buy は 背景=灰色 rgb(153,153,153) + disabled。 本物の青は青系背景。
      //   SPA描画で文字「カートに入れる」が先に出て背景がまだ灰色の過渡を、 buttonState は文字+disabled しか
      //   見ないため「青」と誤認 → 押下 → フリーズ。 ここで背景色が無効灰色なら 1発目を撃たずリロード。
      //   ★加えて、判定時のボタンの実際の見た目(色/クラス)をログ採取 → transient の正体を実データで確定する。
      const _DISABLED_GREY = 'rgb(153,153,153)';
      const _st0 = Date.now();
      let _settleReason = 'OK持続', _greyBg = false, _capBg = '', _capCls = '';
      while (Date.now() - _st0 < _settleMs) {
        if (loadState().paused === true) { updateUI(); return; }
        const _sbs = buttonState();
        const _b = document.getElementById('buy') || document.getElementById('buy_side');
        if (_b) { try { _capBg = getComputedStyle(_b).backgroundColor; _capCls = (_b.className || '').toString().slice(0,30); } catch (_) {} }
        if (!_sbs.clickable) { _settleReason = _sbs.reason; break; }            // transient が settle(文字で grey化) → ループ i=0 へ委譲
        if (_capBg.replace(/\s/g,'') === _DISABLED_GREY) { _greyBg = true; _settleReason = 'GREY_BG(在庫切れ色・文字先行)'; break; }  // ★色で在庫切れ確定
        await sleep(70);
      }
      pbLog('🎯','phase26',`1発目 settle 確認 (${Date.now()-_st0}ms / ${_settleReason}) bg=${_capBg} cls=${_capCls}`);
      if (_greyBg) {
        // 背景=無効灰色 = 在庫切れの過渡(文字だけ青) → 撃たずリロード(フリーズ根絶)
        const sGB = loadState();
        const atGB = sGB.productAttempts[target.id] || { reloads: 0 };
        atGB.reloads = (atGB.reloads || 0) + 1;
        sGB.productAttempts[target.id] = atGB;
        saveState(sGB);
        await humanSleep(timing().grey_mid_reload_sleep_ms);
        if (loadState().paused === true) { updateUI(); return; }
        await safeReload('phase26-grey-bg');
        return;
      }
    }
    // ★旧 Phase 14 の order 充填待ちは iframe フォールバック時のみ実行(realButton click では不要)。
    //   理由: order 充填ゲートは iframe POST の空POST(/error/4/)防止用。 realButton では使わない上、
    //   本日確認のとおり在庫切れ品でも order は充填済(例 order=2560670000004)なので在庫切れを弾けず無意味。
    if (!_rbModeEarly && (cfg.options || {}).wait_order_fill_before_post !== false) {
      const _wMax = (cfg.options || {}).wait_order_fill_max_ms || 4000;
      const _wr = await waitForCartOrderFilled(_wMax);
      if (_wr.reason === 'paused') { updateUI(); return; }
      if (_wr.ok) {
        pbLog('🎯','phase14',`order 充填確認 (待ち${_wr.waitedMs}ms/${_wr.polls}回) → 有効な1発目を POST(iframe)`);
      } else if (_wr.reason === 'timeout') {
        // 上限まで空 → 撃たずにリロード(空POST=/error/4/ を踏まない)
        pbError('warn','phase14',`order が ${_wMax}ms 経っても空 → POST せずリロード(空POSTは弾かれる無駄撃ち)`);
        const sP14 = loadState();
        const atP14 = sP14.productAttempts[target.id] || { reloads: 0 };
        atP14.reloads = (atP14.reloads || 0) + 1;
        sP14.productAttempts[target.id] = atP14;
        saveState(sP14);
        await humanSleep(timing().retry_fail_reload_sleep_ms);
        if (loadState().paused === true) { updateUI(); return; }
        await safeReload('phase14-order-empty');
        return;
      } else {
        // grey / no-form / modal 等 → ループ側の既存ガードに委ねる(順当に処理される)
        pbLog('🎯','phase14',`order 充填待ち離脱 (${_wr.reason}) → 既存ガードへ委譲`);
      }
    }

    // 青(クリック可能) → 10回連打
    // ★試行の統計集計は廃止(押して失敗は当たり前なのでログ不要)
    // ★attempt loop 全体の hard timeout: 30秒以上ループ内でstuckしたら強制脱出
    //   理由: fetchWithTimeout が機能しない例外的なケース (await res.arrayBuffer() の hang等)
    //         でも 30秒経過したら強制リロードで脱出する保険機構
    const _attemptLoopStartMs = Date.now();
    const ATTEMPT_LOOP_HARD_TIMEOUT_MS = 30000;
    // ★Phase 16 (実験): 2発目以降を本物ボタン+小窓待ちにするか。 既定 true(silver-cat 実験)。
    //   real-button モードでは各押下が自前の 90秒救出を持つため、 ループ全体の 30秒保険は使わない
    //   (遅い小窓待ちを途中で切らないため)。 各反復は iframe(~10s) か real-button(~90s)で自己完結。
    const realButtonMode = (cfg.options || {}).realbutton_retry !== false;
    for (let i = 0; i < RETRY_LIMIT; i++) {
      const cur = loadState();
      if (cur.paused === true) { updateUI(); return; }
      // ★hard timeout チェック: 30秒経過なら強制脱出(real-button モードでは無効=小窓を待ち切る)
      if (!realButtonMode && Date.now() - _attemptLoopStartMs > ATTEMPT_LOOP_HARD_TIMEOUT_MS) {
        pbLog('⚠','main',`連打 ${ATTEMPT_LOOP_HARD_TIMEOUT_MS/1000}秒到達 → 区切ってリロード(試行 ${i+1}/${RETRY_LIMIT} で長時間化)`);
        await humanSleep(timing().retry_fail_reload_sleep_ms);
        if (loadState().paused === true) { updateUI(); return; }
        await safeReload('attempt-loop-stuck');
        return;
      }
      // 設定モーダル開いている間は試行も止める(編集中に勝手に投入しない)
      await waitWhileSettingsOpen('attempt-loop');
      // ★2026-07-06 (4fix-③④ HIROさん): サーバの嫌がらせポップアップ(×/閉じる/混雑/個数不足)は
      //   「まず閉じる → 青ボタンが活性なら押す」。 ポップアップが出ただけではリロード/中断しない。
      //   旧仕様は isSiteBusy() で即 break していた(=混雑表示で1発しか押せずチャンスを逃す主因)→ 廃止。
      try { dismissAnyPopup(); } catch (_) {}
      // ★各試行前にボタン状態を確認、 青(clickable)のみ押す。 下の青復帰待ちで更新するため let。
      let bs2 = buttonState();
      // ★青が活性でない時: 確定完売(在庫データ×)なら諦めてリロード(Phase29フリーズ防止)。
      //   それ以外(混雑/一瞬グレー)は「嫌がらせを閉じて青の復帰を短時間待つ」→ 復帰したら押す。
      if (!bs2.clickable && bs2.reason !== 'ALREADY_IN_CART' && bs2.reason !== 'LIMIT') {
        let _sjNow = null; try { _sjNow = (typeof stockJudge === 'function') ? stockJudge() : null; } catch (_) {}
        if (!(_sjNow && _sjNow.soldOut)) {
          const _blueWaitMs = (cfg.options || {}).blue_wait_ms || 1500;
          const _bw0 = Date.now();
          while (Date.now() - _bw0 < _blueWaitMs) {
            if (loadState().paused === true) { updateUI(); return; }
            try { dismissAnyPopup(); } catch (_) {}
            await sleep(150);
            bs2 = buttonState();
            if (bs2.clickable) break;
            let _sj2 = null; try { _sj2 = (typeof stockJudge === 'function') ? stockJudge() : null; } catch (_) {}
            if (_sj2 && _sj2.soldOut) break;   // 途中で×確定 → 抜けてリロード判定へ
          }
          if (bs2.clickable) pbLog('🔵','button',`嫌がらせ閉じ後に青が復帰 → 押下 (${i+1}/${RETRY_LIMIT})`);
        }
      }
      if (!bs2.clickable) {
        // ★ログ表現: 1回目で grey 検知のケースは「試行 0」 と区別して表示
        if (i === 0) {
          pbLog('🔘','button',`連打前にボタン色確認 → grey (${bs2.reason}) → 試行せず次サイクルへ`);
        } else {
          pbLog('🔘','button',`${i}/${RETRY_LIMIT} 試行後にボタン色変化 (${bs2.reason}) → 連打終了 → 次サイクルへ`);
        }
        // ★連打中にボタンが ALREADY_IN_CART / LIMIT になった = 成功(カート入り確定)
        if (bs2.reason === 'ALREADY_IN_CART' || bs2.reason === 'LIMIT') {
          const reasonLabel = bs2.reason === 'LIMIT' ? '購入制限超過' : 'カート追加済み表示';
          pbError('success','cart',`カート確保(${reasonLabel}検知): ${effectiveName(target)}`);
          const s3 = loadState();
          if (!s3.doneIds.includes(target.id)) s3.doneIds.push(target.id);
          s3.productAttempts[target.id] = { reloads: 0 };
          s3.lastSuccessAt = Date.now();
          saveState(s3);
          const cAfter = loadConfig();
          const idxAfter = cAfter.products.findIndex(p => p.id === target.id);
          if (idxAfter >= 0 && !cAfter.products[idxAfter].acquired) {
            cAfter.products[idxAfter].acquired = true;
            saveConfig(cAfter);
          }
          await notifyCartSuccess(target, []);
          if (psa === 'stop') {
            pauseToolWithReason(`mid-attempt-${bs2.reason}`);
            updateUI({ status: `✅ カート確保(${reasonLabel}) — 決済を待つ` });
          }
          return;
        }
        // STOCK_OUT 等 → カート件数を確認(成功検知のフォールバック)
        //   ★background_cart_check=false(既定)は /cart/ 裏フェッチをしない → 件数増検知スキップ。
        //     成功は次boot後の ALREADY_IN_CART(見えるボタン)で確実に拾えるのでフォールバック不要。
        const after = ((cfg.options || {}).background_cart_check === true) ? await getCartItemIds() : { ids: null };
        if (after.ids && after.ids.length > knownCartIds.length) {
          const newIds = after.ids.filter((x) => !knownCartIds.includes(x));
          // ★target の order ID を取得して照合(keepalive 等の並行追加と区別)
          const cf2 = findCartFormOnPage();
          const oi2 = cf2 ? cf2.querySelector('input[name="order"]') : null;
          const expectedOrderId = oi2 ? oi2.value : null;
          // ★expectedOrderId が空文字/null なら誤通知防止のため抑止(target照合できないので安全側)
          const isRealSuccess = expectedOrderId && newIds.includes(expectedOrderId);
          if (!isRealSuccess) {
            // target照合失敗 → 別商品の追加 or form未取得 → 通知抑止
            pbLog('🛒','main',`カート内に別商品あり(対象とは異なる order=${expectedOrderId||'(空)'})→ 監視継続(既存カート維持)`);
            knownCartIds = after.ids;  // 次試行のために更新
            // 通知はせず、リロードルートに進む(下のフォールバック)
          } else {
            pbError('success','cart',`カート確保(件数増検知): ${effectiveName(target)} (order=${newIds.join(',')})`);
            const s3 = loadState();
            if (!s3.doneIds.includes(target.id)) s3.doneIds.push(target.id);
            s3.productAttempts[target.id] = { reloads: 0 };
            s3.lastSuccessAt = Date.now();
            saveState(s3);
            // ★2026-07-08 (二重カートイン修正 HIROさん): この経路だけ acquired=true を立てていなかった。
            //   → boot の state自動修復(acquired=false の doneId を削除)で確保記録が消え、 再監視→再追加(二重)。
            //   他の成功パスと揃えて config にも acquired=true を立てる(7/8 デナンで確認)。
            {
              const cCI = loadConfig();
              const idxCI = cCI.products.findIndex(p => p.id === target.id);
              if (idxCI >= 0 && !cCI.products[idxCI].acquired) {
                cCI.products[idxCI].acquired = true;
                saveConfig(cCI);
                pbLog('✅','main',`acquired=true 自動ON(件数増検知): ${effectiveName(target)}`);
              }
            }
            await notifyCartSuccess(target, newIds);
            if (psa === 'stop') {
              pauseToolWithReason('count-increase');
              updateUI({ status: '✅ カート確保 — 決済を待つ' });
            }
            return;
          }
        }
        // ★2026-07-06 (4fix-④ HIROさん): 確定完売(在庫データ×)でなく、 まだ10回に達していないなら
        //   リロードせず次の押下チャンス(青の復帰)を待つ。 混雑/一瞬グレーでチャンスを捨てない。
        {
          let _sjG = null; try { _sjG = (typeof stockJudge === 'function') ? stockJudge() : null; } catch (_) {}
          if (!(_sjG && _sjG.soldOut) && i < RETRY_LIMIT - 1) {
            pbLog('🔵','attempt',`grey(混雑/一瞬)・完売×ではない → リロードせず継続 (${i+1}/${RETRY_LIMIT})`);
            await humanSleep((cfg.options || {}).grey_recheck_gap_ms || 400);
            if (loadState().paused === true) { updateUI(); return; }
            continue;
          }
        }
        // 在庫切れなど → リロード(復活待ち)
        // ★HIROさん 2026-05-09: grey-mid reload 経路でも reload counter を増やして cooldown を発動させる
        //   旧: 連打10回完了経路でしか reloads++ せず、grey-mid 経路で永遠にリロードして cooldown 発動せず白画面
        //   新: 全 reload 経路で reloads++ + cooldown チェック
        const sGM = loadState();
        const atGM = sGM.productAttempts[target.id] || { reloads: 0 };
        atGM.reloads = (atGM.reloads || 0) + 1;
        sGM.productAttempts[target.id] = atGM;
        saveState(sGM);
        pbLog('🔘','main',`grey 化 + カート未変化 → リロード (reason=${bs2.reason}) #${atGM.reloads}`);
        // cooldown チェック(連打10回失敗 reload と同じロジック)
        const _memReleaseEveryGM = timing().memory_release_every_cycles || 2;
        const _cooldownEveryGM = timing().cooldown_every_cycles || 30;
        const _cooldownSleepMsGM = timing().cooldown_sleep_ms || 5000;
        if (atGM.reloads > 0 && atGM.reloads % _memReleaseEveryGM === 0) {
          try {
            clearCookiesPreserveConfig();
            if (atGM.reloads % _cooldownEveryGM === 0) {
              clearSessionKeepTabId();  // ★Phase 9-M: TAB_ID は保持
              pbLog('💥','memory',`サイクル${atGM.reloads}(grey-mid): Cookie+Cache+sessionStorage 解放 + ${_cooldownSleepMsGM/1000}秒 cooldown`);
              updateUI({ status: `💤 ${atGM.reloads}回目のリロード\nクールダウン ${_cooldownSleepMsGM/1000}秒(セッション軽量化)` });
              if (await interruptibleSleep(_cooldownSleepMsGM)) { updateUI(); return; }  // ★Phase 10: 即中断
            } else {
              pbLog('🍪','memory',`サイクル${atGM.reloads}(grey-mid): Cookie+Cache 解放`);
            }
          } catch (e) { pbLog('⚠','memory','解放エラー: '+e.message); }
        }
        // ★Phase 9-7: 警戒モード時は 5〜10秒ジッター追加(発売直後の連打圧力を抑制)
        if (_alertMode) {
          const jitterMs = 5000 + Math.random() * 5000;
          pbLog('💤','main',`警戒モード: リロード前 ${Math.round(jitterMs/1000)}秒待機`);
          updateUI({ status: `🛡 警戒モード ${Math.round(jitterMs/1000)}秒待機 → リロード` });
          if (await interruptibleSleep(jitterMs)) { updateUI(); return; }  // ★Phase 10: 即中断
        }
        await humanSleep(timing().grey_mid_reload_sleep_ms);
        await safeReload('grey-mid');
        return;
      }
      // ★ステータス表示はシンプルに: ライブDOMの状態と矛盾する誤解を招かない表記
      updateUI({
        status: useSafeMode
          ? `🛡 SAFE モード投入 ${i+1}/${RETRY_LIMIT}`
          : `🛒 カート投入 ${i+1}/${RETRY_LIMIT}`
      });
      // ★試行1回ごとにログ
      // ★Phase 21 (2026-06-11): 全押下を本物ボタン+小窓待ちに統一(1発目の iframe は SPA 化で空シェル39字/
      //   error4 になり死んでいる + bot判定の元 → 廃止)。 realbutton_retry=false の時のみ旧 iframe にフォールバック。
      const _useRealBtn = realButtonMode;
      pbLog('🛒','attempt',`カート投入 ${i+1}/${RETRY_LIMIT} ${_useRealBtn ? '本物ボタンclick' : 'POST送信'}`);
      // ★ログ整理: 個別試行ログは省略(連打終了時の集計のみ記録)
      // ★knownCartIds を渡して before fetch をスキップ(試行毎の fetch 1回減)
      let r;
      if (_useRealBtn) {
        r = await realButtonAttemptOnce(target, knownCartIds, (cfg.options || {}).realbutton_popup_wait_ms || 90000);
      } else {
        r = await attemptCartAddOnce(target, knownCartIds);
      }
      // ★HIRO 2026-05-09: 「落ちる前のログ」要望 → 各試行の結果を必ず記録
      try {
        const _tm = r && r.timings;
        const _tmStr = _tm ? ` [post=${_tm.post}ms body=${_tm.body}ms decode=${_tm.decode}ms cart=${_tm.cartFetch}ms total=${_tm.total}ms]` : '';
        pbLog('🛒','attempt-result',
          `投入 ${i+1}/${RETRY_LIMIT} 結果: ${r && r.result || 'undef'} ` +
          `newOrders=${(r && r.newOrderIds && r.newOrderIds.length) || 0}${_tmStr}` +
          `${r && r.detail ? ' | ' + r.detail : ''}`);
      } catch (e) {}
      // 統計記録
      // 試行ごとの統計記録は廃止
      // 次試行用に knownCartIds を更新(変動分のみ)
      if (r.afterIds) knownCartIds = r.afterIds;
      // ★Phase 16 (実験): 本物ボタンで停止押下を検知 → 即終了
      if (r.result === 'PAUSED') { updateUI(); return; }
      // ★Phase 16 (実験): 本物ボタンで小窓が一定時間出ず(ページ無応答)→ リロード救出
      if (r.result === 'DEAD_PAGE') {
        const _cap = (cfg.options || {}).realbutton_popup_wait_ms || 90000;
        pbLog('🔄','phase16',`本物ボタン: ${Math.round(_cap/1000)}秒 小窓が出ず(ページ無応答)→ リロード救出`);
        const sDP = loadState();
        const atDP = sDP.productAttempts[target.id] || { reloads: 0 };
        atDP.reloads = (atDP.reloads || 0) + 1;
        sDP.productAttempts[target.id] = atDP;
        saveState(sDP);
        await humanSleep(timing().retry_fail_reload_sleep_ms);
        if (loadState().paused === true) { updateUI(); return; }
        await safeReload('realbtn-dead-page');
        return;
      }
      // カートイン成功ポップアップ検知(realButtonの'added'で拾えなかった時のフォールバック)
      if (r.result !== 'SUCCESS' && detectCartAddedPopup()) {
        const cfPop = findCartFormOnPage();
        const oiPop = cfPop ? cfPop.querySelector('input[name="order"]') : null;
        const expectedOrderId = oiPop ? oiPop.value : null;
        if ((cfg.options || {}).background_cart_check === true) {
          // ★旧: /cart/ 裏フェッチで target order を照合(並行追加の誤検知防止)
          const recheck = await getCartItemIds();
          const newIds = (recheck.ids || []).filter(x => !knownCartIds.includes(x));
          const isRealSuccess = expectedOrderId && newIds.includes(expectedOrderId);
          if (newIds.length > 0 && isRealSuccess) {
            pbLog('✅','popup','カートイン成功ポップアップ検知 → SUCCESS扱い(target order一致)');
            r.result = 'SUCCESS'; r.newOrderIds = newIds; knownCartIds = recheck.ids || knownCartIds;
          } else if (newIds.length > 0) {
            pbLog('🛒','popup',`成功ポップアップ検知(対象とは異なる order=${expectedOrderId||'(空)'})→ 監視継続`);
            knownCartIds = recheck.ids || knownCartIds;
          }
        } else {
          // ★background_cart_check=false(既定): 見える成功ポップアップを信頼(/cart/フェッチ無し)。
          //   target のページに居るので order は form から取得。 keepalive 既定OFFで並行追加も無い。
          pbLog('✅','popup','成功ポップアップ検知 → SUCCESS扱い(見える判定・/cart/フェッチ無し)');
          r.result = 'SUCCESS';
          r.newOrderIds = expectedOrderId ? [expectedOrderId] : [];
        }
      }
      // ポップアップ自動クローズ(エラー/成功どちらも常に閉じる)
      //   成功は Discord通知 + FAB + 上部パネルで確認できるので、画面のポップアップは不要
      try { dismissAnyPopup(); } catch (e) {}

      if (r.result === 'ACCESS_CONTROL') {
        const s = loadState();
        s.accessControlStreak = (s.accessControlStreak || 0) + 1;
        s.lastAccessControlAt = Date.now();  // ★Phase 9-L: 時間ベースリセット用
        saveState(s);
        pbError('error','access-control',`アクセス制限検知 streak=${s.accessControlStreak} cart=${knownCartIds.length}件`);
        if (cartHasOther) {
          // 既存カート保護: 全停止
          pauseToolWithReason('access-control-protect');
          pbError('error','protect','既存カート保護のため全停止しました(カート='+knownCartIds.length+'件)');
          updateUI({ status: '🚨 アクセス制限検知 — 既存カート保護のため全停止' });
          await notifyDiscord({
            content: `${(cfg.notify||{}).device_tag||'📱'} 🚨 **アクセス制限を検知 → 全停止** — 既存カート(${knownCartIds.length}件)を守るため`,
            embeds: [{
              title: 'アクセス制限への対応',
              color: 0xd4001a,
              description: 'アクセス制限中は連続操作しても解除されません。\n10〜30分ほど時間を置いてから再開するか、 必要なら 🍪 強制リセットで対処してください。',
            }],
          });
          return;
        }
        // カート空: 即リロード(or auto_nuke)
        if (cfg.options && cfg.options.auto_nuke_when_empty && s.accessControlStreak >= ACCESS_CONTROL_ALERT_THRESHOLD) {
          pbLog('💥','main','自動リセット起動(アクセス制限連続検知のため Cookie + Cache 全削除)');
          nukeAllSiteData();
          await humanSleep(timing().auto_nuke_reload_sleep_ms);
          await safeReload('auto-nuke');
          return;
        }
        // ★Phase 9-RR2 (2026-05-29): 連続検知 5 回以上で長め待機 (BotManager 絞り回避)
        //   旧仕様: 毎回同じ間隔で即リロード = 機械的リズム = BotManager に絞られ続ける
        //   新仕様: 5 回以上連発したら 15-30 秒ランダム待機 → 人らしいリズム → 絞り緩和の狙い
        //   5/29 12:00 シュピーゲル発売解析で 7 回連続発火 → 36 秒の停滞を確認したのを受けて
        if ((s.accessControlStreak || 0) >= 5) {
          const _longWait = 15000 + Math.random() * 15000;
          pbLog('💤','access-control',`連続 ${s.accessControlStreak} 回検知 → ${Math.round(_longWait/1000)}秒待機 (BotManager 絞り回避)`);
          updateUI({ status: `💤 アクセス制限連発 ${s.accessControlStreak}回 → ${Math.round(_longWait/1000)}秒待機` });
          // ★Phase 10: 中断可能 sleep (停止押下で即中断)
          if (await interruptibleSleep(_longWait)) { updateUI(); return; }
          await safeReload('access-control-long-wait');
          return;
        }
        await humanSleep(timing().access_reload_sleep_ms); await safeReload('access-control'); return;
      }
      // 制限以外: streak リセット
      const s2 = loadState();
      if (s2.accessControlStreak) { s2.accessControlStreak = 0; saveState(s2); }
      if (r.result === 'SUCCESS') {
        const s3 = loadState();
        if (!s3.doneIds.includes(target.id)) s3.doneIds.push(target.id);
        s3.productAttempts[target.id] = { reloads: 0 };
        s3.lastSuccessAt = Date.now();
        saveState(s3);
        // ★acquired = true 自動ON(設定モーダルにも反映される)
        const cAfter = loadConfig();
        const idxAfter = cAfter.products.findIndex(p => p.id === target.id);
        if (idxAfter >= 0 && !cAfter.products[idxAfter].acquired) {
          cAfter.products[idxAfter].acquired = true;
          saveConfig(cAfter);
          pbLog('✅','main',`acquired=true 自動ON: ${effectiveName(target)}`);
        }
        pbError('success','cart','カート確保: ' + effectiveName(target) + ' (order=' + (r.newOrderIds||[]).join(',') + ')');
        await notifyCartSuccess(target, r.newOrderIds);
        updateUI({ status: '✅ カート投入成功' });
        // post_success_action
        if (psa === 'stop') {
          pauseToolWithReason('success-stop');
          updateUI({ status: '✅ カート確保 — 決済を待つ' });
        } else {
          // 次商品の URL に自動移動
          const nextP = cfg.products.find((p) =>
            p.id !== target.id && !p.acquired && !s3.doneIds.includes(p.id)
          );
          if (nextP) { await sleep(500); await safeNavigate(nextP.url, 'next-product'); }
        }
        return;
      }
      // ★Phase 9-RR2 (2026-05-29): cartAddViaFormSubmit が返した iframe 内 HTML の markers で判定
      //   旧仕様 (Phase 9-RR 初版): waitForPopupOrTimeout で親 body 監視 → iframe submit では機能不全
      //                            5 秒 timeout を毎回喰らって hard timeout 30 秒で 5/10 break する副作用
      //   新仕様: r.hadPopupMarker (iframe 内 HTML に POPUP_TRIGGER_WORDS が含まれるか) で判定
      //          - true (サーバが反応した): 50-150ms (タップ物理時間) → 次の POST
      //          - false (反応なし、 /error/4/ 等): 200-500ms ランダム → 次の POST
      //          機械的固定 100-220ms は廃止、 サーバの反応有無に応じて動的に変える
      // ★Phase 21 (2026-06-11): 押下間隔は「小窓を閉じ切ってから人間間隔(既定0.5秒)」。
      //   HIROさん指摘「popアップの表示時間と消す時間を考慮しろ、 押すだけではダメ」を反映 —
      //   閉じる → 消えたのを確認(消す時間) → 0.5秒(人間間隔) を1サイクルに含める(タイマー盲打ちにしない)。
      if (_useRealBtn) {
        const _ERR = /大変混み合っているため|在庫がございません|追加できません|エラーが発生/;
        const _dm0 = Date.now();
        while (Date.now() - _dm0 < 1500) {            // 小窓が消えるまで確認(消す時間を考慮)
          try { dismissAnyPopup(); } catch (_) {}
          const _bt = (document.body && document.body.innerText) || '';
          if (!_ERR.test(_bt)) break;
          await sleep(120);
        }
        if (loadState().paused === true) { updateUI(); return; }
        const _gap = (cfg.options || {}).realbtn_press_gap_ms || 500;
        await sleep(_gap);                            // 人間らしい間隔(0.5秒)
        if (loadState().paused === true) { updateUI(); return; }
        if (i === 0 || (i + 1) % 3 === 0) {
          pbLog('🔁','attempt',`本物ボタン反応駆動: 小窓閉じ+${_gap}ms間隔 → 次押下 (${i+1}/${RETRY_LIMIT})`);
        }
      } else {
        // 旧 iframe 方式の反応駆動 wait(realbutton_retry=false のフォールバック時のみ)
        try { dismissAnyPopup(); } catch (_) {}
        const _hadPopup = !!(r && r.hadPopupMarker);
        const _waitMs = _hadPopup ? (50 + Math.random() * 100) : (200 + Math.random() * 300);
        await sleep(_waitMs);
        if (loadState().paused === true) { updateUI(); return; }
        if (i === 0 || (i + 1) % 5 === 0) {
          pbLog('🔁','attempt',`reaction-driven popup=${_hadPopup?'yes':'no'} wait=${Math.round(_waitMs)}ms (i=${i+1}/${RETRY_LIMIT})`);
        }
      }
    }

    // ★RETRY_LIMIT 失敗 → 監視方式で分岐
    //   新方式: ポーリングに戻る(リロードせず、サーバ負荷ゼロ)
    //   旧方式: 実リロード(従来通り)
    const s5 = loadState();
    const at5 = s5.productAttempts[target.id] || { reloads: 0 };
    at5.reloads += 1;
    s5.productAttempts[target.id] = at5;
    saveState(s5);
    // ★連打10回失敗後は新方式でも実リロード必須
    //   理由: プレバン側で「青ボタンの有効回数は10回まで」という制限がある
    //         10回連打した時点で無効化されるので、リロードして青ボタンの有効回数をリセットする
    updateUI({ status: `🔄 ${RETRY_LIMIT}回投入完了 → リロード #${at5.reloads}` });
    if ([50, 100, 200].includes(at5.reloads)) {
      pbError('warn','retry',`連打サイクル${at5.reloads}回到達: ${effectiveName(target)} — 状況確認推奨`);
    }
    // ★iPhone Safari セーフガード対策: 累積疲労を構造的に断ち切る
    //   端末ごとに調整可能: timing() 経由で 通常/低負荷モード のパラメータを取得
    //   通常モード(iPhone 17 Pro 等): 2サイクル毎解放、30サイクル毎 cooldown 5秒
    //   低負荷モード(iPhone 13 Pro 等): 1サイクル毎解放、15サイクル毎 cooldown 8秒
    const _memReleaseEvery = timing().memory_release_every_cycles || 2;
    const _cooldownEvery = timing().cooldown_every_cycles || 30;
    const _cooldownSleepMs = timing().cooldown_sleep_ms || 5000;
    if (at5.reloads > 0 && at5.reloads % _memReleaseEvery === 0) {
      try {
        clearCookiesPreserveConfig();
        if (at5.reloads % _cooldownEvery === 0) {
          clearSessionKeepTabId();  // ★Phase 9-M: TAB_ID は保持
          pbLog('💥','memory',`サイクル${at5.reloads}: Cookie+Cache+sessionStorage 解放 + ${_cooldownSleepMs/1000}秒 cooldown`);
          updateUI({ status: `💤 ${at5.reloads}回目のリロード\nクールダウン ${_cooldownSleepMs/1000}秒(セッション軽量化)` });
          if (await interruptibleSleep(_cooldownSleepMs)) { updateUI(); return; }  // ★Phase 10: 即中断
        } else {
          pbLog('🍪','memory',`サイクル${at5.reloads}: Cookie+Cache 解放`);
        }
      } catch (e) { pbLog('⚠','memory','解放エラー: '+e.message); }
    }
    await humanSleep(timing().retry_fail_reload_sleep_ms);
    // ★リロード直前にも paused 確認(待機中に停止押されたら即終了)
    if (loadState().paused === true) { updateUI(); return; }
    await safeReload('retry-fail');
  }

  // =================================================================
  // 11. キープアライブ
  // =================================================================
  // ★mainLoop と keepalive の相互排他ミューテックス
  //   どちらも cart_add POST を発射するため、同時に走ると
  //   keepalive の dummy 投入をmainLoop が「target の件数増」と誤検知して
  //   オープンしていない商品の Discord 通知を発火させる原因になる
  //   → 共有ロックで直列化する
  let _cartOpLock = false;
  async function withCartOpLock(name, fn) {
    // 短時間の競合は順番待ちで吸収(最大 5秒)
    const start = Date.now();
    while (_cartOpLock) {
      if (Date.now() - start > 5000) {
        pbLog('⏳','lock',`${name}: ロック待機 5 秒超過 → スキップ(他処理がカート操作中)`);
        return { skipped: 'lock-timeout' };
      }
      await sleep(80);
    }
    _cartOpLock = true;
    try { return await fn(); }
    finally { _cartOpLock = false; }
  }

  // ★キープアライブの実際の処理(setInterval & 手動テストの両方で使用)
  async function runKeepaliveOnce(forceManual) {
    const c = loadConfig();
    // ★設定モーダル編集中は keepalive を defer (編集中の裏動作を防ぐ、 ROADMAP.md Phase 3)
    if (!forceManual && isSettingsModalOpen()) {
      pbLog('💚','keepalive','SKIP: 設定モーダル編集中');
      return { skipped: 'settings-open' };
    }
    if (!forceManual && (!c.keepalive || !c.keepalive.enabled)) {
      pbLog('💚','keepalive','SKIP: 無効化されています');
      return { skipped: 'disabled' };
    }
    const dummies = ((c.keepalive && c.keepalive.dummy_products) || []).filter(u => u && u.trim());
    if (dummies.length === 0) {
      pbLog('💚','keepalive','SKIP: ダミーURLが未設定');
      return { skipped: 'no-dummies' };
    }
    if (!forceManual && loadState().paused) {
      pbLog('💚','keepalive','SKIP: ツール停止中');
      return { skipped: 'paused' };
    }
    const cartNonEmpty = await isCartNonEmpty();
    if (!forceManual && !cartNonEmpty) {
      pbLog('💚','keepalive','SKIP: カート空(キープアライブ不要)');
      return { skipped: 'cart-empty' };
    }
    // ★mainLoop と直列化: 連打中の cart_add と同時実行を避ける
    return withCartOpLock('keepalive', async () => {
      // ★HIROさん 2026-05-09 要望: 1回だけ試行(BAN リスク削減)
      //   旧: 全ダミーURLを順次試行(連続POST多 = bot 判定リスク)
      //   新: 1回だけ試行 → 失敗時は次の50分後に持ち越し(2時間あれば数回試行できる)
      const s = loadState();
      const idx = (s.keepaliveDummyIdx || 0) % dummies.length;
      const dummyUrl = dummies[idx];
      const s0 = loadState(); s0.keepaliveDummyIdx = idx + 1; saveState(s0);

      const r = await tryOneDummy(dummyUrl);
      if (r.ok) {
        // ★成功: lastKeepaliveAt 更新
        const s2 = loadState();
        s2.lastKeepaliveAt = Date.now();
        saveState(s2);
        pbLog('💚','keepalive',`✅ 完了: 追加→削除=${r.addedRemoved}件 (${dummyUrl.substring(0,40)})`);
        return { ok: true, addedRemoved: r.addedRemoved, usedUrl: dummyUrl };
      }
      // 1回失敗 → 次回(50分後)に持ち越し(連続POST しない = BAN 回避)
      pbLog('⚠','keepalive',`今回はカート維持できず (${r.fail||'unknown'}) → 次回(50分後)へ持ち越し`);
      return { fail: 'single-attempt-failed', failures: [{ url: dummyUrl, ...r }] };
    });  // withCartOpLock end
  }

  // ★案B 2026-05-09: iframe ベース 軽量ポーリング
  //   軽量ポーリングは fetch + DOMParser で JS 未実行の状態を見るが、
  //   ガンダムベース系商品は生HTMLが常時青(JS書き換えで grey)→ 偽陽性で連続リロード →白画面
  //   iframe で同origin読み込み + JS 1.5秒待機 → 真のライブDOM状態を取得 →
  //   STOCK_OUT 確定 → リロードしない(loop 解消)、 OK 確定 → リロード(攻め)
  async function pollViaIframe() {
    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;border:0;visibility:hidden;';
      iframe.setAttribute('aria-hidden', 'true');
      let resolved = false;
      const finish = (r) => { if (resolved) return; resolved = true; try { iframe.remove(); } catch(_){} resolve(r); };
      const tid = setTimeout(() => finish({ ok: false, fail: 'iframe-timeout' }), 12000);
      iframe.onload = async () => {
        try {
          await new Promise(r => setTimeout(r, 1000));  // JS 実行待ち(1500→1000ms 短縮、 大半の商品は十分)
          const doc = iframe.contentDocument;
          if (!doc) { clearTimeout(tid); finish({ ok: false, fail: 'no-doc' }); return; }
          const btn = doc.getElementById('buy') || doc.getElementById('buy_side');
          if (!btn) { clearTimeout(tid); finish({ ok: false, fail: 'no-btn' }); return; }
          // buttonState 同等の判定(JS実行後 = 真のライブDOM)
          const text = (btn.innerText || btn.value || '').trim();
          const parent = btn.closest('form, section, div');
          const surrounding = parent ? (parent.innerText || '').slice(0, 500) : '';
          const fullText = text + ' ' + surrounding;
          let reason;
          if (CART_DONE_KEYWORDS.some(k => fullText.includes(k))) reason = 'ALREADY_IN_CART';
          else if (BLUE_BTN_PATTERN.test(text) && !btn.disabled) reason = 'OK';
          else if (STOCK_OUT_BTN_KEYWORDS.some(k => fullText.includes(k))) reason = 'STOCK_OUT';
          else if (LIMIT_BTN_KEYWORDS.some(k => fullText.includes(k))) reason = 'LIMIT';
          else if (btn.disabled) reason = 'DISABLED';
          else reason = 'TEXT';
          clearTimeout(tid);
          finish({ ok: true, bs: { clickable: reason === 'OK', reason, text } });
        } catch (e) { clearTimeout(tid); finish({ ok: false, fail: e.message }); }
      };
      iframe.onerror = () => { clearTimeout(tid); finish({ ok: false, fail: 'iframe-error' }); };
      try { document.body.appendChild(iframe); iframe.src = location.href; }
      catch (e) { clearTimeout(tid); finish({ ok: false, fail: 'iframe-append-error' }); }
    });
  }

  // ★iframe で dummy URL を読み込んで JS 実行後の form を取得
  //   理由: プレバンの商品ページは <input name="order" value=""> がサーバ生HTMLでは空で、
  //         JS が実行されてはじめて orderId が埋まる。fetch + DOMParser だと JS 実行されないので
  //         orderId が空のまま POST → サーバは「order必須」エラーで拒否 = カート追加失敗。
  //         iframe で同origin読み込み + JS実行待機すると orderId が埋まった form が手に入る。
  async function loadFormFromIframe(dummyUrl, waitMs) {
    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;border:0;visibility:hidden;';
      iframe.setAttribute('aria-hidden', 'true');
      let resolved = false;
      const finish = (result) => {
        if (resolved) return;
        resolved = true;
        try { iframe.remove(); } catch(_){}
        resolve(result);
      };
      const timeoutId = setTimeout(() => finish({ fail: 'iframe-timeout' }), 12000);
      iframe.onload = async () => {
        try {
          // JS実行待機(orderId が埋まるまで)
          await new Promise(r => setTimeout(r, waitMs || 1500));
          const doc = iframe.contentDocument;
          if (!doc) { clearTimeout(timeoutId); finish({ fail: 'no-iframe-doc' }); return; }
          const form = doc.querySelector('form[action*="/cart_add/"]');
          if (!form) { clearTimeout(timeoutId); finish({ fail: 'no-form', doc }); return; }
          // form を deep clone して iframe 削除後も使えるように
          const clonedForm = form.cloneNode(true);
          // FormData は document に attached された form でも、detached でも使える
          // ただし select の selected は cloneNode で正しくコピーされない場合があるため、明示反映
          const origSelects = form.querySelectorAll('select');
          const cloneSelects = clonedForm.querySelectorAll('select');
          origSelects.forEach((s, i) => {
            if (cloneSelects[i]) {
              for (let j=0; j<s.options.length; j++) {
                if (cloneSelects[i].options[j]) cloneSelects[i].options[j].selected = s.options[j].selected;
              }
              cloneSelects[i].value = s.value;
            }
          });
          // ボタン状態も拾う
          const dummyBtn = doc.getElementById('buy');
          const btnDisabled = dummyBtn ? (dummyBtn.disabled || /\bdisabled\b/i.test(dummyBtn.outerHTML)) : false;
          const btnText = dummyBtn ? (dummyBtn.textContent || '').trim() : '';
          const formText = (form.innerText || '').slice(0, 500);
          clearTimeout(timeoutId);
          finish({ ok: true, form: clonedForm, btnDisabled, btnText, formText });
        } catch (e) {
          clearTimeout(timeoutId);
          finish({ fail: 'iframe-onload-error', detail: e.message });
        }
      };
      iframe.onerror = () => { clearTimeout(timeoutId); finish({ fail: 'iframe-error' }); };
      try {
        document.body.appendChild(iframe);
        iframe.src = dummyUrl;
      } catch (e) {
        clearTimeout(timeoutId);
        finish({ fail: 'iframe-append-error', detail: e.message });
      }
    });
  }

  // ★1つのダミーURLでカート追加を試みる(成功 / 詳細失敗理由を返す)
  async function tryOneDummy(dummyUrl) {
    pbLog('💚','keepalive',`▶ 試行: ${dummyUrl.substring(0,60)}`);

    // ★iframe で JS実行後の form を取得(orderId が埋まる)
    //   fetch + DOMParser だと JS未実行のためorder値が空 → サーバ拒否
    const ifr = await loadFormFromIframe(dummyUrl, 1500);
    if (ifr.fail) {
      pbLog('⚠','keepalive',`  - FAIL iframe: ${ifr.fail}${ifr.detail?' '+ifr.detail:''}`);
      if (ifr.fail === 'no-form') return { fail: 'no-form', dummyUrl };
      return { fail: ifr.fail, detail: ifr.detail, dummyUrl };
    }
    const form = ifr.form;
    if (ifr.btnDisabled) {
      pbLog('⚠','keepalive',`  - FAIL: button disabled "${ifr.btnText}"`);
      return { fail: 'button-disabled', dummyUrl, btnText: ifr.btnText };
    }
    if (STOCK_OUT_BTN_KEYWORDS.some(k => ifr.formText.includes(k))) {
      pbLog('⚠','keepalive',`  - FAIL: form に在庫切れ文言検知`);
      return { fail: 'stock-out-on-page', dummyUrl };
    }

    // ★必須フィールドを総ざらいで埋める:
    // (1) checkbox は全て checked (規約同意等)
    form.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true; });
    // (2) ★radio: name グループ毎に「最初の選択肢」を checked (色/版/サイズ等)
    const radioGroupsSeen = new Set();
    form.querySelectorAll('input[type="radio"]').forEach(r => {
      if (r.name && !radioGroupsSeen.has(r.name)) {
        radioGroupsSeen.add(r.name);
        r.checked = true;
      }
    });
    // (3) select は unit=1 を担保、それ以外の select は最初の選択肢
    form.querySelectorAll('select').forEach(sel => {
      if (!sel.options || sel.options.length === 0) return;
      if (sel.name === 'unit') {
        for (const opt of sel.options) opt.selected = (opt.value === '1');
        if (!Array.from(sel.options).some(o => o.selected)) sel.options[0].selected = true;
      } else {
        if (!Array.from(sel.options).some(o => o.selected)) sel.options[0].selected = true;
      }
    });

    // ★target の orderId を form から抽出(iframe経由でJS実行後 → 値が埋まってる)
    const orderInput = form.querySelector('input[name="order"]');
    const expectedOrderId = orderInput ? orderInput.value : null;
    if (!expectedOrderId) {
      pbLog('⚠','keepalive',`  - FAIL: orderId が空(JS実行待機が足りない可能性)`);
      return { fail: 'order-id-empty', dummyUrl };
    }

    // ★事前削除: 前回の keepalive 中断等でこのダミーが既にカートに残っているケース
    //   旧: 残っていると cart_add の挙動が変わり「フォーム必須項目不足」と誤判定される
    //   新: 追加前に同じ orderId をチェック → あれば先に削除して fresh add
    const preCart = await getCartItemIds();
    if (preCart.error === 'ACCESS_CONTROL') return { fail: 'access-control', dummyUrl };
    const preIds = preCart.ids || [];
    if (expectedOrderId && preIds.includes(expectedOrderId)) {
      pbLog('💚','keepalive',`  - 既存ダミー検出(orderId=${expectedOrderId}) → 事前削除`);
      try { await fetchWithTimeout(`/cart_del/${expectedOrderId}/`, { credentials:'include' }); } catch (_) {}
    }

    const fd = new FormData(form);
    fd.set('unit', '1');
    pbLog('💚','keepalive',`  - form fields: cb=${form.querySelectorAll('input[type="checkbox"]').length}, radio_groups=${radioGroupsSeen.size}, select=${form.querySelectorAll('select').length}, orderId=${expectedOrderId||'?'}`);

    // 事前削除後の cart 状態を取り直す(POST 直前の比較ベース)
    const beforePost = await getCartItemIds();
    if (beforePost.error === 'ACCESS_CONTROL') return { fail: 'access-control', dummyUrl };
    const beforeIds = beforePost.ids || [];

    let postRes;
    try { postRes = await fetchWithTimeout('/cart_add/', { method:'POST', body:fd, credentials:'include' }); }
    catch (e) { return { fail: 'post-error', detail: e.message, dummyUrl }; }

    let respHtml = '';
    try {
      const respBuf = await postRes.arrayBuffer();
      respHtml = decodeHtmlBuffer(respBuf, postRes.headers.get('content-type'));
    } catch (_) {}
    if (detectAccessControl(respHtml)) return { fail: 'access-control-post', dummyUrl };

    const after = await getCartItemIds();
    if (after.error === 'ACCESS_CONTROL') return { fail: 'access-control-post', dummyUrl };
    const afterIds = after.ids || [];
    const newIds = afterIds.filter(x => !beforeIds.includes(x));
    // ★成功判定: orderId ベースで照合(差分検知だけだと並行追加で誤判定)
    const success = expectedOrderId
      ? afterIds.includes(expectedOrderId)
      : (newIds.length > 0);

    if (success) {
      // ★削除: orderId 確定なら orderId で、なければ差分IDで削除
      const idsToDelete = expectedOrderId ? [expectedOrderId] : newIds;
      for (const id of idsToDelete) {
        try { await fetchWithTimeout(`/cart_del/${id}/`, { credentials:'include' }); } catch (_) {}
      }
      pbLog('💚','keepalive',`  - ✅ OK: 追加→削除=${idsToDelete.length}件 (orderId=${expectedOrderId||'(差分)'})`);
      return { ok: true, addedRemoved: idsToDelete.length, dummyUrl };
    }

    // ★失敗時: 実際のエラーメッセージを抽出して提示
    //   ★重要: script/noscript/style/head は事前に除去(GTMコード等を拾わないため)
    //   ★[class*="error"] のような曖昧なselectorは廃止(scriptタグを誤拾い)
    let actualError = '(エラー文言抽出できず)';
    let bodySnippet = '';
    try {
      const respDoc = new DOMParser().parseFromString(respHtml, 'text/html');
      // GTM/JSコード等を除去
      respDoc.querySelectorAll('script, noscript, style, head, link, meta').forEach(e => e.remove());
      const errSelectors = [
        '.error', '.errorMessage', '.error-message', '.alert', '.alert-danger',
        '#errorMessage', '#error_message', '.cart-error', '.message-error'
      ];
      for (const sel of errSelectors) {
        const el = respDoc.querySelector(sel);
        if (el) {
          const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
          // 短すぎる/長すぎる/JSコードっぽいのは弾く
          if (t && t.length > 5 && t.length < 300 && !/function\s*\(|window\.|document\./.test(t)) {
            actualError = t.slice(0, 200); break;
          }
        }
      }
      if (actualError === '(エラー文言抽出できず)') {
        const body = respDoc.body ? (respDoc.body.textContent || '').trim().replace(/\s+/g, ' ') : '';
        bodySnippet = body.slice(0, 400);
        if (body) actualError = bodySnippet || '(本文なし)';
      }
    } catch (e) { actualError = `抽出エラー: ${e.message}`; }
    // ★詳細ログ: HIROさんが状況を把握できるよう、HTTPステータス・redirect・URL も併記
    pbLog('⚠','keepalive',`  - FAIL no-cart-change: HTTP=${postRes.status} redirected=${postRes.redirected} → "${actualError.substring(0, 120)}"`);
    return {
      fail: 'no-cart-change',
      reason: actualError,
      dummyUrl,
      httpStatus: postRes.status,
      httpRedirected: postRes.redirected,
      expectedOrderId,
      preCartCount: preIds.length,
      afterCartCount: afterIds.length,
      cartHadExpected: preIds.includes(expectedOrderId),
    };
  }

  // ★keepalive 構造再設計(2026-05-09 HIROさん指示)
  //   旧: setInterval 50min → リロードで破棄 → 50分以内のリロード運用で永遠に発火しない
  //   新: 「条件判定」と「実行」を分離し、3経路で発火確認:
  //       (a) boot 時チェック     ← リロードのたびに経過時間を確認
  //       (b) visibilitychange    ← タブ復帰時(iOS Safari の suspend 対策)
  //       (c) 1分ごとの軽量ポーリング ← 同一ページ滞在時のフォールバック
  //   これで「50分以内に必ずリロードが起きる運用」でも boot 時に
  //   elapsed >= interval を検知して必ず発火する。
  let _keepalivePollTimer = null;
  let _keepaliveRunningFlag = false;  // 多重発火ガード

  // ★純粋な条件判定関数(副作用なし)
  function shouldRunKeepalive() {
    const cfg = loadConfig();
    if (!cfg.keepalive || !cfg.keepalive.enabled) return { ok:false, reason:'disabled' };
    const dummies = ((cfg.keepalive.dummy_products) || []).filter(u => u && u.trim());
    if (dummies.length === 0) return { ok:false, reason:'no-dummies' };
    if (loadState().paused === true) return { ok:false, reason:'paused' };
    const intervalMs = (cfg.keepalive.interval_minutes || 50) * 60 * 1000;
    const lastAt = loadState().lastKeepaliveAt || 0;
    if (lastAt === 0) {
      // ★初回: 時計を「今」から開始(boot 時刻を起点として記録)
      //   こうしないと毎リロードで firstDelay=50min がリセットされ続けて永遠に発火しない
      const s = loadState();
      s.lastKeepaliveAt = Date.now();
      saveState(s);
      pbLog('💚','keepalive',`時計開始: ${new Date(s.lastKeepaliveAt).toLocaleTimeString('ja-JP')} を起点に ${cfg.keepalive.interval_minutes||50}分後発火`);
      return { ok:false, reason:'clock-started' };
    }
    const elapsed = Date.now() - lastAt;
    const remain = intervalMs - elapsed;
    if (remain > 0) return { ok:false, reason:'wait', remainMs: remain };
    return { ok:true, elapsedMs: elapsed };
  }

  // ★条件チェック → 実行 のラッパー(boot/visibility/poll から呼ばれる)
  async function maybeRunKeepalive(triggerSource) {
    if (_keepaliveRunningFlag) return { skipped: 'already-running' };
    const judge = shouldRunKeepalive();
    if (!judge.ok) {
      // wait 中は静かに(ログ抑制)
      if (judge.reason !== 'wait' && judge.reason !== 'clock-started') {
        // disabled/no-dummies/paused は1分に1回ログ出すと冗長なので、boot 時のみログ出力
        if (triggerSource === 'boot') pbLog('💚','keepalive',`SKIP (${triggerSource}): ${judge.reason}`);
      }
      return { skipped: judge.reason };
    }
    // カート空チェック(forceManual=false で runKeepaliveOnce が再判定するが、
    // ここで先にスキップしてサーバー fetch を1回減らす)
    const ne = await isCartNonEmpty();
    if (!ne) {
      pbLog('💚','keepalive',`SKIP (${triggerSource}): カート空(60分タイマー対象なし)`);
      // カート空でも経過時間ログは更新したい?しない方が安全(カート復活で即発火する)
      return { skipped: 'cart-empty' };
    }
    pbLog('💚','keepalive',`★発火 (${triggerSource}): 経過 ${Math.floor(judge.elapsedMs/60000)}分`);
    _keepaliveRunningFlag = true;
    try {
      return await runKeepaliveOnce();
    } finally {
      _keepaliveRunningFlag = false;
    }
  }

  // ★boot から呼ぶエントリポイント
  //   3経路を全部セット → どれか1つでも発火すれば OK
  function startKeepaliveTimer() {
    if (_keepalivePollTimer) { clearInterval(_keepalivePollTimer); _keepalivePollTimer = null; }
    const cfg = loadConfig();
    if (!cfg.keepalive || !cfg.keepalive.enabled) {
      pbLog('💚','keepalive','起動時: 無効化(設定モーダルで有効化可能)');
      return;
    }
    const dummies = ((cfg.keepalive.dummy_products) || []).filter(u => u && u.trim());
    if (dummies.length === 0) {
      pbLog('💚','keepalive','起動時: 有効だがダミーURL未設定 → 実行されません');
      return;
    }
    // 状況ログ(時計確認用)
    const st = loadState();
    const lastAt = st.lastKeepaliveAt || 0;
    const intervalMin = cfg.keepalive.interval_minutes || 50;
    if (lastAt > 0) {
      const elapsedMin = Math.floor((Date.now() - lastAt) / 60000);
      const remainMin = Math.max(0, intervalMin - elapsedMin);
      pbLog('💚','keepalive',`起動: ${dummies.length}件、${intervalMin}分間隔、前回${elapsedMin}分前 → 残り${remainMin}分`);
    }
    // (a) boot 時チェック
    setTimeout(() => maybeRunKeepalive('boot'), 1000);  // boot 直後は他処理優先のため1秒遅延
    // (b) visibilitychange ハンドラ(タブ復帰時)
    if (!window._pbKeepaliveVisHandler) {
      window._pbKeepaliveVisHandler = () => {
        if (!document.hidden) maybeRunKeepalive('visible');
      };
      document.addEventListener('visibilitychange', window._pbKeepaliveVisHandler);
    }
    // (c) 1分ごとの軽量ポーリング(同一ページ滞在時のフォールバック)
    _keepalivePollTimer = setInterval(() => maybeRunKeepalive('poll'), 60 * 1000);
  }

  // =================================================================
  // 12. フローティングUI
  // =================================================================
  let _uiInjected = false;
  function injectFloatingUI() {
    if (_uiInjected) return true;
    if (!document.body) {
      pbLog('⚠','ui','document.body not ready, retry in 100ms');
      setTimeout(injectFloatingUI, 100);
      return false;
    }
    _uiInjected = true;
    const style = document.createElement('style');
    style.textContent = `
      #pb-error-panel {
        position: fixed; top: 0; left: 0; right: 0; z-index: 2147483646;
        background: rgba(20,8,8,0.96); color: #ffd987;
        font: 11px/1.4 -apple-system, ui-monospace, monospace;
        max-height: 35vh;
        border-bottom: 2px solid #d4001a;
        box-shadow: 0 2px 8px rgba(0,0,0,0.6); display: none;
        flex-direction: column;
      }
      #pb-error-panel.has-errors { display: flex; }
      #pb-error-panel .err-head {
        display: flex; justify-content: space-between; align-items: center;
        gap: 8px; padding: 4px 8px;
        background: #2a0a0a; border-bottom: 1px solid #4a3a1a;
        flex: 0 0 auto;
      }
      #pb-error-panel .err-head .err-title {
        font-size: 11px; font-weight: bold; color: #ffd987;
      }
      #pb-error-panel .err-head .err-clear {
        background: #4a0a0a; color: #fff; border: 1px solid #d4001a;
        font-size: 11px; padding: 4px 10px; border-radius: 3px; cursor: pointer;
        flex: 0 0 auto;
      }
      #pb-error-panel .err-list {
        flex: 1 1 auto; overflow-y: auto;
        padding: 4px 8px;
        white-space: pre-wrap; word-break: break-all;
      }
      #pb-error-panel .err-row { padding: 3px 0; border-bottom: 1px dotted #4a3a1a; }
      #pb-error-panel .err-row:last-child { border-bottom: 0; }
      #pb-error-panel .err-row.error { color: #ff8888; }
      #pb-error-panel .err-row.warn { color: #ffd987; }
      #pb-error-panel .err-row.info { color: #88d4ff; }
      #pb-error-panel .err-row.success { color: #5fd47f; font-weight: bold; }
      #pb-fab {
        position: fixed; right: 8px;
        bottom: calc(120px + env(safe-area-inset-bottom, 0px));
        z-index: 2147483640;
        background: linear-gradient(180deg, #1a1308 0%, #0a0805 100%);
        color: #f4ecd8; font: 11px/1.45 -apple-system, system-ui, sans-serif;
        padding: 8px 10px; border: 2px solid #c9a85a; border-radius: 6px;
        /* ★Phase 10 (2026-06-04): アコーディオン化に伴いサイズを可変に
           折りたたみ=コンパクト / 展開=必要分だけ伸びる。 max-height で画面内に収め、
           はみ出す分は .pb-detail を内部スクロールさせる (旧 min-height:240px 固定を撤廃) */
        width: 220px;
        max-height: 80vh;
        box-sizing: border-box;
        display: flex; flex-direction: column;
        box-shadow: 0 4px 12px rgba(0,0,0,0.7);
        color-scheme: dark;
        overflow: hidden;
      }
      #pb-fab .brand {
        font-weight: 900; font-size: 13px; letter-spacing: 0.1em;
        background: linear-gradient(180deg, #e7c97a 0%, #c9a85a 50%, #8a6f2c 100%);
        -webkit-background-clip: text; background-clip: text; color: transparent;
        margin-bottom: 4px;
      }
      #pb-fab .brand > span:not(.version) { color: #d4001a; -webkit-text-fill-color: #d4001a; }
      /* ★build識別: バージョン+ビルド番号+時刻+ハッシュ (2026-06-03 視認性向上) */
      #pb-fab .brand .version {
        display: block;
        color: #d8c89a; -webkit-text-fill-color: #d8c89a;
        background: none;
        font-weight: normal; font-size: 9.5px; letter-spacing: 0.02em;
        opacity: 0.95; margin-top: 1px; line-height: 1.3;
        font-family: 'SF Mono','Consolas',monospace;
      }
      #pb-fab .runstate {
        display:flex; align-items:center; gap:6px; padding:5px 7px; margin: 2px 0 4px;
        border-radius:4px; font-size:11px; font-weight:bold;
        background:#0d2614; color:#5fd47f; border:1px solid #2a9c4d;
      }
      #pb-fab .runstate.paused { background:#260d0d; color:#ff8888; border-color:#8a0014; }
      #pb-fab .runstate .dot {
        width:8px; height:8px; border-radius:50%; background:#5fd47f;
        animation: pb-pulse 1s ease-in-out infinite;
      }
      #pb-fab .runstate.paused .dot { background:#d4001a; animation:none; }
      @keyframes pb-pulse {
        0%,100% { box-shadow:0 0 0 0 rgba(95,212,127,0.7); opacity:1; }
        50% { box-shadow:0 0 0 6px rgba(95,212,127,0); opacity:0.6; }
      }
      /* ★Phase 10 (2026-06-04): アコーディオン式ライブパネル */
      #pb-fab .pb-acc { margin: 0 0 4px; }
      #pb-fab .pb-sum {
        list-style: none; cursor: pointer; display: flex; align-items: center; gap: 6px;
        padding: 6px 7px; border-radius: 5px; font-size: 12px; font-weight: bold;
        background: #0d2614; color: #5fd47f; border: 1px solid #2a9c4d;
        white-space: nowrap; overflow: hidden;
      }
      #pb-fab .pb-sum::-webkit-details-marker { display: none; }
      #pb-fab .pb-acc.paused .pb-sum { background:#260d0d; color:#ff8888; border-color:#8a0014; }
      #pb-fab .pb-acc.waiting .pb-sum { background:#2a2208; color:#ffd987; border-color:#8a6f2c; }
      #pb-fab .pb-sum .sum-dot {
        width:9px; height:9px; border-radius:50%; background:#5fd47f; flex:0 0 auto;
        animation: pb-pulse 1s ease-in-out infinite;
      }
      #pb-fab .pb-acc.paused .pb-sum .sum-dot { background:#d4001a; animation:none; }
      #pb-fab .pb-acc.waiting .pb-sum .sum-dot { background:#ffb000; }
      #pb-fab .pb-sum .sum-line { flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; }
      #pb-fab .pb-sum .sum-caret { flex:0 0 auto; opacity:0.6; font-size:9px; transition: transform .15s; }
      #pb-fab .pb-acc[open] .pb-sum .sum-caret { transform: rotate(180deg); }
      /* ★展開時の本体: 画面に収まらなければここだけ内部スクロール (FAB 全体ははみ出さない) */
      #pb-fab .pb-detail { padding-top: 4px; overflow-y: auto; max-height: 56vh; }
      /* ★リアルタイム検知行 (画面種別 / ボタン状態) */
      #pb-fab .detect {
        font-size: 10px; color: #b8d8e8; margin-top: 2px; min-height: 14px;
        white-space: pre-line; line-height: 1.4;
      }
      /* ★status を固定高さに(複数行ステータスでもボタン位置がずれない) */
      #pb-fab .status {
        font-weight: bold; color: #ffd987; white-space: pre-line;
        min-height: 32px; max-height: 56px; overflow: hidden;
      }
      /* ★target も上限を設定(長い商品名でボタン位置がずれない) */
      #pb-fab .target {
        word-break: break-all; opacity: 0.85; margin-top: 2px; font-size: 10px;
        min-height: 24px; max-height: 32px; overflow: hidden;
      }
      #pb-fab .schedule { font-size: 10px; color: #c9a85a; margin-top: 2px; font-weight: bold; min-height: 14px; }
      #pb-fab .counter { opacity: 0.75; font-size: 10px; min-height: 14px; }
      /* ★ボタン群を最下部に固定: 上要素が伸縮しても position fixed のように振る舞う */
      #pb-fab .btn-bottom-row { display: flex; gap: 4px; margin-top: 6px; flex: 0 0 auto; }
      #pb-fab .btn-pause, #pb-fab .btn-register-here { flex: 0 0 auto; }
      #pb-fab button {
        margin-top: 4px; margin-right: 3px; padding: 4px 8px; font-size: 10px;
        background: #ff7700; color: #fff; border: 0; border-radius: 3px; cursor: pointer; font-weight: bold;
      }
      #pb-fab .btn-settings { background: linear-gradient(180deg, #c9a85a 0%, #8a6f2c 100%); color: #1a1308; }
      #pb-modal {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 2147483647;
        background: #000; display: none;  /* ★2026-07-06 (4fix-②): 半透明rgba(0,0,0,0.92)→不透明で背景ページの合成コストを排除(設定オープン時の数秒フリーズ対策) */
        overflow-y: auto; -webkit-overflow-scrolling: touch;
      }
      #pb-modal.open { display: block; }
      #pb-modal-inner {
        max-width: 640px; margin: 0 auto; padding: 16px 14px 80px;
        color: #f4ecd8; font: 13px/1.5 -apple-system, system-ui, sans-serif;
      }
      /* ヒーローセクション(設定上部のロゴ + キャッチコピー) */
      #pb-modal .pb-hero {
        text-align: center;
        padding: 14px 8px 10px;
        margin: 0 0 14px;
        background: radial-gradient(ellipse at center, #1a1308 0%, #0a0805 70%);
        border-radius: 8px;
        border: 1px solid #4a3a1a;
      }
      #pb-modal .pb-hero-logo {
        display: block;
        margin: 0 auto 8px;
        max-width: 240px; width: 100%; height: auto;
        filter: drop-shadow(0 2px 6px rgba(231,201,122,0.25));
      }
      #pb-modal .pb-hero-tagline {
        font-size: 12px;
        color: #c9a85a;
        letter-spacing: 0.04em;
        line-height: 1.4;
      }
      #pb-modal .pb-hero-tagline b {
        color: #f3dca0;
        background: linear-gradient(180deg,#e7c97a,#c9a85a);
        -webkit-background-clip: text; background-clip: text;
        color: transparent;
        font-weight: 900;
      }
      #pb-modal h2 {
        font-size: 18px; margin: 0 0 12px;
        background: linear-gradient(180deg, #e7c97a, #c9a85a, #8a6f2c);
        -webkit-background-clip: text; background-clip: text; color: transparent;
        border-bottom: 1px solid #4a3a1a; padding-bottom: 8px;
      }
      #pb-modal section {
        background: #1a1308; border: 1px solid #4a3a1a; border-radius: 6px;
        padding: 12px; margin-bottom: 12px;
      }
      #pb-modal section h3 {
        font-size: 12px; color: #e7c97a; margin: 0 0 8px;
        letter-spacing: 0.06em; text-transform: uppercase;
        border-bottom: 1px dashed #4a3a1a; padding-bottom: 4px;
      }
      #pb-modal label { display: block; font-size: 11px; color: #b8a988; margin: 6px 0 2px; }
      /* iOS Safari がフォーム要素を OS デフォルト(白背景)にしないよう強制 */
      #pb-modal { color-scheme: dark; }
      #pb-modal input[type=text], #pb-modal input[type=url], #pb-modal input[type=datetime-local],
      #pb-modal input[type=number], #pb-modal select, #pb-modal textarea {
        -webkit-appearance: none !important;
        appearance: none !important;
        width: 100%; box-sizing: border-box; padding: 10px 12px;
        background: #15110a !important;
        background-color: #15110a !important;
        color: #f4ecd8 !important;
        border: 1px solid #4a3a1a !important;
        border-radius: 4px; font-size: 14px; font-family: inherit;
        line-height: 1.5 !important;
        /* ★min-height 44px = Apple HIG 推奨タップエリア、 文字下切れ防止 */
        min-height: 44px;
      }
      /* ★number 入力は数字桁が見切れないよう padding 控えめ + 中央寄せ */
      #pb-modal input[type=number] {
        padding: 10px 6px !important;
        text-align: center !important;
      }
      /* ★select は option text が長い場合の下切れ対策 */
      #pb-modal select {
        min-height: 48px !important;
        padding-top: 12px !important;
        padding-bottom: 12px !important;
      }
      /* select の矢印 */
      #pb-modal select {
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23c9a85a'><path d='M7 10l5 5 5-5z'/></svg>") !important;
        background-repeat: no-repeat !important;
        background-position: right 6px center !important;
        background-size: 18px !important;
        padding-right: 28px;
      }
      /* datetime-local 内部の白背景・黒文字を上書き */
      #pb-modal input[type=datetime-local]::-webkit-date-and-time-value { text-align: left; color: #f4ecd8; }
      #pb-modal input[type=datetime-local]::-webkit-calendar-picker-indicator {
        filter: invert(0.7) sepia(1) hue-rotate(20deg) saturate(2);
        cursor: pointer;
      }
      /* オートフィル時の白背景を抑制 */
      #pb-modal input:-webkit-autofill,
      #pb-modal input:-webkit-autofill:focus,
      #pb-modal input:-webkit-autofill:hover {
        -webkit-box-shadow: 0 0 0 1000px #15110a inset !important;
        -webkit-text-fill-color: #f4ecd8 !important;
      }
      /* チェックボックスを自前スタイルで(✓付き、視認性UP) */
      #pb-modal input[type=checkbox] {
        -webkit-appearance: none !important;
        appearance: none !important;
        width: 26px; height: 26px; min-height: 0;
        border: 2px solid #c9a85a !important;
        background: #15110a !important;
        border-radius: 4px;
        position: relative;
        cursor: pointer;
        flex: 0 0 auto;
        margin: 0;
      }
      #pb-modal input[type=checkbox]:checked {
        background: linear-gradient(180deg, #e7c97a, #c9a85a) !important;
        border-color: #e7c97a !important;
      }
      #pb-modal input[type=checkbox]:checked::after {
        content: '✓';
        position: absolute;
        color: #1a1308;
        font-weight: 900;
        font-size: 18px;
        line-height: 22px;
        top: 0; left: 4px;
      }
      /* ラジオボタンも自前スタイル */
      #pb-modal input[type=radio] {
        -webkit-appearance: none !important;
        appearance: none !important;
        width: 24px; height: 24px;
        border: 2px solid #c9a85a !important;
        background: #15110a !important;
        border-radius: 50%;
        position: relative;
        cursor: pointer;
        flex: 0 0 auto;
      }
      #pb-modal input[type=radio]:checked {
        border-color: #ff7700 !important;
      }
      #pb-modal input[type=radio]:checked::after {
        content: '';
        position: absolute;
        width: 12px; height: 12px;
        background: linear-gradient(180deg, #ff9933, #ff7700);
        border-radius: 50%;
        top: 4px; left: 4px;
      }
      #pb-modal button {
        background: #ff7700; color: #fff; border: 0; border-radius: 6px;
        padding: 10px 14px; font-size: 14px; font-weight: bold; cursor: pointer;
        margin: 3px; min-height: 42px; box-sizing: border-box;
        letter-spacing: 0.02em;
        box-shadow: 0 2px 4px rgba(0,0,0,0.4);
      }
      #pb-modal button.gold {
        background: linear-gradient(180deg, #e7c97a, #c9a85a, #8a6f2c);
        color: #1a1308; text-shadow: 0 1px 0 rgba(255,255,255,0.3);
      }
      #pb-modal button.outline {
        background: #1a1308; border: 1px solid #c9a85a; color: #f3dca0;
      }
      #pb-modal button.danger {
        background: linear-gradient(180deg, #d4001a, #8a0014); color: #fff;
        border: 1px solid #ff4455;
      }
      #pb-modal .product {
        background: #261a0d; border: 1px solid #4a3a1a; border-radius: 6px;
        margin-bottom: 8px;
      }
      /* ★2段組み: 1段目=商品情報、 2段目=タイマー chip + 操作ボタン群 (重なり解消) */
      #pb-modal .product summary {
        cursor: pointer; padding: 10px 12px; list-style: none;
        display: flex; flex-direction: column; gap: 8px;
      }
      #pb-modal .product summary .summary-info {
        display: flex; align-items: center; gap: 6px; min-width: 0;
      }
      #pb-modal .product summary .summary-info .p-summary-name {
        flex: 1; min-width: 0;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        font-weight: bold;
      }
      /* 2段目: タイマー chip (左) + 操作ボタン群 (右) を両端寄せ */
      #pb-modal .product summary .summary-actions {
        display: flex; gap: 6px; align-items: center;
        justify-content: space-between;
      }
      #pb-modal .product summary .summary-actions .actions-buttons {
        display: flex; gap: 4px; align-items: center; flex: 0 0 auto;
      }
      #pb-modal .product summary .summary-actions button {
        margin: 0; padding: 6px 10px; font-size: 14px; min-height: 34px;
        min-width: 36px; box-shadow: none; border-radius: 4px;
      }
      #pb-modal .product summary .p-summary-open {
        background: linear-gradient(180deg, #4a7eff, #2c5cd8) !important;
        color: #fff !important; border: 1px solid #6699ff;
      }
      /* 発売時刻 + タイマー切替チップ(2段目左) */
      #pb-modal .product summary .p-time-chip {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 6px 10px; min-height: 34px;
        border-radius: 4px; font-size: 12px; font-weight: bold;
        cursor: pointer; user-select: none; white-space: nowrap;
        border: 1px solid #4a3a1a;
        flex: 0 1 auto;
      }
      #pb-modal .product summary .p-time-chip.timer-on {
        background: linear-gradient(180deg,#2a4d33,#1a3322);
        color: #5fd47f; border-color: #2a9c4d;
        box-shadow: 0 0 0 1px rgba(95,212,127,0.2);
      }
      #pb-modal .product summary .p-time-chip.timer-off {
        background: #1a1308; color: #8a6f2c; border-color: #4a3a1a;
      }
      #pb-modal .product summary .p-time-chip.timer-none {
        background: #15110a; color: #5a4a2a; border-color: #2a2010;
        cursor: default; opacity: 0.7;
      }
      #pb-modal .product summary::-webkit-details-marker { display: none; }
      #pb-modal .product summary::before {
        content: '▶'; color: #c9a85a; font-size: 10px; margin-right: 4px;
        transition: transform 0.15s;
      }
      #pb-modal .product[open] summary::before { transform: rotate(90deg); display: inline-block; }
      #pb-modal .product .body { padding: 0 12px 12px; }
      /* summary-info 内の小バッジ群: gap=6px と統一、 margin は使わない (重なり防止) */
      #pb-modal .badge {
        padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: bold;
        flex: 0 0 auto;
      }
      #pb-modal .badge.new { background: #d4001a; color: #fff; }
      #pb-modal .badge.restock { background: #c9a85a; color: #1a1308; }
      #pb-modal .num {
        background: #c9a85a; color: #1a1308; padding: 2px 7px; border-radius: 4px;
        font-weight: bold; font-size: 11px;
        flex: 0 0 auto;
      }
      #pb-modal .row { display: flex; gap: 6px; flex-wrap: wrap; align-items: flex-end; }
      #pb-modal .row > div { flex: 1; min-width: 0; }
      #pb-modal .preset-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      #pb-modal .preset-row button {
        background: #261a0d; border: 1px solid #c9a85a; color: #f3dca0;
        padding: 8px 12px; font-size: 13px; min-height: 36px; font-weight: bold;
        margin: 0; box-shadow: none;
      }
      #pb-modal .preset-row button.now {
        background: linear-gradient(180deg, #ff7700, #cc5f00);
        border-color: #ff9933; color: #fff;
      }
      /* 種別選択行 */
      #pb-modal .kind-row {
        display: flex; gap: 8px; margin-top: 4px;
      }
      #pb-modal .kind-opt {
        display: flex !important; flex-direction: column; align-items: center; gap: 6px;
        padding: 12px 8px;
        background: #15110a !important;
        border: 2px solid #4a3a1a !important;
        border-radius: 8px; cursor: pointer;
        flex: 1; min-height: 90px; box-sizing: border-box;
        color: #b8a988;
        transition: all 0.15s;
      }
      #pb-modal .kind-opt .k-name { font-size: 14px; font-weight: bold; line-height: 1.2; }
      #pb-modal .kind-opt .k-qty { font-size: 11px; color: #8a6f2c; line-height: 1.2; }
      /* JSで .checked クラスを切替(iOS互換) */
      #pb-modal .kind-opt.checked {
        background: linear-gradient(180deg, #3a2810, #1a1308) !important;
        border-color: #e7c97a !important;
        color: #f3dca0;
        box-shadow: 0 0 0 2px rgba(231,201,122,0.3);
      }
      #pb-modal .kind-opt.checked .k-name { color: #f3dca0; }
      #pb-modal .kind-opt.checked .k-qty { color: #e7c97a; }

      /* 個数+カートイン済の行 */
      #pb-modal .acquired-box {
        display: flex; align-items: center; gap: 8px; cursor: pointer;
        padding: 10px 12px;
        background: #15110a !important;
        border: 2px solid #4a3a1a !important;
        border-radius: 6px;
        flex: 0 0 auto; min-height: 42px;
        font-size: 13px; font-weight: bold; color: #b8a988;
        white-space: nowrap;
      }
      #pb-modal .acquired-box:has(input:checked) {
        background: linear-gradient(180deg, #2a4d33, #1a3322) !important;
        border-color: #5fd47f !important;
        color: #b3f0c5;
      }
      #pb-modal .save-bar {
        position: fixed; bottom: 0; left: 0; right: 0; padding: 10px 14px;
        background: linear-gradient(180deg, rgba(10,8,5,0.95), rgba(10,8,5,1));
        border-top: 1px solid #c9a85a; text-align: center;
      }
      #pb-modal .save-bar button { padding: 12px 24px; font-size: 14px; }
      #pb-modal .close-x {
        position: absolute; top: 10px; right: 14px; font-size: 24px;
        color: #fff; cursor: pointer; background: none; border: 0; padding: 0;
      }
    `;
    document.head.appendChild(style);

    // 上部エラー/警告パネル(スクショ運用用、エラー時のみ表示)
    const errPanel = document.createElement('div');
    errPanel.id = 'pb-error-panel';
    errPanel.innerHTML = `
      <div class="err-head">
        <span class="err-title">⚠ PB-CART イベント</span>
        <button class="err-clear" type="button">✕ 消す</button>
      </div>
      <div class="err-list"></div>
    `;
    document.body.appendChild(errPanel);
    errPanel.querySelector('.err-clear').onclick = () => {
      ERROR_BUFFER.length = 0;
      saveErrorBuffer();
      renderErrorPanel();
    };
    // 起動時に既存エラーがあれば即描画(リロードを跨いだスクショ運用)
    setTimeout(() => { try { renderErrorPanel(); } catch(e){} }, 0);

    const fab = document.createElement('div');
    fab.id = 'pb-fab';
    // ★Phase 10 (2026-06-04): アコーディオン式ライブパネル
    //   summary = 1 行ライブ (●モード ⏰カウントダウン 🛒動作)、 展開で全詳細
    //   既存の .status/.target/.schedule/.counter セレクタは .pb-detail 内に温存 (updateUI 互換)
    //   ボタンは details の外 = 開閉に関わらず常時クリック可能 (停止をすぐ押せる)
    fab.innerHTML = `
      <details class="pb-acc" id="pb-acc">
        <summary class="pb-sum">
          <span class="sum-dot"></span>
          <span class="sum-line">起動中…</span>
          <span class="sum-caret">▼</span>
        </summary>
        <div class="pb-detail">
          <div class="brand">PB<span>-</span>CART <span class="version">build v2.3.45 2026-07-09 05:29 #1aebea JST</span></div>
          <div class="runstate"><span class="dot"></span><span class="rs-text">起動中</span></div>
          <div class="status">起動中…</div>
          <div class="detect"></div>
          <div class="target"></div>
          <div class="schedule"></div>
          <div class="counter"></div>
        </div>
      </details>
      <button class="btn-register-here" style="width:100%;margin-top:6px;padding:8px;background:linear-gradient(180deg,#5fd47f,#2a9c4d);color:#000;font-weight:bold;font-size:12px;display:none;">📌 このページを商品に登録</button>
      <button class="btn-pause" style="width:100%;margin-top:6px;padding:8px;background:linear-gradient(180deg,#d4001a,#8a0014);color:#fff;font-weight:bold;font-size:12px;border:1px solid #ff3344;">⏸ 停止</button>
      <div class="btn-bottom-row">
        <button class="btn-settings" style="flex:1;">⚙ 設定</button>
        <button class="btn-cache-clear" style="flex:0 0 auto;background:#8a6f2c;color:#fff;" title="Cookie+Cache を即削除(PB-CART設定は保持)">🍪 クリア</button>
      </div>
    `;
    // ★アコーディオン開閉状態を記憶 (sessionStorage、 タブ独立)
    try {
      const acc = fab.querySelector('#pb-acc');
      if (acc) {
        const saved = sessionStorage.getItem('pb_cart_v2_acc_open');
        acc.open = (saved === null) ? false : (saved === '1');  // デフォルト折りたたみ
        acc.addEventListener('toggle', () => {
          try { sessionStorage.setItem('pb_cart_v2_acc_open', acc.open ? '1' : '0'); } catch (_) {}
        });
      }
    } catch (_) {}
    document.body.appendChild(fab);

    // 📌 このページを商品に登録
    fab.querySelector('.btn-register-here').onclick = async () => {
      if (!isProductPage()) {
        alert('商品ページではありません(/item/item-XXXXXXXXXX/ で実行してください)');
        return;
      }
      const url = currentProductUrl();
      const cfg = loadConfig();
      // 既登録チェック
      const exists = cfg.products.find((p) => normalizeProductUrl(p.url) === url);
      if (exists) {
        if (!confirm('この商品は既に登録されています:\n' + (exists.name || exists.id) + '\n\n商品名・時刻を上書き取得しますか?')) return;
      }
      // 同origin fetch でメタ取得(現在のページ自体を fetch することで charset 等も正しく解決)
      pbLog('📌','register','fetch ' + url);
      const meta = await fetchProductMeta(url);
      let target = exists;
      const _hadRelease = exists && exists.release_time;  // ★既存タイマー維持判定用
      if (!target) {
        target = { id: uuid(), url, name: '', kind: 'new', release_time: null, quantity: 1, acquired: false, use_timer: true, notes: '(📌 ページから登録 ' + new Date().toLocaleString('ja-JP') + ')' };
        cfg.products.push(target);
      }
      if (meta && !meta.error) {
        if (meta.name) target.name = meta.name;
        if (meta.release_time) target.release_time = meta.release_time;
        // 種別判定: 商品名に【再販】等あれば再販、それ以外は時刻有無で判定
        if (meta.isRestockHinted) {
          target.kind = 'restock';
          if (target.quantity > 3 || target.quantity < 1) target.quantity = 1;
        } else if (meta.release_time) {
          target.kind = 'new';
          target.quantity = 1;
        } else {
          target.kind = target.kind || 'restock';
        }
      }
      saveConfig(cfg);
      // ★ログ表現を整理: 既存タイマー維持/新規取得/未設定 を区別
      let _releaseLabel;
      if (target.release_time) {
        const _src = (meta && meta.release_time) ? '自動取得' : '既存値維持';
        _releaseLabel = `${new Date(target.release_time).toLocaleString('ja-JP')} (${_src})`;
      } else {
        _releaseLabel = 'タイマー未設定(再販品 or 自動取得不可、 設定モーダルで手動入力可)';
      }
      pbLog('✅','register',`saved name=${target.name || '(?)'} release=${_releaseLabel}`);
      alert(
        '✅ 商品を登録しました\n\n' +
        '名前: ' + (target.name || '(取得失敗 → 設定で手動編集)') + '\n' +
        '時刻: ' + (target.release_time ? new Date(target.release_time).toLocaleString('ja-JP') : '(なし=即時)') + '\n' +
        'URL: ' + url + '\n\n' +
        '右下「⚙ 設定」で詳細を編集できます。'
      );
      updateUI();
    };
    // ⏸ 停止 / ▶ 再開
    fab.querySelector('.btn-pause').onclick = () => {
      const s = loadState();
      s.paused = !s.paused;
      saveState(s);
      pbLog(s.paused === true ? '⏸' : '▶', 'pause', s.paused === true ? '停止' : '再開');
      updateUI();
      if (s.paused === true) {
        if (typeof showToast === 'function') showToast('⏸ 監視を停止しました', '#ff8888');
      } else {
        if (typeof showToast === 'function') showToast('▶ 監視を再開しました', '#5fd47f');
        setTimeout(mainLoop, 200);
      }
    };
    fab.querySelector('.btn-settings').onclick = (ev) => {
      // ★HIRO 2026-05-09: modal 暴発の実機調査用に click イベント情報も記録
      try {
        pbLog('🪟','modal-trigger',
          `fab .btn-settings clicked: type=${ev && ev.type} isTrusted=${ev && ev.isTrusted} ` +
          `target=${ev && ev.target && (ev.target.className || ev.target.tagName) || '?'}`);
      } catch (e) {}
      openSettingsModal('fab-click');
    };
    // ★手動キャッシュクリア(Cookie+Cache 即削除、PB-CART設定は保持)
    fab.querySelector('.btn-cache-clear').onclick = async () => {
      const btn = fab.querySelector('.btn-cache-clear');
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = '🍪 削除中...';
      try {
        const n = clearCookiesPreserveConfig();
        clearSessionKeepTabId();  // ★Phase 9-M: TAB_ID は保持
        if (window.caches) { try { (await caches.keys()).forEach(k => caches.delete(k)); } catch(_){} }
        try { localStorage.removeItem('pb_cart_v2_attempt_hist'); } catch(_){}
        try { localStorage.removeItem('pb_cart_v2_reload_hist'); } catch(_){}
        pbLog('🍪','manual-clear',`手動キャッシュクリア: Cookie ${n}個削除 + sessionStorage + Cache + 履歴`);
        btn.textContent = `✅ ${n}個削除`;
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
      } catch (e) {
        pbLog('❌','manual-clear','エラー: '+e.message);
        btn.textContent = '❌ 失敗';
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
      }
    };
    pbLog('✅','ui','floating UI injected');
    return true;
  }

  // ★Phase 18 (2026-06-10): FAB 自己修復 — ページが読込後に DOM を丸ごと差し替え、 注入した UI を消す事象に対応。
  //   実測(2026-06-10 ブラウザ調査): document-end 時点 body=3要素(=薄い"白いページ") → 描画後 84要素に。
  //   その際 documentElement ごと差し替えられ、 注入した FAB が消滅(ただし window 変数は生存)。
  //   旧来は _uiInjected ガードで再注入もされず「モニターが商品ページで消える」 状態になっていた。
  //   対策: FAB(#pb-fab)が DOM から消えていたら _uiInjected を戻して再注入し、 監視も再開する。
  //   window は当該ページ生存中ずっと残るので setInterval が効く(全面リロード時は新規 boot で作り直される)。
  //   ※ #pb-fab が健在なら getElementById チェックだけで即 return(コスト極小・チラつきなし)。
  function ensureFloatingUI() {
    try {
      if (!document.body) return;
      const _fab = document.getElementById('pb-fab');
      if (_fab) {
        // ★Phase 25 (2026-06-11): FAB は健在だが、サイト側モーダル(「注文できる商品がございません」等)に
        //   覆われてモニターが見えなくなる事象に対応(HIROさん報告: ポップアップ表示中にツールが見えない)。
        //   FAB中心点の最前面要素が FAB 自身(or その子)でなければ覆われている →
        //   body 末尾へ再append + z-index 最大化で最前面へ復帰。z-index 値に依存せず確実。
        try {
          const _r = _fab.getBoundingClientRect();
          if (_r.width > 0 && _r.height > 0) {
            const _topEl = document.elementFromPoint(_r.left + _r.width / 2, _r.top + _r.height / 2);
            if (_topEl && _topEl.id !== 'pb-fab' && !_fab.contains(_topEl)) {
              _fab.style.zIndex = '2147483647';
              document.body.appendChild(_fab);   // DOM 末尾 = 同z-indexでも最前面に来る
              if (!window._pbFabCovered) {
                window._pbFabCovered = true;
                pbLog('🔝','ui-front','FABがサイトのモーダルに覆われた → 最前面へ復帰');
              }
            } else {
              window._pbFabCovered = false;
            }
          }
        } catch (_) {}
        return;   // FAB 健在 → 上記の最前面チェックのみで終了
      }
      // FAB が消えた = ページが DOM を差し替えた → 再注入
      _uiInjected = false;
      injectFloatingUI();
      try { renderErrorPanel(); } catch (_) {}
      try { updateUI(); } catch (_) {}
      pbLog('🔁','ui-heal','FAB消失検知 → 再注入(ページがDOMを差し替えた)');
      // 差し替え後に描画された本体(#buy 等)を監視するため mainLoop を再起動(paused は尊重)
      try { if (loadState().paused !== true) setTimeout(mainLoop, 0); } catch (_) {}
    } catch (e) {}
  }
  function startFabSelfHeal() {
    if (window._pbFabHealTimer) return;
    try { window._pbFabHealTimer = setInterval(ensureFloatingUI, 700); } catch (_) {}
  }

  function updateUI(extra) {
    const fab = $('#pb-fab');
    if (!fab) return;
    const cfg = loadConfig();
    const state = loadState();
    const target = findTargetProduct(cfg, state);
    fab.querySelector('.status').textContent = state.paused ? '⏸ 一時停止' : (extra && extra.status ? extra.status : (target ? '🎯 監視中' : '⏸ 対象外ページ'));
    // ▶ 動作中 / ⏸ 停止中 ランプ
    const rs = fab.querySelector('.runstate');
    const rsText = fab.querySelector('.rs-text');
    const lpSuffix = isLowPower() ? ' ⚡低負荷' : '';
    const pollSuffix = ((cfg.options||{}).lightweight_polling === false) ? ' 🔄旧方式' : ' 🔍poll';
    if (rs && rsText) {
      if (state.paused === true) {
        rs.classList.add('paused');
        rsText.textContent = '⏸ 停止中(▶再開ボタンで起動)';
      } else if (target) {
        rs.classList.remove('paused');
        rsText.textContent = '▶ 動作中' + pollSuffix + lpSuffix;
      } else if (cfg.products.length === 0) {
        rs.classList.add('paused');
        rsText.textContent = '⚙ 商品未登録(設定から登録)';
      } else {
        rs.classList.remove('paused');
        rsText.textContent = '▶ 動作中(対象外ページ)' + pollSuffix + lpSuffix;
      }
    }
    // 現在ページの商品(登録あり/なし問わず)を取得して、カート確保済みなら明示
    let targetLabel;
    if (target) {
      targetLabel = `▶ ${effectiveName(target)} (${getKind(target)==='new'?'新発売':'再販'} x${applyQuantityCap(target)})`;
    } else if (isProductPage()) {
      // 登録済みだが acquired/done で除外された商品があるか
      const cur = currentProductUrl();
      const acquired = cfg.products.find(p => p.url && normalizeProductUrl(p.url) === cur && (p.acquired || state.doneIds.includes(p.id)));
      if (acquired) {
        targetLabel = `✅ ${effectiveName(acquired)} (カート確保済み)`;
      } else {
        targetLabel = 'この商品は登録されていません';
      }
    } else {
      targetLabel = 'このページは商品ページではありません';
    }
    fab.querySelector('.target').textContent = targetLabel;
    // ★スケジュール表示: 現在ターゲットの発売時刻 + タイマー状態
    const sch = fab.querySelector('.schedule');
    if (sch) {
      if (target && target.release_time) {
        const tt = new Date(target.release_time);
        const now = Date.now();
        const remainMs = tt.getTime() - now;
        const fmt = tt.toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
        const timerOn = (target.use_timer !== false);
        const timerLbl = timerOn ? '⏰▶ON' : '⏰⏸OFF';
        let remainStr = '';
        if (remainMs > 0) {
          if (remainMs < 60000) remainStr = ` (残${Math.ceil(remainMs/1000)}秒)`;
          else if (remainMs < 3600000) remainStr = ` (残${Math.ceil(remainMs/60000)}分)`;
          else remainStr = ` (残${Math.floor(remainMs/3600000)}時間)`;
        } else {
          remainStr = ' (発売時刻到達)';
        }
        sch.textContent = `${fmt} ${timerLbl}${remainStr}`;
        sch.style.display = '';
      } else if (target) {
        sch.textContent = '⏰ 発売時刻なし(常時監視)';
        sch.style.display = '';
      } else {
        sch.style.display = 'none';
      }
    }
    const att = target ? (state.productAttempts[target.id] || {}) : {};
    const totalCount = cfg.products.length;
    const acquiredCount = cfg.products.filter(p => p.acquired).length;
    // ★方式別にラベル統一(新方式ではpoll数、旧方式ではreload数)
    const useLightPollNow = !((cfg.options || {}).lightweight_polling === false);
    const cntLabel = useLightPollNow ? 'Poll' : 'Reload';
    fab.querySelector('.counter').textContent = `${cntLabel} ${att.reloads||0} / 完 ${acquiredCount}/${totalCount}`;
    // 商品ページにいる時のみ「📌 このページを登録」ボタン表示
    const registerBtn = fab.querySelector('.btn-register-here');
    if (registerBtn) {
      registerBtn.style.display = isProductPage() ? 'block' : 'none';
      if (isProductPage()) {
        const exists = cfg.products.find((p) => normalizeProductUrl(p.url) === currentProductUrl());
        registerBtn.textContent = exists ? '🔄 メタ更新(既登録)' : '📌 このページを商品に登録';
      }
    }
    // ⏸ 停止 / ▶ 再開 のラベルと色切替
    const pauseBtn = fab.querySelector('.btn-pause');
    if (pauseBtn) {
      if (state.paused === true) {
        pauseBtn.textContent = '▶ 再開';
        pauseBtn.style.background = 'linear-gradient(180deg,#5fd47f,#2a9c4d)';
        pauseBtn.style.color = '#000';
        pauseBtn.style.border = '1px solid #5fd47f';
      } else {
        pauseBtn.textContent = '⏸ 停止';
        pauseBtn.style.background = 'linear-gradient(180deg,#d4001a,#8a0014)';
        pauseBtn.style.color = '#fff';
        pauseBtn.style.border = '1px solid #ff3344';
      }
    }
    // ★Phase 10 (2026-06-04): アコーディオン summary 1 行ライブ + 検知行
    //   safeRun で囲み、 描画失敗してもボタンや本体は止めない (例外は phase10 タグで CSV に残る)
    safeRun('updateUI-summary', () => {
      renderFabSummary(fab, cfg, state, target, extra);
    });
  }

  // ★Phase 10: アコーディオン summary 行 + 検知行を組み立てて diff-update
  let _lastSumLine = '';
  let _lastDetect = '';
  function renderFabSummary(fab, cfg, state, target, extra) {
    const acc = fab.querySelector('#pb-acc');
    const sumLine = fab.querySelector('.sum-line');
    const detectEl = fab.querySelector('.detect');
    if (!acc || !sumLine) return;

    // ── モード判定 (緑=監視 / 赤=停止 / 黄=待機) ──
    const statusTxt = (extra && extra.status) ? extra.status : '';
    const isWaiting = /💤|混雑|待機|cooldown|クールダウン|休止/.test(statusTxt);
    let mode;  // 'run' | 'paused' | 'waiting' | 'idle'
    if (state.paused === true) mode = 'paused';
    else if (isWaiting) mode = 'waiting';
    else if (target) mode = 'run';
    else mode = 'idle';
    acc.classList.toggle('paused', mode === 'paused');
    acc.classList.toggle('waiting', mode === 'waiting');

    // ── カウントダウン (mm:ss) ──
    let cd = '';
    if (target && target.release_time) {
      const remainMs = new Date(target.release_time).getTime() - Date.now();
      if (remainMs > 0) {
        const s = Math.ceil(remainMs / 1000);
        const mm = Math.floor(s / 60), ss = s % 60;
        const hh = Math.floor(mm / 60);
        cd = hh > 0
          ? `⏰${hh}:${String(mm % 60).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
          : `⏰${mm}:${String(ss).padStart(2,'0')}`;
      } else {
        cd = '⏰発売中';
      }
    }

    // ── 今の動作 (連打/待機/リロード) ── statusTxt から要約
    let act = '';
    const mAtt = statusTxt.match(/(\d+)\s*\/\s*(10|RETRY)/);
    if (/連打|投入|カート投入/.test(statusTxt) && mAtt) act = `🛒${mAtt[1]}/10`;
    else if (mode === 'waiting') act = '💤待機';
    else if (mode === 'paused') act = '停止中';
    else if (target) {
      const att = state.productAttempts[target.id] || {};
      act = `🔁${att.reloads || 0}`;
    }

    // ── summary 1 行 (●ドット は CSS、 ここはテキスト) ──
    const modeLabel = mode === 'paused' ? '停止中' : mode === 'waiting' ? '待機' : mode === 'run' ? '監視中' : '対象外';
    const sum = [modeLabel, cd, act].filter(Boolean).join('  ');
    if (sum !== _lastSumLine) { sumLine.textContent = sum; _lastSumLine = sum; }

    // ── 検知行 (画面種別 + ボタン状態) ── 展開時のみ意味があるが常時更新 ──
    if (detectEl) {
      let screen = '商品ページ';
      try {
        if (isSiteBusy && isSiteBusy()) screen = '🚨 混雑/アクセス制限';
        else if (!isProductPage()) {
          const p = location.pathname || '';
          screen = p.includes('/cart') ? 'カート' : p.includes('/login') ? 'ログイン' :
                   p.includes('/error') ? 'エラー画面' : p.includes('/order') ? '注文画面' : 'その他ページ';
        }
      } catch (_) {}
      let btnTxt = '—';
      try {
        if (isProductPage() && typeof buttonState === 'function') {
          const bs = buttonState();
          btnTxt = bs.clickable ? '🔵青(押せる)' : `⚫${bs.reason || 'グレー'}`;
        }
      } catch (_) {}
      const detect = `画面: ${screen}\nボタン: ${btnTxt}`;
      if (detect !== _lastDetect) { detectEl.textContent = detect; _lastDetect = detect; }
    }
  }

  // ★Phase 10: 1500ms ごとのライブ更新 (Amazon bot 準拠、 イベント待ちでなく常に最新)
  //   発売前カウントダウンを毎秒見せたいので 1000ms。 diff-update でちらつき防止。
  let _statusLiveTimer = null;
  function startStatusLiveRefresh() {
    if (_statusLiveTimer) clearInterval(_statusLiveTimer);
    _statusLiveTimer = setInterval(() => {
      safeRun('status-live-refresh', () => {
        // updateUI は status を上書きするので、 直近の status 文言は保持して渡す
        const fab = $('#pb-fab');
        if (!fab) return;
        const cur = fab.querySelector('.status');
        const lastStatus = cur ? cur.textContent : '';
        updateUI({ status: lastStatus });
      });
    }, 1000);
  }
  function openSettingsModal(reason) {
    // ★HIRO 2026-05-09 依頼: modal が「いつ・なぜ」開いたかを必ずログに残す
    //   理由: attempt-loop 中に意図せず modal が開く現象が再発(1日複数回)。
    //   modal が開く唯一の経路は fab .btn-settings click のはずだが、
    //   誤タップ/暴発判別のため stack trace + reason を記録する。
    try {
      const stack = (new Error()).stack || '';
      const lines = stack.split('\n').slice(1, 4).map(s => s.trim()).filter(Boolean).join(' / ');
      pbLog('🪟', 'modal', `OPEN reason=${reason || 'unknown'} stack=${lines.slice(0, 220)}`);
    } catch (e) {}
    let modal = $('#pb-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'pb-modal';
      document.body.appendChild(modal);
    }
    // ★2026-07-06 (4fix-②): 設定を開くと数秒固まる件の計測。 描画(JS)の同期時間をログ化。
    //   JS が速ければ freeze はブラウザのレイアウト/合成コスト(→ 背景を #000 不透明にして背後ページの合成を停止)。
    const _t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    renderSettingsModal(modal);
    modal.classList.add('open');
    try {
      const _dt = ((window.performance && performance.now) ? performance.now() : Date.now()) - _t0;
      pbLog('⏱','settings-open',`設定描画 ${Math.round(_dt)}ms (商品${loadConfig().products.length}件)`);
    } catch (_) {}
  }
  function closeSettingsModal() {
    const m = $('#pb-modal');
    if (m) m.classList.remove('open');
  }
  function renderSettingsModal(modal) {
    const cfg = loadConfig();
    modal.innerHTML = `
      <div id="pb-modal-inner">
        <button class="close-x" id="pb-close">✕</button>
        <div class="pb-hero">
          <img src="${PB_LOGO_B64}" alt="PREMIUM BANDAI" class="pb-hero-logo">
          <div class="pb-hero-tagline">アナタらしい「プレミアム」との出会いを<b>全力でサポート</b>。</div>
        </div>
        <h2>⚙ PB-CART 設定</h2>
        <div style="background:#3a2810;border:1px solid #c9a85a;border-radius:6px;padding:8px 10px;margin:0 0 10px;font-size:12px;color:#ffd987;">
          ⏸ 設定を編集中は<b>自動監視を一時停止</b>しています(リロードで設定が消えないよう保護)。<br>
          下の「💾 保存して監視開始 ▶」で再開します。
        </div>

        <section>
          <h3>1. 監視対象商品</h3>
          <div id="pb-products"></div>
          <button id="pb-add-product" class="gold">＋ 商品を追加</button>
          <div style="font-size:11px;color:#b8a988;margin-top:8px;">
            URL貼付 → 「📥 取得」で商品名・発売時刻を自動入力(同origin fetch、文字化けなし)<br>
            新発売=1個 / 再販=1〜3個。最大100個。
          </div>
        </section>

        <section>
          <h3>★ 運用モード(状況に応じて切替)</h3>
          <div style="padding:10px;background:linear-gradient(180deg,#1a2538,#0a1322);border:1px solid #4a6fa5;border-radius:6px;margin-bottom:10px;">
            <label style="display:block;">
              <input type="checkbox" id="pb-new-release-only">
              <strong style="color:#88d4ff;font-size:14px;">🎯 新発売狙いモード(発売時刻商品のみ)</strong>
            </label>
            <div style="font-size:11px;color:#b8d4e8;margin:6px 0 0 24px;line-height:1.6;">
              <strong>ON</strong>:<br>
              ・<b>発売時刻が設定された商品のみ監視</b>(release_time なしの商品は無視)<br>
              ・発売時刻から指定分(下記)経過したら自動停止<br>
              ・累積POSTを抑え、 BAN リスク低減(発売イベントだけ ON 推奨)<br><br>
              <strong>OFF(デフォルト)</strong>:<br>
              ・<b>再販品も含めて全商品を監視</b>(在庫復活待ちも有効)<br>
              ・通常運用はこちら、 ただし長時間連続監視は BAN リスクあり<br>
              ・必要に応じて 🍪クリア で解除可能
            </div>
            <label style="margin-left:24px;margin-top:8px;display:block;">発売時刻からの監視継続時間(分、0〜120、推奨 30)</label>
            <input type="number" id="pb-new-release-grace" min="0" max="120" style="width:100px;margin-left:24px;">
          </div>
          <div style="padding:10px;background:linear-gradient(180deg,#2a2538,#0a0a14);border:1px solid #6a5fa5;border-radius:6px;margin-bottom:10px;">
            <label style="display:block;">
              <strong style="color:#c4b8ff;font-size:14px;">🛡 警戒モード(発売直後の BAN リスク軽減)</strong>
            </label>
            <div style="font-size:11px;color:#d4c8ff;margin:6px 0 0 24px;line-height:1.6;">
              発売後の指定分間は <strong>連打 3 回 + リロード 5〜10秒待機</strong> に切り替えて累積 POST を抑制します。<br>
              0=無効 / 30=発売後 30 分間 警戒(推奨)
            </div>
            <label style="margin-left:24px;margin-top:8px;display:block;">発売後の警戒モード時間(分、0〜120、 0で無効)</label>
            <input type="number" id="pb-alert-mode-minutes" min="0" max="120" step="5" style="width:100px;margin-left:24px;">
          </div>
        </section>

        <section>
          <h3>2. 監視方式 ★最重要設定</h3>
          <details>
            <summary style="cursor:pointer;padding:8px 10px;background:linear-gradient(180deg,#2a1808,#1a0808);border:1px solid #8a4f2c;border-radius:6px;color:#ffcc88;font-size:12px;font-weight:bold;">⚠ 触らない方が良い詳細設定(★絶対デフォルト)</summary>
            <div style="padding:10px;background:linear-gradient(180deg,#0d2614,#0a1808);border:1px solid #2a9c4d;border-radius:6px;margin-top:6px;">
              <div style="font-size:11px;color:#ffcc88;margin-bottom:8px;line-height:1.5;">
                ⚠ 監視方式は「実リロード+描画待ち」に固定です(下記)。
              </div>
              <label style="display:block;opacity:0.5;">
                <input type="checkbox" id="pb-lightweight-polling" disabled>
                <strong style="color:#9a9a9a;font-size:14px;">🔍 軽量ポーリング(現在は無効・廃止)</strong>
              </label>
              <div style="font-size:11px;color:#bdbd9f;margin:6px 0 0 24px;line-height:1.6;">
                <strong>2026-06 にプレバンが全面SPA化</strong>したため、fetch でHTMLだけ取得しても<br>
                ボタン(#buy)がJSで後から描画される=空シェルしか取れず<b>軽量ポーリングは機能しません</b>。<br>
                毎回 refresh-failed リロードに落ちて<b>無駄fetch</b>になっていたため廃止しました。<br><br>
                <strong>現在の監視(固定)= 実リロード + 描画待ち</strong>:<br>
                ・グレー検知 → 実ページリロード<br>
                ・読込後にボタンがJS描画されるのを待ってから(<b>白画面対策・Phase 19</b>)状態判定<br>
                ・青になったら連打10回で確保(従来どおり)
              </div>
            </div>
          </details>
        </section>

        <section>
          <h3>3. カート確保後の挙動</h3>
          <select id="pb-psa">
            <option value="stop">A. 完全停止 — 決済を待つ(最も安全・推奨)</option>
            <option value="safe">B. 超控えめ続行 — 次商品も狙う(リスク中)</option>
            <option value="normal">C. 通常モードで攻める(リスク高)</option>
          </select>
          <div style="font-size:11px;color:#b8a988;margin-top:6px;line-height:1.5;">
            ・A: カート確保したら停止、HIROさんが手動決済<br>
            ・B/C: 自動で次の未取得商品ページに遷移して継続<br>
            ※カートに既存商品があるとき B は SAFE モード(連打3回・控えめ)になります
          </div>
        </section>

        <section>
          <h3>4. 端末・ネットワーク保護</h3>
          <div style="padding:10px;background:linear-gradient(180deg,#1a2538,#0a1322);border:1px solid #4a6fa5;border-radius:6px;margin-bottom:10px;">
            <label style="display:block;">
              <input type="checkbox" id="pb-low-power">
              <strong style="color:#88d4ff;">🐢 低負荷モード(iPhone 13 Pro / 11 Pro 等の古い端末)</strong>
            </label>
            <div style="font-size:11px;color:#88d4ff;margin:6px 0 0 24px;line-height:1.5;">
              ポーリング間隔・連打間隔を緩めて<strong>安定動作優先</strong>:<br>
              ・ポーリング 250ms → <strong>500ms</strong><br>
              ・試行間隔 100-220ms → <strong>180-320ms</strong><br>
              ・連打回数は通常通り 10回維持
            </div>
          </div>
          <label style="display:block;margin-top:10px;">
            <input type="checkbox" id="pb-periodic-cleanup">
            <strong>🍪 定期キャッシュクリア</strong>(アクセス制限予防)
          </label>
          <div style="font-size:11px;color:#b8a988;margin:4px 0 6px 24px;line-height:1.5;">
            カート空のとき定期的に Cookie 削除して新セッションに。<br>
            <strong>カートに商品があるときは実行されません</strong>(商品が消えるため)。
          </div>
          <label style="margin-left:24px;">間隔(分、3〜60、推奨10)</label>
          <input type="number" id="pb-cleanup-interval" min="3" max="60" style="width:100px;margin-left:24px;">
          <div style="margin-top:10px;">
            <label><input type="checkbox" id="pb-auto-nuke"> 🚨 アクセス制限を連続検知したら自動でCookie削除(カート空時のみ)</label>
          </div>
          <div style="margin-top:10px;">
            <label><input type="checkbox" id="pb-realbutton-retry"> 🧪 <strong>2発目以降は本物ボタンを押す(実験)</strong></label>
            <div style="font-size:11px;color:#b8a988;margin:4px 0 0 24px;line-height:1.5;">
              1発目は従来どおり。 2発目以降は本物のカートボタンを実際に押して、 画面の小窓(入った/在庫なし)を見てから次へ。<br>
              <strong>OFF にすると従来の連打方式に戻ります</strong>(うまく動かない時の保険)。
            </div>
          </div>
          <div style="margin-top:10px;">
            <label><input type="checkbox" id="pb-foreground-only"> 📱 <strong>表示中のタブだけ動かす(iOS向け)</strong></label>
            <div style="font-size:11px;color:#b8a988;margin:4px 0 0 24px;line-height:1.5;">
              今表示しているタブだけ監視・投入。 裏に回したタブは自動で停止し、 再び表示すると再開。<br>
              <strong>OFF にすると開いている全タブが並行で動きます</strong>(従来動作)。
            </div>
          </div>
        </section>

        <section>
          <h3>5. 動作の流れ(参考)</h3>
          <div style="font-size:11px;color:#b8a988;padding:8px;background:#0a0805;border-radius:4px;line-height:1.7;">
            <strong>現在の監視(実リロード + 描画待ちに一本化)</strong><br>
            ① 商品ページを開く<br>
            ② 読込後、ボタンがJS描画されるのを待つ(白画面対策・Phase 19)<br>
            ③ グレーなら → 200ms後に実ページリロード → ②へ戻る<br>
            ④ 青になったら → 連打10回で確保<br>
            ⑤ カート確保 → Discord通知 → 動作モードA なら停止
          </div>
          <div style="font-size:11px;color:#ffcc88;margin-top:8px;padding:8px;background:#2a1808;border:1px solid #8a4f2c;border-radius:4px;line-height:1.6;">
            <strong>⚠ Safari「問題が繰り返し起きました」画面について</strong><br>
            iOS Safari は短時間に連続リロードすると自動セーフガードでタブを強制終了します。<br>
            <b>新方式なら発生しません</b>(リロードしないため)。旧方式時のみ注意。
          </div>
        </section>

        <section>
          <h3>6. キープアライブ(カート保持)</h3>
          <label><input type="checkbox" id="pb-ka-enabled"> 有効化(60分手前でダミー商品追加→削除)</label>
          <label>間隔(分、推奨50)</label>
          <input type="number" id="pb-ka-interval" min="45" max="58" style="width:100px;">
          <label>ダミー商品 URL(個別入力、ローテーション使用)</label>
          <div style="font-size:11px;color:#ffcc88;margin:4px 0 6px;padding:6px 8px;background:#2a1808;border:1px solid #8a4f2c;border-radius:4px;line-height:1.5;">
            ⚠ <strong>常に在庫があって買える商品</strong>を登録してください:<br>
            ・食玩 / ガシャポン / キャンディ系の小物<br>
            ・在庫が大量にある通常商品<br>
            ※ 予約商品・在庫切れ商品・限定商品は<strong>不向き</strong>(カート追加できない=キープアライブ機能しない)
          </div>
          <div id="pb-ka-dummies-list"></div>
          <button id="pb-ka-add-dummy" class="outline">＋ ダミーURLを追加</button>
          <button id="pb-ka-test" class="outline" style="margin-top:8px;background:linear-gradient(180deg,#3a4d33,#2a3322);border-color:#5fd47f;color:#9fff9f;">💚 今すぐテスト実行(動作確認用)</button>
          <div style="font-size:11px;color:#b8a988;margin-top:6px;line-height:1.5;">
            動作未確認なら、ダミーURL登録後にテスト実行で確認できます。<br>
            実行結果はログ(🔍 診断画面の下部)で確認:<br>
            ・<b>💚 keepalive: ✅ 完了 ...</b> = 成功<br>
            ・<b>💚 keepalive: SKIP ...</b> = 条件不成立(カート空・無効化等)
          </div>
        </section>

        <section>
          <h3>7. 通知</h3>
          <label>Discord Webhook URL</label>
          <input type="url" id="pb-webhook">
          <label>端末タグ</label>
          <input type="text" id="pb-tag" maxlength="6">
        </section>

        <section>
          <h3>8. データ管理</h3>
          <button id="pb-export" class="outline">⬇ 設定をJSONエクスポート</button>
          <button id="pb-import" class="outline" style="background:linear-gradient(180deg,#1a3848,#0a2538);border-color:#5fa3e0;color:#5fa3e0;">📥 設定JSONインポート(別端末/シークレット用)</button>
          <button id="pb-send-logs" class="outline" style="background:linear-gradient(180deg,#2a3848,#1a2538);border-color:#88d4ff;color:#88d4ff;">📤 直近ログをDiscord送信(動作分析用)</button>
          <!-- ★Phase 9-C (2026-05-22): CSV エクスポート (Amazon bot for iOS と同方式) -->
          <button id="pb-export-csv-full" class="outline" style="background:linear-gradient(180deg,#3a2848,#2a1838);border-color:#c4a8ff;color:#c4a8ff;">📥 CSV保存(全タブ統合・最大3000件)</button>
          <button id="pb-export-csv-critical" class="outline" style="background:linear-gradient(180deg,#482838,#381828);border-color:#ffa8c4;color:#ffa8c4;">📥 CSV保存(重要のみ・全タブ)</button>
          <button id="pb-reset-state" class="outline">🔄 試行履歴のみリセット</button>
          <button id="pb-reset-acquired" class="outline">🔓 全商品の「カートイン済」を一括解除</button>
          <button id="pb-reset-all" class="danger">🗑 全設定削除</button>
          <div style="font-size:11px;color:#b8a988;margin-top:8px;line-height:1.5;">
            <strong>⬇ エクスポート</strong>: 全設定をJSONでクリップボードにコピー(シークレット移行用)<br>
            <strong>📥 インポート</strong>: 別端末/シークレットモードで貼付して設定丸ごと復元<br>
            <strong>📥 CSV保存(全タブ統合)</strong>: 全タブのログを時刻順に統合して CSV ダウンロード(tab列で識別、 datetime_jst列で日本時間)<br>
            <strong>📥 CSV保存(重要)</strong>: アクセス制御・カート確保・セッション異常など重要タグだけ(全タブ・長期保存用)<br>
            <strong>🔄 試行履歴のみリセット</strong>: カート確保済みフラグ・リロード回数・停止状態を初期化(設定は保持)<br>
            <strong>🗑 全設定削除</strong>: 商品リスト含めて全部削除
          </div>
        </section>

        <div class="save-bar">
          <button id="pb-save" class="gold">💾 保存して監視開始 ▶</button>
        </div>
      </div>
    `;

    // 既存値を読み込む
    modal.querySelector('#pb-psa').value = cfg.options.post_success_action || 'stop';
    modal.querySelector('#pb-periodic-cleanup').checked = !(cfg.options.periodic_cleanup_enabled === false);
    modal.querySelector('#pb-cleanup-interval').value = cfg.options.periodic_cleanup_minutes || 10;
    modal.querySelector('#pb-auto-nuke').checked = !(cfg.options.auto_nuke_when_empty === false);
    modal.querySelector('#pb-low-power').checked = !!cfg.options.low_power_mode;
    modal.querySelector('#pb-lightweight-polling').checked = !(cfg.options.lightweight_polling === false);
    { const _rb = modal.querySelector('#pb-realbutton-retry'); if (_rb) _rb.checked = !(cfg.options.realbutton_retry === false); }
    { const _fg = modal.querySelector('#pb-foreground-only'); if (_fg) _fg.checked = !(cfg.options.foreground_only === false); }
    // ★明示的に true の時だけ ON、 デフォルト・未設定は OFF(再販品も監視するため)
    modal.querySelector('#pb-new-release-only').checked = cfg.options.new_release_only_mode === true;
    modal.querySelector('#pb-new-release-grace').value = cfg.options.new_release_grace_minutes != null ? cfg.options.new_release_grace_minutes : 30;
    modal.querySelector('#pb-alert-mode-minutes').value = cfg.options.alert_mode_minutes_after_release != null ? cfg.options.alert_mode_minutes_after_release : 0;
    modal.querySelector('#pb-ka-enabled').checked = !!(cfg.keepalive && cfg.keepalive.enabled);
    modal.querySelector('#pb-ka-interval').value = cfg.keepalive.interval_minutes || 50;
    renderDummyList(modal, cfg);
    modal.querySelector('#pb-webhook').value = cfg.notify.discord_webhook || '';
    modal.querySelector('#pb-tag').value = cfg.notify.device_tag || '📱';

    renderProductList(modal, cfg);

    // ハンドラ
    modal.querySelector('#pb-close').onclick = () => {
      closeSettingsModal();
      // ✕ で閉じた時もメインループが再開できるようにキック(待機中なら無視される)
      setTimeout(() => mainLoop(), 200);
    };
    // 外クリックでは閉じない(裏で動作中に確認できるよう)
    // 閉じるには ✕ ボタンか「💾 保存して閉じる」を使う
    modal.querySelector('#pb-add-product').onclick = () => {
      const c = loadConfig();
      if (c.products.length >= 100) { alert('最大100個までです'); return; }
      c.products.push({
        id: uuid(), url: '', name: '',
        kind: 'new', release_time: null, quantity: 1, acquired: false, use_timer: true, notes: '',
      });
      saveConfig(c);
      renderSettingsModal(modal);
    };
    modal.querySelector('#pb-export').onclick = () => {
      const c = loadConfig();
      const json = JSON.stringify(c, null, 2);
      try {
        navigator.clipboard.writeText(json).then(() => alert('✅ 設定JSONをクリップボードにコピー'));
      } catch (e) {
        prompt('設定JSON(コピーしてください):', json);
      }
    };
    // ★設定JSONインポート(シークレットモード/別端末への移行用)
    //   prompt() は iOS Safari で挙動不安定 + クリップボード自動読込みは許可必要
    //   → 専用の textarea UI を出して確実にペースト+確認できるようにする
    modal.querySelector('#pb-import').onclick = () => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;padding:20px;box-sizing:border-box;color:#f4ecd8;font:13px/1.5 -apple-system,system-ui,sans-serif;';
      overlay.innerHTML = `
        <h3 style="margin:0 0 8px;color:#5fa3e0;font-size:16px;">📥 設定JSONインポート</h3>
        <div style="font-size:12px;color:#b8a988;margin-bottom:8px;line-height:1.5;">
          別端末で「⬇ エクスポート」した JSON 文字列をここに貼り付けてください。<br>
          長押し → ペースト で貼り付け可能。
        </div>
        <textarea id="pb-import-textarea" style="flex:1;min-height:200px;width:100%;box-sizing:border-box;background:#15110a;color:#f4ecd8;border:2px solid #5fa3e0;border-radius:6px;padding:10px;font:11px/1.4 ui-monospace,monospace;resize:none;" placeholder='{"version":2,"products":[...],...}'></textarea>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button id="pb-import-cancel" style="flex:1;padding:12px;background:#4a3a1a;color:#f4ecd8;border:1px solid #8a6f2c;border-radius:6px;font-size:14px;font-weight:bold;">キャンセル</button>
          <button id="pb-import-paste" style="flex:1;padding:12px;background:linear-gradient(180deg,#5fa3e0,#3a82c0);color:#fff;border:0;border-radius:6px;font-size:14px;font-weight:bold;">📋 クリップから貼付</button>
          <button id="pb-import-apply" style="flex:1;padding:12px;background:linear-gradient(180deg,#5fd47f,#2a9c4d);color:#000;border:0;border-radius:6px;font-size:14px;font-weight:bold;">✅ インポート実行</button>
        </div>
        <div id="pb-import-status" style="font-size:12px;color:#ffd987;margin-top:8px;min-height:18px;"></div>
      `;
      document.body.appendChild(overlay);
      const ta = overlay.querySelector('#pb-import-textarea');
      const status = overlay.querySelector('#pb-import-status');
      ta.focus();
      overlay.querySelector('#pb-import-cancel').onclick = () => overlay.remove();
      overlay.querySelector('#pb-import-paste').onclick = async () => {
        try {
          const txt = await navigator.clipboard.readText();
          if (txt) { ta.value = txt; status.textContent = '✅ クリップボードから貼付完了 ('+txt.length+'文字)'; status.style.color='#5fd47f'; }
          else { status.textContent = '⚠ クリップボード空 — 手動で長押しペーストしてください'; status.style.color='#ffd987'; }
        } catch (e) {
          status.textContent = '⚠ クリップボード読取りブロックされた — 手動で長押しペーストしてください: '+e.message;
          status.style.color='#ffd987';
        }
      };
      overlay.querySelector('#pb-import-apply').onclick = () => {
        const json = (ta.value || '').trim();
        if (!json) { status.textContent='❌ 空欄です'; status.style.color='#ff8888'; return; }
        let parsed;
        try { parsed = JSON.parse(json); }
        catch (e) { status.textContent = '❌ JSON パース失敗: '+e.message; status.style.color='#ff8888'; return; }
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.products)) {
          status.textContent = '❌ 形式不正(products 配列が見つからない)'; status.style.color='#ff8888'; return;
        }
        if (!confirm(`📥 インポート確認\n\n商品数: ${parsed.products.length}件\nacquired済: ${parsed.products.filter(p=>p.acquired).length}件\nkeepalive: ${(parsed.keepalive&&parsed.keepalive.enabled)?'有効':'無効'}\n\n現在の設定を上書きしますか?`)) return;
        try {
          saveConfig(parsed);
          pbLog('📥','import',`設定インポート完了: 商品${parsed.products.length}件`);
          overlay.remove();
          alert('✅ 設定インポート完了\n\n商品リスト・設定を反映しました。');
          renderSettingsModal(modal);
        } catch (e) {
          status.textContent = '❌ 保存失敗: ' + e.message;
          status.style.color='#ff8888';
        }
      };
    };
    // ★直近ログをDiscord送信
    modal.querySelector('#pb-send-logs').onclick = async (e) => {
      e.preventDefault();
      const btn = e.target;
      const c = loadConfig();
      const wh = (c.notify || {}).discord_webhook;
      if (!wh) {
        alert('Discord webhook が未設定です。「7. 通知」セクションで設定してください。');
        return;
      }
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = '📤 送信中...';
      try {
        // 直近100件のログを Discord に送信(分割して制限内)
        const logs = LOG_BUFFER.slice(-100);
        const errors = ERROR_BUFFER.slice(-8);
        // 状態スナップショット
        const state = loadState();
        const snapshot = {
          time: new Date().toLocaleString('ja-JP'),
          url: location.pathname,
          paused: state.paused,
          doneIds: state.doneIds.length,
          accessControlStreak: state.accessControlStreak || 0,
          products_total: c.products.length,
          products_acquired: c.products.filter(p => p.acquired).length,
          options: {
            psa: (c.options||{}).post_success_action,
            lightweight_polling: (c.options||{}).lightweight_polling !== false,
            low_power_mode: !!(c.options||{}).low_power_mode,
          }
        };
        const summary = [
          '**📊 PB-CART 動作分析ログ**',
          '```json',
          JSON.stringify(snapshot, null, 2),
          '```',
          '**直近のエラー/警告 (上部パネル):**',
          '```',
          errors.length ? errors.map(e => `[${e.ts}] ${e.level}/${e.category}: ${e.message}`).join('\n') : '(なし)',
          '```',
          `**直近 ${logs.length} 件のイベントログ:**`,
        ].join('\n');
        // Discord 1メッセージ 2000文字制限 → 分割
        await fetchWithTimeout(wh, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: summary.substring(0, 1900) }),
        });
        // ログ本体を分割送信(1メッセージ ~1800文字)
        let chunk = '';
        let part = 1;
        for (const line of logs) {
          if (chunk.length + line.length + 1 > 1800) {
            await fetchWithTimeout(wh, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: '```\n' + chunk + '\n```' }),
            });
            chunk = '';
            part++;
            await sleep(500);  // Rate limit緩和
          }
          chunk += (chunk ? '\n' : '') + line;
        }
        if (chunk) {
          await fetchWithTimeout(wh, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: '```\n' + chunk + '\n```' }),
          });
        }
        pbLog('📤','send-logs',`Discord送信完了: ${logs.length}件のログ`);
        alert(`✅ Discord に送信完了\n\n・状態スナップショット\n・直近 ${errors.length} 件の警告/エラー\n・直近 ${logs.length} 件のイベントログ\n\nDiscordチャンネルを確認してください。`);
      } catch (err) {
        alert('❌ Discord送信失敗: ' + err.message);
      }
      btn.disabled = false;
      btn.textContent = orig;
    };
    // ★Phase 9-M (2026-06-03): CSV ダウンロード — 全タブ統合ログ
    modal.querySelector('#pb-export-csv-full').onclick = (e) => {
      e.preventDefault();
      try {
        const r = exportLogToCsv('full');
        if (r.ok) {
          pbLog('📥','csv-export',`CSV ダウンロード(全タブ統合): ${r.count}件 → ${r.fname}`);
          alert(`✅ CSV 保存しました\n\nファイル名: ${r.fname}\n件数: ${r.count} 件 (全タブ統合・時刻順)`);
        } else {
          alert('❌ CSV 保存失敗: ' + (r.error || 'unknown'));
        }
      } catch (err) {
        alert('❌ CSV 保存失敗: ' + (err && err.message ? err.message : err));
      }
    };
    // ★Phase 9-M (2026-06-03): CSV ダウンロード — 重要のみ (全タブ)
    modal.querySelector('#pb-export-csv-critical').onclick = (e) => {
      e.preventDefault();
      try {
        const r = exportLogToCsv('critical');
        if (r.ok) {
          pbLog('📥','csv-export',`CSV ダウンロード(重要・全タブ): ${r.count}件 → ${r.fname}`);
          alert(`✅ CSV 保存しました\n\nファイル名: ${r.fname}\n件数: ${r.count} 件 (重要のみ・全タブ統合)`);
        } else {
          alert('❌ CSV 保存失敗: ' + (r.error || 'unknown'));
        }
      } catch (err) {
        alert('❌ CSV 保存失敗: ' + (err && err.message ? err.message : err));
      }
    };
    modal.querySelector('#pb-reset-state').onclick = () => {
      if (!confirm('試行履歴のみリセットします。\n\n・カート確保済みフラグ\n・リロード回数\n・停止状態\n・アクセス制限カウンタ\n\nを初期化(商品リスト・通知設定は保持)。\n\n実行しますか?')) return;
      localStorage.removeItem(STATE_KEY);
      pbLog('🔄','reset','試行履歴をリセット');
      alert('✅ 試行履歴をリセットしました');
      closeSettingsModal();
      location.reload();
    };
    modal.querySelector('#pb-reset-acquired').onclick = () => {
      const c = loadConfig();
      const acquiredCount = c.products.filter(p => p.acquired).length;
      if (acquiredCount === 0) {
        alert('「カートイン済」になっている商品はありません。');
        return;
      }
      if (!confirm(`${acquiredCount}件の商品の「カートイン済」フラグを一括解除します。\n\n・実カートの状態とは関係なく、設定上のフラグのみ解除します\n・解除後、各商品ページで通常の連打試行が再開されます\n・商品リスト自体は削除しません\n\n実行しますか?`)) return;
      c.products.forEach(p => { p.acquired = false; });
      saveConfig(c);
      // doneIds もリセット
      const s = loadState();
      s.doneIds = [];
      s.productAttempts = {};
      saveState(s);
      pbLog('🔓','reset',`${acquiredCount}件の acquired を一括解除`);
      alert(`✅ ${acquiredCount}件の「カートイン済」フラグを解除しました`);
      renderSettingsModal(modal);  // モーダル再描画
    };
    modal.querySelector('#pb-reset-all').onclick = () => {
      if (!confirm('全設定を削除します(商品リスト含め全削除)。よろしいですか?')) return;
      localStorage.removeItem(CONFIG_KEY);
      localStorage.removeItem(STATE_KEY);
      localStorage.removeItem(META_KEY);
      renderSettingsModal(modal);
    };
    modal.querySelector('#pb-save').onclick = () => {
      collectAndSave(modal);
      // ★保存時の auto-resume: ただし acquired=true の商品が残っている時は維持
      //   (SUCCESS 後の「決済待ち」 状態で他商品を追加するケースを保護、 ROADMAP.md Phase 2)
      const sNow = loadState();
      const cfgNow = loadConfig();
      const hasAcquiredProduct = (cfgNow.products || []).some(p => p.acquired === true);
      if (sNow.paused && !hasAcquiredProduct) {
        sNow.paused = false;
        saveState(sNow);
        pbLog('▶','save','paused→running auto-resume (acquired 商品なし)');
      } else if (sNow.paused && hasAcquiredProduct) {
        pbLog('🛑','save','paused 維持 (acquired 商品あり、 決済待ち保護)');
      }
      closeSettingsModal();
      updateUI();
      // 定期クリーンアップを再起動(設定変更を反映)
      startPeriodicCleanup();
      // ★キープアライブも再起動(有効化/間隔変更/ダミー追加 を即時反映)
      startKeepaliveTimer();
      // 状態に応じてトースト (cfgNow は上で取得済み)
      const tgt = findTargetProduct(cfgNow, loadState());
      if (cfgNow.products.length === 0) {
        showToast('⚙ 商品が未登録です\n設定から商品URLを追加してください', '#ffd987');
      } else if (tgt) {
        showToast(`▶ 監視開始: ${effectiveName(tgt)}\n青ボタン→自動連打 / グレー→自動リロード`, '#5fd47f');
      } else if (isProductPage()) {
        showToast('💾 保存しました\n(このページは登録商品ではありません)', '#ffd987');
      } else {
        showToast('💾 保存しました\n登録した商品ページを開くと監視開始', '#ffd987');
      }
      // ★Phase 9-RR3 (2026-05-30): mainLoop() → safeReload() に変更
      //   旧仕様: setTimeout(() => mainLoop(), 200) → 既に動いてる mainLoop に飲み込まれて
      //          新設定が即反映されない (_mainLoopRunning=true なら requested フラグだけ立つ)
      //   症状: 保存しても監視動作が変わらず、 HIROさん が手動でページ更新すると初めて動き出す
      //   新仕様: 全面リロード = boot から mainLoop を新規起動 = 最新設定で確実に動く
      //          HIROさん の手動操作 (Safari 更新ボタン) と同じ挙動を自動化
      setTimeout(() => safeReload('config-save'), 200);
    };
    // ★キープアライブ 今すぐテスト実行
    modal.querySelector('#pb-ka-test').onclick = async (e) => {
      e.preventDefault();
      const btn = e.target;
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = '💚 実行中...';
      pbLog('💚','keepalive','★ 手動テスト実行 ★');
      try {
        // 設定が未保存の状態でテストするため、まず保存
        collectAndSave(modal);
        const r = await runKeepaliveOnce(true);  // forceManual=true
        if (r.ok) {
          alert(`✅ キープアライブテスト成功\n\nダミー商品をカートに追加→削除しました(${r.addedRemoved}件)。\nカート保持タイマーが60分にリセットされます。\n\n使用URL: ${(r.usedUrl||'').substring(0,60)}\n\n本番では ${(loadConfig().keepalive||{}).interval_minutes||50}分ごとに自動実行されます。`);
        } else if (r.skipped) {
          alert(`⚠ キープアライブ実行スキップ\n\n理由: ${r.skipped}\n\n・disabled = 設定が無効\n・no-dummies = ダミーURL未設定\n・cart-empty = カート空(本来はキープ不要)\n・access-control = アクセス制限中\n\nスキップ条件を解消してから再テストしてください。`);
        } else if (r.fail === 'all-dummies-failed' || r.fail === 'single-attempt-failed') {
          // ★全URL失敗 → 各URLの失敗理由を一覧表示
          const lines = (r.failures || []).map((f, i) => {
            const u = (f.url||'').substring(0, 50);
            let detail;
            if (f.fail === 'no-cart-change') {
              detail = [
                `HTTP ${f.httpStatus} redirect=${f.httpRedirected}`,
                `cart前=${f.preCartCount}件 後=${f.afterCartCount}件`,
                `expectedOrderId=${f.expectedOrderId} (前カート内?=${f.cartHadExpected})`,
                `エラー: "${(f.reason||'').substring(0,150)}"`
              ].join('\n   ');
            }
            else if (f.fail === 'button-disabled') detail = `ボタンgrey: "${f.btnText||'?'}"`;
            else if (f.fail === 'no-form') detail = 'cart_add フォームなし(URL確認)';
            else if (f.fail === 'stock-out-on-page') detail = 'form内に在庫切れ文言';
            else if (f.fail === 'fetch-error') detail = `fetch失敗: ${f.detail}`;
            else if (f.fail === 'post-error') detail = `POST失敗: ${f.detail}`;
            else detail = f.fail;
            return `${i+1}. ${u}\n   ${detail}`;
          }).join('\n\n');
          alert(`❌ 登録ダミー${(r.failures||[]).length}件すべて失敗\n\n${lines}\n\n💡 cart前=後 で件数変化なしなら:\n・cartHadExpected=true → 既存ダミーを削除できなかった\n・false かつ HTTP=200 → サーバが追加を拒否(他原因)\n→ プレバンのカートを直接開いて中身を確認、不要な物を削除して再テスト`);
        } else if (r.fail) {
          alert(`❌ キープアライブ失敗\n\n原因: ${r.fail}${r.detail?'\n詳細: '+r.detail:''}\n\nダミーURLが正しい商品ページか確認してください。`);
        }
      } catch (err) {
        alert('❌ テスト実行中エラー: ' + err.message);
      }
      btn.disabled = false;
      btn.textContent = orig;
    };
    // ダミーURL 追加ボタン
    modal.querySelector('#pb-ka-add-dummy').onclick = (e) => {
      e.preventDefault();
      const c = loadConfig();
      c.keepalive = c.keepalive || {};
      c.keepalive.dummy_products = c.keepalive.dummy_products || [];
      c.keepalive.dummy_products.push('');
      saveConfig(c);
      renderDummyList(modal, c);
      const all = modal.querySelectorAll('#pb-ka-dummies-list input.dummy-url');
      if (all.length) all[all.length - 1].focus();
    };
  }

  // ダミーURL 個別 input をレンダリング
  function renderDummyList(modal, cfg) {
    const root = modal.querySelector('#pb-ka-dummies-list');
    if (!root) return;
    root.innerHTML = '';
    const dummies = (cfg.keepalive && cfg.keepalive.dummy_products) || [];
    if (dummies.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:12px;text-align:center;color:#b8a988;font-size:11px;border:1px dashed #4a3a1a;border-radius:4px;margin-bottom:6px;';
      empty.textContent = 'ダミー商品URL未登録(下のボタンで追加)';
      root.appendChild(empty);
      return;
    }
    dummies.forEach((u, idx) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;align-items:center;';
      row.innerHTML = `
        <span style="flex:0 0 28px;background:#c9a85a;color:#1a1308;padding:6px 0;border-radius:4px;font-weight:bold;text-align:center;">${idx + 1}</span>
        <input type="url" class="dummy-url" value="${escapeHtml(u || '')}" style="flex:1;min-width:0;" placeholder="https://p-bandai.jp/item/item-XXXXXXXXXX/">
        <button class="dummy-open outline" title="商品ページを開く" style="flex:0 0 auto;padding:8px 10px;font-size:12px;margin:0;">🔗</button>
        <button class="dummy-del danger" title="削除" style="flex:0 0 auto;padding:8px 10px;font-size:12px;margin:0;">✕</button>
      `;
      const input = row.querySelector('.dummy-url');
      const openBtn = row.querySelector('.dummy-open');
      const delBtn = row.querySelector('.dummy-del');
      openBtn.onclick = (e) => {
        e.preventDefault();
        const v = input.value.trim();
        if (v) window.open(v, '_blank');
      };
      delBtn.onclick = (e) => {
        e.preventDefault();
        if (!confirm('このダミーURLを削除しますか?')) return;
        // 削除前に全 input の値を保存(他の入力中値が消えないよう)
        const cur = collectDummyUrls(modal);
        cur.splice(idx, 1);
        const c = loadConfig();
        c.keepalive = c.keepalive || {};
        c.keepalive.dummy_products = cur;
        saveConfig(c);
        renderDummyList(modal, c);
      };
      root.appendChild(row);
    });
  }
  function collectDummyUrls(modal) {
    return Array.from(modal.querySelectorAll('#pb-ka-dummies-list input.dummy-url'))
      .map((el) => el.value.trim()).filter(Boolean);
  }

  function renderProductList(modal, cfg) {
    const root = modal.querySelector('#pb-products');
    root.innerHTML = '';
    if (cfg.products.length === 0) {
      root.innerHTML = '<div style="text-align:center;padding:16px;color:#b8a988;border:1px dashed #4a3a1a;border-radius:6px;">商品なし。「＋ 商品を追加」で追加</div>';
      return;
    }
    cfg.products.forEach((p, idx) => {
      const det = document.createElement('details');
      det.className = 'product';
      det.dataset.id = p.id;
      const kind = getKind(p);
      det.innerHTML = `
        <summary>
          <span class="summary-info">
            <span class="num">${idx + 1}</span>
            ${p.acquired ? '<span class="badge acquired-badge" style="background:#5fd47f;color:#1a1308;">✅済</span>' : ''}
            <span class="badge ${kind}">${kind === 'new' ? '新発売' : '再販'}</span>
            <span class="p-summary-name">${escapeHtml(p.name || effectiveName(p) || '(未取得)')}</span>
          </span>
          <span class="summary-actions">
            ${(() => {
              const hasTime = !!p.release_time;
              const timerOn = hasTime && (p.use_timer !== false);
              const cls = !hasTime ? 'timer-none' : (timerOn ? 'timer-on' : 'timer-off');
              const timeStr = hasTime
                ? new Date(p.release_time).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })
                : 'なし';
              const icon = !hasTime ? '⏰' : (timerOn ? '⏰▶' : '⏰⏸');
              const title = !hasTime ? '発売時刻なし(常時監視)' : (timerOn ? 'タイマー予約ON(クリックでOFF)' : 'タイマー予約OFF(クリックでON)');
              return `<span class="p-time-chip ${cls}" title="${title}">${icon} ${escapeHtml(timeStr)}</span>`;
            })()}
            <span class="actions-buttons">
              <button class="p-summary-open" title="商品ページを別タブで開く">🔗</button>
              <button class="p-up outline" title="上に">▲</button>
              <button class="p-down outline" title="下に">▼</button>
              <button class="p-del danger" title="削除">✕</button>
            </span>
          </span>
        </summary>
        <div class="body">
          <label>商品 URL</label>
          <input type="url" class="p-url" value="${escapeHtml(p.url || '')}">
          <div style="margin-top:6px;">
            <button class="p-fetch gold">📥 商品名・時刻を取得(同origin fetch)</button>
            <button class="p-open outline" type="button">🔗 商品ページを開く</button>
          </div>
          <div class="p-status" style="font-size:11px;margin-top:4px;color:#b8a988;"></div>

          <label>表示名</label>
          <input type="text" class="p-name" value="${escapeHtml(p.name || '')}">

          <label>種別</label>
          <div class="kind-row">
            <label class="kind-opt ${kind==='new'?'checked':''}">
              <span class="k-name">新発売</span>
              <span class="k-qty">(1個)</span>
              <input type="radio" name="k_${p.id}" class="p-kind" value="new" ${kind==='new'?'checked':''}>
            </label>
            <label class="kind-opt ${kind==='restock'?'checked':''}">
              <span class="k-name">再販</span>
              <span class="k-qty">(1〜3個)</span>
              <input type="radio" name="k_${p.id}" class="p-kind" value="restock" ${kind==='restock'?'checked':''}>
            </label>
          </div>

          <div class="qty-row" style="display:flex;gap:10px;align-items:center;margin-top:10px;">
            <div style="flex:1;min-width:0;">
              <label>個数</label>
              <select class="p-qty"></select>
            </div>
            <label class="acquired-box">
              <input type="checkbox" class="p-acquired" ${p.acquired?'checked':''}>
              <span>カートイン済</span>
            </label>
          </div>

          <label>発売時刻(JST、空欄=即時)</label>
          <input type="datetime-local" class="p-release" value="${fmtForInput(p.release_time)}">
          <div class="preset-row">
            <button class="ps" data-day="0" data-h="8">今日 8:00</button>
            <button class="ps" data-day="0" data-h="10">今日 10:00</button>
            <button class="ps" data-day="0" data-h="11">今日 11:00</button>
            <button class="ps" data-day="0" data-h="12">今日 12:00</button>
            <button class="ps" data-day="0" data-h="13">今日 13:00</button>
            <button class="ps" data-day="0" data-h="16">今日 16:00</button>
            <button class="ps now" data-clear="1">▶ 即時</button>
          </div>
          <label class="acquired-box" style="margin-top:8px;${p.use_timer === false ? '' : 'background:linear-gradient(180deg,#2a4d33,#1a3322) !important;border-color:#5fd47f !important;'}">
            <input type="checkbox" class="p-use-timer" ${p.use_timer === false ? '' : 'checked'}>
            <span>⏰ 発売時刻ジャストにタイマー予約(推奨)</span>
          </label>
          <div style="font-size:10px;color:#8a7a5a;margin-top:4px;line-height:1.4;">
            ※ 上の「発売時刻」 を設定しないと予約は発火しません(再販品は時刻欄を空欄=即時開始)
          </div>

          <label>メモ</label>
          <input type="text" class="p-notes" value="${escapeHtml(p.notes || '')}">
        </div>
      `;
      // 個数セレクト
      const qtySel = det.querySelector('.p-qty');
      rebuildQty(qtySel, kind, p.quantity);

      // ハンドラ
      det.querySelector('.p-summary-open').onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const u = (det.querySelector('.p-url').value || p.url || '').trim();
        if (u) window.open(u, '_blank');
        else alert('URL未設定');
      };
      // カートイン済チェックの即時保存(チェック ON → 即 acquired=true)
      // ★re-render しない(details の開閉状態を維持) → バッジだけ in-place 更新
      det.querySelector('.p-acquired').onchange = (e) => {
        const c = loadConfig();
        const idx = c.products.findIndex(x => x.id === p.id);
        if (idx >= 0) {
          c.products[idx].acquired = e.target.checked;
          // acquired=false なら doneIds と productAttempts もクリア(再投下を成立させる)
          if (!e.target.checked) {
            const s = loadState();
            const before = s.doneIds.length;
            s.doneIds = s.doneIds.filter(x => x !== p.id);
            if (s.productAttempts) delete s.productAttempts[p.id];
            if (s.doneIds.length !== before) {
              saveState(s);
              pbLog('🔄','config',`acquired=false → doneIds除去: ${effectiveName(p)}`);
            }
          }
          saveConfig(c);
          pbLog('💾','config',`acquired=${e.target.checked}: ${effectiveName(p)}`);
          // バッジを直接更新(details は畳まない)
          const sumInfo = det.querySelector('.summary-info');
          if (sumInfo) {
            const exist = sumInfo.querySelector('.acquired-badge');
            if (e.target.checked && !exist) {
              const b = document.createElement('span');
              b.className = 'badge acquired-badge';
              b.style.cssText = 'background:#5fd47f;color:#1a1308;';
              b.textContent = '✅済';
              const numEl = sumInfo.querySelector('.num');
              if (numEl) numEl.after(b); else sumInfo.prepend(b);
            } else if (!e.target.checked && exist) {
              exist.remove();
            }
          }
          updateUI();
        }
      };
      det.querySelector('.p-up').onclick = (e) => { e.preventDefault(); e.stopPropagation(); moveProduct(p.id, -1, modal); };
      det.querySelector('.p-down').onclick = (e) => { e.preventDefault(); e.stopPropagation(); moveProduct(p.id, +1, modal); };
      // ★時刻チップ更新ヘルパー(2026-05-11 HIROさん指摘: datetime-local 変更が chip に反映されないバグ対策)
      //   datetime-local や use_timer や preset 等で release_time が変わるたびに呼ぶ
      //   chip テキスト・アイコン・class を DOM 上で即時更新(保存前でも反映)
      const refreshTimeChip = () => {
        const chip = det.querySelector('.p-time-chip');
        if (!chip) return;
        const relStr = det.querySelector('.p-release').value;
        const isoVal = fmtFromInput(relStr);
        const useTimerEl = det.querySelector('.p-use-timer');
        const useTimer = useTimerEl ? useTimerEl.checked : true;
        const hasTime = !!isoVal;
        const timerOn = hasTime && useTimer !== false;
        chip.classList.remove('timer-none', 'timer-on', 'timer-off');
        chip.classList.add(!hasTime ? 'timer-none' : (timerOn ? 'timer-on' : 'timer-off'));
        const timeStr = hasTime
          ? new Date(isoVal).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })
          : 'なし';
        const icon = !hasTime ? '⏰' : (timerOn ? '⏰▶' : '⏰⏸');
        const title = !hasTime ? '発売時刻なし(常時監視)' : (timerOn ? 'タイマー予約ON(クリックでOFF)' : 'タイマー予約OFF(クリックでON)');
        chip.textContent = `${icon} ${timeStr}`;
        chip.setAttribute('title', title);
      };
      // ★時刻チップ: タップでタイマーON/OFF 切替(クリック時に判定: 動的に状態が変わるため)
      const timeChip = det.querySelector('.p-time-chip');
      if (timeChip) {
        timeChip.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();  // details の展開を防ぐ
          // ★時刻なしのときは切替対象なし(発売時刻 datetime-local を入力してから)
          if (timeChip.classList.contains('timer-none')) return;
          const c = loadConfig();
          const idx = c.products.findIndex(x => x.id === p.id);
          if (idx < 0) return;
          c.products[idx].use_timer = !(c.products[idx].use_timer !== false);
          saveConfig(c);
          pbLog('⏰','timer',`use_timer=${c.products[idx].use_timer}: ${effectiveName(p)}`);
          renderProductList(modal, c);
        };
      }
      // ★datetime-local の値変更で chip 即時更新(2026-05-11 HIROさん指摘対応)
      const relInput = det.querySelector('.p-release');
      if (relInput) {
        relInput.addEventListener('input', refreshTimeChip);
        relInput.addEventListener('change', refreshTimeChip);
      }
      // ★use_timer チェック変更でも chip 更新
      const useTimerEl2 = det.querySelector('.p-use-timer');
      if (useTimerEl2) {
        useTimerEl2.addEventListener('change', refreshTimeChip);
      }
      det.querySelector('.p-del').onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!confirm('この商品を削除しますか?')) return;
        const c = loadConfig();
        c.products = c.products.filter(x => x.id !== p.id);
        saveConfig(c);
        renderSettingsModal(modal);
      };
      det.querySelector('.p-fetch').onclick = async (e) => {
        e.preventDefault();
        const urlInput = det.querySelector('.p-url');
        const stEl = det.querySelector('.p-status');
        const url = (urlInput.value || '').trim();
        if (!/^https?:\/\/(www\.)?p-bandai\.jp\/item\/item-\d+\/?$/.test(url)) {
          stEl.textContent = '⚠ プレバンURL(/item/item-XXXXXXXXXX/)を入力してください';
          stEl.style.color = '#ffb84d';
          return;
        }
        stEl.textContent = '⏳ 取得中(同origin fetch)…';
        stEl.style.color = '#e7c97a';
        const r = await fetchProductMeta(url);
        if (r.error) {
          stEl.textContent = '❌ 取得失敗: ' + r.error;
          stEl.style.color = '#ff6b6b';
          return;
        }
        const filled = [];
        if (r.name) {
          det.querySelector('.p-name').value = r.name;
          det.querySelector('.p-summary-name').textContent = r.name;
          filled.push('名前: ' + r.name);
        }
        if (r.release_time) {
          det.querySelector('.p-release').value = fmtForInput(r.release_time);
          filled.push('時刻: ' + new Date(r.release_time).toLocaleString('ja-JP'));
          // ★fetch 取得で時刻変わったら chip も即更新(2026-05-11 HIROさん指摘対応)
          refreshTimeChip();
        }
        // 種別自動判定: 商品名に【再販】等あれば再販、なければ時刻有無で判定
        if (r.isRestockHinted) {
          det.querySelector('.p-kind[value="restock"]').checked = true;
          rebuildQty(det.querySelector('.p-qty'), 'restock', det.querySelector('.p-qty').value);
          filled.push('種別: 再販(自動判定)');
        } else if (r.release_time) {
          det.querySelector('.p-kind[value="new"]').checked = true;
          rebuildQty(det.querySelector('.p-qty'), 'new', det.querySelector('.p-qty').value);
        }
        stEl.textContent = '✅ 取得成功 — ' + (filled.join(' / ') || '(取得結果なし)');
        stEl.style.color = '#5fd47f';
      };
      det.querySelector('.p-open').onclick = (e) => {
        e.preventDefault();
        const u = det.querySelector('.p-url').value.trim();
        if (u) window.open(u, '_blank');
      };
      // 種別変更(iOS互換: .checked クラスを切替)
      det.querySelectorAll('.p-kind').forEach(r => r.onchange = () => {
        const k = det.querySelector('.p-kind:checked').value;
        rebuildQty(det.querySelector('.p-qty'), k, det.querySelector('.p-qty').value);
        // ラジオラベルの .checked クラスを切替
        det.querySelectorAll('.kind-opt').forEach(el => el.classList.remove('checked'));
        r.closest('.kind-opt').classList.add('checked');
      });
      // プリセット
      det.querySelectorAll('.ps').forEach(b => b.onclick = (e) => {
        e.preventDefault();
        const rel = det.querySelector('.p-release');
        if (b.dataset.clear) {
          rel.value = '';
        } else {
          const d = new Date();
          d.setDate(d.getDate() + Number(b.dataset.day));
          d.setHours(Number(b.dataset.h), 0, 0, 0);
          rel.value = fmtForInput(d.toISOString());
        }
        // ★preset で時刻変更されたら chip も即更新(2026-05-11 HIROさん指摘対応)
        refreshTimeChip();
      });
      root.appendChild(det);
    });
  }

  function rebuildQty(selectEl, kind, currentValue) {
    const max = kind === 'new' ? 1 : 3;
    const desired = Math.max(1, Math.min(Number(currentValue) || 1, max));
    selectEl.innerHTML = '';
    for (let i = 1; i <= max; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = i + ' 個';
      if (i === desired) opt.selected = true;
      selectEl.appendChild(opt);
    }
  }
  function moveProduct(id, delta, modal) {
    const c = loadConfig();
    const i = c.products.findIndex(x => x.id === id);
    if (i < 0) return;
    const j = i + delta;
    if (j < 0 || j >= c.products.length) return;
    const it = c.products.splice(i, 1)[0];
    c.products.splice(j, 0, it);
    saveConfig(c);
    renderSettingsModal(modal);
  }

  function fmtForInput(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const pad = (n) => String(n).padStart(2,'0');
      return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate())
        + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch (e) { return ''; }
  }
  function fmtFromInput(localStr) {
    if (!localStr) return null;
    try { return new Date(localStr).toISOString(); } catch (e) { return null; }
  }

  function collectAndSave(modal) {
    const c = loadConfig();
    const dets = modal.querySelectorAll('#pb-products .product');
    c.products = Array.from(dets).map((d) => {
      const id = d.dataset.id;
      const kindRadio = d.querySelector('.p-kind:checked');
      const kind = kindRadio ? kindRadio.value : 'new';
      let qty = Number(d.querySelector('.p-qty').value) || 1;
      qty = kind === 'new' ? 1 : Math.min(Math.max(qty, 1), 3);
      const useTimerEl = d.querySelector('.p-use-timer');
      return {
        id,
        url: d.querySelector('.p-url').value.trim(),
        name: d.querySelector('.p-name').value.trim(),
        kind, release_time: fmtFromInput(d.querySelector('.p-release').value),
        quantity: qty,
        acquired: d.querySelector('.p-acquired').checked,
        use_timer: useTimerEl ? useTimerEl.checked : true,  // ★発売時刻ジャストの保険タイマー
        notes: d.querySelector('.p-notes').value.trim(),
      };
    });
    // ★Phase 14: モーダルに UI が無いオプションは既存値を退避して引き継ぐ(保存で消さない)
    const _prevOpts = c.options || {};
    c.options = {
      post_success_action: modal.querySelector('#pb-psa').value,
      auto_nuke_when_empty: modal.querySelector('#pb-auto-nuke').checked,
      low_power_mode: modal.querySelector('#pb-low-power').checked,
      lightweight_polling: modal.querySelector('#pb-lightweight-polling').checked,
      periodic_cleanup_enabled: modal.querySelector('#pb-periodic-cleanup').checked,
      periodic_cleanup_minutes: Math.max(3, Math.min(60, Number(modal.querySelector('#pb-cleanup-interval').value) || 10)),
      new_release_only_mode: modal.querySelector('#pb-new-release-only').checked,
      new_release_grace_minutes: Math.max(0, Math.min(120, Number(modal.querySelector('#pb-new-release-grace').value) || 30)),
      alert_mode_minutes_after_release: Math.max(0, Math.min(120, Number(modal.querySelector('#pb-alert-mode-minutes').value) || 0)),
      // ★Phase 14: order 充填待ち(モーダル UI 無し → 既存値を維持。 既定 ON/4000ms)
      wait_order_fill_before_post: _prevOpts.wait_order_fill_before_post !== false,
      wait_order_fill_max_ms: _prevOpts.wait_order_fill_max_ms || 4000,
      // ★Phase 16 (実験): 2発目以降の本物ボタン。 チェックボックスで切替、 無ければ既存値維持
      realbutton_retry: (modal.querySelector('#pb-realbutton-retry')
        ? modal.querySelector('#pb-realbutton-retry').checked
        : (_prevOpts.realbutton_retry !== false)),
      realbutton_popup_wait_ms: _prevOpts.realbutton_popup_wait_ms || 90000,
      realbtn_press_gap_ms: _prevOpts.realbtn_press_gap_ms || 500,
      // ★Phase 17: 表示中タブのみ稼働。 チェックボックスで切替、 無ければ既存値維持
      foreground_only: (modal.querySelector('#pb-foreground-only')
        ? modal.querySelector('#pb-foreground-only').checked
        : (_prevOpts.foreground_only !== false)),
    };
    c.keepalive = {
      enabled: modal.querySelector('#pb-ka-enabled').checked,
      interval_minutes: Math.max(45, Math.min(58, Number(modal.querySelector('#pb-ka-interval').value) || 50)),
      dummy_products: collectDummyUrls(modal),
    };
    c.notify = {
      discord_webhook: modal.querySelector('#pb-webhook').value.trim(),
      device_tag: modal.querySelector('#pb-tag').value.trim() || '📱',
    };
    saveConfig(c);
    pbLog('💾','config','保存完了 商品='+c.products.length);

    // ★保存時の状態整合化: acquired=false の商品は doneIds と productAttempts もクリア
    //   (HIROさん操作: カート削除→「カートイン済」チェック外し→再投下 を成立させる)
    const s = loadState();
    let mutated = false;
    for (const p of c.products) {
      if (!p.acquired) {
        // doneIds から該当id を全部除去(重複もまとめて掃除)
        const before = s.doneIds.length;
        s.doneIds = s.doneIds.filter(x => x !== p.id);
        if (s.doneIds.length !== before) {
          mutated = true;
          pbLog('🔄','reset','acquired=false → doneIds から除去: '+(p.name||p.id));
        }
        if (s.productAttempts && s.productAttempts[p.id]) {
          delete s.productAttempts[p.id];
          mutated = true;
        }
      }
    }
    // 設定上に存在しないIDも doneIds から掃除(削除商品の残骸)
    const validIds = new Set(c.products.map(p => p.id));
    const beforeAll = s.doneIds.length;
    s.doneIds = Array.from(new Set(s.doneIds.filter(x => validIds.has(x))));  // 重複も除去
    if (s.doneIds.length !== beforeAll) mutated = true;
    if (mutated) {
      saveState(s);
      pbLog('🔄','reset','state再整合 doneIds='+s.doneIds.length);
    }
  }

  // =================================================================
  // 14. 起動バナー
  // =================================================================
  // 上部エラーパネル描画
  function renderErrorPanel() {
    const panel = document.getElementById('pb-error-panel');
    if (!panel) return;
    const title = panel.querySelector('.err-title');
    if (ERROR_BUFFER.length === 0) {
      panel.classList.remove('has-errors');
      const list = panel.querySelector('.err-list');
      if (list) list.innerHTML = '';
      return;
    }
    panel.classList.add('has-errors');
    if (title) title.textContent = `⚠ PB-CART イベント (${ERROR_BUFFER.length}件)`;
    const list = panel.querySelector('.err-list');
    if (!list) return;
    // 新しいものを上に
    list.innerHTML = ERROR_BUFFER.slice().reverse().map(e => {
      const cls = escapeHtml(e.level || 'info');
      const icMap = { error:'❌', warn:'⚠', success:'✅', info:'ℹ' };
      const ic = icMap[e.level] || 'ℹ';
      return `<div class="err-row ${cls}">[${escapeHtml(e.ts)}] ${ic} ${escapeHtml(e.category)}: ${escapeHtml(e.message)}</div>`;
    }).join('');
  }

  // 短時間トースト(画面中央上)
  // ★ボタン状態診断ツール(キーワード検証用)
  //   HIROさんが商品ページで「🔍 診断」を押すと、現在のボタン要素・周辺UI・判定結果を画面表示
  //   スクショで送ってもらえれば判定キーワードを調整できる
  async function runDiagnostic() {
    const old = document.getElementById('pb-diag-overlay');
    if (old) old.remove();

    // 1. ボタン要素の取得
    const btn = document.getElementById('buy') || document.getElementById('buy_side');
    const btnInfo = btn ? {
      id: btn.id,
      tag: btn.tagName,
      text: (btn.innerText || btn.value || '').trim(),
      disabled: !!btn.disabled,
      className: btn.className || '',
      outerHTML: (btn.outerHTML || '').substring(0, 300),
    } : null;

    // 2. 周辺UI(親form/section/divのテキスト)
    const parent = btn ? btn.closest('form, section, div') : null;
    const surrounding = parent ? (parent.innerText || '').slice(0, 800) : '';

    // 3. buttonState() 判定結果
    const bs = buttonState();

    // 4. キーワードヒット結果
    const fullText = (btnInfo ? btnInfo.text : '') + ' ' + surrounding;
    const hits = {
      ALREADY_IN_CART: CART_DONE_KEYWORDS.filter(k => fullText.includes(k)),
      STOCK_OUT: STOCK_OUT_BTN_KEYWORDS.filter(k => fullText.includes(k)),
      LIMIT: LIMIT_BTN_KEYWORDS.filter(k => fullText.includes(k)),
    };

    // 5. カート状態(fetch)
    let cartInfo = '(取得中...)';
    let cartIds = [];
    try {
      const r = await getCartItemIds();
      if (r.error) cartInfo = 'エラー: ' + r.error;
      else { cartIds = r.ids || []; cartInfo = `${cartIds.length}件 ids=[${cartIds.join(', ')}]`; }
    } catch (e) { cartInfo = 'fetch失敗: ' + e.message; }

    // 6. 商品フォームの orderId
    const cartForm = findCartFormOnPage();
    const orderInput = cartForm ? cartForm.querySelector('input[name="order"]') : null;
    const targetOrderId = orderInput ? orderInput.value : '(なし)';
    const isInCart = cartIds.includes(targetOrderId) ? 'はい(✅)' : 'いいえ';

    const ts = new Date().toLocaleString('ja-JP');

    // オーバーレイ表示
    const overlay = document.createElement('div');
    overlay.id = 'pb-diag-overlay';
    overlay.style.cssText = `
      position:fixed; top:0; left:0; right:0; bottom:0; z-index:2147483647;
      background:rgba(0,0,0,0.85); overflow-y:auto;
      padding:20px 12px; box-sizing:border-box;
      color:#f4ecd8; font:12px/1.5 ui-monospace,monospace;
    `;
    const fmtList = (arr) => arr.length ? arr.map(s=>`"${escapeHtml(s)}"`).join(', ') : '(なし)';
    overlay.innerHTML = `
      <div style="max-width:600px;margin:0 auto;background:#1a1308;border:2px solid #c9a85a;border-radius:8px;padding:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid #4a3a1a;padding-bottom:8px;">
          <h3 style="margin:0;color:#e7c97a;font-size:14px;">🔍 ボタン診断結果</h3>
          <button id="pb-diag-close" style="background:#4a0a0a;color:#fff;border:1px solid #d4001a;font-size:14px;padding:4px 12px;border-radius:4px;font-weight:bold;">✕ 閉じる</button>
        </div>
        <div style="margin-bottom:10px;color:#88d4ff;">📅 ${ts}</div>
        <div style="margin-bottom:10px;"><b>📍 URL:</b><br><span style="color:#ffd987;word-break:break-all;">${escapeHtml(location.href)}</span></div>

        <div style="background:#0a0805;padding:8px;border-radius:4px;margin:10px 0;">
          <div style="color:#5fd47f;font-weight:bold;margin-bottom:4px;">▶ 判定結果(buttonState)</div>
          <div>reason: <b style="color:#ff8888;">${escapeHtml(bs.reason)}</b></div>
          <div>clickable: <b>${bs.clickable}</b></div>
          <div>text: "<span style="color:#ffd987;">${escapeHtml(bs.text||'')}</span>"</div>
        </div>

        <div style="background:#0a0805;padding:8px;border-radius:4px;margin:10px 0;">
          <div style="color:#5fd47f;font-weight:bold;margin-bottom:4px;">▶ ボタン要素</div>
          ${btnInfo ? `
            <div>id: ${escapeHtml(btnInfo.id)}</div>
            <div>tag: ${escapeHtml(btnInfo.tag)}</div>
            <div>disabled: ${btnInfo.disabled}</div>
            <div>className: ${escapeHtml(btnInfo.className)}</div>
            <div>text: "<span style="color:#ffd987;">${escapeHtml(btnInfo.text)}</span>"</div>
            <div style="font-size:10px;color:#888;margin-top:4px;word-break:break-all;">HTML: ${escapeHtml(btnInfo.outerHTML)}</div>
          ` : '<span style="color:#ff8888;">ボタン要素が見つかりません(#buy / #buy_side)</span>'}
        </div>

        <div style="background:#0a0805;padding:8px;border-radius:4px;margin:10px 0;">
          <div style="color:#5fd47f;font-weight:bold;margin-bottom:4px;">▶ キーワード判定ヒット</div>
          <div>ALREADY_IN_CART(カート確保済み): ${fmtList(hits.ALREADY_IN_CART)}</div>
          <div>LIMIT(購入制限): ${fmtList(hits.LIMIT)}</div>
          <div>STOCK_OUT(在庫切れ): ${fmtList(hits.STOCK_OUT)}</div>
        </div>

        <div style="background:#0a0805;padding:8px;border-radius:4px;margin:10px 0;">
          <div style="color:#5fd47f;font-weight:bold;margin-bottom:4px;">▶ カート状態(fetch /cart/)</div>
          <div>${escapeHtml(cartInfo)}</div>
          <div>このページ商品の orderId: <b>${escapeHtml(targetOrderId)}</b></div>
          <div>カート内に存在: <b>${isInCart}</b></div>
        </div>

        <div style="background:#0a0805;padding:8px;border-radius:4px;margin:10px 0;">
          <div style="color:#5fd47f;font-weight:bold;margin-bottom:4px;">▶ 周辺UI テキスト(親要素 800文字)</div>
          <div style="white-space:pre-wrap;color:#b8a988;font-size:11px;max-height:200px;overflow-y:auto;border:1px dotted #4a3a1a;padding:6px;">${escapeHtml(surrounding)}</div>
        </div>

        <div style="background:#0a0805;padding:8px;border-radius:4px;margin:10px 0;">
          <div style="color:#5fd47f;font-weight:bold;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <span>📋 直近のイベントログ(最新${Math.min(30, LOG_BUFFER.length)}件 / 全${LOG_BUFFER.length}件)</span>
            <button id="pb-diag-log-all" style="background:#444;color:#fff;border:0;border-radius:4px;font-size:10px;padding:4px 8px;font-weight:bold;">全表示</button>
          </div>
          <div id="pb-diag-log" style="white-space:pre-wrap;color:#9fff9f;font-family:ui-monospace,monospace;font-size:10px;max-height:240px;overflow-y:auto;border:1px dotted #4a3a1a;padding:6px;background:#000;">${escapeHtml(LOG_BUFFER.slice(-30).join('\n') || '(ログなし)')}</div>
        </div>

        <div style="margin-top:12px;font-size:11px;color:#888;line-height:1.6;">
          📸 この画面をスクショして送ってください。<br>
          判定キーワードと実物の差異を調整します。
        </div>
      </div>
    `;
    (document.body || document.documentElement).appendChild(overlay);
    overlay.querySelector('#pb-diag-close').onclick = () => overlay.remove();
    const logAllBtn = overlay.querySelector('#pb-diag-log-all');
    if (logAllBtn) {
      logAllBtn.onclick = () => {
        const el = overlay.querySelector('#pb-diag-log');
        if (el) {
          el.textContent = LOG_BUFFER.join('\n') || '(ログなし)';
          el.scrollTop = el.scrollHeight;
          el.dataset.expanded = '1';  // pbLog のリアルタイム更新を停止(全表示維持)
        }
        logAllBtn.style.display = 'none';
      };
    }
    pbLog('🔍','diag',`reason=${bs.reason} text="${bs.text}" cart=${cartIds.length}件`);
  }

  function showToast(text, color) {
    color = color || '#5fd47f';
    const t = document.createElement('div');
    t.style.cssText = `
      position:fixed; top:16px; left:50%; transform:translateX(-50%); z-index:2147483647;
      background:${color}; color:#000; padding:12px 18px; border-radius:8px;
      font:bold 14px/1.4 system-ui; box-shadow:0 4px 12px rgba(0,0,0,0.5);
      max-width:90vw; text-align:center; white-space:pre-wrap;
    `;
    t.textContent = text;
    (document.body || document.documentElement).appendChild(t);
    setTimeout(() => { try { t.style.transition='opacity 0.4s'; t.style.opacity='0'; } catch(e){} }, 2600);
    setTimeout(() => { try { t.remove(); } catch(e){} }, 3200);
    return t;
  }

  // 軽量バナー(起動完了などの一時表示用、ボタンなし、自動消去)
  function showBanner(msgList, color, ttl) {
    color = color || '#5fd47f';
    const banner = document.createElement('div');
    banner.style.cssText = `
      position:fixed; top:0; left:0; right:0; z-index:2147483645;
      background: ${color}; color:#000;
      padding:8px 30px 8px 10px; font:bold 11px/1.4 system-ui;
      box-shadow:0 2px 8px rgba(0,0,0,0.5); max-height:35vh; overflow:auto;
    `;
    const list = msgList.map(m => '・' + m).join('<br>');
    banner.innerHTML = list;
    const close = document.createElement('div');
    close.textContent = '✕';
    close.style.cssText = 'position:absolute;top:4px;right:8px;cursor:pointer;font-size:16px;font-weight:bold;';
    close.onclick = () => banner.remove();
    banner.appendChild(close);
    const tryAppend = () => {
      if (document.body) document.body.appendChild(banner);
      else setTimeout(tryAppend, 50);
    };
    tryAppend();
    if (ttl && ttl > 0) setTimeout(() => { try { banner.remove(); } catch(e){} }, ttl);
    return banner;
  }

  // =================================================================
  // 15. 起動
  // =================================================================
  // 現在表示中のページが混雑画面(アクセス制御)か判定
  // ★Cookie同意バナーを自動でOKタップ(画面下に常時出るのを消す)
  //   プレバン本体のバナー: 「当ウェブサイトではクッキーを使用しています」+ [OK] ボタン
  //   リロードのたびに再表示されるので、自動で OK を押して消す
  //   ★誤通知防止のため厳しくスコープ:
  //     - ボタンのテキストが完全一致("OK" / "同意する" / "承諾" / "閉じる" / "✕" / "×")
  //     - parent の textContent に「クッキー」+「使用」が両方含まれる(<300文字)
  //     - cart_add フォーム内のボタンは除外(誤って「カートに入れる」を押さないため)
  // ★1度消去成功したら以降のスイープをスキップするフラグ
  //   旧: 0/300/1000/3000/6000ms の5段でスイープ → OneTrust成功後もフォールバックが
  //       別の「OK」ボタンを誤検出して連発クリック → iOS Safari セーフガード誘発の原因
  //   新: 1回成功したらフラグ立てて以降ノーオペ
  let _pbCookieBannerDismissed = false;
  function autoDismissCookieBanner() {
    if (_pbCookieBannerDismissed) return false;  // 一度成功したら以降スキップ
    try {
      // ★ファストパス: OneTrust(プレバンが採用しているクッキー同意SDK)
      //   id が固定なので即クリック可能、副作用ゼロ
      const ot = document.getElementById('onetrust-accept-btn-handler');
      if (ot && ot.offsetParent !== null) {
        try {
          ot.click();
          pbLog('🍪','cookie-banner','OneTrust OK 自動タップ');
          _pbCookieBannerDismissed = true;
          return true;
        } catch (_) {}
      }
      // ★OneTrust が見つからない場合のみフォールバック(最大1回)
      //   OneTrust 成功時はここに落ちないので、誤検出による連発クリックは発生しない
      const ALLOWED_TEXTS = ['OK', '同意する', '承諾', '閉じる', '✕', '×'];
      const buttonCandidates = $$('button').filter(el => {
        const t = (el.innerText || '').trim();
        if (!ALLOWED_TEXTS.includes(t)) return false;
        if (el.closest('form[action*="/cart_add/"]')) return false;
        if (el.closest('#pb-fab, #pb-modal, #pb-error-panel')) return false;
        return true;
      });
      for (const btn of buttonCandidates) {
        let p = btn, depth = 0;
        while (p && depth < 6) {
          const t = p.innerText || '';
          if (t.length < 300 && /(クッキー|Cookie|cookie)/.test(t) && /(使用|使|consent|accept|policy)/i.test(t)) {
            try {
              btn.click();
              pbLog('🍪','cookie-banner',`自動消去 (${btn.tagName} text="${(btn.innerText||'').trim()}")`);
              _pbCookieBannerDismissed = true;
              return true;
            } catch (_) { return false; }
          }
          p = p.parentElement; depth++;
        }
      }
    } catch (e) {}
    return false;
  }
  // ★スイープ間隔を 0/1000/3000ms の3回に削減
  //   旧 5段(0/300/1000/3000/6000ms): フラグなしで連発クリックの原因
  //   新 3段+フラグ: 1回成功で以降ノーオペ(無駄クリック完全防止)
  function startCookieBannerSweep() {
    const delays = [0, 1000, 3000];
    for (const d of delays) {
      setTimeout(() => {
        if (!_pbCookieBannerDismissed) autoDismissCookieBanner();
      }, d);
    }
  }

  function isCurrentPageAccessControl() {
    if (!document.body) return false;
    const text = document.body.innerText || '';
    return detectAccessControl(text);
  }

  function boot() {
    // ★2026-05-09 HIROさん 検証用: 白画面発動直前のシステム状態を記録
    window._pbBootAt = Date.now();
    const _bootSinceNav = (typeof performance !== 'undefined' && performance.now) ? Math.round(performance.now()) : null;
    // ★JS heap メモリ使用量(iOS Safari は 17+ で performance.memory 非対応の可能性、try で確認)
    let _heapStr = '';
    try {
      if (performance && performance.memory) {
        const m = performance.memory;
        _heapStr = ` heap=${Math.round(m.usedJSHeapSize/1048576)}/${Math.round(m.totalJSHeapSize/1048576)}/${Math.round(m.jsHeapSizeLimit/1048576)}MB`;
      }
    } catch (e) {}
    // ★localStorage 使用量(累積で大きくなりすぎてないか)
    let _lsSize = 0;
    try {
      for (const k of Object.keys(localStorage)) {
        _lsSize += (k.length + (localStorage.getItem(k)||'').length);
      }
    } catch (e) {}
    const _lsStr = _lsSize > 0 ? ` ls=${Math.round(_lsSize/1024)}KB` : '';
    // ★navigation type(reload か通常 navigate か)
    let _navType = '';
    try {
      const navs = performance.getEntriesByType ? performance.getEntriesByType('navigation') : null;
      if (navs && navs[0] && navs[0].type) _navType = ` nav=${navs[0].type}`;
    } catch (e) {}
    pbLog('🚀','boot',`PB-CART v2 起動 build=v2.3.45 2026-07-09 05:29 #1aebea JST path=${location.pathname.substring(0,50)}${_bootSinceNav!=null?` sinceNav=${_bootSinceNav}ms`:''}${_navType}${_heapStr}${_lsStr}`);

    // ★★★ Phase 31 (2026-07-01): ネイティブ alert()/confirm() を横取り ★★★
    //   実機確定(v2.3.33 で 80回ポップアップ・popup-struct=0/dismissed=0): 「注文できる商品がございません」
    //   「大変混み合っているため…」等は DOM モーダルではなく iOS Safari の★ネイティブ alert()★。
    //   btn.click() で発火 → JS を同期ブロック(=フリーズ)・画面最上部に表示・DOM に無いので閉じるボタンを
    //   掴めず(3回直して閉じなかった真因)・HIROさんが手動で閉じるしかなかった。
    //   対策: alert/confirm を横取りして★ネイティブダイアログを出さず、 文言をログに記録して即続行★。
    //   → ブロック/フリーズ/手動クローズが消え、 中身も分かる(今まで取れなかったデータ)。 サイトJSは即 return 相当で継続。
    //   ※@grant none によりページ文脈で動くため window.alert 上書きがサイトの alert 呼出に効く。
    try {
      if (!window._pbDialogHooked) {
        window._pbDialogHooked = true;
        window.alert = function (msg) {
          const _m = String(msg == null ? '' : msg);
          // ★Phase 32: 抑止した文言を残す → detectCartAddedPopup / ERR 判定が「成功/エラーのネイティブalert」を拾える
          try { window._pbLastAlert = { msg: _m, at: Date.now() }; } catch (_) {}
          try { pbLog('🔕','native-alert',`alert抑止: ${_m.slice(0,80)}`); } catch (_) {}
          return undefined;  // ネイティブダイアログを出さない(ブロック回避)
        };
        window.confirm = function (msg) {
          const _m = String(msg == null ? '' : msg);
          try { window._pbLastAlert = { msg: _m, at: Date.now() }; } catch (_) {}
          try { pbLog('🔕','native-alert',`confirm抑止(OK扱い): ${_m.slice(0,80)}`); } catch (_) {}
          return true;  // 予約フローを止めないよう OK 相当で続行
        };
        pbLog('🔕','native-alert','alert/confirm 横取り設置(ネイティブダイアログ抑止・文言ログ化)');
      }
    } catch (_) {}

    // ★Phase 13 (2026-06-05): 前回 reload() → 今回 boot の所要を計測 → ツール側 overhead を分離
    //   reloadToBoot = reload()呼出 〜 この boot。 sinceNav = ナビ開始〜boot (Akamai ページロード)。
    //   overhead = reloadToBoot - sinceNav ≈ 「reload()呼出 → ナビ開始」 (pagehide flush + 解体)。
    try {
      const _mk = JSON.parse(localStorage.getItem('pb_cart_v2_reload_marker') || 'null');
      if (_mk && _mk.t) {
        const _reloadToBoot = Date.now() - _mk.t;
        const _overhead = (_bootSinceNav != null) ? (_reloadToBoot - _bootSinceNav) : null;
        if (_reloadToBoot >= 0 && _reloadToBoot < 60000) {
          pbLog('🔬','reload-diag',
            `前回reload()→boot=${_reloadToBoot}ms (sinceNav=${_bootSinceNav}ms ＝Akamaiページロード / ツール側overhead≈${_overhead}ms / label=${_mk.label})`);
        }
        localStorage.removeItem('pb_cart_v2_reload_marker');
      }
    } catch (_e) {}

    // ★Phase 9-L (2026-05-22): accessControlStreak の時間ベース自動リセット
    //   旧仕様: POST 経路以外でリセットされず、 過去の発売の累積値が残り続けるバグ
    //   新仕様: 最終発火から ACCESS_CONTROL_RESET_AFTER_MS (10 分) 超なら 0 リセット
    //          これで「直近の連続検出数」 本来の意味に戻る
    try {
      const _sBoot = loadState();
      if ((_sBoot.accessControlStreak || 0) > 0 && _sBoot.lastAccessControlAt) {
        const _elapsed = Date.now() - _sBoot.lastAccessControlAt;
        if (_elapsed > ACCESS_CONTROL_RESET_AFTER_MS) {
          const _oldStreak = _sBoot.accessControlStreak;
          _sBoot.accessControlStreak = 0;
          _sBoot.accessControlAlertSent = false;
          saveState(_sBoot);
          pbLog('🔄','boot',`accessControlStreak 自動リセット: ${_oldStreak}→0 (最終発火から ${Math.round(_elapsed/60000)}分経過)`);
        }
      }
    } catch (_e) {}

    // ★Phase 9-L (2026-05-22): 異常セッション遷移 (/logout/ /login/) を警告として記録
    //   旧仕様: 「ℹ page: 商品ページではありません」 で済まされ、 上部パネルに残らない
    //   新仕様: 強制ログアウト等の予兆を上部パネルに残して事後検証可能にする
    //   /cart_err/ は line 下方で既に pbError 記録されているのでここでは除外
    try {
      const _path = location.pathname || '';
      if (_path.startsWith('/logout')) {
        pbError('warn','session-anomaly','/logout/ に自動遷移 — PB側のセッション切れ/強制ログアウトの可能性');
      } else if (_path.startsWith('/login')) {
        pbError('warn','session-anomaly','/login/ ページ — 認証要求の可能性 (元商品ページから飛んだ場合は要注意)');
      }
    } catch (_e) {}

    // ★最優先: /cart_err/ 検知 → サーバ側のカート無効化 = bot 検知反応
    //   これに到達した = 連続cart_add で Akamai/プレバン側にbot判定された証拠
    //   そのまま動作継続するとさらに悪化(セッション完全凍結等) → 即時停止
    if (location.pathname.includes('/cart_err') || location.pathname.includes('/cart/error')) {
      pbError('error','session','★サーバ側でカート無効化検知 (/cart_err/) — bot検知の可能性、自動停止します');
      pauseToolWithReason('cart-err-page');
      try { injectFloatingUI(); updateUI({ status: '🚨 サーバ側カート無効化検知\n→ 自動停止(手動再開で続行)' }); } catch (e) {}
      return;
    }

    // ★最優先: 混雑画面なら即リロード
    // ★Phase 9-L (2026-05-22): pbLog → pbError('warn',...) に格上げ
    //   boot 連発時はイベントログから流れて事後検証不能になっていたため上部パネルにも残す
    if (isCurrentPageAccessControl()) {
      pbError('warn','site-busy','混雑画面検知 → 即リロード');
      // ただし auto_nuke が ON でカート空ならまず Cookie 削除
      const cfgEarly = loadConfig();
      const cartCheck = isCartNonEmpty();
      // カート確認は async なので発火後に判断
      cartCheck.then(async (nonEmpty) => {
        if (cfgEarly.options && cfgEarly.options.auto_nuke_when_empty && !nonEmpty) {
          const state = loadState();
          state.accessControlStreak = (state.accessControlStreak || 0) + 1;
          state.lastAccessControlAt = Date.now();  // ★Phase 9-L: 時間ベースリセット用
          saveState(state);
          if (state.accessControlStreak >= ACCESS_CONTROL_ALERT_THRESHOLD) {
            pbLog('💥','boot','auto nuke (cart empty)');
            nukeAllSiteData();
          }
        }
        // ★2026-07-07 (HIROさん「リロードが速すぎてカート無効化/Access Denied」): アクセス制御ページでの
        //   300ms即リロードは BotManager の絞りを悪化させ、 弾かれ続ける主因。 人間ペースの safeReload に変更。
        await safeReload('boot-access-control');
      });
      return;
    }

    const cfg = loadConfig();
    const state = loadState();

    // ★起動時 state 自動修復(壊れた doneIds を直す)
    {
      const validIds = new Set(cfg.products.map(p => p.id));
      const before = state.doneIds.length;
      // ★2026-07-08 (二重カートイン修正): 重複除去 + 設定にないIDのみ除去。
      //   旧は「acquired=false の doneId も除去」していたため、 acquired を立て損ねた成功(件数増検知)の
      //   確保記録が boot で消え、 再監視→再追加(二重)になっていた(7/8 デナン)。 acquired=false でも確保記録は保持。
      //   (手動「カートイン済一括解除」は doneIds を直接空にするのでこの緩和と両立する)
      state.doneIds = Array.from(new Set(state.doneIds)).filter(x => validIds.has(x));
      if (state.doneIds.length !== before) {
        pbLog('🔄','boot',`state自動修復: doneIds ${before}→${state.doneIds.length}`);
        saveState(state);
      }
    }

    // ★低負荷モードキャッシュ初期化
    refreshLowPower();

    // ★Cookie同意バナーを自動消去(画面下に毎リロード出るのを邪魔)
    //   厳しくスコープ:
    //     - cart_add form 内のボタンは絶対クリックしない
    //     - pb-cart 自身のUIも除外
    //     - parent に「クッキー」+「使用/consent/accept/policy」が両方ある場合のみ
    //   遅延注入対策で 0/300/1000/3000/6000ms で再試行
    startCookieBannerSweep();

    // FAB注入(右下UI)
    injectFloatingUI();
    updateUI();
    // ★Phase 18 (2026-06-10): FAB 自己修復を起動(p-bandai が読込後に DOM 差し替え→FAB消滅 する対策)
    startFabSelfHeal();

    // タイマー & mainLoop はバナーと並行起動(バナー表示で投入処理が遅延しないこと)
    startKeepaliveTimer();
    startPeriodicCleanup();
    // ★2026-05-10: watchdog & visibility 復帰機構の起動 (これまで定義のみで起動されていなかったバグを修正)
    //   - startMainLoopWatchdog: 30秒 heartbeat 停止検知 → 強制再起動
    //   - startMainLoopVisibilityRecovery: タブ suspend/kill からの復帰時に mainLoop 強制再起動
    startMainLoopWatchdog();
    startMainLoopVisibilityRecovery();
    // ★Phase 10 (2026-06-04): ステータスパネルの 1秒ライブ更新を起動 (発売カウントダウン等を常時最新に)
    safeRun('start-status-live', () => startStatusLiveRefresh());
    // ★クラッシュ復帰検知: 直前の heartbeat から N秒以上経過していたら、 タブが kill されていた可能性
    //   ログに残して HIROさんが状況把握できるよう
    try {
      const _stChk = loadState();
      const _lastHb = _stChk.lastMainLoopHeartbeat || 0;
      if (_lastHb > 0 && !_stChk.paused) {
        const _gapMs = Date.now() - _lastHb;
        if (_gapMs > 10000) {
          // ★Phase 10 (2026-06-04): 文言修正。 大半は「画面 OFF (スリープ) からの復帰」 で
          //   「タブ kill」 は誤解を招く (HIROさん 指摘)。 長時間ギャップは画面 OFF が主因。
          const _gapSec = Math.floor(_gapMs/1000);
          const _cause = _gapSec > 120 ? '画面OFF/タブ復帰' : 'タブ復帰';
          pbLog('🔄','recovery',`★前回 heartbeat から ${_gapSec}秒経過 → ${_cause}`);
        }
      }
    } catch (e) {}
    // ★HIROさん 2026-05-09 観察: ガンダムベース系商品はJS書き換えが超速で
    //   200ms 後の評価ではすでに DOM が STOCK_OUT に書き換え済み → OK 窓を捕捉できない
    //   → 0ms (次イベントループ) で即起動して JS 未実行の窓を最速捕捉する
    setTimeout(mainLoop, 0);

    // ログに登録数を記録(HIROさん環境のデバッグ用)
    pbLog('🔍','boot',`登録商品=${cfg.products.length}件 acquired済=${cfg.products.filter(p=>p.acquired).length}件`);

    // 起動状況の表示は最小限(ボタンなし、エラー時はpbError上部パネル)
    if (cfg.products.length === 0) {
      pbError('warn','config','商品リストが空です — 右下「⚙ 設定」から商品URLを追加してください');
      return;
    }
    if (!isProductPage()) {
      // 商品ページでない時は info(警告ではない、HIROさんが他のページを見てるだけ)
      pbError('info','page','商品ページではありません(右下「⚙ 設定」で確認/編集可)');
      return;
    }
    const target = findTargetProduct(cfg, state);
    if (!target) {
      // ★target=null の理由を区別して表示(HIROさん 2026-05-10 要望)
      const cur = currentProductUrl();
      const registered = cfg.products.find(p => p.url && normalizeProductUrl(p.url) === cur);
      if (registered && registered.acquired) {
        pbError('info','done','✅ この商品はカート確保済み(監視対象外): ' + (registered.name || registered.id));
      } else if (registered && (cfg.options || {}).new_release_only_mode) {
        // ★新発売狙いモード ON で対象外になってるケース → 真の理由を明示
        const rt = effectiveReleaseTime(registered);
        if (!rt) {
          pbError('warn','target',`🎯 新発売狙いモード ON: release_time 未設定のため監視対象外: ${registered.name || registered.id}\n→ 設定で「新発売狙いモード」を OFF にするか、 商品に発売時刻を設定してください`);
        } else {
          const elapsedMin = Math.floor((Date.now() - new Date(rt).getTime()) / 60000);
          const grace = cfg.options.new_release_grace_minutes != null ? cfg.options.new_release_grace_minutes : 30;
          if (elapsedMin > grace) {
            pbError('warn','target',`🎯 新発売狙いモード: 発売時刻から${elapsedMin}分経過(grace=${grace}分)→ 自動停止中: ${registered.name || registered.id}\n→ 設定で「新発売狙いモード」を OFF にすれば監視継続できます`);
          } else {
            // grace 内のはずなので別の理由(コード bug の可能性)
            pbError('warn','target',`登録あり、 grace 内だが target 取れず: ${registered.name || registered.id}`);
          }
        }
      } else {
        // ★Phase 10 (2026-06-04): warn → info に格下げ。 他商品を閲覧してるだけで「異常」 ではない。
        //   warn だと上部パネル (8 件枠) を埋めて本物の警告を押し出す (6/4 ログで 14 件のノイズ確認)。
        //   統合 CSV には info でも記録されるので追跡性は維持。
        pbError('info','target','このページは登録商品ではありません: ' + cur.substring(0,60));
      }
      return;
    }

    // ★target 検出時、上部パネルから古い target/page 関連エラーを掃除
    //   (URL正規化バグや過去の試行で残ったゴミを自動クリーンアップ)
    {
      const before = ERROR_BUFFER.length;
      for (let i = ERROR_BUFFER.length - 1; i >= 0; i--) {
        const e = ERROR_BUFFER[i];
        if (e.category === 'target' || e.category === 'page' || e.category === 'done') {
          ERROR_BUFFER.splice(i, 1);
        }
      }
      if (ERROR_BUFFER.length !== before) {
        saveErrorBuffer();
        try { renderErrorPanel(); } catch(e){}
        pbLog('🧹','boot',`stale errors cleaned: ${before - ERROR_BUFFER.length}件`);
      }
    }

    // 正常起動: 短時間バナーのみ(3秒で消去、ボタンなし)
    const lines = [`🎯 ${effectiveName(target)}`];
    const rt = effectiveReleaseTime(target);
    if (rt) {
      const wait = Math.ceil((new Date(rt).getTime() - Date.now())/1000);
      lines.push(wait > 0 ? `⏰ 発売まで ${wait}s` : '✅ 発売時刻到達済 — 投入開始');
    } else {
      lines.push('✅ 即時開始');
    }
    lines.push('▶ 動作中: 青=10連打 / グレー=即リロード');
    lines.push('🔧 build: v2.3.45 2026-07-09 05:29 #1aebea JST');
    pbLog('🎯','boot','target='+effectiveName(target));
    showBanner(lines, '#5fd47f', 3000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
