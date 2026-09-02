// ==UserScript==
// @name         G.U.N.D.A.M. Bot - 楽天ブックス購入
// @namespace    gundam-bot.rakuten-books
// @updateURL    https://raw.githubusercontent.com/hiro20926/gandam/main/rakuten/gundambot-rakuten.user.js
// @downloadURL  https://raw.githubusercontent.com/hiro20926/gandam/main/rakuten/gundambot-rakuten.user.js
// @version      3.2.0
// @description  楽天ブックスの自動購入(rakuten全ドメイン対応・iOS Safari + Userscripts拡張用)/ Build 2026-05-04 21:00 JST
// @author       HIRO
// @match        https://*.rakuten.co.jp/*
// @match        https://*.rakuten.com/*
// @match        https://sp.books.step.rakuten.co.jp/*
// @match        https://books.step.rakuten.co.jp/*
// @match        https://step.rakuten.co.jp/*
// @match        https://order.step.rakuten.co.jp/*
// @match        https://basket.step.rakuten.co.jp/*
// @match        https://checkout.step.rakuten.co.jp/*
// @match        https://login.account.rakuten.co.jp/*
// @match        https://my.rakuten.co.jp/*
// @match        https://books.rakuten.co.jp/*
// @match        https://item.rakuten.co.jp/*
// @match        https://www.rakuten.co.jp/*
// @include      https://*rakuten.co.jp/*
// @include      https://*rakuten.com/*
// @include      *://*.rakuten.co.jp/*
// @include      *://*.rakuten.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

// ==================================================================
// v2.9.23 (Build 2026-05-04 18:00 JST)
//   ★ v2.9.22 でもマッチしなかった真の原因と修正
//
//   原因の真相:
//   sp.books.step.rakuten.co.jp は 4階層サブドメイン
//   - *.rakuten.co.jp の `*` 部分 = "sp.books.step"(3階層)
//   - *.step.rakuten.co.jp の `*` 部分 = "sp.books"(2階層)
//   どちらも iOS Userscripts 拡張のワイルドカード実装では
//   1階層しかマッチしないため、両方 NG。
//
//   修正:
//   1. ★ 完全明示ドメインを @match に列挙(ワイルドカード依存をやめる)
//      ・https://sp.books.step.rakuten.co.jp/*  ← HIRO のスクショ URL
//      ・https://books.step.rakuten.co.jp/*
//      ・https://step.rakuten.co.jp/*           ← 親ドメイン
//      ・https://order.step.rakuten.co.jp/*
//      ・https://basket.step.rakuten.co.jp/*
//      ・https://checkout.step.rakuten.co.jp/*
//      ・https://login.account.rakuten.co.jp/*  ← ログイン
//      ・https://my.rakuten.co.jp/*
//      ・https://books.rakuten.co.jp/*          ← PC 版
//      ・https://item.rakuten.co.jp/*           ← 商品ページ系
//      ・https://www.rakuten.co.jp/*
//   2. @include を 4 パターンに拡充(@match で漏れた URL の保険)
//      ・*rakuten.co.jp/*
//      ・*rakuten.com/*
//      ・*://*.rakuten.co.jp/*
//      ・*://*.rakuten.com/*
//
//   これでどんな実装の Userscripts 拡張でも確実にマッチする。
//   ロジック・色には一切触れていない(@match/@include 追加のみ)。
// ==================================================================

// ==================================================================
// v2.9.21 (Build 2026-05-04 16:30 JST)
//   ブランドカラー化(駿河屋との視覚的区別)
//
//   変更点(色のみ・ロジック完全無触):
//   1. 設定ボタン ⚙: 灰色 #555 → 楽天オレンジ #ff8200
//   2. バッジ: 黒緑 #000/#0f0 → 楽天R赤 #bf0000 + オレンジ文字 #ff8200
//   3. テストボタン: オレンジ #f57c00 → 楽天R赤 #bf0000
//   4. 購入ボタン: 緑 #2e7d32 → 楽天オレンジ #ff8200
//
//   停止ボタンは赤 #d32f2f のまま(国際的「停止=赤」の安全サイン)
//
//   楽天 = 赤+オレンジ / 駿河屋 = 青+黄色 でサイトを開いた瞬間に判別可能。
//   間違って違うサイトのボタンを押す事故を防ぐ。
//
// v2.9.20 (Build 2026-05-04 16:00 JST)
//   駿河屋 v0.3.1 開発で得た学びを最小限・ピンポイントで楽天に反映。
//   ★ 動作中の購入フローには 1 ビットも触っていない ★
//
//   変更点(2 つだけ):
//   1. suppressPasswordManager() 関数を新設 + handleLoginPage で呼出
//      - email/password input に autocomplete=off + 1P/LP/Bitwarden 等の
//        ignore 属性を仕込む
//      - これで Safari の「保存しますか?」が出にくくなる
//      - 既存 keychain エントリ起因の漏洩警告は依然として出る(Apple 仕様)
//      - 購入ロジックは無変更、ログイン時の予防的属性付与のみ
//   2. パスワード入力後の sleep 300ms → 100ms に短縮(-200ms)
//      - 駿河屋 v0.3.0 で実績のある削減幅
//      - blur 後のバリデーションは 100ms あれば十分(駿河屋実機確認済)
//
//   ★ 触っていない箇所(意図的に維持):
//   - robustClick(orderBtn) など全 robustClick 呼出(HIRO の長期運用で
//     事故ゼロ実績があり、楽天サーバーの冪等性で救われている可能性が高い)
//   - 注文確定の即押下(楽天は元々 sleep なし、駿河屋 v0.3.1 もこれに合わせた)
//   - sleep(1200ms) の form.submit() 再送信フォールバック(動作中の機能)
//   - その他の sleep 値(400, 500, 150, 50)はサーバー応答待ち、削減リスクあり
// ==================================================================

