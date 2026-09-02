// ==UserScript==
// @name         G.U.N.D.A.M. Bot - 駿河屋購入
// @namespace    gundam-bot.surugaya
// @updateURL    https://raw.githubusercontent.com/hiro20926/gandam/main/surugaya/gundambot-surugaya.user.js
// @downloadURL  https://raw.githubusercontent.com/hiro20926/gandam/main/surugaya/gundambot-surugaya.user.js
// @version      1.0.0
// @description  駿河屋の自動購入(suruga-ya.jp 対応・iOS Safari + Userscripts拡張用)/ Build 2026-05-04 21:00 JST
// @author       HIRO
// @match        https://*.suruga-ya.jp/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

// ==================================================================
// Build:    2026-05-17 (JST)
// Version:  v0.4.1 (自動確定不発対策 + ログ機能追加)
//
// v0.4.1 で追加 (★HIRO 報告「自動最終確定してくれなかった」対応★)
//
//   症状: 注文確認画面まで進んだが何もトーストが出ず自動確定されなかった。
//
//   原因: handleOrderConfirm 冒頭の state チェックで即 return されていた。
//     - STATE_TTL 10分切れ (銀行入力等で時間かけた) が最有力
//     - もしくは session-id ミスマッチ等
//
//   修正 (3 点):
//     1. STATE_TTL_SEC を 10分 → 30分に延長
//     2. state 無効時に診断 toast (現状は無音で死んでいた)
//        → 次回同じ状況になっても HIRO さんが即気付ける
//     3. 注文確定ボタン探索失敗時、ページ上の候補ボタン文字列を toast に列挙
//        (駿河屋のサイト側で文字列変更があっても即発見できるように)
//
//   追加: ログ機能 (Amazon Bot と同じ仕組み)
//     - localStorage ログバッファ (最大 300 件、リロード跨ぎ永続)
//     - パネルに 📋 ログボタン追加 (オーバーレイで一覧表示)
//     - Discord 送信 (重要のみ / 全件)
//     - 📥 CSV 保存 (BOM 付き UTF-8、iPhone Safari の「ファイル」アプリに保存)
//     - コピー / クリアボタン
//     - logSY 関数 (Amazon の logAm 相当)、既存 toast 呼出に並列追加
//
//   触らない:
//     - 中古検出 (第 1 / 第 3 防衛ライン) — 安全要件
//     - testMode 動作
//     - 確定ボタン click 単発 (二重発注防止)
//     - 既存認証・入力フロー (handleOrder1, handleLoginPage, etc)
//
// v0.3.2 (旧)
//   ブランドカラー化(楽天との視覚的区別)
//   ブランドカラー化(楽天との視覚的区別)
//   1. 設定ボタン ⚙: 灰色 #555 → 駿河屋青(濃紺) #1e40af
//   2. バッジ: 赤 #c62828 → 駿河屋青 #1e40af + 黄色文字 #fbbf24
//   3. テストボタン: オレンジ #f57c00 → 駿河屋黄色 #fbbf24 + 黒文字
//   4. 購入ボタン: 緑 #2e7d32 → 駿河屋青(濃紺) #1e40af
//
//   停止ボタンは赤 #d32f2f のまま(国際的「停止=赤」の安全サイン)
//
//   駿河屋 = 青+黄色 / 楽天 = 赤+オレンジ で開いた瞬間に判別可能。
//   間違って違うサイトのボタンを押す事故を防ぐ。
//   ロジックは完全無触、色のみ変更。
// ==================================================================

