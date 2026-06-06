# 🛒 GUNDAMBOT — 購入/自動化 bot 統合リポジトリ

各サービスの自動化 userscript を **bot ごとのサブフォルダ**で管理。
iPhone Safari + Userscripts 拡張用。インストール方法は各フォルダの README を参照。

## 一覧

| bot | 対象 | 状態 | フォルダ |
|---|---|---|---|
| 🟢 Amazon | Amazon.co.jp 直販 | v0.3.8.97 | [amazon/](amazon/) |
| 🟢 PB-CART | プレミアムバンダイ | — | [pb-cart/](pb-cart/) |
| 🟢 LONDO BELL Mobile | GUNDAM BASE | — | [londo-bell-mobile/](londo-bell-mobile/) |
| ⏸ 楽天ブックス | 楽天 | 移行準備中 | (予定) |
| ⏸ 駿河屋 | 駿河屋 | 移行準備中 | (予定) |

## 📲 インストール共通

1. iPhone の **カメラ**で各フォルダの QR を読む(or インストールURLを Safari で開く)
2. Userscripts が「Install / Update」→ タップ
3. **旧版(Netlify由来など)が入っていたら Userscripts アプリで削除**(2つ動くと競合)

> 更新は `@updateURL` で自動。新版が出ても iPhone で更新を受けるだけ。URL/QR は変わりません。

---

- 配信は **GitHub**(コード置き場)。Netlify のような凍結はされにくい。
- 秘密(Discord webhook 等)は**公開ファイルに含めず**、各端末のアプリ内設定にだけ保存。
