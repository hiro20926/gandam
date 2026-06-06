# LONDO BELL Mobile

GUNDAM BASE WEB 整理券抽選 自動申込システム（iOS Userscripts 拡張用）

---

## 📥 インストール

iPhone の Safari で以下の URL を開いてください（要：Userscripts アプリ事前インストール）。

### 本番版（安定版 v1.1）

```
https://raw.githubusercontent.com/hiro20926/gandam/main/londo-bell-mobile/londo_bell.user.js
```

### β版（次世代版 v1.2-beta）

```
https://raw.githubusercontent.com/hiro20926/gandam/main/londo-bell-mobile/londo_bell_beta.user.js
```

> 📦 配布元: https://github.com/hiro20926/gandam

---

## 📱 インストール手順

1. App Store から **Userscripts** アプリ（無料）をインストール
2. Safari を開く → 設定 → 機能拡張 → Userscripts をオン
3. 上記の `.user.js` URL を Safari で開く
4. Safari にコードが表示される → アドレスバー左の「ぁあ」→ **Userscripts**
5. 「**Install**」または「**Tap to re-install**」をタップ
6. **https://www.gundam-base-entry.net/** を開くと自動起動

---

## ⚙ 初回セットアップ

Userscript インストール後、GUNDAM BASE のサイトを初めて開くと、起動演出のあと**設定画面（bottom sheet）が自動で表示**されます。

そこで以下を入力して「**保存して反映**」をタップ：

- 姓・名
- 電話番号（ハイフンなし、10〜11桁）
- 店舗
- 希望日（未記入なら今日）

以降の設定変更は、画面右下の窓内「**⚙ 設定変更**」から同じ画面を呼び出せます。

---

## 🕒 希望時間の変更

GUNDAM BASE のページ右下の窓に「**▼ 希望時間**」アコーディオンがあります：

- タップで展開、第1〜第5希望をドロップダウンから選択
- 「リセット」で初期値に戻す（第1=自動、第2〜5=指定なし）
- 「保存」で反映（自動でページがリロードされます）

---

## ⏰ 抽選アラーム（任意）

「⚙ 設定変更」内に **Apple Calendar 連携**があります：

- 抽選開始時刻を入力 → 「📅 Apple Calendar に登録」
- `.ics` ファイルがダウンロード → iOS が「カレンダーで開く」を提案
- 登録すると、iPhone がスリープ中でも 1分前に通知が来ます

---

## ⏹ 停止 / ▶ 再開

- 画面右下窓の「⏹ 停止」ボタンで監視を停止
- 停止後は自動再開しません（リロードしても止まったまま）
- 「▶ 再開」ボタンで監視を再開

---

## 🆘 トラブルシューティング

| 症状 | 対処 |
|---|---|
| 設定画面が出ない | Safari を完全終了 → 再起動。Userscripts でこの script が ON か確認 |
| 窓が消えた | ページをリロード。それでも出ない場合は Userscripts で再インストール |
| 認証が必要と出る | GUNDAM BASE で 1 回手動ログインしてください |
| バージョンを上げたい | この README の URL から再インストール（既存設定は保持されます）|

---

## バージョン

| 種類 | バージョン |
|---|---|
| 本番版 | v1.1.1 (rev16.6) |
| β版 | v1.2-beta (rev16.6) |

---

## ライセンス・配布について

HIROさん個人運用ツール。配布は GUNDAM BASE 個別利用に限る。

ANAHEIM ELECTRONICS — LONDO BELL DIV.
