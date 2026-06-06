# 🟢 Amazon 購入bot  `v0.3.8.97`

Amazon.co.jp **直販オンリー**の自動購入。⚡TRANS-AM(高速連打購入)/ 🏠ホームアイコン自動起動 / 二重購入防止。

## 📲 インストール(iPhone)

<img src="qr_amazon_install.png" width="200" alt="install QR">

**インストールURL:**
```
https://raw.githubusercontent.com/hiro20926/gandam/main/amazon/gundambot-amazon.user.js
```

1. iPhone カメラで上の QR を読む → Safari でURLが開く
2. Userscripts が「Install / Update」→ タップ
3. **旧 Netlify版が入っていたら Userscripts アプリで削除**(競合防止)
4. Amazon商品ページのパネル **⚙設定** → Discord webhook を貼る → 💾保存
   - 端末ローカルにだけ保存(公開ファイルには入りません)

## 設定

- ⚙設定: Discord webhook(任意・端末ローカル)
- パネルの **🛑数量更新トグル**: 二重購入防止の ON/OFF
- それ以外は内部固定(skip_confirm=常に確認なし 等)

## 更新

このファイルが更新されると、`@updateURL` 経由で Userscripts が自動検知。
HIRO は iPhone で更新を受けるだけ(GitHub操作不要)。