(function () {
    'use strict';

    // ───────────────────────────────────────────────
    // 位置情報リクエストのブロック(駿河屋ページが勝手に位置情報を要求するため)
    //   購入フローと無関係なので UserScript 側で navigator.geolocation を無効化。
    //   @run-at document-start で IIFE 直後に実行されるため、ページスクリプトが
    //   getCurrentPosition を呼ぶより前に override が効く。
    // ───────────────────────────────────────────────
    try {
        if (navigator && navigator.geolocation) {
            const denyError = { code: 1, PERMISSION_DENIED: 1, message: 'blocked by UserScript' };
            navigator.geolocation.getCurrentPosition = (success, errorCb) => {
                try { if (typeof errorCb === 'function') errorCb(denyError); } catch (e) {}
            };
            navigator.geolocation.watchPosition = (success, errorCb) => {
                try { if (typeof errorCb === 'function') errorCb(denyError); } catch (e) {}
                return 0;
            };
            navigator.geolocation.clearWatch = () => {};
        }
    } catch (e) { /* noop */ }

    // ───────────────────────────────────────────────
    // CONFIG (Netlify Functions により設定ページから値が埋め込まれる)
    // ───────────────────────────────────────────────
    // ★v3.0.0: 設定を「配布ファイルへの埋め込み」から「端末内(localStorage)保存」に変更。
    //   旧方式: Netlify の設定ページで入力 → __INJECT_*__ を焼き込んで配布 → 更新の度に再インストール。
    //   新方式: GitHub から素の本体を配布(認証情報を含まない)→ 端末の設定画面で入力して保存。
    //   利点: ①配布物にパスワードが入らない ②@updateURL で自動更新(再インストール不要)
    //         ③Netlify とデプロイ元の管理が不要
    const CFG_KEY = 'LB_SY_CONFIG_V1';
    const CONFIG_DEFAULTS = {
        profileName:    '駿河屋',
        username:       '',
        password:       '',
        reloadInterval: 1000,
        reloadMax:      0,
        testMode:       false,
        debugMode:      false,
        timerEnabled:   false,
        timerHHMM:      '',
        discordWebhook: '',
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

    // ───────────────────────────────────────────────
    // ストレージキー(駿河屋専用、楽天 LB_RB_* と区別するため LB_SY_*)
    // ───────────────────────────────────────────────
    const KEY_PRODUCT_URL   = 'LB_SY_PRODUCT_URL_V1';
    const KEY_START_TS      = 'LB_SY_START_TS_V1';
    const KEY_RELOAD_COUNT  = 'LB_SY_RELOAD_COUNT_V1';
    const KEY_WAITING       = 'LB_SY_WAITING_V1';   // v0.3.5: リロード待機中フラグ

    // 過去版のキー(起動時に削除)
    const OLD_KEYS = [
        // 駿河屋版は v0.1.0 が初版なので過去版なし
    ];
    const purgeOldStorage = () => {
        OLD_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
    };

    const SCRIPT_VERSION = '1.0.0';

    // ───────────────────────────────────────────────
    // 共通ユーティリティ
    // ───────────────────────────────────────────────
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // 楽天 v2.9.8 で確立した「別タブ暴走防止」パターンをそのまま移植。
    //   駿河屋はキャンセル不可なので、誤発注は楽天以上に致命的。
    //   セッションID + タイムスタンプ + 10分TTL で別タブ暴走を防ぐ。
    const SESSION_KEY = 'LB_SY_SESSION_ID';
    const STATE_TTL_MS = 30 * 60 * 1000;   // ★v0.4.1: 10分→30分

    const getSessionId = () => {
        let id = sessionStorage.getItem(SESSION_KEY);
        if (!id) {
            id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
            sessionStorage.setItem(SESSION_KEY, id);
        }
        return id;
    };

    // ───────────────────────────────────────────────
    // クッキー状態管理(.suruga-ya.jp スコープ)
    //   楽天版と完全に同パターン。@match が異なるため楽天と干渉しない。
    // ───────────────────────────────────────────────
    const COOKIE_SID = 'LB_SY_SID';
    const COOKIE_STOP = 'LB_SY_STOP';
    const COOKIE_STATE = 'LB_SY_STATE';

    const writeSurugayaCookie = (name, value, maxAgeSec) => {
        try {
            document.cookie =
                `${name}=${encodeURIComponent(value)}; path=/; domain=.suruga-ya.jp; ` +
                `max-age=${maxAgeSec}; SameSite=Lax`;
        } catch (e) {}
    };
    const readSurugayaCookie = (name) => {
        try {
            const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
            return m ? decodeURIComponent(m[1]) : '';
        } catch (e) { return ''; }
    };
    const deleteSurugayaCookie = (name) => {
        try {
            document.cookie =
                `${name}=; path=/; domain=.suruga-ya.jp; max-age=0; SameSite=Lax`;
        } catch (e) {}
    };

    const renewSessionId = () => {
        const newId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        sessionStorage.setItem(SESSION_KEY, newId);
        writeSurugayaCookie(COOKIE_SID, newId, 600);
        deleteSurugayaCookie(COOKIE_STOP);
        return newId;
    };

    const syncSessionIdFromCookie = () => {
        try {
            const fromCookie = readSurugayaCookie(COOKIE_SID);
            if (!fromCookie) return;
            const current = sessionStorage.getItem(SESSION_KEY);
            if (current !== fromCookie) {
                sessionStorage.setItem(SESSION_KEY, fromCookie);
            }
        } catch (e) {}
    };

    // state パース(別タブ・古い state を弾く)
    const parseStateValue = (raw) => {
        if (!raw) return null;
        const parts = raw.split('|');
        if (parts.length === 3) {
            return { state: parts[0], sessionId: parts[1], ts: parseInt(parts[2], 10) };
        }
        return null;
    };
    const getValidatedState = (raw) => {
        const parsed = parseStateValue(raw);
        if (!parsed) return '';
        if (parsed.sessionId !== getSessionId()) return '';
        if (Date.now() - parsed.ts > STATE_TTL_MS) return '';
        return parsed.state;
    };
    const encodeStateValue = (s) => `${s}|${getSessionId()}|${Date.now()}`;

    // 停止フラグ
    const STOP_TTL_SEC = 5 * 60;
    const isStopped = () => readSurugayaCookie(COOKIE_STOP) === '1';
    const setStopped = (v) => {
        if (v) writeSurugayaCookie(COOKIE_STOP, '1', STOP_TTL_SEC);
        else   deleteSurugayaCookie(COOKIE_STOP);
    };

    // state クッキー(.suruga-ya.jp 全配下で持ち回し)
    // ★v0.4.1: 10分 → 30分に延長 (HIRO 報告「銀行情報入力で時間かけて期限切れ」対応)
    const STATE_TTL_SEC = 30 * 60;
    const getState = () => getValidatedState(readSurugayaCookie(COOKIE_STATE));
    const setState = (s) => writeSurugayaCookie(COOKIE_STATE, encodeStateValue(s), STATE_TTL_SEC);
    const clearState = () => {
        deleteSurugayaCookie(COOKIE_STATE);
        localStorage.removeItem(KEY_PRODUCT_URL);
        localStorage.removeItem(KEY_START_TS);
        localStorage.removeItem(KEY_RELOAD_COUNT);
        localStorage.removeItem(KEY_WAITING);   // v0.3.5
        localStorage.removeItem('LB_SY_TIMER_FIRED_V1');   // v0.4.0
    };

    // v0.3.6: リロード待機中フラグ判定(楽天 v2.9.19 と同じ仕組み)
    const isWaiting = () => localStorage.getItem(KEY_WAITING) === '1';

    // ───────────────────────────────────────────────
    // DOM utility (楽天 v2.9.19 と同等)
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
            } catch (e) {}
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
            } catch (e) {}
            poller = setInterval(check, 80);
            timer = setTimeout(() => finish(null), timeoutMs);
        });
    };

    const fillNative = (el, value) => {
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        ).set;
        try { el.focus(); } catch (e) {}
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        try { el.blur(); } catch (e) {}
    };

    // ───────────────────────────────────────────────
    // Apple 自動入力・保存・漏洩警告を抑制するヘルパー
    //   form と input に「保存対象外」を示す属性を仕込む。
    //   これで Safari/iOS の Password Manager は:
    //     - ログイン成功後の「保存しますか?」を出さない(理論上)
    //     - 漏洩警告ダイアログを出さない(理論上)
    //   主要パスワードマネージャ(1Password, LastPass, Bitwarden 等)も無視。
    //
    //   注意: 既に keychain に保存されている駿河屋エントリに対する漏洩警告は
    //   この処理では消えない。それは iOS 設定 → パスワードから手動削除するしかない。
    //   この処理は「これ以降の保存・記憶を防ぐ」もの。
    //
    //   iOS Safari の挙動上、autocomplete=off は時々無視されるが、複数の属性を
    //   重ねることで多くのケースで抑制できる。
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

    const robustClick = (el) => {
        if (!el) return;
        try { el.click(); } catch (e) {}
        try {
            if (el.tagName === 'A' && el.href && !el.href.startsWith('javascript:')) {
                setTimeout(() => {
                    if (location.href !== el.href) location.href = el.href;
                }, 400);
            }
        } catch (e) {}
        try {
            const rect = el.getBoundingClientRect();
            const x = rect.left + rect.width  / 2;
            const y = rect.top  + rect.height / 2;
            const touchInit = {
                bubbles: true, cancelable: true, view: window,
                clientX: x, clientY: y,
            };
            // Touch イベント(iOS モバイル UI で touchend を待っているハンドラ向け)
            try {
                if (typeof Touch !== 'undefined' && typeof TouchEvent !== 'undefined') {
                    const touch = new Touch({
                        identifier: Date.now(), target: el,
                        clientX: x, clientY: y, screenX: x, screenY: y,
                        pageX: x, pageY: y, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1,
                    });
                    const tInit = {
                        bubbles: true, cancelable: true,
                        touches: [touch], targetTouches: [touch], changedTouches: [touch],
                    };
                    el.dispatchEvent(new TouchEvent('touchstart', tInit));
                    el.dispatchEvent(new TouchEvent('touchend', { ...tInit, touches: [] }));
                }
            } catch (e) { /* iOS Safari では Touch コンストラクタが使えないことがある */ }
            el.dispatchEvent(new MouseEvent('mousedown', touchInit));
            el.dispatchEvent(new MouseEvent('mouseup',   touchInit));
            if (typeof PointerEvent !== 'undefined') {
                el.dispatchEvent(new PointerEvent('pointerdown', touchInit));
                el.dispatchEvent(new PointerEvent('pointerup',   touchInit));
            }
        } catch (e) {}
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
        } catch (e) {}
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ★v0.4.1: ログ機能 (Amazon Bot と同じ仕組み移植)
    //   - localStorage バッファ (最大 300 件、リロード跨ぎ永続)
    //   - logSY(level, category, message, detail) で追加
    //   - level: 'info' | 'warn' | 'error' | 'order-complete'
    //   - 📋 ログボタンで一覧表示 + Discord 送信 + CSV 保存 / コピー / クリア
    //   - Discord 送信は error / warn / order-complete のみ自動 (info は手動)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // HIRO 専用 Discord webhook (Amazon Bot と共通)
    // ★v1.0.0: GitHub 公開配布のため webhook をコード直書きから設定値(端末内)へ移動。
    //   公開リポジトリに秘密情報を置かないための対応(Amazon PC版と同じ方針)。
    const HIRO_SY_WEBHOOK = (CONFIG.discordWebhook || '');

    const LOG_KEY_SY = 'lb_sy_log_buffer';
    const LOG_MAX_SY = 300;
    const LOG_BUFFER_SY = (() => {
        try { return JSON.parse(localStorage.getItem(LOG_KEY_SY) || '[]').slice(-LOG_MAX_SY); }
        catch (e) { return []; }
    })();
    const saveLogSY = () => {
        try { localStorage.setItem(LOG_KEY_SY, JSON.stringify(LOG_BUFFER_SY)); } catch (e) {}
    };
    const _logSyStartedAt = Date.now();
    const logSY = (level, category, message, detail) => {
        try {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const ts = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' +
                       pad(now.getSeconds()) + '.' + String(now.getMilliseconds()).padStart(3, '0');
            const entry = {
                ts: ts,
                perfMs: Date.now() - _logSyStartedAt,
                level: level || 'info',
                category: category || '',
                message: message || '',
                detail: detail || undefined,
            };
            LOG_BUFFER_SY.push(entry);
            if (LOG_BUFFER_SY.length > LOG_MAX_SY) {
                LOG_BUFFER_SY.splice(0, LOG_BUFFER_SY.length - LOG_MAX_SY);
            }
            saveLogSY();
        } catch (e) {}
    };

    // Discord 送信 (Amazon と同じ form-urlencoded + payload_json 方式)
    const sendToDiscordRawSY = async (payload) => {
        const url = HIRO_SY_WEBHOOK;
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
            return { ok: false, reason: 'fetch-err', detail: e.message };
        }
    };

    const renderStopButton = () => {
        if (document.getElementById('lb-sy-stop-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'lb-sy-stop-btn';
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
            clearState();
            setStopped(true);
            // v0.4.0: タイマー interval を停止 + 発火フラグもリセット
            //   (停止後に HIRO が再度開始した時にタイマーを使えるように)
            try {
                if (typeof timerCheckIntervalId !== 'undefined' && timerCheckIntervalId) {
                    clearInterval(timerCheckIntervalId);
                }
                if (typeof timerCountdownIntervalId !== 'undefined' && timerCountdownIntervalId) {
                    clearInterval(timerCountdownIntervalId);
                }
            } catch (e) {}
            clearTimerFired();
            toast('🛑 停止しました(自動進行も停止)', '#d32f2f', 5000);
            try { logSY('info', 'stop', '🛑 停止しました', { url: location.href }); } catch (e) {}
        });
        document.body.appendChild(btn);
    };

    // ★v3.0.0: 端末内設定画面。
    //   Face ID(iOSパスワード自動入力)対応が要件のため、フォームは意図的に
    //   「自動入力が効く」作りにしている:
    //     - <form> でくくる
    //     - ID欄 autocomplete="username" / パスワード欄 autocomplete="current-password"
    //     - 楽天のドメイン上で開くので、iOS キーチェーンに保存済みの駿河屋の
    //       ID/パスワードが候補に出る → Face ID で流し込める
    //   ※ ログイン画面側の入力欄には従来どおり suppressPasswordManager() を適用し、
    //     自動入力ポップアップを抑制する(役割が逆なので混同しないこと)
    const openSettingsPanel = () => {
        if (document.getElementById('lb-sy-settings-ov')) return;
        const cur = loadConfig();
        const esc = (v) => String(v == null ? '' : v)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        const ov = document.createElement('div');
        ov.id = 'lb-sy-settings-ov';
        ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.88);' +
            'overflow:auto;padding:16px;font-family:sans-serif;';
        const L = 'display:block;margin:10px 0 4px;color:#93c5fd;font-size:13px;font-weight:bold;';
        const I = 'width:100%;padding:12px;font-size:16px;border:1px solid #888;border-radius:6px;box-sizing:border-box;';
        ov.innerHTML =
            '<form id="lb-sy-cfgform" style="max-width:520px;margin:0 auto;background:#161616;padding:16px;border-radius:10px;">' +
            '<div style="color:#1e40af;font-size:17px;font-weight:bold;margin-bottom:4px;">⚙ 駿河屋設定</div>' +
            '<div style="color:#bbb;font-size:12px;margin-bottom:10px;">' +
            'ID/パスワードは<b>この端末内だけ</b>に保存されます(配布ファイルには含まれません)。<br>' +
            '入力欄をタップすると Face ID の自動入力が使えます。</div>' +
            '<label style="' + L + '">プロファイル名</label>' +
            '<input id="lb-sy-cf-prof" type="text" style="' + I + '" value="' + esc(cur.profileName) + '">' +
            '<label style="' + L + '">駿河屋ID(メールアドレス)</label>' +
            '<input id="lb-sy-cf-user" name="username" type="text" autocomplete="username" ' +
            'autocapitalize="off" autocorrect="off" spellcheck="false" style="' + I + '" value="' + esc(cur.username) + '">' +
            '<label style="' + L + '">パスワード</label>' +
            '<input id="lb-sy-cf-pass" name="password" type="password" autocomplete="current-password" ' +
            'style="' + I + '" value="' + esc(cur.password) + '">' +
            '<label style="' + L + '">リロード間隔(ミリ秒)</label>' +
            '<input id="lb-sy-cf-int" type="number" style="' + I + '" value="' + esc(cur.reloadInterval) + '">' +
            '<label style="' + L + '">リロード上限(0=無制限)</label>' +
            '<input id="lb-sy-cf-max" type="number" style="' + I + '" value="' + esc(cur.reloadMax) + '">' +
            '<label style="' + L + '">発火時刻(HH:MM、空欄=使わない)</label>' +
            '<input id="lb-sy-cf-hhmm" type="text" placeholder="22:00" style="' + I + '" value="' + esc(cur.timerHHMM) + '">' +
            '<label style="' + L + '">Discord Webhook URL(任意・通知に使用)</label>' +
            '<input id="lb-sy-cf-hook" type="text" autocomplete="off" style="' + I + '" value="' + esc(cur.discordWebhook) + '">' +
            '<label style="margin-top:12px;display:flex;align-items:center;gap:8px;color:#ddd;font-size:14px;">' +
            '<input id="lb-sy-cf-timer" type="checkbox" style="width:20px;height:20px;"' + (cur.timerEnabled ? ' checked' : '') + '>時刻発火を使う</label>' +
            '<label style="margin-top:8px;display:flex;align-items:center;gap:8px;color:#ddd;font-size:14px;">' +
            '<input id="lb-sy-cf-test" type="checkbox" style="width:20px;height:20px;"' + (cur.testMode ? ' checked' : '') + '>テストモード(実際に買わない)</label>' +
            '<button id="lb-sy-cf-save" type="submit" style="width:100%;margin-top:16px;padding:14px;background:#1e40af;' +
            'color:#fff;border:0;border-radius:8px;font-size:16px;font-weight:bold;">💾 保存</button>' +
            '<button id="lb-sy-cf-close" type="button" style="width:100%;margin-top:8px;padding:12px;background:#555;' +
            'color:#fff;border:0;border-radius:8px;font-size:14px;">✕ 閉じる</button>' +
            '</form>';
        document.body.appendChild(ov);
        const close = () => { try { ov.remove(); } catch (e) {} };
        ov.querySelector('#lb-sy-cf-close').onclick = close;
        ov.querySelector('#lb-sy-cfgform').onsubmit = (ev) => {
            ev.preventDefault();
            const g = (id) => (ov.querySelector(id) || {}).value;
            const c = (id) => !!(ov.querySelector(id) || {}).checked;
            const next = {
                profileName:    (g('#lb-sy-cf-prof') || '駿河屋').trim(),
                username:       (g('#lb-sy-cf-user') || '').trim(),
                password:       g('#lb-sy-cf-pass') || '',
                reloadInterval: parseInt(g('#lb-sy-cf-int'), 10) || CONFIG_DEFAULTS.reloadInterval,
                reloadMax:      parseInt(g('#lb-sy-cf-max'), 10) || 0,
                timerHHMM:      (g('#lb-sy-cf-hhmm') || '').trim(),
                timerEnabled:   c('#lb-sy-cf-timer'),
                testMode:       c('#lb-sy-cf-test'),
                debugMode:      !!cur.debugMode,
                discordWebhook: (g('#lb-sy-cf-hook') || '').trim(),
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

    const renderSettingsButton = () => {
        if (document.getElementById('lb-sy-settings-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'lb-sy-settings-btn';
        btn.type = 'button';
        btn.textContent = '⚙';
        btn.onclick = openSettingsPanel;
        Object.assign(btn.style, {
            // v0.3.3: 開始ボタンの少し上(押し間違い防止)に移動。楽天と統一。
            //   駿河屋サイト純正の左上 UI とも分離して扱いやすい位置。
            position: 'fixed', bottom: '180px', right: '20px',
            // v0.3.2: 駿河屋ブランド色(濃紺)。楽天(オレンジ)との視覚的区別。
            background: '#1e40af', color: 'white',
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

    // ★v0.4.1: 📋 ログボタン (バッジ + Discord 送信 + CSV 保存)
    const renderLogButton = () => {
        if (document.getElementById('lb-sy-log-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'lb-sy-log-btn';
        btn.textContent = '📋';
        Object.assign(btn.style, {
            // ⚙ (180px) の上に配置
            position: 'fixed', bottom: '230px', right: '20px',
            background: '#1e40af', color: '#fbbf24',
            border: 'none', borderRadius: '50%',
            width: '40px', height: '40px',
            fontSize: '18px', cursor: 'pointer',
            zIndex: '2147483647',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            fontFamily: 'sans-serif',
        });
        btn.title = 'ログ表示 / 送信 / CSV保存';
        btn.addEventListener('click', openLogOverlaySY);
        document.body.appendChild(btn);
    };

    const openLogOverlaySY = () => {
        try {
            const exist = document.getElementById('lb-sy-log-overlay');
            if (exist) { exist.remove(); return; }
            const ov = document.createElement('div');
            ov.id = 'lb-sy-log-overlay';
            Object.assign(ov.style, {
                position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
                background: 'rgba(0,0,0,0.95)', color: '#9fff9f',
                zIndex: '2147483647', overflowY: 'auto',
                padding: '12px', fontFamily: 'monospace', fontSize: '11px',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            });
            const lines = LOG_BUFFER_SY.slice().reverse().map(e => {
                const d = e.detail ? '\n  ' + JSON.stringify(e.detail).slice(0, 500) : '';
                return `[${e.ts}] ${e.level} ${e.category}: ${e.message}${d}`;
            });
            ov.innerHTML = '<div style="text-align:right;margin-bottom:8px;display:flex;gap:6px;flex-wrap:wrap;">' +
                '<button id="lb-sy-log-close" style="padding:8px 12px;background:#d32f2f;color:#fff;border:0;border-radius:6px;font-size:13px;">✕ 閉じる</button>' +
                '<button id="lb-sy-log-discord-imp" style="padding:8px 12px;background:#5865f2;color:#fff;border:0;border-radius:6px;font-size:13px;">📨 重要のみ</button>' +
                '<button id="lb-sy-log-discord-all" style="padding:8px 12px;background:#3f51b5;color:#fff;border:0;border-radius:6px;font-size:13px;">📨 全件</button>' +
                '<button id="lb-sy-log-csv" style="padding:8px 12px;background:#1e40af;color:#fbbf24;border:0;border-radius:6px;font-size:13px;font-weight:bold;">📥 CSV 保存</button>' +
                '<button id="lb-sy-log-copy" style="padding:8px 12px;background:#1976d2;color:#fff;border:0;border-radius:6px;font-size:13px;">📋 コピー</button>' +
                '<button id="lb-sy-log-clear" style="padding:8px 12px;background:#757575;color:#fff;border:0;border-radius:6px;font-size:13px;">🗑 クリア</button>' +
                '</div>' +
                '<div id="lb-sy-log-content">' + (lines.length ? lines.join('\n\n') : '(ログなし)') + '</div>';
            document.body.appendChild(ov);

            document.getElementById('lb-sy-log-close').addEventListener('click', () => ov.remove());
            document.getElementById('lb-sy-log-copy').addEventListener('click', () => {
                try {
                    navigator.clipboard.writeText(lines.join('\n\n'));
                    toast('📋 ログをクリップボードにコピー', '#388e3c', 3000);
                } catch (e) { toast('コピー失敗: ' + e.message, '#d32f2f', 5000); }
            });
            document.getElementById('lb-sy-log-clear').addEventListener('click', () => {
                if (!confirm('ログを全消去しますか?')) return;
                LOG_BUFFER_SY.length = 0;
                saveLogSY();
                document.getElementById('lb-sy-log-content').textContent = '(クリア済み)';
            });

            // CSV 保存
            document.getElementById('lb-sy-log-csv').addEventListener('click', () => {
                try {
                    const csvEscape = (v) => {
                        if (v === null || v === undefined) return '';
                        const s = String(v);
                        if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
                        return s;
                    };
                    const header = ['timestamp', 'perfMs', 'level', 'tag', 'message', 'data'].join(',');
                    const rows = LOG_BUFFER_SY.map((e) => {
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
                    const csvBody = '﻿' + header + '\n' + rows.join('\n');
                    const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const pad = (n) => String(n).padStart(2, '0');
                    const now = new Date();
                    const fname = 'gundambot-surugaya-log-' +
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
                    toast(`📥 ${fname}\n${LOG_BUFFER_SY.length} 件、CSV 保存`, '#388e3c', 4000);
                } catch (e) {
                    toast('CSV 保存失敗: ' + (e && e.message ? e.message : e), '#d32f2f', 5000);
                }
            });

            // Discord 送信 (重要のみ / 全件)
            const sendLogsToDiscordSY = async (filterImportantOnly) => {
                if (!HIRO_SY_WEBHOOK) {
                    toast('📨 webhook URL 未設定', '#d32f2f', 5000);
                    return;
                }
                // 統計集計
                const stats = { error: 0, warn: 0, info: 0, other: 0 };
                for (const e of LOG_BUFFER_SY) {
                    if (e.level === 'error') stats.error++;
                    else if (e.level === 'warn') stats.warn++;
                    else if (e.level === 'info') stats.info++;
                    else stats.other++;
                }
                const total = LOG_BUFFER_SY.length;
                const targetEntries = filterImportantOnly
                    ? LOG_BUFFER_SY.filter(e =>
                        e.level === 'error' || e.level === 'warn' || e.level === 'order-complete')
                    : LOG_BUFFER_SY;
                if (!targetEntries.length) {
                    toast(`📨 送信対象ログなし (全 ${total} 件)`, '#f57c00', 4000);
                    return;
                }
                const targetLines = targetEntries.map(e => {
                    const d = e.detail ? '\n  ' + JSON.stringify(e.detail).slice(0, 1500) : '';
                    return `[${e.ts}] ${e.level} ${e.category}: ${e.message}${d}`;
                });

                // 2000 文字制限を考慮して分割送信
                const MAX_PAYLOAD = 1900;
                const chunks = [];
                let current = '';
                for (const line of targetLines) {
                    if ((current + '\n' + line).length > MAX_PAYLOAD) {
                        if (current) chunks.push(current);
                        current = line;
                    } else {
                        current = current ? current + '\n\n' + line : line;
                    }
                }
                if (current) chunks.push(current);

                toast(`📨 駿河屋ログ送信中... ${targetEntries.length}件 / ${chunks.length}通`, '#1976d2', 4000);
                // 統計サマリ最初に送信
                const summary = '[駿河屋] ログ送信開始 ' + new Date().toLocaleString('ja-JP') +
                    ` 合計 ${total} 件 (error:${stats.error} / warn:${stats.warn} / info:${stats.info})` +
                    ` v${SCRIPT_VERSION} / 送信対象: ${filterImportantOnly ? '重要のみ' : '全件'} ${targetEntries.length} 件 / ${chunks.length} 通に分割`;
                await sendToDiscordRawSY({
                    username: 'GUNDAMBOT 駿河屋',
                    content: summary,
                });
                for (let i = 0; i < chunks.length; i++) {
                    const block = chunks[i];
                    const payload = {
                        username: 'GUNDAMBOT 駿河屋',
                        content: `[駿河屋] ${filterImportantOnly ? '重要' : '全件'} (${i + 1}/${chunks.length})\n\`\`\`\n${block}\n\`\`\``,
                    };
                    const res = await sendToDiscordRawSY(payload);
                    if (!res.ok) {
                        toast(`📨 送信失敗 (${i + 1}/${chunks.length}): ${res.reason}`, '#d32f2f', 8000);
                        return;
                    }
                    await new Promise(r => setTimeout(r, 500)); // rate limit 対策
                }
                toast(`📨 駿河屋ログ送信完了 ${targetEntries.length} 件 / ${chunks.length} 通`, '#388e3c', 5000);
            };
            document.getElementById('lb-sy-log-discord-imp').addEventListener('click', () => sendLogsToDiscordSY(true));
            document.getElementById('lb-sy-log-discord-all').addEventListener('click', () => sendLogsToDiscordSY(false));
        } catch (e) {
            toast('ログ画面表示失敗: ' + e.message, '#d32f2f', 5000);
        }
    };

    // 駿河屋固有の画面判定(バッジに表示用)
    const detectScreen = () => {
        const path = location.pathname;
        if (path.includes('/product/detail')) return 'PRODUCT';
        if (path === '/cargo/detail' || path.startsWith('/cargo/detail')) return 'CART';
        if (path === '/cargo/order1' || path.startsWith('/cargo/order1')) return 'ORDER1';
        if (path === '/cargo/order2' || path.startsWith('/cargo/order2')) return 'ORDER2(CONFIRM)';
        if (path.includes('/cargo/order_complete')) return 'COMPLETE';
        if (path.includes('/pcmypage')) return 'LOGIN';
        if (path.includes('/smpmypage')) return 'MYPAGE(自動遷移中)';
        return 'OTHER';
    };

    const renderVersionBadge = () => {
        let badge = document.getElementById('lb-sy-version-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'lb-sy-version-badge';
            Object.assign(badge.style, {
                // v0.3.3: ⚙ ボタンが右下に移動したので、バッジを左上いっぱいに上げる
                position: 'fixed', top: '8px', left: '8px',
                // v0.3.2: 駿河屋ブランド色(濃紺背景 + 黄色文字)。楽天バッジ(R赤)と区別。
                background: '#1e40af', color: '#fbbf24',
                padding: '8px 12px', borderRadius: '6px',
                fontSize: '11px', fontFamily: 'monospace',
                zIndex: '2147483646', maxWidth: '70vw',
                whiteSpace: 'pre-wrap',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                lineHeight: '1.3',
            });
            document.body.appendChild(badge);
        }
        const profile = CONFIG.profileName || '(no profile)';
        const stop = isStopped() ? '⛔停止中' : '▶監視中';
        const screen = detectScreen();
        if (!CONFIG.debugMode) {
            badge.textContent =
                `v${SCRIPT_VERSION} ${stop}\n` +
                `profile: ${profile}\n` +
                `screen: ${screen}`;
            return;
        }
        // 詳細モード
        const stateNow = getState() || '-';
        const sid = getSessionId().slice(0, 6);
        badge.textContent =
            `v${SCRIPT_VERSION} ${stop}\n` +
            `profile: ${profile}\n` +
            `screen: ${screen}\n` +
            `state: ${stateNow}\n` +
            `sid: ${sid}\n` +
            `host: ${location.host}\n` +
            `path: ${location.pathname}`;
    };

    const startBadgeUpdater = () => {
        renderVersionBadge();
        setInterval(renderVersionBadge, 1000);
    };

    // 開始ボタン(テスト=黄色 #fbbf24 / 本番=駿河屋青 #1e40af)
    //   v0.3.2: 駿河屋ブランドカラー(青と黄色)に変更。楽天(赤・オレンジ)と
    //   サイトを開いた瞬間に視覚的に区別できるようにする。
    const renderStartButton = () => {
        if (document.getElementById('lb-sy-start-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'lb-sy-start-btn';
        Object.assign(btn.style, {
            position: 'fixed', bottom: '100px', right: '20px',
            border: 'none', borderRadius: '32px',
            padding: '14px 22px',
            color: 'white', fontSize: '16px', fontWeight: 'bold',
            cursor: 'pointer', zIndex: '2147483647',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            fontFamily: 'sans-serif',
        });
        // v0.3.4: 開始ボタンの色を元に戻す(HIRO の長期慣れに合わせる)
        //   テスト=オレンジ #f57c00、本番購入=緑 #2e7d32
        //   サイト判別はバッジ色とサイト純正のロゴで行えば十分。
        //   開始/テストボタンを間違えて押す事故を最優先で防ぐため、慣れた配色を維持。
        if (CONFIG.testMode) {
            btn.textContent = '🧪 テスト';
            btn.style.background = '#f57c00';
            btn.style.color = 'white';
        } else {
            btn.textContent = '🛒 購入';
            btn.style.background = '#2e7d32';
            btn.style.color = 'white';
        }
        btn.addEventListener('click', startPurchase);
        document.body.appendChild(btn);
    };

    const removeStartButton = () => {
        const b = document.getElementById('lb-sy-start-btn');
        if (b) b.remove();
    };

    // ───────────────────────────────────────────────
    // 状態定数
    // ───────────────────────────────────────────────
    const ST_PURCHASING = 'PURCHASING';   // 購入フロー進行中
    const ST_CART_DONE  = 'CART_DONE';    // カート追加完了、/cargo/detail 待ち
    const ST_ORDER1_OK  = 'ORDER1_OK';    // 住所/銀行入力完了、確認画面へ進む
    const ST_TEST_DONE  = 'TEST_DONE';    // テストモードで停止

    // ───────────────────────────────────────────────
    // 中古検出(共通)
    //   - 駿河屋はキャンセル不可なので、3 段階で「中古」が混ざっていないか検証
    // ───────────────────────────────────────────────
    const containsUsedKeyword = (text) => {
        if (!text) return false;
        // 「中古」だけ含まれていればアウト。「新品」「予約」は安全リスト
        return text.includes('中古');
    };

    // ───────────────────────────────────────────────
    // 商品ページ: 「新品」or「予約」ラジオを選択する
    //   PC 版 v4.49 と同じロジック:
    //   - 新品 最優先
    //   - 新品なし → 予約
    //   - 中古しかない → 中止
    //
    // v0.1.3: 「新品を選択して、絶対」(HIRO) — 駿河屋はキャンセル不可で誤発注時のリスクが
    //   楽天より深刻なため、選択処理を強化:
    //     1. 既に checked でも click を強制発火(synthetic event の取りこぼし対策)
    //     2. click が効かない環境で .checked = true を直接設定するフォールバック
    //     3. 設定後に r.checked を再検証、失敗ならエラー返却
    // ───────────────────────────────────────────────
    const forceSelectRadio = (r) => {
        // ① 通常 click (UI 上のラジオ選択ロジックを通す)
        try {
            r.click();
        } catch (e) {}
        // ② change/input イベント発火(フレームワークの onChange 対策)
        try {
            r.dispatchEvent(new Event('change', { bubbles: true }));
            r.dispatchEvent(new Event('input',  { bubbles: true }));
        } catch (e) {}
        // ③ それでも checked にならなければ直接設定
        if (!r.checked) {
            try {
                r.checked = true;
                r.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (e) {}
        }
        return r.checked;
    };

    const selectGradeRadio = () => {
        const radios = document.querySelectorAll('input[type="radio"][name="grade"]');
        if (!radios || radios.length === 0) {
            // ラジオがない場合 = 単一商品(新品のみ等)。続行可
            return { ok: true, label: '(no radio)' };
        }

        // ── 「新品」を最優先で強制選択 ──
        for (const r of radios) {
            const label = r.closest('label, tr, div, li')?.innerText || '';
            // 「新品」を含み、かつ「中古」を含まない(誤検出防止)
            if (label.includes('新品') && !label.includes('中古')) {
                const ok = forceSelectRadio(r);
                if (!ok) {
                    return { ok: false, label: '新品ラジオの選択に失敗' };
                }
                return { ok: true, label: '新品' };
            }
        }

        // ── 「予約」次点 ──
        for (const r of radios) {
            const label = r.closest('label, tr, div, li')?.innerText || '';
            if (label.includes('予約') && !label.includes('中古')) {
                const ok = forceSelectRadio(r);
                if (!ok) {
                    return { ok: false, label: '予約ラジオの選択に失敗' };
                }
                return { ok: true, label: '予約' };
            }
        }

        // 中古しかない
        return { ok: false, label: '新品/予約なし(中古のみ)' };
    };

    // ───────────────────────────────────────────────
    // 二重検証: 「中古が選択されていない」「新品 or 予約 が選択されている」
    //   selectGradeRadio が成功を返しても念のため再走査して確認。
    //   駿河屋はキャンセル不可なので、ここで一段重ねて誤購入を防ぐ。
    // ───────────────────────────────────────────────
    const verifyGradeNotUsed = () => {
        const radios = document.querySelectorAll('input[type="radio"][name="grade"]');
        if (!radios || radios.length === 0) {
            return { ok: true, reason: 'no-radio' };
        }
        let selectedLabel = '';
        for (const r of radios) {
            if (r.checked) {
                const label = r.closest('label, tr, div, li')?.innerText || '';
                if (label.includes('中古')) {
                    return { ok: false, reason: '🚨 中古が選択されている' };
                }
                if (label.includes('新品')) selectedLabel = '新品';
                else if (label.includes('予約')) selectedLabel = '予約';
                else selectedLabel = label.slice(0, 20);
            }
        }
        if (!selectedLabel) {
            return { ok: false, reason: 'どのラジオも選択されていない' };
        }
        if (selectedLabel !== '新品' && selectedLabel !== '予約') {
            return { ok: false, reason: `想定外の選択: ${selectedLabel}` };
        }
        return { ok: true, reason: selectedLabel };
    };

    // ───────────────────────────────────────────────
    // 購入開始(🧪テスト/🛒購入ボタン押下時)
    // ───────────────────────────────────────────────
    const startPurchase = async () => {
        // 既に進行中ならスキップ
        if (getState() && !isStopped()) {
            toast('⚠️ 既に進行中です。停止ボタンで止めてから再開してください', '#f57c00', 4000);
            return;
        }

        // 新セッション開始(別タブ暴走対策の sid 更新)
        renewSessionId();
        setStopped(false);
        // v0.4.0: 手動で開始した場合、タイマーは無効化(競合防止)
        try {
            if (typeof timerCheckIntervalId !== 'undefined' && timerCheckIntervalId) {
                clearInterval(timerCheckIntervalId);
            }
            if (typeof timerCountdownIntervalId !== 'undefined' && timerCountdownIntervalId) {
                clearInterval(timerCountdownIntervalId);
            }
        } catch (e) {}
        clearTimerFired();

        const screen = detectScreen();
        if (screen !== 'PRODUCT') {
            toast('⚠️ 商品ページではありません', '#d32f2f', 4000);
            return;
        }

        toast(`▶ ${CONFIG.testMode ? 'テスト' : '購入'}フロー開始`, '#388e3c', 3000);
        await attemptPurchase();
    };

    // ───────────────────────────────────────────────
    // ───────────────────────────────────────────────
    // v0.3.5: 新品/予約が無い・カートボタンが無い時のリロード待機
    //   楽天 v2.9.19 の reload 仕組みを駿河屋に移植。
    //   - 駿河屋でも「予約商品の販売開始待ち」「在庫復活待ち」のニーズがある
    //   - 中古しか出ていない時もリロードして新品入荷を待つ(HIRO 運用)
    //   - reloadInterval ms 後に location.reload()、reloadMax 回まで
    //   - 停止ボタンが押されたらリロードしない
    //   - キャンセル不可リスクは verifyGradeNotUsed 二重検証で守る
    // ───────────────────────────────────────────────
    const scheduleReloadForWait = (reason) => {
        const interval = CONFIG.reloadInterval;
        const max      = CONFIG.reloadMax;
        let count = parseInt(localStorage.getItem(KEY_RELOAD_COUNT) || '0', 10);

        if (count >= max) {
            toast(`❌ ${max}回リロードしても${reason}\n停止します`, '#d32f2f', 10000);
            clearState();
            return;
        }

        count++;
        localStorage.setItem(KEY_RELOAD_COUNT, String(count));
        localStorage.setItem(KEY_WAITING, '1');

        toast(`⏳ ${reason}(${count}/${max})… ${interval}ms 後にリロード`,
              '#7b1fa2', Math.max(1500, interval - 300));

        setTimeout(() => {
            if (isStopped()) return;
            location.reload();
        }, interval);
    };

    // ───────────────────────────────────────────────
    // v0.4.0: タイマー機能(時刻指定発火)
    //   仕様(HIRO 確認済):
    //   - 時刻入力は時:分のみ(設定ページで指定、デフォルト 21:00)
    //   - 過ぎた時刻は発火しない(誤発火防止)
    //   - 時刻ピッタリで発火(0秒オフセット)
    //   - 発火後はタイマーを自動 OFF (LB_SY_TIMER_FIRED_V1 フラグでロック)
    //   - 発火時の動作: KEY_WAITING を立てて location.reload()
    //     → リロード後に商品ページの isWaiting() で attemptPurchase が自動再開
    //   - デフォルト OFF (CONFIG.timerEnabled = false)
    //
    //   注意: スマホでブラウザ開きっぱなし運用が前提。
    //   日付指定はなし(HIRO 運用上不要)。
    // ───────────────────────────────────────────────
    const KEY_TIMER_FIRED = 'LB_SY_TIMER_FIRED_V1';

    // タイマーが既に発火済みか
    const isTimerFired = () => localStorage.getItem(KEY_TIMER_FIRED) === '1';
    const markTimerFired = () => localStorage.setItem(KEY_TIMER_FIRED, '1');
    const clearTimerFired = () => localStorage.removeItem(KEY_TIMER_FIRED);

    // 設定時刻 (HH:MM) → 今日のその時刻のミリ秒タイムスタンプを返す
    //   過ぎた時刻なら null を返す(発火しない)
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
        // 過ぎた時刻なら null(誤発火防止、HIRO 仕様)
        if (target.getTime() <= now.getTime()) return null;
        return target.getTime();
    };

    // タイマーチェッカー: 商品ページで起動するタイマー監視
    //   定期的に時刻チェックして、設定時刻になったら発火
    let timerCheckIntervalId = null;
    let timerCountdownIntervalId = null;

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

        // バッジに残り時間を 1 秒ごとに表示
        if (timerCountdownIntervalId) clearInterval(timerCountdownIntervalId);
        timerCountdownIntervalId = setInterval(() => {
            updateTimerBadge(targetMs);
        }, 1000);
        updateTimerBadge(targetMs);

        // 定期チェック: 1秒ごとに時刻判定
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
        }, 250);   // 250ms 間隔でチェック(時刻ピッタリ精度を上げる)
    };

    const fireTimer = () => {
        if (isStopped()) return;
        if (isTimerFired()) return;
        markTimerFired();   // 発火フラグを立てる(再発火防止)

        toast(`🔔 タイマー発火! ${CONFIG.timerHHMM}\nリロードして購入を開始します`,
              '#2e7d32', 4000);

        // KEY_WAITING を立てて location.reload()
        // リロード後の商品ページで isWaiting() により attemptPurchase が自動実行される
        localStorage.setItem(KEY_WAITING, '1');
        // RELOAD_COUNT は 0 から始める(タイマー発火後の最初のリロード)
        localStorage.removeItem(KEY_RELOAD_COUNT);

        // わずかに遅延させてトーストを見せる
        setTimeout(() => {
            if (isStopped()) return;
            location.reload();
        }, 500);
    };

    const formatRemain = (sec) => {
        if (sec < 0) sec = 0;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${m}:${String(s).padStart(2, '0')}`;
    };

    const updateTimerBadge = (targetMs) => {
        const badge = document.getElementById('lb-sy-version-badge');
        if (!badge) return;
        const remainSec = Math.floor((targetMs - Date.now()) / 1000);
        const stop = isStopped() ? '⛔停止中' : '▶監視中';
        const timerLine = `\n⏰ ${CONFIG.timerHHMM} (あと ${formatRemain(remainSec)})`;
        badge.textContent =
            `v${SCRIPT_VERSION} ${stop}\n` +
            `state: ${getState() || 'idle'}` +
            timerLine;
    };

    // ───────────────────────────────────────────────
    // 購入試行: 商品ページでラジオ選択 → カートボタン
    // ───────────────────────────────────────────────
    const attemptPurchase = async () => {
        if (isStopped()) {
            toast('🛑 停止中', '#d32f2f', 3000);
            return;
        }

        const grade = selectGradeRadio();
        if (!grade.ok) {
            // v0.3.5: 中古のみ表示等で新品/予約が選べない場合、リロードして在庫変動を待つ
            //   (HIRO 運用: 予約商品の販売開始待ち / 新品入荷待ち)
            //   ただし、ラジオ選択そのものに失敗した場合(DOM 異常)は停止する。
            if (grade.label === '新品/予約なし(中古のみ)') {
                toast(`⏳ 新品/予約なし(中古のみ)→ リロード待機`, '#7b1fa2', 4000);
                scheduleReloadForWait('新品/予約が出ません');
                return;
            }
            // 「新品ラジオの選択に失敗」「予約ラジオの選択に失敗」等の DOM 異常は停止
            toast(`❌ ${grade.label} → 停止`, '#d32f2f', 8000);
            clearState();
            setStopped(true);
            return;
        }

        // ラジオ選択に成功した = 中古ではない状態が確定 → カウンタリセット
        localStorage.removeItem(KEY_RELOAD_COUNT);
        localStorage.removeItem(KEY_WAITING);

        // ── 二重検証: 中古が選択されていないこと、新品/予約が選択されていることを再確認 ──
        // selectGradeRadio が成功を返しても、この時点で実際の DOM がどうなっているかを
        // もう一度走査して確認する。駿河屋はキャンセル不可なので、二段階で誤発注を防ぐ。
        await sleep(150); // ラジオ change の伝播待ち
        const verify = verifyGradeNotUsed();
        if (!verify.ok) {
            toast(`🚨 ${verify.reason}\n誤発注防止のため停止します`, '#d32f2f', 12000);
            clearState();
            setStopped(true);
            return;
        }

        toast(`✓ 種類: ${verify.reason}(検証済)`, '#388e3c', 2500);
        await sleep(100); // v0.3.0 高速化: 300→100

        // カートボタン候補を順番に試す。見つかったら matchedIdx を残して診断に出す。
        // PC 版 v4.49 + モバイル想定の幅広いセレクタで網羅。
        const candidates = [
            ['form-submit-cart',     () => document.querySelector('form[action*="cart"] input[type="submit"]')],
            ['form-submit-buy',      () => document.querySelector('form[action*="buy"] input[type="submit"]')],
            ['btn_buy.cart1',        () => document.querySelector('button.btn_buy.cart1, a.btn_buy.cart1')],
            ['btn_buy',              () => document.querySelector('button.btn_buy, a.btn_buy')],
            ['name=cart_in',         () => document.querySelector("button[name='cart_in'], input[name='cart_in']")],
            ['input-value=カート',   () => document.querySelector('input[type="submit"][value*="カート"]')],
            ['text=カートに入れる',  () => findByText('button, a, input[type="submit"], input[type="button"]', 'カートに入れる')],
            ['class*=cart-text',     () => findByText('[class*="cart"], [class*="buy"], [class*="Cart"], [class*="Buy"]', 'カートに入れる')],
            ['onclick=carttext',     () => findByText('[onclick]', 'カートに入れる')],
            ['any=カートに入れる',   () => findByText('*', 'カートに入れる')],
        ];

        let cartBtn = null;
        let matchedLabel = '';
        for (const [label, fn] of candidates) {
            try {
                const el = fn();
                if (el) { cartBtn = el; matchedLabel = label; break; }
            } catch (e) {}
        }

        if (!cartBtn) {
            // v0.3.5: カートボタンが無い = 販売前 / 品切れ → リロードして再挑戦
            //   楽天 v2.9.19 と同じ仕組み。reloadMax で上限。
            toast('⏳ カートボタン未出現 → リロード待機', '#7b1fa2', 4000);
            scheduleReloadForWait('カートボタンが出ません');
            return;
        }

        // 診断: 見つかった要素の素性をトーストに出す(常時表示 = 初版なので)
        const tag = cartBtn.tagName;
        const id  = cartBtn.id || '';
        const cls = (cartBtn.className || '').toString().slice(0, 50);
        const val = (cartBtn.value || '').slice(0, 30);
        const txt = (cartBtn.innerText || '').trim().slice(0, 30);
        toast(
            `🔍 ボタン検出 [${matchedLabel}]\n<${tag}> id="${id}" class="${cls}"\nvalue="${val}" text="${txt}"`,
            '#1976d2', 6000
        );

        setState(ST_PURCHASING);
        localStorage.setItem(KEY_PRODUCT_URL, location.href);
        localStorage.setItem(KEY_START_TS, String(Date.now()));

        const beforeUrl = location.href;
        await sleep(400); // v0.3.0 高速化: 1500→400(診断短縮)

        toast('▶ カートに入れます(1回のみ)', '#1976d2', 2500);

        // ★ v0.1.6: カートボタンには el.click() 1 回だけ。
        //   robustClick だと touchend/mouseup/pointerup/click を全部 dispatch して
        //   駿河屋の AJAX ハンドラが複数回呼ばれ「カート2回押下」が発生する。
        //   駿河屋はキャンセル不可なので二重発注を絶対防ぐ。
        try {
            cartBtn.click();
        } catch (e) {
            toast(`❌ クリック失敗: ${e.message}`, '#d32f2f', 8000);
            return;
        }

        // ★ v0.1.8: 駿河屋のカート追加は AJAX で完了するだけで、/cargo/detail に自動
        //   遷移しない仕様。v0.1.7 までは「待つだけ」で何も起きず止まっていた。
        //   修正: カート追加成功を確認したら、自分で /cargo/detail へ遷移する。
        //   遷移は href ベース(駿河屋のサイト純正カートアイコン a タグ)を最優先、
        //   見つからなければ直接 location.href = '/cargo/detail' にする。

        // クリック前のカートカウンタを記録(後で増加チェック)
        const readCartCount = () => {
            // 駿河屋のカートアイコン横のバッジ(数字)を網羅的に探す
            const candidates = [
                () => document.querySelector('.cart_count, .cart-count, .cartCount'),
                () => document.querySelector('[class*="cart"][class*="count"]'),
                () => document.querySelector('[class*="cart"][class*="num"]'),
                () => document.querySelector('a[href*="cargo/detail"] [class*="badge"]'),
                () => document.querySelector('a[href*="cargo/detail"] [class*="count"]'),
                () => document.querySelector('a[href*="cargo/detail"] .num'),
                () => {
                    // カートアイコンの a タグ内のテキストから数字を抽出
                    const a = document.querySelector('a[href*="cargo/detail"]');
                    if (!a) return null;
                    const m = a.textContent.match(/\b(\d+)\b/);
                    return m ? m[1] : null;
                },
            ];
            for (const fn of candidates) {
                try {
                    const r = fn();
                    if (typeof r === 'string') return parseInt(r, 10) || 0;
                    if (r && r.textContent) {
                        const m = r.textContent.match(/\d+/);
                        if (m) return parseInt(m[0], 10) || 0;
                    }
                } catch (e) {}
            }
            return null; // 取得不能
        };
        const beforeCartCount = readCartCount();

        // カートページへの遷移先を決める(駿河屋のカートアイコンの href を優先)
        const findCartPageUrl = () => {
            const a = document.querySelector('a[href*="/cargo/detail"]');
            if (a && a.href) return a.href;
            return location.origin + '/cargo/detail';
        };

        // 1.8 秒後: カート追加成功を確認して /cargo/detail へ遷移
        setTimeout(() => {
            const afterCount = readCartCount();
            const cartIncreased = beforeCartCount !== null && afterCount !== null && afterCount > beforeCartCount;
            // カウンタが取得できないサイト構造でも、デフォルトで遷移を試みる
            // (カート追加 click は走っており、駿河屋の AJAX は通常成功する)
            if (cartIncreased) {
                toast(`✅ カートに追加(${beforeCartCount}→${afterCount})、カートページへ`, '#388e3c', 3000);
            } else if (beforeCartCount === null) {
                // カウンタを読めなかった = サイト構造が想定外。それでも遷移は試す。
                toast(`▶ カートページへ移動します`, '#1976d2', 3000);
            } else {
                // カウンタは読めたが増えていない = AJAX まだ処理中の可能性。少し待ってから遷移。
                toast(`▶ カートページへ移動します(処理待ち)`, '#1976d2', 3000);
            }
            // /cargo/detail へ遷移(カート追加完了後の正常フロー)
            // setState(ST_CART_DONE) は handleCart() 側で行うので、ここでは ST_PURCHASING のまま
            location.href = findCartPageUrl();
        }, 700); // v0.3.0 高速化: 1800→700

        // 6秒の安全網: もし上記の遷移が何らかの理由で効かなかった場合の通知のみ。
        // 自動再試行・再クリックは絶対しない(駿河屋はキャンセル不可)。
        setTimeout(() => {
            if (location.pathname.includes('/product/detail')) {
                toast(
                    `ℹ️ カートページに移動できませんでした。\n` +
                    `右上の🛒アイコンをタップして手動でカートを開いてください。`,
                    '#1976d2', 12000
                );
            }
        }, 6000);
    };

    // ───────────────────────────────────────────────
    // /cargo/detail (カートページ) 処理
    //   - tr.item p.item_condition で「中古」検出 → 即停止
    //   - 注文画面に進むボタン(a[href='/cargo/order1']) をクリック
    // ───────────────────────────────────────────────
    const handleCart = async () => {
        if (isStopped()) return;
        const st = getState();
        if (!st) {
            // state なし = HIRO が手動でカート画面開いただけ → 何もしない
            return;
        }
        if (st !== ST_PURCHASING) {
            // フロー外の state → 何もしない(別タブ等)
            return;
        }

        toast('▶ カート確認中', '#1976d2', 2500);
        await sleep(300); // v0.3.0 高速化: 800→300

        // 中古検出(第1防衛ライン)
        const items = document.querySelectorAll('tr.item');
        if (items.length === 0) {
            toast('⚠️ カートが空です。商品ページから再度実行してください', '#f57c00', 6000);
            clearState();
            return;
        }

        for (const item of items) {
            const cond = item.querySelector('p.item_condition');
            const condText = cond ? cond.innerText : '';
            if (containsUsedKeyword(condText)) {
                toast('🚨 カート内に中古を検出。停止しました', '#d32f2f', 8000);
                try { logSY('warn', 'cart-used-detected', '🚨 カート内に中古を検出 → 停止',
                    { url: location.href }); } catch (e) {}
                clearState();
                setStopped(true);
                // ※ カート削除は UserScript からは行わない(複雑+リスク)。手動削除推奨。
                return;
            }
        }

        toast('✓ 中古なし、注文画面へ', '#388e3c', 2000);
        try { logSY('info', 'cart-ok', '✓ 中古なし、注文画面へ', { url: location.href }); } catch (e) {}
        setState(ST_CART_DONE);

        // 注文画面に進むリンク
        const proceedLink =
            document.querySelector("a[href='/cargo/order1']") ||
            document.querySelector("a[href*='/cargo/order1']") ||
            findByText('a, button', '注文画面に進む') ||
            findByText('a, button', '購入手続き');

        if (!proceedLink) {
            toast('❌ 注文画面に進むボタンが見つかりません', '#d32f2f', 6000);
            return;
        }
        await sleep(150); // v0.3.0 高速化: 500→150
        robustClick(proceedLink);
    };

    // ───────────────────────────────────────────────
    // /cargo/order1 (注文画面) 処理
    //   - 住所 input[name='address'][value='registered_address'] チェック
    //   - 銀行振込ラジオ選択
    //   - 三井住友銀行 select
    //   - 「ご注文内容の確認へ」ボタンクリック
    // ───────────────────────────────────────────────
    const handleOrder1 = async () => {
        if (isStopped()) return;
        const st = getState();
        if (!st) return;

        // state リカバリ: ORDER1_OK で /cargo/order1 に居る = 前回 submit が拒否された
        //   → 自動的に状態をクリアして停止。HIRO に商品ページから再開してもらう。
        if (st === ST_ORDER1_OK) {
            toast(
                '⚠️ 注文画面の入力に失敗していました。\n' +
                'バリデーションエラーが出ているはず。\n' +
                '状態をリセットして停止します。商品ページから再開してください。',
                '#d32f2f', 12000
            );
            clearState();
            setStopped(true);
            return;
        }

        if (st !== ST_CART_DONE && st !== ST_PURCHASING) return;

        toast('▶ 注文画面確認中', '#1976d2', 2500);
        try { logSY('info', 'order1', '▶ 注文画面確認中', { url: location.href }); } catch (e) {}

        // モバイル SPA で要素が遅延描画される可能性に備えて少し待機
        await sleep(300); // v0.3.0 高速化: 800→300

        // ログイン状態の判定:
        //   PC 版 v4.49 で確認済み: 登録済み住所ラジオ
        //   `input[name='address'][value='registered_address']` が存在 = ログイン済み。
        //   存在しない = ゲスト or 未ログイン状態。
        const addrRadio = document.querySelector(
            "input[name='address'][value='registered_address']"
        );
        const isLoggedIn = !!addrRadio;

        if (!isLoggedIn) {
            // 未ログイン → サインインリンクを多角的に探す
            const signinCandidates = [
                ['a[href callback]',     () => document.querySelector("a[href*='/pcmypage?callback=/cargo/order1']")],
                ['a[href callback /]',   () => document.querySelector("a[href*='/pcmypage/?callback=/cargo/order1']")],
                ['a[href pcmypage+cb]',  () => document.querySelector("a[href*='/pcmypage'][href*='callback']")],
                ['a[href pcmypage]',     () => document.querySelector("a[href*='/pcmypage']")],
                ['onclick=pcmypage',     () => document.querySelector("[onclick*='pcmypage']")],
                ['text=マイページにサインイン', () => findByText('a, button, [role="button"], div, span', 'マイページにサインイン')],
                ['text=サインイン',       () => findByText('a, button, [role="button"]', 'サインイン')],
            ];

            let signinLink = null;
            let signinMatchedLabel = '';
            for (const [label, fn] of signinCandidates) {
                try {
                    const el = fn();
                    if (el) { signinLink = el; signinMatchedLabel = label; break; }
                } catch (e) {}
            }

            if (signinLink) {
                const tag = signinLink.tagName;
                const cls = (signinLink.className || '').toString().slice(0, 40);
                const txt = (signinLink.innerText || '').trim().slice(0, 30);
                toast(
                    `🔑 サインイン要 [${signinMatchedLabel}]\n<${tag}> class="${cls}"\ntext="${txt}"`,
                    '#f57c00', 5000
                );
                await sleep(400); // v0.3.0 高速化: 1500→400(診断短縮)
                // state はそのまま保持(/cargo/order1 に戻ってきた時に再開できる)
                robustClick(signinLink);
                return;
            }

            // サインインボタン見つからず → ゲスト購入は対応しないので停止
            toast(
                '❌ 未ログインかつサインインボタンも見つからず。\n' +
                'ゲスト購入には対応していません。停止します。',
                '#d32f2f', 12000
            );
            clearState();
            setStopped(true);
            return;
        }

        // ── ここからログイン済み前提のフォーム入力 ──

        // 「ご注文内容の確認へ」ボタンが出るまで待つ(JS 生成待ち)
        const submitBtn = await waitForSelector(
            "input[type='submit']#edit-submit, " +
            "input[type='submit'][value='ご注文内容の確認へ']",
            15000
        );
        if (!submitBtn) {
            toast('❌ 注文画面のボタンが現れませんでした', '#d32f2f', 8000);
            return;
        }

        // 住所: registered_address(登録済み住所) を選択
        if (addrRadio && !addrRadio.checked) {
            addrRadio.click();
            await sleep(200);
        }

        // 支払い: 「銀行振込」を選択
        const paymentRadios = document.querySelectorAll("input[type='radio'][name*='payment']");
        for (const r of paymentRadios) {
            const label = r.closest('label, tr, div, li')?.innerText || '';
            if (label.includes('銀行振込')) {
                if (!r.checked) {
                    r.click();
                    r.dispatchEvent(new Event('change', { bubbles: true }));
                }
                break;
            }
        }
        await sleep(150); // v0.3.0 高速化: 500→150

        // 銀行: 三井住友
        const selects = document.querySelectorAll('select');
        for (const sel of selects) {
            const opts = Array.from(sel.options).map(o => o.text).join(',');
            if (opts.includes('三井住友')) {
                const cur = sel.options[sel.selectedIndex]?.text || '';
                if (!cur.includes('三井住友')) {
                    for (const o of sel.options) {
                        if (o.text.includes('三井住友')) {
                            sel.value = o.value;
                            sel.dispatchEvent(new Event('change', { bubbles: true }));
                            break;
                        }
                    }
                }
                break;
            }
        }
        await sleep(150); // v0.3.0 高速化: 500→150

        setState(ST_ORDER1_OK);
        toast('✓ 入力完了、確認画面へ', '#388e3c', 2000);
        try { logSY('info', 'order1-ok', '✓ 入力完了、確認画面へ',
            { url: location.href, state: 'ORDER1_OK' }); } catch (e) {}
        await sleep(100); // v0.3.0 高速化: 300→100
        robustClick(submitBtn);
    };

    // ───────────────────────────────────────────────
    // /cargo/order2 等(注文確認画面) 処理
    //   - 中古最終チェック(tr td:first-child)
    //   - テストモード: ここで停止、確定ボタン押さない
    //   - 本番モード: 確定ボタン押下
    // ───────────────────────────────────────────────
    const handleOrderConfirm = async () => {
        if (isStopped()) return;
        const st = getState();
        // ★v0.4.1: state 無効時に診断 toast (現状は無音で死んでいた)
        if (!st) {
            toast(
                '⚠️ 注文確認画面に着いたが state 無効\n' +
                '(TTL 30分切れ / 別タブ干渉 / session-id ミスマッチ)\n' +
                '→ 自動確定スキップ。手動で「注文確定」を押してください',
                '#f57c00', 15000
            );
            try { logSY('warn', 'order-confirm-no-state',
                '注文確認画面到達: state 無効 → 自動確定スキップ',
                { url: location.href, path: location.pathname }); } catch (e) {}
            return;
        }
        if (st !== ST_ORDER1_OK) {
            toast(
                `⚠️ 注文確認画面: state="${st}" (ORDER1_OK でない)\n` +
                '→ 自動確定スキップ。手動で「注文確定」を押してください',
                '#f57c00', 15000
            );
            try { logSY('warn', 'order-confirm-wrong-state',
                `注文確認画面到達: state="${st}" → 自動確定スキップ`,
                { url: location.href, path: location.pathname, state: st }); } catch (e) {}
            return;
        }

        toast('▶ 注文確認画面、最終チェック中', '#1976d2', 3000);
        try { logSY('info', 'order-confirm', '注文確認画面、最終チェック中',
            { url: location.href, state: st }); } catch (e) {}
        await sleep(300); // v0.3.0 高速化: 800→300

        // 第3防衛ライン: 注文明細テーブルの種類列で「中古」を最終チェック
        const rows = document.querySelectorAll('tr');
        let foundShinpinOrYoyaku = false;
        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) continue;
            const first = (cells[0].innerText || '').trim();
            if (first === '中古') {
                toast('🚨 注文確認で中古を検出。停止しました(最終防衛ライン)', '#d32f2f', 10000);
                try { logSY('warn', 'order-confirm-used-detected',
                    '🚨 注文確認で中古を検出(最終防衛ライン) → 停止',
                    { url: location.href }); } catch (e) {}
                clearState();
                setStopped(true);
                return;
            }
            if (first === '新品' || first === '予約') {
                foundShinpinOrYoyaku = true;
            }
        }

        if (foundShinpinOrYoyaku) {
            toast('✓ 中古なし、新品/予約を確認', '#388e3c', 2500);
        } else {
            toast('⚠️ 種類列を確認できず(続行)', '#f57c00', 3000);
        }

        // テストモード: ここで停止
        if (CONFIG.testMode) {
            setState(ST_TEST_DONE);
            toast(
                '🧪 テスト完了\n注文確認画面まで到達\n確定ボタンは押していません\n問題なければ本番モードへ',
                '#f57c00', 12000
            );
            return;
        }

        // 本番モード: 注文確定ボタンを押す
        // ※ 注文確定ボタンのセレクタは PC 版コードに明示なし。
        //    駿河屋の確認画面で「注文を確定する」「ご注文確定」「この内容で注文する」等のテキストを探索。
        toast('🛒 注文確定ボタンを探しています', '#2e7d32', 3000);
        await sleep(150); // v0.3.0 高速化: 500→150

        const confirmBtn = await new Promise((resolve) => {
            const tryFind = () => {
                return findByText(
                    "input[type='submit'], button, a",
                    // ★ v0.2.1: HIRO の実機スクショで実際のボタンテキストが「注文確定」だったため最優先で追加
                    '注文確定',
                    // 念のため他の候補も維持(駿河屋のサイト変更や他画面に備えて)
                    'この内容で注文する', '注文を確定する', 'ご注文を確定', 'ご注文確定', '注文する'
                );
            };
            let elapsed = 0;
            const tick = () => {
                if (isStopped()) return resolve(null);
                const el = tryFind();
                if (el) return resolve(el);
                elapsed += 200;
                if (elapsed > 8000) return resolve(null);
                setTimeout(tick, 200);
            };
            tick();
        });

        if (!confirmBtn) {
            // ★v0.4.1: 確定ボタンが見つからない時、ページ上の候補ボタン文字列を列挙
            //   駿河屋がボタン文字列を変更した時に即発見できるように
            let candidates = [];
            try {
                const allBtns = document.querySelectorAll(
                    "input[type='submit'], button, a[href*='order'], a.btn, [role='button']"
                );
                const seen = new Set();
                for (const b of allBtns) {
                    const t = ((b.innerText || b.value || '').trim()).slice(0, 30);
                    if (t && !seen.has(t)) {
                        seen.add(t);
                        candidates.push(t);
                        if (candidates.length >= 10) break;
                    }
                }
            } catch (e) {}
            const candidatesText = candidates.length
                ? candidates.map(t => `「${t}」`).join(' / ')
                : '(候補なし)';
            toast(
                '❌ 注文確定ボタンが見つかりません\n' +
                '探索文字列: 注文確定 / 注文を確定する / 注文する 等\n' +
                'ページ上の候補:\n' + candidatesText,
                '#d32f2f', 20000
            );
            try { logSY('error', 'confirm-button-not-found',
                '注文確定ボタン探索失敗',
                { url: location.href, candidates: candidates }); } catch (e) {}
            return;
        }

        // ★ v0.3.1: HIRO 指示により 2秒待機を撤廃して即押下に変更。
        //   テストモードでは上の if (CONFIG.testMode) {...; return;} で
        //   この行に到達する前に必ず return するので、本番モード時のみここに来る。
        //   駿河屋の注文確定は楽天と異なりここまでで十分なフィルタが入っている:
        //     - 商品ページの新品ラジオ強制選択 + verifyGradeNotUsed
        //     - カート画面の中古検出(第1防衛ライン)
        //     - 注文確認画面の中古検出(第3防衛ライン、上の処理で実施済)
        //     - confirmBtn.click() 単発(二重発注防止)

        clearState();
        // ★v0.4.1: 確定 click 直前ログ
        try { logSY('info', 'order-confirm-click', '注文確定ボタン click 投入直前',
            { btnText: ((confirmBtn.innerText || confirmBtn.value || '').trim()).slice(0, 30),
              btnTag: confirmBtn.tagName, url: location.href }); } catch (e) {}
        try {
            confirmBtn.click();
        } catch (e) {
            toast(`❌ 注文確定クリック失敗: ${e.message}`, '#d32f2f', 10000);
            try { logSY('error', 'order-confirm-click-failed',
                '注文確定クリック失敗', { err: e.message }); } catch (er) {}
            return;
        }
        toast('✅ 注文確定ボタンを押しました', '#2e7d32', 6000);
        try { logSY('order-complete', 'order-confirm-clicked',
            '✅ 注文確定ボタンを押しました', { url: location.href }); } catch (e) {}
    };

    // ───────────────────────────────────────────────
    // ログイン画面処理
    //   /pcmypage 配下、メール+パスワード、サインインボタン
    // ───────────────────────────────────────────────
    const handleLoginPage = async () => {
        if (isStopped()) return;
        if (!CONFIG.username || !CONFIG.password) {
            toast('⚠️ ID/PW 未設定。手動でログインしてください', '#f57c00', 6000);
            return;
        }

        await sleep(200); // v0.3.0 高速化: 500→200

        // ★ 予防接種: ページ内の全パスワード・メール input に対して
        //   Safari/iOS パスワードマネージャ抑制属性を付与。
        //   こうしておくと、後続の fillNative で値を入れたときに「ログイン
        //   フォームへ新規入力」と誤認されにくい。
        document.querySelectorAll(
            "input[type='password'], input[type='email'], " +
            "input[name='mail_address'], input[name='mail'], " +
            "input[name='password'], input[name='loginid'], input[name='user']"
        ).forEach(suppressPasswordManager);
        // form にも自動入力抑制
        document.querySelectorAll('form').forEach(form => {
            try {
                form.setAttribute('autocomplete', 'off');
                form.setAttribute('data-1p-ignore', 'true');
                form.setAttribute('data-lpignore', 'true');
            } catch (e) {}
        });

        // メール
        const mailInput = document.querySelector(
            "input[placeholder='メールアドレス'], " +
            "input[name='mail_address'], input[name='mail'], input[type='email']"
        );
        if (!mailInput) {
            toast('❌ メール入力欄が見つかりません', '#d32f2f', 6000);
            return;
        }
        // ★ 値を入れる前に Safari/iOS のパスワード保存・自動入力を抑制
        suppressPasswordManager(mailInput);
        fillNative(mailInput, CONFIG.username);
        await sleep(100); // v0.3.0 高速化: 300→100

        // パスワード
        const pwInput = document.querySelector(
            "input[placeholder='パスワード'], " +
            "input[name='password'], input[type='password'], #password"
        );
        if (!pwInput) {
            toast('❌ パスワード欄が見つかりません', '#d32f2f', 6000);
            return;
        }
        // ★ パスワード欄も同様に抑制
        suppressPasswordManager(pwInput);
        fillNative(pwInput, CONFIG.password);
        await sleep(100); // v0.3.0 高速化: 300→100

        // サインインボタン
        const signinBtn =
            findByText("button[type='submit']", 'サインイン') ||
            findByText('button, input[type="submit"]', 'サインイン') ||
            document.querySelector("button[type='submit'], input[type='submit']");
        if (!signinBtn) {
            toast('❌ サインインボタンが見つかりません', '#d32f2f', 6000);
            return;
        }

        // 楽天 v2.9.17 で実装した「フルクリック」(touchstart/end + mousedown/up + click)
        const fullClick = (el) => {
            try { el.focus(); } catch (e) {}
            const rect = el.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const opts = {
                bubbles: true, cancelable: true, view: window,
                clientX: x, clientY: y,
            };
            try {
                if (typeof PointerEvent !== 'undefined') {
                    el.dispatchEvent(new PointerEvent('pointerdown', opts));
                }
                el.dispatchEvent(new MouseEvent('mousedown', opts));
                if (typeof PointerEvent !== 'undefined') {
                    el.dispatchEvent(new PointerEvent('pointerup', opts));
                }
                el.dispatchEvent(new MouseEvent('mouseup', opts));
                el.dispatchEvent(new MouseEvent('click', opts));
            } catch (e) {}
            try { el.click(); } catch (e) {}
        };

        // ★★★ v0.2.0: ログインフォーム偽装による漏洩警告ダイアログ回避(実験的)★★★
        //
        //   Safari の漏洩警告ダイアログは、Safari が「ログインフォーム」と認識した
        //   フォームで送信されたパスワードを漏洩 DB と照合して出すもの。
        //   フォームを「ログインフォームではない」と一瞬でも装えば、Safari の
        //   検出ロジックを回避できる可能性がある。
        //
        //   方法:
        //   1. 送信直前に pwInput の type を password → text に変更(短時間)
        //   2. signinBtn をクリック(送信)
        //   3. 送信は同期的にトリガーされるが、サーバー応答は非同期
        //   4. type=text のままだとサーバーには平文 PW が送られるが、駿河屋の
        //      フィールドが name=password ベースで処理しているので問題なし
        //
        //   重要: type=password から type=text に変えると input.value は維持される
        //   ので、送信される値は変わらない。サーバーから見たら通常のログイン送信。
        //
        //   駿河屋のサーバー側で type を見ているとは考えにくいが、念のため:
        //   送信が発火した直後(50ms後)に type を password に戻す保険。

        // 偽装属性のバックアップ
        const originalPwType = pwInput.type;
        const originalPwName = pwInput.name;
        const originalPwAutocomplete = pwInput.getAttribute('autocomplete');

        try {
            // 偽装: type を text に、name を別物に、autocomplete を off に
            pwInput.type = 'text';
            pwInput.setAttribute('name', 'srgy_pw_field');
            pwInput.setAttribute('autocomplete', 'off');
            // 値はそのまま維持(fillNative で入れた値はそのまま)
        } catch (e) {
            // 万が一エラーなら復元
            try { pwInput.type = originalPwType; } catch (e2) {}
            try { pwInput.setAttribute('name', originalPwName); } catch (e2) {}
        }

        toast('▶ サインイン送信', '#1976d2', 2500);

        // クリック直前にもう一度確認: 偽装が効いているか念のため(もし type が戻って
        // しまっていたら fallback として復元しないで送信)
        // ※ 駿河屋のサーバーは name="password" を期待しているため、
        //   送信直前に name だけは元に戻す(type=text のまま送信)
        try {
            pwInput.setAttribute('name', originalPwName);
        } catch (e) {}

        fullClick(signinBtn);

        // 念のため、submit が走り終わったら(50ms後)type も復元
        // これで遷移までのわずかな間にダイアログが出る判定をくぐり抜ける
        setTimeout(() => {
            try {
                pwInput.type = originalPwType || 'password';
                if (originalPwAutocomplete) {
                    pwInput.setAttribute('autocomplete', originalPwAutocomplete);
                } else {
                    pwInput.removeAttribute('autocomplete');
                }
            } catch (e) {}
        }, 50);
    };

    // ───────────────────────────────────────────────
    // ルーター(main)
    // ───────────────────────────────────────────────
    const main = async () => {
        try {
            if (!document.body) {
                await new Promise((r) => {
                    const check = () => document.body ? r() : setTimeout(check, 50);
                    check();
                });
            }
        } catch (e) {}

        purgeOldStorage();
        syncSessionIdFromCookie();

        const host = location.host;
        // 駿河屋は基本 www.suruga-ya.jp 一本。サブドメインは現状なし。
        if (!host.endsWith('suruga-ya.jp')) return;

        try { toast(`▶ v${SCRIPT_VERSION} on ${host}`, '#388e3c', 2000); } catch (e) {}

        renderStopButton();
        renderSettingsButton();
        renderLogButton();   // ★v0.4.1
        startBadgeUpdater();

        // ★v0.4.1: main 起動ログ (Amazon Bot の main: v起動 相当)
        try { logSY('info', 'main', `v${SCRIPT_VERSION} 起動`, {
            url: location.href.slice(0, 200),
            path: location.pathname,
            stopped: isStopped(),
        }); } catch (e) {}

        const path = location.pathname;

        // 商品ページ
        if (path.includes('/product/detail')) {
            renderStartButton();
            // v0.3.6: リロード待機中フラグが立っていれば自動で attemptPurchase を再開
            //   (HIRO 運用: 新品/予約/カートボタンが出るまで自動リロードを継続)
            //   楽天 v2.9.19 の initProductPage と同じ仕組み。
            //   停止ボタンが押されていれば再開しない(別タブ事故防止)。
            if (isWaiting()) {
                if (isStopped()) {
                    localStorage.removeItem(KEY_WAITING);
                    return;
                }
                await sleep(500);
                await attemptPurchase();
                return;
            }

            // v0.4.0: タイマー機能(時刻指定発火)
            //   待機中でなく、タイマーが ON で未発火なら、時刻まで待機する。
            //   isWaiting() が立っているとき(連続リロード中)は重ねて起動しない。
            if (CONFIG.timerEnabled && !isTimerFired() && !isStopped()) {
                startTimer();
            }
            return;
        }

        // カートページ
        if (path === '/cargo/detail' || path.startsWith('/cargo/detail')) {
            await handleCart();
            return;
        }

        // 注文画面
        if (path === '/cargo/order1' || path.startsWith('/cargo/order1')) {
            await handleOrder1();
            return;
        }

        // 注文確認画面(駿河屋では /cargo/order2 等、複数候補ありうる)
        // 「ご注文内容の確認へ」ボタンを押した次のページが該当
        if (path === '/cargo/order2' || path.startsWith('/cargo/order2') ||
            path.includes('/cargo/confirm') || path.includes('/cargo/order_confirm')) {
            await handleOrderConfirm();
            return;
        }

        // ログイン画面
        if (path.includes('/pcmypage')) {
            await handleLoginPage();
            return;
        }

        // ★ v0.1.9: /smpmypage (ログイン後のマイページ) 到達時の処理
        //   駿河屋ログイン直後に Safari が「漏洩パスワード警告」ダイアログを出す
        //   ことがあり、UserScript からは閉じられない(iOS native UI)。
        //   対処: ページ遷移すると Safari がモーダルを自動で閉じる仕様を利用して、
        //   /smpmypage に到達したら 1.5秒後に /cargo/order1 へ自動遷移させる。
        //   結果としてダイアログが消え、購入フローも継続できる。
        if (path.includes('/smpmypage')) {
            const st = getState();
            // state が PURCHASING/CART_DONE なら購入フロー継続中なので /cargo/order1 へ
            if (st === ST_PURCHASING || st === ST_CART_DONE) {
                if (!isStopped()) {
                    toast('▶ ログイン完了、注文画面へ進みます', '#388e3c', 2500);
                    setTimeout(() => {
                        if (!isStopped()) {
                            // ページ遷移すると Safari の native ダイアログも自動で閉じる
                            location.href = location.origin + '/cargo/order1';
                        }
                    }, 600); // v0.3.0 高速化: 1500→600
                }
            }
            return;
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        main();
    }
})();