(function () {
    'use strict';

    // ───────────────────────────────────────────────
    // CONFIG (Netlify Functions により設定ページから値が埋め込まれる)
    // ───────────────────────────────────────────────
    // ★v3.0.0: 設定を「配布ファイルへの埋め込み」から「端末内(localStorage)保存」に変更。
    //   旧方式: Netlify の設定ページで入力 → __INJECT_*__ を焼き込んで配布 → 更新の度に再インストール。
    //   新方式: GitHub から素の本体を配布(認証情報を含まない)→ 端末の設定画面で入力して保存。
    //   利点: ①配布物にパスワードが入らない ②@updateURL で自動更新(再インストール不要)
    //         ③Netlify とデプロイ元の管理が不要
    const CFG_KEY = 'LB_RB_CONFIG_V1';
    const CONFIG_DEFAULTS = {
        profileName:    '楽天',
        username:       '',
        password:       '',
        reloadInterval: 1000,
        reloadMax:      0,
        testMode:       false,
        debugMode:      false,
        timerEnabled:   false,
        timerHHMM:      '',
    };
    const loadConfig = () => {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {}; } catch (e) { saved = {}; }
        return Object.assign({}, CONFIG_DEFAULTS, saved);
    };
    const saveConfig = (cfg) => {
        try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); return true; }
        catch (e) { return false; }
    };
    const CONFIG = loadConfig();

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ★v3.1.0: ログ基盤(Amazon版と同方式)
    //   HIRO 要望「楽天もログを抽出したい」。従来はトースト表示のみで記録が残らず、
    //   ログイン不具合の原因究明ができなかった。Amazon版 logAm と同じ構造にして
    //   CSV で取り出せるようにする(列: timestamp,perfMs,level,tag,message,data)。
    //   重要ログ(error/warn)は別バッファにも保持し、通常バッファが溢れても消えない。
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const LOG_KEY_RB = 'lb_rb_log_buffer';
    const LOG_MAX_RB = 1500;
    const LOG_KEY_RB_CRIT = 'lb_rb_log_buffer_critical';
    const LOG_MAX_RB_CRIT = 500;
    const _readLog = (k, max) => {
        try { return JSON.parse(localStorage.getItem(k) || '[]').slice(-max); } catch (e) { return []; }
    };
    const LOG_BUFFER_RB = _readLog(LOG_KEY_RB, LOG_MAX_RB);
    const LOG_BUFFER_RB_CRIT = _readLog(LOG_KEY_RB_CRIT, LOG_MAX_RB_CRIT);
    const _saveLogRb = () => {
        try { localStorage.setItem(LOG_KEY_RB, JSON.stringify(LOG_BUFFER_RB)); } catch (e) {}
    };
    const _saveLogRbCrit = () => {
        try { localStorage.setItem(LOG_KEY_RB_CRIT, JSON.stringify(LOG_BUFFER_RB_CRIT)); } catch (e) {}
    };
    const _rbStartedAt = Date.now();
    const logRb = (level, category, message, detail) => {
        try {
            const t = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const ts = pad(t.getHours()) + ':' + pad(t.getMinutes()) + ':' + pad(t.getSeconds()) +
                       '.' + String(t.getMilliseconds()).padStart(3, '0');
            const entry = {
                ts: ts, perfMs: Date.now() - _rbStartedAt,
                level: level || 'info', category: category || '',
                message: message || '', detail: detail || null,
            };
            LOG_BUFFER_RB.push(entry);
            if (LOG_BUFFER_RB.length > LOG_MAX_RB) LOG_BUFFER_RB.shift();
            _saveLogRb();
            if (level === 'error' || level === 'warn') {
                LOG_BUFFER_RB_CRIT.push(entry);
                if (LOG_BUFFER_RB_CRIT.length > LOG_MAX_RB_CRIT) LOG_BUFFER_RB_CRIT.shift();
                _saveLogRbCrit();
            }
            try { console.log(`[GBOT-RB] ${ts} ${level} ${category}: ${message}`, detail || ''); } catch (e) {}
        } catch (e) {}
    };
    // 画面/フォームの状態をまるごと記録するヘルパー(ログイン不具合の解析用)
    const dumpFormStateRb = (label) => {
        try {
            const vis = (e) => { try { const r = e.getBoundingClientRect();
                return e.offsetParent !== null && r.width > 0 && r.height > 0; } catch (x) { return false; } };
            const inputs = Array.from(document.querySelectorAll('input')).map((i) => ({
                type: i.type, name: i.name || '', id: i.id || '',
                visible: vis(i), disabled: !!i.disabled, hasValue: !!i.value,
                autocomplete: i.getAttribute('autocomplete') || '',
            }));
            const buttons = Array.from(document.querySelectorAll('button,input[type=submit],a[role=button],div[role=button]'))
                .filter(vis).map((b) => ({
                    tag: b.tagName, type: b.getAttribute('type') || '',
                    id: b.id || '', disabled: !!b.disabled,
                    text: (b.innerText || b.value || '').trim().slice(0, 30),
                }));
            const texts = Array.from(document.querySelectorAll('a,button,div,span,li,label'))
                .filter(vis).map((e) => (e.innerText || '').trim())
                .filter((t) => t && t.length <= 30);
            logRb('info', 'dom-dump', label, {
                url: location.href.slice(0, 200),
                host: location.host,
                title: (document.title || '').slice(0, 60),
                inputs: inputs.slice(0, 20),
                buttons: buttons.slice(0, 15),
                shortTexts: Array.from(new Set(texts)).slice(0, 40),
                hasPasswordField: !!document.querySelector('input[type=password]'),
                iframeCount: document.querySelectorAll('iframe').length,
            });
        } catch (e) {}
    };

    // ───────────────────────────────────────────────
    // ストレージキー(v2.9: 過去版の汚染を完全回避するためキー名を変更)
    // ───────────────────────────────────────────────
    const KEY_STATE         = 'LB_RB_STATE_V3';
    const KEY_STOP          = 'LB_RB_STOP_V3';
    const KEY_PRODUCT_URL   = 'LB_RB_PRODUCT_URL_V3';
    const KEY_START_TS      = 'LB_RB_START_TS_V3';
    const KEY_WAITING       = 'LB_RB_WAITING_V3';
    const KEY_RELOAD_COUNT  = 'LB_RB_RELOAD_COUNT_V3';

    // 過去版のキー(起動時に削除)
    const OLD_KEYS = [
        'LB_RB_STATE', 'LB_RB_STOP', 'LB_RB_PRODUCT_URL', 'LB_RB_START_TS',
        'LB_RB_WAITING', 'LB_RB_RELOAD_COUNT',
    ];

    // 過去版のクッキー(起動時に削除)
    const purgeOldStorage = () => {
        try {
            OLD_KEYS.forEach((k) => localStorage.removeItem(k));
            OLD_KEYS.forEach((k) => {
                document.cookie =
                    `${k}=; path=/; domain=.rakuten.co.jp; max-age=0; SameSite=Lax`;
            });
            // v2.9.9: 旧形式 lb_stop=1 のハッシュ残骸も除去
            //   (セッションID無しの古い停止フラグが永続するのを防ぐ)
            const hash = location.hash || '';
            if (/[#&]lb_stop=1(&|$)/.test(hash)) {
                let h = hash.replace(/^#/, '').replace(/(^|&)lb_stop=1(&|$)/g, '$2').replace(/^&/, '');
                history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
            }
            // 旧形式の localStorage 停止フラグ '1' も除去
            if (localStorage.getItem(KEY_STOP) === '1') {
                localStorage.removeItem(KEY_STOP);
            }
        } catch (e) { /* noop */ }
    };

    // v2.9: URLハッシュで state をクロスオリジンに持ち回す
    //   #lb_state=cart_added の形式で URL ハッシュに乗せる
    //   遷移先のページでもハッシュは保持されるため、
    //   sp.books.step.rakuten.co.jp でも books.rakuten.co.jp の値が読める
    const HASH_PREFIX = 'lb_state=';

    const readHashState = () => {
        try {
            const hash = location.hash || '';
            const m = hash.match(new RegExp(`[#&]${HASH_PREFIX}([^&]+)`));
            return m ? decodeURIComponent(m[1]) : '';
        } catch (e) { return ''; }
    };

    const writeHashState = (s) => {
        try {
            // 既存のハッシュから lb_state= を除去して新しい値で置換
            let hash = (location.hash || '').replace(/^#/, '');
            hash = hash.replace(new RegExp(`(^|&)${HASH_PREFIX}[^&]*`), '').replace(/^&/, '');
            const newHash = (hash ? hash + '&' : '') + HASH_PREFIX + encodeURIComponent(s);
            // history.replaceState でハッシュ書き換え(ページ再読み込みなし)
            history.replaceState(null, '', '#' + newHash);
        } catch (e) { /* noop */ }
    };

    const clearHashState = () => {
        try {
            let hash = (location.hash || '').replace(/^#/, '');
            hash = hash.replace(new RegExp(`(^|&)${HASH_PREFIX}[^&]*`), '').replace(/^&/, '');
            history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search);
        } catch (e) { /* noop */ }
    };

    const NG_TERMINAL_WORDS = [
        '在庫切れ', '品切れ', '販売終了', 'カートに入れられません',
        'お取り寄せ', '入荷待ち', 'sold out',
    ];

    // ───────────────────────────────────────────────
    // 共通ユーティリティ
    // ───────────────────────────────────────────────
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // v2.9.8: 新規タブ暴走防止のため、stateにセッションIDとタイムスタンプを付与
    //
    //   問題: URLハッシュに lb_state=cart_added が残ると、別タブで楽天を開いた瞬間に
    //         そのstateを読んで購入フローが再開し、勝手に注文確定されていた。
    //
    //   対策:
    //     1. state に「セッションID + タイムスタンプ」を埋め込む
    //     2. セッションIDは sessionStorage に保存(タブごとに別物)
    //     3. UserScript起動時、URLハッシュのセッションIDが今のタブのIDと一致しなければ無視
    //     4. タイムスタンプから10分以上経過した state も無視
    //
    //   形式: lb_state=<state>|<sessionId>|<timestamp>
    //         例: lb_state=cart_added|abc123|1714627384000

    const SESSION_KEY = 'LB_RB_SESSION_ID';
    const STATE_TTL_MS = 10 * 60 * 1000; // 10分

    // タブごとに固有のセッションIDを取得or発行
    const getSessionId = () => {
        let id = sessionStorage.getItem(SESSION_KEY);
        if (!id) {
            id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
            sessionStorage.setItem(SESSION_KEY, id);
        }
        return id;
    };

    // v2.9.15: 楽天のSPAページ(ログイン画面の#/session_upgrade等)が
    //   URLハッシュを上書きすることが判明。ハッシュは信頼できない。
    //
    //   クッキー(.rakuten.co.jp ドメインスコープ)で sid と reset フラグを持ち回す。
    //   全 *.rakuten.co.jp サブドメインで共有され、楽天SPAも消さない。
    //
    //   フォーマット:
    //     LB_SID=<セッションID>     ; path=/; domain=.rakuten.co.jp; max-age=600
    //     LB_RESET=1                ; path=/; domain=.rakuten.co.jp; max-age=60
    //   reset は60秒で自動失効、sid は10分。
    const COOKIE_SID = 'LB_SID';
    const COOKIE_RESET = 'LB_RESET';
    const COOKIE_STOP = 'LB_STOP';     // v2.9.16
    const COOKIE_STATE = 'LB_STATE';   // v2.9.16

    const writeRakutenCookie = (name, value, maxAgeSec) => {
        try {
            // .rakuten.co.jp スコープ(login.account.rakuten.com には届かないが、
            // フローの戻り先は全て .rakuten.co.jp 配下なので問題なし)
            document.cookie =
                `${name}=${encodeURIComponent(value)}; path=/; domain=.rakuten.co.jp; ` +
                `max-age=${maxAgeSec}; SameSite=Lax`;
        } catch (e) {}
    };
    const readRakutenCookie = (name) => {
        try {
            const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
            return m ? decodeURIComponent(m[1]) : '';
        } catch (e) { return ''; }
    };
    const deleteRakutenCookie = (name) => {
        try {
            document.cookie =
                `${name}=; path=/; domain=.rakuten.co.jp; max-age=0; SameSite=Lax`;
        } catch (e) {}
    };

    const renewSessionId = () => {
        const newId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        sessionStorage.setItem(SESSION_KEY, newId);
        writeRakutenCookie(COOKIE_SID, newId, 600); // 10分
        // v2.9.16: 停止フラグもクッキーになったため LB_RESET の役目は終わった。
        //   購入開始時に明示的に「停止クッキーを削除」するだけで十分。
        deleteRakutenCookie(COOKIE_STOP);
        return newId;
    };

    // v2.9.16: 旧版の localStorage 残骸(KEY_STOP, KEY_STATE等)を掃除する役目だけ残す。
    //   新規開始時にだけ呼ぶ。
    const consumeResetFlag = () => {
        try {
            // 旧版の残骸クリーンアップ(localStorage)
            localStorage.removeItem(KEY_STOP);
            localStorage.removeItem(KEY_STATE);
            // 旧版のreset クッキーが残っていれば削除
            deleteRakutenCookie(COOKIE_RESET);
            return true;
        } catch (e) { return false; }
    };

    const syncSessionIdFromHash = () => {
        // v2.9.15: 名前は historical (互換のためそのまま)。実体はクッキーから sid を読む。
        try {
            const fromCookie = readRakutenCookie(COOKIE_SID);
            if (!fromCookie) return;
            const current = sessionStorage.getItem(SESSION_KEY);
            if (current !== fromCookie) {
                sessionStorage.setItem(SESSION_KEY, fromCookie);
            }
        } catch (e) {}
    };

    // state 値をパースして {state, sessionId, ts} を返す
    const parseStateValue = (raw) => {
        if (!raw) return null;
        const parts = raw.split('|');
        if (parts.length === 3) {
            return { state: parts[0], sessionId: parts[1], ts: parseInt(parts[2], 10) };
        }
        // 旧形式(セッションID等なし) → 信用しない(暴走リスク)
        return null;
    };

    // 現タブで有効な state のみ返す
    const getValidatedState = (raw) => {
        const parsed = parseStateValue(raw);
        if (!parsed) return '';
        // セッションID不一致 → 別タブの残骸 → 無視
        if (parsed.sessionId !== getSessionId()) return '';
        // タイムスタンプ古すぎ → 無視
        if (Date.now() - parsed.ts > STATE_TTL_MS) return '';
        return parsed.state;
    };

    // state を保存形式に変換
    const encodeStateValue = (s) => {
        return `${s}|${getSessionId()}|${Date.now()}`;
    };

    // 停止フラグもURLハッシュに(クロスオリジン対応)
    // v2.9.9: セッションID付き形式に変更。古いタブ/別タブの停止フラグは無視。
    // v2.9.16: 停止フラグもクッキーで持ち回す。
    //   全 *.rakuten.co.jp サブドメインで自動共有される。
    //   max-age で自動失効するため、過去のテストの残骸が永続することがない。
    const STOP_TTL_SEC = 5 * 60; // 5分

    const isStopped = () => {
        return readRakutenCookie(COOKIE_STOP) === '1';
    };
    const setStopped = (v) => {
        if (v) {
            writeRakutenCookie(COOKIE_STOP, '1', STOP_TTL_SEC);
        } else {
            deleteRakutenCookie(COOKIE_STOP);
        }
    };

    // v2.9.16: state もクッキーで持ち回す。
    //   形式: <state>|<sessionId>|<timestamp>
    //   sid不一致(別タブ)or 10分超で自動失効。
    //   max-age=600 でクッキー自体も10分で消える(二重防御)。
    const STATE_TTL_SEC = 10 * 60;

    const getState = () => {
        const raw = readRakutenCookie(COOKIE_STATE);
        return getValidatedState(raw);
    };
    const setState = (s) => {
        const encoded = encodeStateValue(s);
        writeRakutenCookie(COOKIE_STATE, encoded, STATE_TTL_SEC);
    };
    const clearState = () => {
        deleteRakutenCookie(COOKIE_STATE);
        // v2.9.16: localStorage には KEY_PRODUCT_URL等の補助情報のみ残す
        localStorage.removeItem(KEY_PRODUCT_URL);
        localStorage.removeItem(KEY_START_TS);
        localStorage.removeItem(KEY_WAITING);
        localStorage.removeItem(KEY_RELOAD_COUNT);
        localStorage.removeItem('LB_RB_TIMER_FIRED_V3');   // v2.9.26
    };

    const isWaiting = () => localStorage.getItem(KEY_WAITING) === '1';

    // ───────────────────────────────────────────────
    // v2.3: PC版強制を撤廃。スマホ版そのままで動作
    //   ・楽天が sp.books.step.rakuten.co.jp に強制リダイレクトする挙動への対策
    //   ・force-site=pc は books.rakuten.co.jp/rb/* では効くが
    //     books.step.rakuten.co.jp 系では無視される(検証済み 2026-05-02)
    // ───────────────────────────────────────────────

    // ───────────────────────────────────────────────
    // DOM utility
    // ───────────────────────────────────────────────
    const findByText = (selector, ...texts) => {
        const els = document.querySelectorAll(selector);
        for (const el of els) {
            const t = (el.innerText || el.value || '').trim();
            for (const target of texts) {
                if (t.includes(target)) return el;
            }
        }
        return null;
    };

    // v2.5: MutationObserver で DOM 変化を即時検知 + 80msポーリング併用
    const waitForByText = (selector, timeoutMs, ...texts) => {
        return new Promise((resolve) => {
            let done = false;
            let observer = null, poller = null, timer = null;
            const finish = (val) => {
                if (done) return;
                done = true;
                if (poller) clearInterval(poller);
                if (observer) observer.disconnect();
                if (timer) clearTimeout(timer);
                resolve(val);
            };
            const check = () => {
                if (isStopped()) { finish(null); return; }
                const el = findByText(selector, ...texts);
                if (el) finish(el);
            };
            check();
            if (done) return;
            try {
                observer = new MutationObserver(check);
                observer.observe(document.body, { childList: true, subtree: true, characterData: true });
            } catch (e) { /* document.body未準備の保険 */ }
            poller = setInterval(check, 80);
            timer = setTimeout(() => finish(null), timeoutMs);
        });
    };

    const waitForSelector = (selector, timeoutMs) => {
        return new Promise((resolve) => {
            let done = false;
            let observer = null, poller = null, timer = null;
            const finish = (val) => {
                if (done) return;
                done = true;
                if (poller) clearInterval(poller);
                if (observer) observer.disconnect();
                if (timer) clearTimeout(timer);
                resolve(val);
            };
            const check = () => {
                if (isStopped()) { finish(null); return; }
                const el = document.querySelector(selector);
                if (el) finish(el);
            };
            check();
            if (done) return;
            try {
                observer = new MutationObserver(check);
                observer.observe(document.body, { childList: true, subtree: true });
            } catch (e) { /* noop */ }
            poller = setInterval(check, 80);
            timer = setTimeout(() => finish(null), timeoutMs);
        });
    };

    // v2.9.17: React入力欄が "値が入った" と認識するため、input + change に加えて
    //   focus/blur/keyup も発火。楽天ログイン画面のバリデーションが
    //   blur 後に走る前提のため。
    const fillNative = (el, value) => {
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        ).set;
        try { el.focus(); } catch (e) {}
        // v2.9.27: 新ログインUI対策。React は _valueTracker に前回値を保持し、
        //   「値が変わっていない」と判断すると input イベントを無視する。
        //   先にトラッカーを空にしておくと確実に変更として認識される。
        try { if (el._valueTracker && el._valueTracker.setValue) el._valueTracker.setValue(''); } catch (e) {}
        // v2.9.27: 実ユーザー入力に近づけるため keydown / beforeinput も発火
        try { el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true })); } catch (e) {}
        setter.call(el, value);
        try {
            el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, data: value, inputType: 'insertText' }));
        } catch (e) {}
        try {
            el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
        } catch (e) {
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
        // keyup を発火することで、React の onKeyUp/onChange ハンドラ両対応
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        // blur で「入力完了」を通知(バリデーション発火)
        try { el.blur(); } catch (e) {}
    };

    // ★v2.9.27: ログイン画面で詰まった時に「スクリプトが何を見ているか」を可視化する診断。
    //   新ログインUI(login.account.rakuten.com)は自動化ブラウザから調査できないため、
    //   実機で失敗した瞬間の画面構造をコピーして送ってもらうのが唯一の確実な手段。
    //   購入ロジックには一切影響しない(表示のみ)。
    const showLoginDiag = (reason) => {
        try {
            const vis = (e) => { try { const r = e.getBoundingClientRect();
                return e.offsetParent !== null && r.width > 0 && r.height > 0; } catch (x) { return false; } };
            const inputs = Array.from(document.querySelectorAll('input'))
                .filter(i => i.type !== 'hidden')
                .map(i => `${i.type}|name=${i.name || '-'}|id=${i.id || '-'}|visible=${vis(i)}`);
            const clicks = Array.from(document.querySelectorAll('a,button,div,span,li,label'))
                .filter(vis)
                .map(e => (e.innerText || '').trim())
                .filter(t => t && t.length <= 30)
                .slice(0, 40);
            const lines = [
                '=== 楽天ログイン診断 v' + SCRIPT_VERSION + ' ===',
                '理由: ' + reason,
                'URL: ' + location.href.slice(0, 160),
                'パスワード欄: ' + (document.querySelector('input[type=password]') ? 'あり' : 'なし'),
                '--- 表示中の入力欄 ---',
                inputs.join(String.fromCharCode(10)) || '(なし)',
                '--- 画面に見える短いテキスト ---',
                Array.from(new Set(clicks)).join(' / '),
            ];
            const text = lines.join(String.fromCharCode(10));
            const ov = document.createElement('div');
            ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.9);' +
                'padding:16px;overflow:auto;font-size:13px;color:#fff;';
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'width:100%;height:52vh;font-size:12px;padding:8px;border-radius:6px;';
            const btnCopy = document.createElement('button');
            btnCopy.textContent = '📋 診断をコピー';
            btnCopy.style.cssText = 'width:100%;padding:14px;margin-top:10px;background:#ff8200;color:#fff;' +
                'border:0;border-radius:8px;font-size:15px;font-weight:bold;';
            btnCopy.onclick = async () => {
                try { ta.select(); document.execCommand('copy'); } catch (e) {}
                try { if (navigator.clipboard) await navigator.clipboard.writeText(text); } catch (e) {}
                btnCopy.textContent = '✅ コピーしました(貼り付けて送ってください)';
            };
            const btnClose = document.createElement('button');
            btnClose.textContent = '✕ 閉じる';
            btnClose.style.cssText = 'width:100%;padding:12px;margin-top:8px;background:#555;color:#fff;' +
                'border:0;border-radius:8px;font-size:14px;';
            btnClose.onclick = () => { try { ov.remove(); } catch (e) {} };
            const h = document.createElement('div');
            h.textContent = '⚠ ログインで詰まりました。下をコピーして送ってください';
            h.style.cssText = 'margin-bottom:8px;font-weight:bold;color:#ffb84d;';
            ov.appendChild(h); ov.appendChild(ta); ov.appendChild(btnCopy); ov.appendChild(btnClose);
            document.body.appendChild(ov);
        } catch (e) {}
    };

    // ───────────────────────────────────────────────
    // v2.9.20: Apple 自動入力・保存・漏洩警告を抑制するヘルパー
    //   駿河屋テンプレ v0.1.5 から移植。handleLoginPage で input フォーカス前に
    //   仕込んでおくと、Safari/iOS の Password Manager は:
    //     - ログイン成功後の「保存しますか?」を出さない(理論上)
    //     - 漏洩警告ダイアログを出さない(理論上)
    //   主要パスワードマネージャ(1Password, LastPass, Bitwarden 等)も無視。
    //
    //   注意: 既に keychain に保存されているエントリに対する漏洩警告は
    //   この処理では消えない。それは iOS 設定 → パスワードから手動削除するしかない。
    //   この処理は「これ以降の保存・記憶を防ぐ」ためのもの。
    // ───────────────────────────────────────────────
    const suppressPasswordManager = (input) => {
        if (!input) return;
        try {
            input.setAttribute('autocomplete', 'off');
            input.setAttribute('data-1p-ignore', 'true');     // 1Password
            input.setAttribute('data-lpignore', 'true');      // LastPass
            input.setAttribute('data-bwignore', 'true');      // Bitwarden
            input.setAttribute('data-form-type', 'other');    // Dashlane など汎用
            // 親 form にも仕込む
            const form = input.closest('form');
            if (form) {
                form.setAttribute('autocomplete', 'off');
                form.setAttribute('data-1p-ignore', 'true');
                form.setAttribute('data-lpignore', 'true');
            }
        } catch (e) {}
    };

    // v2.3: スマホ版は <button> ではなく <a> や <div onclick> の場合がある。
    //   .click() が効かない要素のために touch/pointer イベントもディスパッチする
    const robustClick = (el) => {
        if (!el) return;
        try {
            // ① 通常click
            el.click();
        } catch (e) { /* noop */ }

        // ② リンクなら href 直接遷移
        try {
            if (el.tagName === 'A' && el.href && !el.href.startsWith('javascript:')) {
                // location.href への代入は click() で発火しないSPAルーティング対策
                // ただし click() で onClick ハンドラが先に走った場合は無効化されない可能性あり
                // → 0.4秒待ってから二重発火
                setTimeout(() => {
                    if (location.href !== el.href) location.href = el.href;
                }, 400);
            }
        } catch (e) { /* noop */ }

        // ③ touch / pointer イベント(モバイルで onClick より onTouchEnd を優先するUI対策)
        try {
            const rect = el.getBoundingClientRect();
            const x = rect.left + rect.width  / 2;
            const y = rect.top  + rect.height / 2;
            const touchInit = {
                bubbles: true, cancelable: true, view: window,
                clientX: x, clientY: y,
            };
            el.dispatchEvent(new MouseEvent('mousedown', touchInit));
            el.dispatchEvent(new MouseEvent('mouseup',   touchInit));
            // PointerEvent / TouchEvent は環境によっては未定義
            if (typeof PointerEvent !== 'undefined') {
                el.dispatchEvent(new PointerEvent('pointerdown', touchInit));
                el.dispatchEvent(new PointerEvent('pointerup',   touchInit));
            }
        } catch (e) { /* noop */ }
    };

    // ───────────────────────────────────────────────
    // UI
    // ───────────────────────────────────────────────
    const toast = (msg, color = '#333', duration = 4000) => {
        try {
            const div = document.createElement('div');
            div.textContent = msg;
            Object.assign(div.style, {
                position: 'fixed', bottom: '100px', right: '20px',
                background: color, color: 'white',
                padding: '10px 14px', borderRadius: '8px',
                zIndex: '2147483646', fontSize: '14px', maxWidth: '70vw',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                fontFamily: 'sans-serif', lineHeight: '1.4',
            });
            document.body.appendChild(div);
            setTimeout(() => div.remove(), duration);
        } catch (e) { /* noop */ }
    };

    const renderStopButton = () => {
        if (document.getElementById('lb-rb-stop-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'lb-rb-stop-btn';
        btn.textContent = '🛑 停止';
        Object.assign(btn.style, {
            position: 'fixed', bottom: '20px', right: '20px',
            background: '#d32f2f', color: 'white',
            border: 'none', borderRadius: '50%',
            width: '64px', height: '64px',
            fontSize: '12px', fontWeight: 'bold',
            cursor: 'pointer', zIndex: '2147483647',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            fontFamily: 'sans-serif',
        });
        btn.addEventListener('click', () => {
            // v2.9.6: clearState() を先に呼ぶと writeHashStop が消されるので順序重要
            //   clearState() → setStopped(true) の順で、ハッシュに lb_stop=1 が残る
            clearState();
            setStopped(true);
            // v2.9.26: タイマー interval を停止 + 発火フラグもリセット
            try {
                if (typeof timerCheckIntervalId !== 'undefined' && timerCheckIntervalId) {
                    clearInterval(timerCheckIntervalId);
                }
                if (typeof timerCountdownIntervalId !== 'undefined' && timerCountdownIntervalId) {
                    clearInterval(timerCountdownIntervalId);
                }
            } catch (e) {}
            try { clearTimerFired(); } catch (e) {}
            toast('🛑 停止しました(自動リロードも停止)', '#d32f2f', 5000);
        });
        document.body.appendChild(btn);
    };

    // 設定ボタン: タップで設定ページに飛ばす(Netlify配信)
    // ★v3.0.0: 端末内設定画面。
    //   Face ID(iOSパスワード自動入力)対応が要件のため、フォームは意図的に
    //   「自動入力が効く」作りにしている:
    //     - <form> でくくる
    //     - ID欄 autocomplete="username" / パスワード欄 autocomplete="current-password"
    //     - 楽天のドメイン上で開くので、iOS キーチェーンに保存済みの楽天の
    //       ID/パスワードが候補に出る → Face ID で流し込める
    //   ※ ログイン画面側の入力欄には従来どおり suppressPasswordManager() を適用し、
    //     自動入力ポップアップを抑制する(役割が逆なので混同しないこと)
    const openSettingsPanel = () => {
        if (document.getElementById('lb-rb-settings-ov')) return;
        const cur = loadConfig();
        const esc = (v) => String(v == null ? '' : v)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        const ov = document.createElement('div');
        ov.id = 'lb-rb-settings-ov';
        ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.88);' +
            'overflow:auto;padding:16px;font-family:sans-serif;';
        const L = 'display:block;margin:10px 0 4px;color:#ffb84d;font-size:13px;font-weight:bold;';
        const I = 'width:100%;padding:12px;font-size:16px;border:1px solid #888;border-radius:6px;box-sizing:border-box;';
        ov.innerHTML =
            '<form id="lb-rb-cfgform" style="max-width:520px;margin:0 auto;background:#161616;padding:16px;border-radius:10px;">' +
            '<div style="color:#ff8200;font-size:17px;font-weight:bold;margin-bottom:4px;">⚙ 楽天ブックス設定</div>' +
            '<div style="color:#bbb;font-size:12px;margin-bottom:10px;">' +
            'ID/パスワードは<b>この端末内だけ</b>に保存されます(配布ファイルには含まれません)。<br>' +
            '入力欄をタップすると Face ID の自動入力が使えます。</div>' +
            '<label style="' + L + '">プロファイル名</label>' +
            '<input id="lb-rb-cf-prof" type="text" style="' + I + '" value="' + esc(cur.profileName) + '">' +
            '<label style="' + L + '">楽天ID(ユーザID)</label>' +
            '<input id="lb-rb-cf-user" name="username" type="text" autocomplete="username" ' +
            'autocapitalize="off" autocorrect="off" spellcheck="false" style="' + I + '" value="' + esc(cur.username) + '">' +
            '<label style="' + L + '">パスワード</label>' +
            '<input id="lb-rb-cf-pass" name="password" type="password" autocomplete="current-password" ' +
            'style="' + I + '" value="' + esc(cur.password) + '">' +
            '<label style="' + L + '">リロード間隔(ミリ秒)</label>' +
            '<input id="lb-rb-cf-int" type="number" style="' + I + '" value="' + esc(cur.reloadInterval) + '">' +
            '<label style="' + L + '">リロード上限(0=無制限)</label>' +
            '<input id="lb-rb-cf-max" type="number" style="' + I + '" value="' + esc(cur.reloadMax) + '">' +
            '<label style="' + L + '">発火時刻(HH:MM、空欄=使わない)</label>' +
            '<input id="lb-rb-cf-hhmm" type="text" placeholder="22:00" style="' + I + '" value="' + esc(cur.timerHHMM) + '">' +
            '<label style="margin-top:12px;display:flex;align-items:center;gap:8px;color:#ddd;font-size:14px;">' +
            '<input id="lb-rb-cf-timer" type="checkbox" style="width:20px;height:20px;"' + (cur.timerEnabled ? ' checked' : '') + '>時刻発火を使う</label>' +
            '<label style="margin-top:8px;display:flex;align-items:center;gap:8px;color:#ddd;font-size:14px;">' +
            '<input id="lb-rb-cf-test" type="checkbox" style="width:20px;height:20px;"' + (cur.testMode ? ' checked' : '') + '>テストモード(実際に買わない)</label>' +
            '<button id="lb-rb-cf-save" type="submit" style="width:100%;margin-top:16px;padding:14px;background:#ff8200;' +
            'color:#fff;border:0;border-radius:8px;font-size:16px;font-weight:bold;">💾 保存</button>' +
            '<button id="lb-rb-cf-close" type="button" style="width:100%;margin-top:8px;padding:12px;background:#555;' +
            'color:#fff;border:0;border-radius:8px;font-size:14px;">✕ 閉じる</button>' +
            '</form>';
        document.body.appendChild(ov);
        const close = () => { try { ov.remove(); } catch (e) {} };
        ov.querySelector('#lb-rb-cf-close').onclick = close;
        ov.querySelector('#lb-rb-cfgform').onsubmit = (ev) => {
            ev.preventDefault();
            const g = (id) => (ov.querySelector(id) || {}).value;
            const c = (id) => !!(ov.querySelector(id) || {}).checked;
            const next = {
                profileName:    (g('#lb-rb-cf-prof') || '楽天').trim(),
                username:       (g('#lb-rb-cf-user') || '').trim(),
                password:       g('#lb-rb-cf-pass') || '',
                reloadInterval: parseInt(g('#lb-rb-cf-int'), 10) || CONFIG_DEFAULTS.reloadInterval,
                reloadMax:      parseInt(g('#lb-rb-cf-max'), 10) || 0,
                timerHHMM:      (g('#lb-rb-cf-hhmm') || '').trim(),
                timerEnabled:   c('#lb-rb-cf-timer'),
                testMode:       c('#lb-rb-cf-test'),
                debugMode:      !!cur.debugMode,
            };
            if (saveConfig(next)) {
                toast('💾 保存しました(反映のためページを再読み込みします)', '#2e7d32', 2500);
                close();
                setTimeout(() => { try { location.reload(); } catch (e) {} }, 800);
            } else {
                toast('❌ 保存に失敗しました', '#d32f2f', 6000);
            }
        };
    };

    // ★v3.1.0: 📋 ログ画面(一覧 / CSV保存 / コピー / クリア)
    //   iPhone では CSV をダウンロードすると「ファイル」アプリに保存でき、
    //   そのまま PC へ渡せる(Amazon版と同じ回収方法)。
    const openLogPanel = () => {
        if (document.getElementById('lb-rb-log-ov')) return;
        const seen = new Set(); const merged = [];
        for (const e of LOG_BUFFER_RB.concat(LOG_BUFFER_RB_CRIT)) {
            const k = (e.ts || '') + '|' + (e.perfMs || '') + '|' + (e.category || '') + '|' + (e.message || '').slice(0, 40);
            if (seen.has(k)) continue;
            seen.add(k); merged.push(e);
        }
        merged.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
        const esc = (v) => String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const csvEsc = (v) => {
            const t = String(v == null ? '' : v);
            return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
        };
        const buildCsv = () => {
            const header = ['timestamp', 'perfMs', 'level', 'tag', 'message', 'data'].join(',');
            const rows = merged.map((e) => [
                csvEsc(e.ts || ''), csvEsc(e.perfMs != null ? e.perfMs : ''),
                csvEsc(e.level || ''), csvEsc(e.category || ''),
                csvEsc(e.message || ''), csvEsc(e.detail ? JSON.stringify(e.detail) : ''),
            ].join(','));
            return '﻿' + header + '\n' + rows.join('\n');
        };
        const ov = document.createElement('div');
        ov.id = 'lb-rb-log-ov';
        ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.92);' +
            'padding:12px;overflow:auto;font-family:sans-serif;';
        const list = merged.slice(-200).map((e) => {
            const col = e.level === 'error' ? '#ff8080' : (e.level === 'warn' ? '#ffb84d' : '#cfe8ff');
            return '<div style="border-bottom:1px solid #333;padding:4px 0;font-size:11px;color:' + col + ';">' +
                '<b>' + esc(e.ts) + '</b> [' + esc(e.category) + '] ' + esc(e.message) + '</div>';
        }).join('');
        ov.innerHTML =
            '<div style="max-width:640px;margin:0 auto;">' +
            '<div style="color:#ff8200;font-size:16px;font-weight:bold;">📋 楽天ログ (' + merged.length + '件)</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;">' +
            '<button id="lb-rb-log-csv" style="flex:1;min-width:130px;padding:12px;background:#ff8200;color:#fff;border:0;border-radius:6px;font-size:14px;font-weight:bold;">📥 CSV 保存</button>' +
            '<button id="lb-rb-log-copy" style="flex:1;min-width:130px;padding:12px;background:#1976d2;color:#fff;border:0;border-radius:6px;font-size:14px;">📋 コピー</button>' +
            '<button id="lb-rb-log-clear" style="flex:1;min-width:130px;padding:12px;background:#7a2222;color:#fff;border:0;border-radius:6px;font-size:14px;">🗑 クリア</button>' +
            '<button id="lb-rb-log-close" style="flex:1;min-width:130px;padding:12px;background:#555;color:#fff;border:0;border-radius:6px;font-size:14px;">✕ 閉じる</button>' +
            '</div>' +
            '<div style="background:#0d0d0d;border-radius:6px;padding:8px;max-height:66vh;overflow:auto;">' +
            (list || '<div style="color:#888;font-size:12px;">ログはまだありません</div>') + '</div></div>';
        document.body.appendChild(ov);
        const close = () => { try { ov.remove(); } catch (e) {} };
        ov.querySelector('#lb-rb-log-close').onclick = close;
        ov.querySelector('#lb-rb-log-csv').onclick = () => {
            try {
                const blob = new Blob([buildCsv()], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const pad = (x) => String(x).padStart(2, '0');
                const d = new Date();
                const fname = 'gundambot-rakuten-log-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
                    '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.csv';
                const a = document.createElement('a');
                a.href = url; a.download = fname; a.style.display = 'none';
                document.body.appendChild(a); a.click();
                setTimeout(() => { try { URL.revokeObjectURL(url); a.remove(); } catch (e) {} }, 3000);
                toast('📥 ' + fname, '#2e7d32', 6000);
            } catch (e) { toast('❌ CSV保存に失敗', '#d32f2f', 6000); }
        };
        ov.querySelector('#lb-rb-log-copy').onclick = async () => {
            const text = buildCsv();
            let ok = false;
            try { if (navigator.clipboard) { await navigator.clipboard.writeText(text); ok = true; } } catch (e) {}
            if (!ok) {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;';
                    document.body.appendChild(ta); ta.select();
                    ok = document.execCommand('copy'); ta.remove();
                } catch (e) {}
            }
            toast(ok ? '📋 ログをコピーしました' : '❌ コピーできませんでした', ok ? '#2e7d32' : '#d32f2f', 4000);
        };
        ov.querySelector('#lb-rb-log-clear').onclick = () => {
            if (!confirm('ログを全消去しますか?')) return;
            try {
                LOG_BUFFER_RB.length = 0; LOG_BUFFER_RB_CRIT.length = 0;
                localStorage.removeItem(LOG_KEY_RB); localStorage.removeItem(LOG_KEY_RB_CRIT);
            } catch (e) {}
            close(); toast('🗑 ログをクリアしました', '#666', 3000);
        };
    };

    const renderLogButton = () => {
        if (document.getElementById('lb-rb-log-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'lb-rb-log-btn';
        btn.type = 'button';
        btn.textContent = '📋';
        btn.title = 'ログ表示 / CSV保存';
        btn.onclick = openLogPanel;
        Object.assign(btn.style, {
            position: 'fixed', bottom: '230px', right: '20px',
            background: '#bf0000', color: 'white', border: 'none', borderRadius: '50%',
            width: '40px', height: '40px', fontSize: '18px', cursor: 'pointer',
            zIndex: '2147483647', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)', fontFamily: 'sans-serif',
        });
        document.body.appendChild(btn);
    };

    const renderSettingsButton = () => {
        if (document.getElementById('lb-rb-settings-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'lb-rb-settings-btn';
        btn.type = 'button';
        btn.textContent = '⚙';
        btn.onclick = openSettingsPanel;
        Object.assign(btn.style, {
            // v2.9.24: 開始ボタンの少し上(押し間違い防止)+ 楽天サイト純正の右上
            //   アイコン群と干渉しない位置に移動。駿河屋と統一。
            position: 'fixed', bottom: '180px', right: '20px',
            // v2.9.21: 楽天ブランド色(オレンジ)。駿河屋(青)との視覚的区別。
            background: '#ff8200', color: 'white',
            border: 'none', borderRadius: '50%',
            width: '40px', height: '40px',
            fontSize: '20px', cursor: 'pointer',
            zIndex: '2147483647', textDecoration: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            fontFamily: 'sans-serif',
        });
        btn.title = '設定(この端末に保存)';
        document.body.appendChild(btn);
    };

    // v2.9.4: バッジを目立つ赤背景にして、ログイン画面でも見落とさないようにする
    const SCRIPT_VERSION = '3.2.0';
    const renderVersionBadge = () => {
        let badge = document.getElementById('lb-rb-version-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'lb-rb-version-badge';
            Object.assign(badge.style, {
                position: 'fixed', top: '8px', left: '8px',
                // v2.9.21: 楽天ブランド色(R赤背景 + オレンジ文字)。駿河屋バッジ(青)と区別。
                background: '#bf0000', color: '#ff8200',
                padding: '4px 8px', borderRadius: '4px',
                fontSize: '10px', fontFamily: 'monospace',
                zIndex: '2147483647', lineHeight: '1.2',
                boxShadow: CONFIG.debugMode ? '0 0 0 2px #ff0' : 'none',
                pointerEvents: 'none',
                maxWidth: CONFIG.debugMode ? '320px' : '180px',
                maxHeight: '70vh',
                overflow: 'auto',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            });
            (document.body || document.documentElement).appendChild(badge);
        }
        const profile = CONFIG.profileName || '-';
        const stop = isStopped() ? 'STOPPED' : 'run';

        // v2.9.14: 通常モードはシンプル表示。調査モードのみ詳細を出す
        if (!CONFIG.debugMode) {
            let screenLine = '';
            try {
                if (location.host.endsWith('books.step.rakuten.co.jp')) {
                    screenLine = `\nscreen: ${detectStepScreen()}`;
                }
            } catch (e) {}
            badge.textContent =
                `v${SCRIPT_VERSION} ${stop}\n` +
                `profile: ${profile}` +
                screenLine;
            return;
        }

        // ===== 調査モード以下のみ詳細表示 =====
        const validState = getState() || '-';
        const rawLs = parseStateValue(localStorage.getItem(KEY_STATE) || '');
        const rawHash = parseStateValue(readHashState());
        const sessOk = (raw) => raw ? (raw.sessionId === getSessionId() ? '✓' : '✗') : '-';

        const lsStopRaw = localStorage.getItem(KEY_STOP) || '';
        const hashFull = location.hash || '';
        const hashStopMatch = hashFull.match(/[#&]lb_stop=([^&]+)/);
        const hashStopRaw = hashStopMatch ? decodeURIComponent(hashStopMatch[1]) : '';
        const curSid = getSessionId().slice(0, 6);
        const truncate = (s, n) => s && s.length > n ? s.slice(0, n) + '..' : (s || '-');

        let screenLine = '';
        try {
            if (location.host.endsWith('books.step.rakuten.co.jp')) {
                screenLine = `screen: ${detectStepScreen()}\n`;
            }
        } catch (e) {}

        // v2.9.14: 起動時ログをバッジ末尾に
        const dbgLog = (localStorage.getItem('LB_RB_DEBUG_LOG') || '').split('\n').slice(-6).join('\n');

        badge.textContent =
            `v${SCRIPT_VERSION} ${stop}\n` +
            `profile: ${profile}\n` +
            `state: ${validState}\n` +
            `state ls:${sessOk(rawLs)} hash:${sessOk(rawHash)}\n` +
            `stop_ls: ${truncate(lsStopRaw, 14)}\n` +
            `stop_hash: ${truncate(hashStopRaw, 14)}\n` +
            `sid: ${curSid}\n` +
            screenLine +
            `host: ${location.host}\n` +
            `--init log--\n` + dbgLog;
    };
    const startBadgeUpdater = () => {
        renderVersionBadge();
        setInterval(renderVersionBadge, 1000);
    };

    const renderStartButton = () => {
        if (document.getElementById('lb-rb-start-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'lb-rb-start-btn';
        Object.assign(btn.style, {
            position: 'fixed', bottom: '100px', right: '20px',
            border: 'none', borderRadius: '32px',
            padding: '14px 22px',
            color: 'white', fontSize: '16px', fontWeight: 'bold',
            cursor: 'pointer', zIndex: '2147483647',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            fontFamily: 'sans-serif',
        });
        // v2.9.25: 開始ボタンの色を元に戻す(HIRO の長期慣れに合わせる)
        //   テスト=オレンジ #f57c00、本番購入=緑 #2e7d32
        //   サイト判別はバッジ色とサイト純正の Rakuten ロゴで行えば十分。
        //   開始/テストボタンを間違えて押す事故を最優先で防ぐため、慣れた配色を維持。
        if (CONFIG.testMode) {
            btn.textContent = '🧪 テスト';
            btn.style.background = '#f57c00';
        } else {
            btn.textContent = '🛒 購入';
            btn.style.background = '#2e7d32';
        }
        btn.addEventListener('click', startPurchase);
        document.body.appendChild(btn);
    };

    // ───────────────────────────────────────────────
    // 購入試行
    // ───────────────────────────────────────────────
    const attemptPurchase = async () => {
        if (isStopped()) return;

        const bodyText = document.body ? (document.body.innerText || '') : '';

        for (const ng of NG_TERMINAL_WORDS) {
            if (bodyText.includes(ng)) {
                toast(`❌ 「${ng}」検知: 購入不可で停止`, '#d32f2f', 8000);
                clearState();
                return;
            }
        }

        // v2.3: スマホ版含めて広くテキストマッチ
        const cartBtn = findByText(
            'button, a, input[type="button"], input[type="submit"], div[role="button"], span[role="button"]',
            '買い物かごに入れる', 'カートに入れる', 'カートへ', '買い物かごへ',
            'かごに入れる', 'カートに追加'
        );

        if (cartBtn) {
            localStorage.removeItem(KEY_WAITING);
            localStorage.removeItem(KEY_RELOAD_COUNT);
            setState('cart_added');
            toast('🛒 カートに追加...', '#2e7d32');
            robustClick(cartBtn);
            await sleep(400);
            if (isStopped()) return;
            // クリックで遷移しない場合のフォールバック
            // v2.9.16: state も sid も停止フラグも全部クッキーで持ち回しているため、
            //   URL ハッシュは一切不要。シンプルに遷移するだけ。
            if (!/books\.step\.rakuten\.co\.jp/.test(location.host)) {
                location.href = 'https://books.step.rakuten.co.jp/rms/mall/book/bs/Cart';
            }
            return;
        }

        const interval = CONFIG.reloadInterval;
        const max      = CONFIG.reloadMax;
        let count = parseInt(localStorage.getItem(KEY_RELOAD_COUNT) || '0', 10);

        if (count >= max) {
            toast(`❌ ${max}回リロードしてもカートボタン未出現、停止`, '#d32f2f', 10000);
            clearState();
            return;
        }

        count++;
        localStorage.setItem(KEY_RELOAD_COUNT, String(count));
        localStorage.setItem(KEY_WAITING, '1');

        toast(`⏳ 販売開始待機中(${count}/${max})… ${interval}ms 後にリロード`,
              '#7b1fa2', Math.max(1500, interval - 300));

        setTimeout(() => {
            if (isStopped()) return;
            location.reload();
        }, interval);
    };

    // ───────────────────────────────────────────────
    // 商品ページ初期化
    // ───────────────────────────────────────────────
    // ───────────────────────────────────────────────
    // v2.9.26: タイマー機能(時刻指定発火)
    //   駿河屋 v0.4.0 と同じ仕組み。HIRO 確認済仕様:
    //   - 時刻入力 HH:MM (デフォルト 21:00)
    //   - 過ぎた時刻は発火しない(誤発火防止)
    //   - 時刻ピッタリで発火
    //   - 発火後はタイマー自動 OFF (LB_RB_TIMER_FIRED_V3 フラグ)
    //   - 発火時の動作: KEY_WAITING を立てて location.reload()
    //     → リロード後に initProductPage の isWaiting() 経由で attemptPurchase が走る
    //   - デフォルト OFF (CONFIG.timerEnabled = false)
    //
    //   ★ 既存の購入フロー・robustClick・全 sleep 値には一切触っていない。
    //   ★ タイマー OFF 時(デフォルト)は、v2.9.25 と完全に同じ挙動。
    // ───────────────────────────────────────────────
    const KEY_TIMER_FIRED = 'LB_RB_TIMER_FIRED_V3';

    const isTimerFired = () => localStorage.getItem(KEY_TIMER_FIRED) === '1';
    const markTimerFired = () => localStorage.setItem(KEY_TIMER_FIRED, '1');
    const clearTimerFired = () => localStorage.removeItem(KEY_TIMER_FIRED);

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
        if (target.getTime() <= now.getTime()) return null;   // 過ぎた時刻は発火しない
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
        const badge = document.getElementById('lb-rb-version-badge');
        if (!badge) return;
        const remainSec = Math.floor((targetMs - Date.now()) / 1000);
        const stop = isStopped() ? '⛔停止中' : '▶監視中';
        const timerLine = `\n⏰ ${CONFIG.timerHHMM} (あと ${formatRemain(remainSec)})`;
        badge.textContent =
            `v${SCRIPT_VERSION} ${stop}\n` +
            `screen: ${detectStepScreen()}` +
            timerLine;
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
            toast(`⏰ タイマー設定時刻(${CONFIG.timerHHMM})は既に過ぎています\n発火しません`,
                  '#d32f2f', 6000);
            return;
        }

        const remainSec = Math.floor((targetMs - Date.now()) / 1000);
        toast(`⏰ タイマー作動中: ${CONFIG.timerHHMM} 発火予定(あと ${formatRemain(remainSec)})`,
              '#7b1fa2', 5000);

        if (timerCountdownIntervalId) clearInterval(timerCountdownIntervalId);
        timerCountdownIntervalId = setInterval(() => {
            updateTimerBadge(targetMs);
        }, 1000);
        updateTimerBadge(targetMs);

        if (timerCheckIntervalId) clearInterval(timerCheckIntervalId);
        timerCheckIntervalId = setInterval(() => {
            if (isStopped()) {
                clearInterval(timerCheckIntervalId);
                clearInterval(timerCountdownIntervalId);
                return;
            }
            if (isTimerFired()) {
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

    const fireTimer = () => {
        if (isStopped()) return;
        if (isTimerFired()) return;
        markTimerFired();

        toast(`🔔 タイマー発火! ${CONFIG.timerHHMM}\nリロードして購入を開始します`,
              '#2e7d32', 4000);

        localStorage.setItem(KEY_WAITING, '1');
        localStorage.removeItem(KEY_RELOAD_COUNT);

        setTimeout(() => {
            if (isStopped()) return;
            location.reload();
        }, 500);
    };

    const initProductPage = async () => {
        renderStartButton();

        // v2.4: state があっても警告は出さない(誤判定で動かなくなる原因)
        // 「購入開始」押下時に必ず clearState() するので問題なし
        if (isWaiting()) {
            if (isStopped()) {
                localStorage.removeItem(KEY_WAITING);
                return;
            }
            await sleep(500);
            await attemptPurchase();
            return;
        }

        // v2.9.26: タイマー機能(時刻指定発火)
        //   待機中でなく、タイマーが ON で未発火なら、時刻まで待機。
        //   isWaiting() のときは重ねて起動しない(連続リロード中)。
        if (CONFIG.timerEnabled && !isTimerFired() && !isStopped()) {
            startTimer();
        }
    };

    const startPurchase = async () => {
        if (!CONFIG.username || !CONFIG.password) {
            alert(
                '楽天ID/パスワードが設定されていません。\n' +
                '設定ページ(右上の⚙)からインストールし直してください。'
            );
            return;
        }

        // v2.9.7: 確認ダイアログ撤廃。
        //   販売開始の瞬間は時間勝負なので、ボタンを押した瞬間に即購入処理。
        //   止めたい時は右下の🛑停止ボタンで即停止できる。

        // v2.9.16: 新規セッションID発行 + 旧版残骸クリーンアップ
        //   - クッキー LB_SID 更新
        //   - クッキー LB_STOP 削除(renewSessionId内)
        //   - 旧版の localStorage 残骸を consumeResetFlag で掃除
        renewSessionId();
        consumeResetFlag();

        setStopped(false);
        clearState();
        // v2.9.26: 手動開始時、タイマー関連 interval を停止 + 発火フラグリセット
        try {
            if (typeof timerCheckIntervalId !== 'undefined' && timerCheckIntervalId) {
                clearInterval(timerCheckIntervalId);
            }
            if (typeof timerCountdownIntervalId !== 'undefined' && timerCountdownIntervalId) {
                clearInterval(timerCountdownIntervalId);
            }
        } catch (e) {}
        try { clearTimerFired(); } catch (e) {}
        localStorage.setItem(KEY_PRODUCT_URL, location.href);
        localStorage.setItem(KEY_START_TS, String(Date.now()));

        const mode = CONFIG.testMode ? '🧪 テスト' : '🚀 本番';
        toast(`${mode} 開始: ${CONFIG.profileName || '無名'}`, '#2e7d32', 2000);
        await attemptPurchase();
    };

    // ───────────────────────────────────────────────
    // books.step.rakuten.co.jp / sp.books.step.rakuten.co.jp
    //
    // v2.9.3: state ベースではなく画面実態ベースで動作する。
    //   localStorage の残骸 state があっても画面要素を見て正しく振る舞う。
    //
    //   画面判定ロジック:
    //     A. URL に /OrderComplete/ や 完了文言 → 注文完了画面
    //     B. button[name="commit_order"] or 注文確定テキスト → 注文確認画面
    //     C. ご購入手続きボタン or カート空メッセージ → カート画面
    //     D. 住所/支払いラジオ → レジ画面(中間)
    //     E. それ以外 → 不明(state を補助情報として活用)
    // ───────────────────────────────────────────────
    const detectStepScreen = () => {
        // A. 注文完了画面
        if (isCompletePage()) return 'complete';

        // B. 注文確認画面(注文確定ボタンがある)
        const commitBtn = document.querySelector('button[name="commit_order"]') ||
            findByText(
                'button, a, input, div[role="button"], span[role="button"]',
                '注文を確定する', '注文する', '注文確定', '購入を確定'
            );
        if (commitBtn) return 'confirm';

        // C. カート画面(「ご購入手続き」ボタンがある or カート空メッセージ)
        const text = document.body ? (document.body.innerText || '') : '';
        if (text.includes('カートに商品はありません') ||
            text.includes('お探しのページが見つかりません')) {
            return 'empty_cart';
        }
        const proceedBtn = findByText(
            'button, a, input, div[role="button"], span[role="button"]',
            'ご購入手続き', 'レジに進む', 'ご注文手続きへ',
            '購入手続き', '購入手続きへ', 'ご注文手続き'
        );
        if (proceedBtn) return 'cart';

        // D. レジ画面(住所/支払いラジオ + 「次へ」ボタン)
        const hasRadio = document.querySelector(
            'input[type=radio][name*="delivery"], input[type=radio][name*="address"], ' +
            'input[type=radio][name*="payment"], input[type=radio][name*="pay"]'
        );
        const nextBtn = findByText(
            'button, a, input, div[role="button"], span[role="button"]',
            '次へ', '確認画面へ', '次へ進む', '注文確認画面へ', '注文内容を確認'
        );
        if (hasRadio || nextBtn) return 'checkout';

        // E. 不明
        return 'unknown';
    };

    const handleStepRakuten = async () => {
        if (isStopped()) return;

        // v2.9.3: ハッシュに stop=1 があれば即停止状態にして以降何もしない
        // (将来の停止連動用、現状未使用だが将来のため)

        // v2.9.3: ハッシュに state があれば、localStorage の古い残骸を上書きする
        //   ・商品ページから明示的に渡された state を優先
        //   ・前回テストの残骸(別オリジンで書かれた値)を排除
        const hashState = readHashState();
        if (hashState) {
            localStorage.setItem(KEY_STATE, hashState);
        }

        // 起動直後、画面の状態を判定
        let screen = detectStepScreen();

        // unknown の場合はDOM出現を最大10秒待つ
        if (screen === 'unknown') {
            const started = Date.now();
            while (Date.now() - started < 10000) {
                if (isStopped()) return;
                await sleep(150);
                screen = detectStepScreen();
                if (screen !== 'unknown') break;
            }
        }

        if (isStopped()) return;

        // 画面別処理
        if (screen === 'complete') {
            handleCompletePage();
            return;
        }

        if (screen === 'empty_cart') {
            toast('❌ カートが空です', '#d32f2f', 6000);
            clearState();
            return;
        }

        if (screen === 'cart') {
            // v2.9.3: カート画面到達 = フローの開始点なので、
            //   localStorage の古い残骸を強制リセットして再スタート
            localStorage.removeItem(KEY_STATE);
            toast('ご購入手続きへ...', '#2e7d32');
            setState('cart_added');
            const proceedBtn = findByText(
                'button, a, input, div[role="button"], span[role="button"]',
                'ご購入手続き', 'レジに進む', 'ご注文手続きへ',
                '購入手続き', '購入手続きへ', 'ご注文手続き'
            );
            if (!proceedBtn) {
                toast('❌ ご購入手続きボタンが消えました', '#d32f2f', 6000);
                return;
            }
            setState('checkout_reached');
            robustClick(proceedBtn);
            return;
        }

        if (screen === 'checkout') {
            toast('レジ画面処理中...', '#2e7d32');
            setState('checkout_reached');

            // 住所選択
            const addrRadios = document.querySelectorAll(
                'input[type=radio][name*="delivery"], input[type=radio][name*="address"]'
            );
            if (addrRadios.length > 0 && !addrRadios[0].checked) {
                addrRadios[0].click();
            }

            // クレジットカード選択
            const payRadios = document.querySelectorAll(
                'input[type=radio][name*="payment"], input[type=radio][name*="pay"]'
            );
            for (const r of payRadios) {
                const lbl = r.closest('label,tr,div,li,td');
                const t = lbl ? lbl.innerText : '';
                if (t.includes('クレジット') || t.toLowerCase().includes('credit')) {
                    if (!r.checked) r.click();
                    break;
                }
            }

            // 「次へ」ボタンを探してクリック
            const nextBtn = findByText(
                'button, a, input, div[role="button"], span[role="button"]',
                '次へ', '確認画面へ', '次へ進む', '注文確認画面へ', '注文内容を確認'
            );
            if (nextBtn) {
                toast('確認画面へ...', '#2e7d32');
                robustClick(nextBtn);
                return;
            }
            toast('❌ レジ画面で「次へ」ボタンが見つかりません', '#d32f2f', 8000);
            return;
        }

        if (screen === 'confirm') {
            setState('confirm_screen');
            await handleConfirmScreen();
            return;
        }

        // ここまで来たら本当に不明
        toast('❌ 画面判定不能(時間切れ)', '#d32f2f', 8000);
    };

    const handleConfirmScreen = async () => {
        // v2.5: 1500ms 初期 sleep 撤廃。waitForCommitOrder が MutationObserver で即検知
        if (isStopped()) return;

        if (isCompletePage()) {
            handleCompletePage();
            return;
        }

        toast('注文確認画面に到達', '#2e7d32');

        const orderBtn = await waitForCommitOrder(15000);
        if (isStopped()) return;
        if (!orderBtn) {
            toast('❌ 注文確定ボタン未発見', '#d32f2f', 8000);
            return;
        }

        if (CONFIG.testMode) {
            toast('🧪 テスト: 確認画面で停止しました', '#f57c00', 8000);
            alert(
                '🧪 テストモード\n\n' +
                '注文確認画面まで到達しました。\n' +
                '注文確定ボタンは押しません。\n\n' +
                'ブラウザ画面で内容を最終確認してください。'
            );
            clearState();
            return;
        }

        toast('🚀 注文確定...', '#d32f2f');
        setState('completed');
        robustClick(orderBtn);
    };

    const waitForCommitOrder = (timeoutMs) => {
        return new Promise((resolve) => {
            let done = false;
            let observer = null, poller = null, timer = null;
            const finish = (val) => {
                if (done) return;
                done = true;
                if (poller) clearInterval(poller);
                if (observer) observer.disconnect();
                if (timer) clearTimeout(timer);
                resolve(val);
            };
            const check = () => {
                if (isStopped()) { finish(null); return; }
                const byName = document.querySelector('button[name="commit_order"]');
                if (byName) { finish(byName); return; }
                const byText = findByText(
                    'button, a, input, div[role="button"], span[role="button"]',
                    '注文を確定する', '注文する', '注文確定', '購入を確定'
                );
                if (byText) finish(byText);
            };
            check();
            if (done) return;
            try {
                observer = new MutationObserver(check);
                observer.observe(document.body, { childList: true, subtree: true, characterData: true });
            } catch (e) {}
            poller = setInterval(check, 80);
            timer = setTimeout(() => finish(null), timeoutMs);
        });
    };

    const isCompletePage = () => {
        const text = document.body ? (document.body.innerText || '') : '';
        const url = location.href;
        // v2.9.3: 'complete' 単独はカートURL等で誤マッチするため、
        //   日本語の確実な文言と URL の特定パスのみで判定
        if (text.includes('ご注文ありがとう')) return true;
        if (text.includes('注文を承りました')) return true;
        if (text.includes('注文完了')) return true;
        const lowerUrl = url.toLowerCase();
        if (lowerUrl.includes('thankyou')) return true;
        if (lowerUrl.includes('thank-you')) return true;
        if (lowerUrl.includes('order-complete')) return true;
        if (lowerUrl.includes('ordercomplete')) return true;
        return false;
    };

    const handleCompletePage = () => {
        toast('✅ 注文完了!', '#388e3c', 8000);
        clearState();
        setTimeout(() => {
            try { alert('✅ 楽天ブックス注文完了\nメールをご確認ください。'); }
            catch (e) { /* noop */ }
        }, 500);
    };

    // ───────────────────────────────────────────────
    // ログイン画面
    //   v2.6: Face ID(WebAuthn)優先表示の楽天ログイン画面で
    //         「パスワードでログイン」リンクを自動クリックして
    //         パスワード入力モードに切り替える
    // ───────────────────────────────────────────────
    const PASSWORD_MODE_KEYWORDS = [
        'パスワードでログイン',
        'パスワードログイン',
        'パスワードを使用',
        'パスワードを使ってログイン',
        'ID・パスワードでログイン',
        'IDとパスワードでログイン',
        '他の方法でログイン',
        '他のログイン方法',
        'その他のログイン',
        'メールアドレスでログイン',
        'パスワードで',
        // v2.9.27: 新UI(Face ID/パスキー画面)の文言ゆれに対応
        'パスワードでサインイン',
        'パスワードを入力',
        '別の方法',
        '他の方法',
        'パスキーを使わない',
        'パスワードに切り替え',
        'パスワードを利用',
    ];

    // ★v3.2.0: 新ログインUI(login.account.rakuten.com)はSPAで、描画がスクリプト起動より
    //   後から来る。実ログ(2026-09-03 00:58:38)で、起動 6ms 時点の DOM が
    //   inputs:[] buttons:[] hasPasswordField:false = 完全に空だったことを確認。
    //   従来は switchToPasswordMode() がこの「空の瞬間」を一度だけ見て失敗し、
    //   その後は出るはずのないパスワード欄を待ち続けて詰まっていた。
    //   対策: 何かが描画されるまで待ってから探索を始める。
    const waitForPageRender = (timeoutMs) => {
        return new Promise((resolve) => {
            const started = Date.now();
            const cap = timeoutMs || 12000;
            let done = false;
            let obs = null, poller = null, timer = null;
            const vis = (e) => {
                try {
                    const r = e.getBoundingClientRect();
                    return e.offsetParent !== null && r.width > 0 && r.height > 0;
                } catch (x) { return false; }
            };
            const rendered = () => {
                try {
                    if (document.querySelector('input[type=password]')) return true;
                    const ins = Array.from(document.querySelectorAll('input')).filter(vis);
                    if (ins.length > 0) return true;
                    const btns = Array.from(document.querySelectorAll('button,a[role=button],div[role=button]')).filter(vis);
                    if (btns.length > 0) return true;
                    const txt = ((document.body && document.body.innerText) || '').trim();
                    return txt.length >= 20;
                } catch (x) { return false; }
            };
            const finish = (ok) => {
                if (done) return;
                done = true;
                try { if (obs) obs.disconnect(); } catch (x) {}
                try { if (poller) clearInterval(poller); } catch (x) {}
                try { if (timer) clearTimeout(timer); } catch (x) {}
                logRb(ok ? 'info' : 'warn', 'login',
                    ok ? 'ページ描画を確認' : '描画待ちタイムアウト(空のまま)',
                    { waitedMs: Date.now() - started });
                resolve(ok);
            };
            if (rendered()) { finish(true); return; }
            try {
                obs = new MutationObserver(() => { if (rendered()) finish(true); });
                obs.observe(document.documentElement || document.body,
                    { childList: true, subtree: true, attributes: true });
            } catch (x) {}
            poller = setInterval(() => { if (rendered()) finish(true); }, 150);
            timer = setTimeout(() => finish(false), cap);
        });
    };

    // パスワードモード切替リンクをクリック
    // 既にパスワード入力欄が見えている場合は何もしない(true=切替不要)
    const switchToPasswordMode = async () => {
        // パスワード欄が既に表示されているかチェック(可視性込み)
        const existingPwField = document.querySelector('input[type=password]:not([disabled])');
        if (existingPwField) {
            const rect = existingPwField.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && existingPwField.offsetParent !== null) {
                return true; // 既にパスワード入力モード
            }
        }

        // パスワード切替リンク/ボタンを探す(可視要素優先)
        // v2.9.27: 新ログインUI(login.account.rakuten.com)は切替が
        //   a/button/[role=button] ではない素の div/span/li のことがあるため、
        //   クリック可能そうな要素に限定せず「見えている全要素」からテキスト一致で探す。
        //   (子を持つ大きな要素を誤爆しないよう、テキスト長が短いものを優先する)
        const candidates = document.querySelectorAll(
            'a, button, div[role="button"], span[role="button"], [onclick], ' +
            'div, span, li, p, label'
        );
        let bestMatch = null;
        for (const el of candidates) {
            const text = (el.innerText || el.value || '').trim();
            if (!text) continue;
            // v2.9.27: 全要素対象にしたため、親コンテナ(長文)を誤爆しないよう制限
            if (text.length > 40) continue;
            for (const kw of PASSWORD_MODE_KEYWORDS) {
                if (text.includes(kw)) {
                    const rect = el.getBoundingClientRect();
                    const visible = rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
                    if (visible) {
                        bestMatch = el;
                        break;
                    }
                }
            }
            if (bestMatch) break;
        }

        // ★v3.2.0: 見つからない場合、SPAの遅延描画に備えて数秒だけ再探索する
        if (!bestMatch) {
            const deadline = Date.now() + 5000;
            while (Date.now() < deadline && !bestMatch) {
                await new Promise((r) => setTimeout(r, 250));
                if (isStopped()) return false;
                const existing = document.querySelector('input[type=password]:not([disabled])');
                if (existing) {
                    const rr = existing.getBoundingClientRect();
                    if (rr.width > 0 && rr.height > 0 && existing.offsetParent !== null) {
                        logRb('info', 'login', '再探索中にパスワード欄が出現 → 切替不要');
                        return true;
                    }
                }
                const again = document.querySelectorAll(
                    'a, button, div[role="button"], span[role="button"], [onclick], div, span, li, p, label'
                );
                for (const el of again) {
                    const t = (el.innerText || el.value || '').trim();
                    if (!t || t.length > 40) continue;
                    for (const kw of PASSWORD_MODE_KEYWORDS) {
                        if (t.includes(kw)) {
                            const r2 = el.getBoundingClientRect();
                            if (r2.width > 0 && r2.height > 0 && el.offsetParent !== null) { bestMatch = el; break; }
                        }
                    }
                    if (bestMatch) break;
                }
            }
            if (bestMatch) {
                logRb('info', 'login', '遅延描画後に切替リンクを発見', {
                    text: (bestMatch.innerText || '').trim().slice(0, 40) });
            }
        }

        if (bestMatch) {
            logRb('info', 'login', 'パスワードログインへ切替をクリック', {
                text: (bestMatch.innerText || '').trim().slice(0, 40), tag: bestMatch.tagName });
            toast(`🔐 パスワードログインへ切替: 「${(bestMatch.innerText || '').trim().substring(0, 20)}」`, '#1976d2', 3000);
            robustClick(bestMatch);
            // 切替後にDOM変化を待つ(MutationObserver)
            await waitForSelector('input[type=password]:not([disabled])', 5000);
            return true;
        }

        return false; // 切替リンク見つからず
    };

    const handleLoginPage = async () => {
        // v2.9.4: ログイン画面到達を必ず可視化(UserScript起動の証拠)
        toast(`🔐 ログイン画面検出 v${SCRIPT_VERSION}`, '#1976d2', 5000);
        logRb('info', 'login', 'ログイン画面を検出', { url: location.href.slice(0, 200), host: location.host });
        dumpFormStateRb('ログイン画面 到達直後のDOM(描画待ち前)');

        if (isStopped()) return;

        if (!CONFIG.password) {
            toast('⚠️ パスワード未設定', '#f57c00', 5000);
            return;
        }

        // ★v3.2.0: SPA の描画完了を待ってから探索する(空DOMを掴む問題の根治)
        await waitForPageRender(12000);
        if (isStopped()) return;
        dumpFormStateRb('描画完了後のDOM(ここを見て判断する)');

        // v2.6: Face ID画面でも「パスワードでログイン」を自動クリックして切替
        await switchToPasswordMode();
        if (isStopped()) return;

        const pwField = await waitForSelector(
            'input[type=password]:not([disabled])',
            8000
        );
        if (!pwField || isStopped()) {
            // パスワード欄が出てこない = Face ID 強制 or 別の認証方式
            // v2.6: 切替再試行(画面遷移後にもう一度トライ)
            const retried = await switchToPasswordMode();
            if (retried) {
                const pwFieldRetry = await waitForSelector(
                    'input[type=password]:not([disabled])', 5000
                );
                if (!pwFieldRetry) {
                    toast('❌ パスワード入力欄が出ません(Face ID必須かも)', '#d32f2f', 8000);
                    logRb('error', 'login', 'パスワード入力欄が出ない(切替後も未出現)');
                    dumpFormStateRb('失敗: パスワード欄なし');
                    showLoginDiag('パスワード入力欄が出ない(切替後も未出現)');
                    return;
                }
                return handleLoginPage(); // 再帰でもう一度ログイン処理(パスワード欄ある状態で)
            }
            toast('❌ パスワードログインへ切替できず', '#d32f2f', 8000);
            logRb('error', 'login', 'パスワードログインへの切替リンクが見つからない');
            dumpFormStateRb('失敗: 切替リンクなし');
            showLoginDiag('パスワードログインへの切替リンクが見つからない');
            return;
        }

        logRb('info', 'login', 'パスワード入力欄を検出', {
            id: pwField.id || '', name: pwField.name || '', url: location.href.slice(0, 160) });
        const emailField = document.querySelector(
            'input[name=u]:not([disabled]), ' +
            'input[type=email]:not([disabled])'
        );

        // v2.9.20: Safari/iOS のパスワード保存・自動入力・漏洩警告を抑制
        //   駿河屋 v0.1.5/v0.2.0 で実績のあるアプローチを楽天にも適用。
        //   入力前に email/password field に autocomplete=off + ignore 系属性を仕込む。
        //   これで:
        //   - 「保存しますか?」が出にくくなる
        //   - 1Password/LastPass などのサードパーティ PW マネージャも介入しない
        //   - 漏洩警告は既存 keychain エントリ起因の場合は出続ける(Apple 仕様)
        //
        //   購入フロー本体には触らない、ログイン入力前の予防的処理のみ。
        document.querySelectorAll(
            "input[type='password'], input[type='email'], " +
            "input[name='u'], input[name='loginid'], input[name='passwd']"
        ).forEach(suppressPasswordManager);
        document.querySelectorAll('form').forEach(form => {
            try {
                form.setAttribute('autocomplete', 'off');
                form.setAttribute('data-1p-ignore', 'true');
                form.setAttribute('data-lpignore', 'true');
            } catch (e) {}
        });

        if (emailField && !emailField.value && CONFIG.username) {
            suppressPasswordManager(emailField);
            fillNative(emailField, CONFIG.username);
            await sleep(50);
        }

        // v2.9.17: パスワード入力後、blurでバリデーション完了を待つため少し待機
        if (!pwField.value) {
            suppressPasswordManager(pwField);
            fillNative(pwField, CONFIG.password);
        }
        await sleep(100); // v2.9.20 高速化: 300→100(駿河屋 v0.3.0 の実績ベース)

        toast('🔐 ログイン送信...', '#2e7d32');
        logRb('info', 'login', 'ログイン送信を実行', {
            emailFilled: !!(emailField && emailField.value),
            passwordFilled: !!pwField.value,
            url: location.href.slice(0, 160) });
        dumpFormStateRb('ログイン送信 直前のDOM');

        // submit ボタン探索
        let submitBtn = document.querySelector('button[type=submit]:not([disabled]), input[type=submit]:not([disabled])');
        if (!submitBtn) {
            submitBtn = findByText(
                'button, a, input, div[role="button"], span[role="button"]',
                'ログイン', 'サインイン', '次へ'
            );
        }

        // v2.9.17: フルクリック(mousedown→mouseup→click)を発火。
        //   React/Vue の合成イベントは pointerdown/mousedown を見ていることが多く、
        //   .click() だけでは反応しないことがある。
        const fullClick = (el) => {
            if (!el) return;
            const opts = { bubbles: true, cancelable: true, view: window };
            try { el.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch (e) {}
            try { el.dispatchEvent(new MouseEvent('mousedown', opts)); } catch (e) {}
            try { el.dispatchEvent(new PointerEvent('pointerup', opts)); } catch (e) {}
            try { el.dispatchEvent(new MouseEvent('mouseup', opts)); } catch (e) {}
            try { el.click(); } catch (e) {}
            try { el.dispatchEvent(new MouseEvent('click', opts)); } catch (e) {}
        };

        if (submitBtn) {
            fullClick(submitBtn);

            // 1秒後に画面遷移していなければ再試行(form submit経由)
            await sleep(1200);
            if (location.host === 'login.account.rakuten.com' && !isStopped()) {
                toast('🔐 再送信(form経由)...', '#f57c00', 3000);
                const form = pwField.closest('form');
                if (form && typeof form.requestSubmit === 'function') {
                    try { form.requestSubmit(); } catch (e) { try { form.submit(); } catch (e2) {} }
                } else if (form) {
                    try { form.submit(); } catch (e) {}
                } else {
                    fullClick(submitBtn);
                }
            }
        } else {
            const form = pwField.closest('form');
            if (form && typeof form.requestSubmit === 'function') {
                try { form.requestSubmit(); } catch (e) { try { form.submit(); } catch (e2) {} }
            } else if (form) {
                form.submit();
            } else {
                toast('❌ 送信ボタン未発見', '#d32f2f', 6000);
                logRb('error', 'login', 'ログイン送信ボタンが見つからない');
                dumpFormStateRb('失敗: 送信ボタンなし');
                showLoginDiag('ログイン送信ボタンが見つからない');
            }
        }
    };

    // ───────────────────────────────────────────────
    // ルーター
    // ───────────────────────────────────────────────
    const main = async () => {
        // v2.9.4: 起動を必ず可視化
        try {
            // body がまだない可能性があるので少し待つ
            if (!document.body) {
                await new Promise((r) => {
                    const check = () => document.body ? r() : setTimeout(check, 50);
                    check();
                });
            }
        } catch (e) {}

        // v2.9.16: 調査モードのみ起動時の動作ログを記録
        //   v2.9.16以降、停止フラグもクッキーになったため main 内で
        //   consumeResetFlag を呼ぶ必要がない(呼ぶと停止が解除されてしまう)。
        if (CONFIG.debugMode) {
            const dbg = [];
            dbg.push(`[start] host=${location.host}`);
            const initialSid = sessionStorage.getItem(SESSION_KEY) || '(none)';
            dbg.push(`[sess.before] ${initialSid.slice(0, 10)}`);
            const cookieSid = readRakutenCookie(COOKIE_SID) || '(none)';
            const cookieStop = readRakutenCookie(COOKIE_STOP) || '(none)';
            const cookieState = readRakutenCookie(COOKIE_STATE) || '(none)';
            dbg.push(`[ck.sid] ${cookieSid.slice(0, 10)}`);
            dbg.push(`[ck.stop] ${cookieStop}`);
            dbg.push(`[ck.state] ${cookieState.slice(0, 30)}`);

            purgeOldStorage();
            syncSessionIdFromHash();

            const afterSyncSid = sessionStorage.getItem(SESSION_KEY) || '(none)';
            dbg.push(`[sess.after_sync] ${afterSyncSid.slice(0, 10)}`);

            try {
                localStorage.setItem('LB_RB_DEBUG_LOG', dbg.join('\n'));
            } catch (e) {}
        } else {
            purgeOldStorage();
            syncSessionIdFromHash();
        }

        const host = location.host;

        // v2.9.5: ワイルドカードで楽天全ドメインを @match しているが、
        //   実際に処理が必要なのは以下のドメインのみ。
        //   それ以外(楽天市場トップ、ニュース等)では完全に何もしない。
        const RELEVANT_HOSTS = [
            'books.rakuten.co.jp',
            'www.books.rakuten.co.jp',
            'login.account.rakuten.com',
            'grp01.id.rakuten.co.jp',
        ];
        const isRelevantHost =
            RELEVANT_HOSTS.includes(host) ||
            host.endsWith('books.step.rakuten.co.jp');
        if (!isRelevantHost) {
            // 楽天の他のドメイン(market, news, travel等)では完全に何もしない
            return;
        }

        // 起動可視化: 関連ページのみトースト
        try {
            logRb('info', 'boot', `v${SCRIPT_VERSION} 起動`, {
                host: host, path: location.pathname.slice(0, 120) });
            toast(`▶ v${SCRIPT_VERSION} on ${host}`, '#388e3c', 2500);
        } catch (e) {}

        const isProductHost = host === 'books.rakuten.co.jp' || host === 'www.books.rakuten.co.jp';
        const isStepHost    = host.endsWith('books.step.rakuten.co.jp');

        renderStopButton();
        renderSettingsButton();
        renderLogButton();
        startBadgeUpdater();

        if (isProductHost && location.pathname.startsWith('/rb/')) {
            await initProductPage();
            return;
        }

        if (isStepHost) {
            await handleStepRakuten();
            return;
        }

        if (host === 'login.account.rakuten.com' || host === 'grp01.id.rakuten.co.jp') {
            await handleLoginPage();
            return;
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        main();
    }
})();
