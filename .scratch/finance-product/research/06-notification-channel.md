# 06 多人通知管道研究：LINE 配額與 iOS 原生推播／Web Push

查證日期：2026-11-08
方法：以 curl 抓官方頁面（預設 User-Agent）並抽出文字；Apple 頁面改抓其 JSON 文件 API。凡未在原文找到的，標「未查證」，不填數字。

## 結論

1. **公開產品的預設提醒管道：App 內提醒＋iOS 原生推播（Expo push → APNs）；網頁版用 Web Push／Email。LINE 改為可選的附加管道，不當預設。**
2. 理由是 LINE 的成本結構：官方價格頁與 Messaging API 計價頁都寫，免費則數與加購都是**帳號總量**，且每則按「收訊人數」計。公開產品全體用戶共用一個官方帳號，用戶數越多，月費階梯式上升（見下表，5,000 人 × 5 則約月費 NT$5,200）。原生推播在官方文件中沒有逐則收費的項目（Expo 頁面未提費用，見「未查證」）。
3. 用戶端摩擦：LINE 需先加好友並完成 account link（linkToken＋nonce 的多步流程），原生推播只需 App 內授權。
4. 翰陞個人的 LINE 決策（`mobile-finance-legacy/issues/07-alert-channel.md`）不受影響：單人每月 3–5 則遠低於輕用量方案 200 則免費額度，月費 0 元。
5. 若日後要在公開產品提供 LINE，條件是：用戶自行選擇啟用、以月結摘要為主（每人每月 3–5 則）、並把 LINE 成本計入訂閱定價。5,000 人全開約 NT$3,200–5,200／月，約每位用戶 NT$0.64–1.04／月（運算結果）。

## 費用表：LINE 官方帳號（假設全體用戶都啟用 LINE，每則為 push，按收訊人數計）

方案（2026-11-01 起新價，不含稅）：輕用量 0 元／200 則；中用量 1,000 元／3,000 則，不可加購；高用量 1,400 元／6,000 則，加購第 1–50,000 則 0.2 元／則，第 50,001 則起 0.15 元／則。來源：https://tw.linebiz.com/column/LINEOA-2026-Price-Plan/

| 用戶數 | 每人 3 則：訊息量 → 最低可行方案 → 月費 | 每人 5 則：訊息量 → 最低可行方案 → 月費 |
|---|---|---|
| 100 | 300 → 中用量 → NT$1,000 | 500 → 中用量 → NT$1,000 |
| 500 | 1,500 → 中用量 → NT$1,000 | 2,500 → 中用量 → NT$1,000 |
| 1,000 | 3,000 → 中用量（剛好 3,000，無餘裕）→ NT$1,000 | 5,000 → 高用量 → 1,400 + (5,000−6,000 不超出) = NT$1,400 |
| 5,000 | 15,000 → 高用量 → 1,400 + 9,000×0.2 = NT$3,200 | 25,000 → 高用量 → 1,400 + 19,000×0.2 = NT$5,200 |

註：方案選擇與加購金額是依上列官方價格做的算術。含稅金額、年繳優惠在頁面未明確寫出，未查證。

## 費用表：iOS 原生推播與 Web Push

| 管道 | 100 | 500 | 1,000 | 5,000 | 依據 |
|---|---|---|---|---|---|
| Expo push service → APNs | 未查證 | 未查證 | 未查證 | 未查證 | Expo 發送文件只寫速率與批次限制，沒有價格描述（見下） |
| Web Push（Safari／macOS 與主畫面網頁 App） | 無逐則費用項目；Apple 稱不必加入 Apple Developer Program | 同左 | 同左 | 同左 | Apple Web Push 文件 |

另：發 iOS App 本身需要 Apple 開發者帳號，年費金額未在本次抓到的頁面中出現，未查證（地圖已記 Apple 年費另計）。

## 細節

### LINE 官方帳號方案與計數
- 2026-11-01 起：中用量月費 800→1,000 元，高用量 1,200→1,400 元，輕用量維持；各方案每月免費 200／3,000／6,000 則；輕用量不可加購、中用量不可加購（需更多就升級高用量）；高用量加購 0.2 元／則（前 50,000 則）、0.15 元／則（第 50,001 則起），累進計價。https://tw.linebiz.com/column/LINEOA-2026-Price-Plan/
- 計數：以收訊人數計，一次請求內的訊息物件數不影響；被封鎖或不存在的 user ID 不計。push、multicast、broadcast、narrowcast 計入；reply 不計入。超出免費則數時 API 回錯誤、不會送出。https://developers.line.biz/en/docs/messaging-api/pricing/
- 可用 API 查本月上限與已送則數（同上頁）。
- 台灣方案以 https://tw.linebiz.com 為準（Messaging API 價格頁也指向台灣官方頁面）。

### 加好友與綁定
- Account link：用 `POST /v2/bot/user/{userId}/linkToken` 發 linkToken；伺服器產生 nonce（至少 128 位元，Base64）；導向 `https://access.line.me/dialog/bot/accountLink?linkToken=…&nonce=…`；LINE 之後送 webhook 事件帶 LINE user ID 與 nonce，伺服器據此完成對應。https://developers.line.biz/en/docs/messaging-api/linking-accounts/
- 加好友引導：官方帳號與 LINE Login channel 連結後，授權網址加 `bot_prompt=normal`（同意畫面顯示加好友選項）或 `aggressive`（同意後另開加好友畫面）。https://developers.line.biz/en/docs/line-login/link-a-bot/
- 推論（需於設計階段驗證）：用戶必須是好友且未封鎖才能收到 push，這與計數頁「封鎖者不計」的描述一致。

### Expo／APNs
- Expo push service 接收請求後轉送 FCM 與 APNs；單次請求最多 100 則訊息；每專案每秒上限 600 則；單次取回執上限 1,000 個；回執 24 小時後清除；無 SLA。https://docs.expo.dev/push-notifications/sending-notifications/
- 官方亦提供不經 Expo、直接串 APNs／FCM 的路徑（同上頁）。
- expo-notifications：推播可在實機與 iOS 模擬器（Xcode 14 以上）運作；iOS 與 web 的權限回應固定為 granted（文件原文，實際授權仍由系統提示決定，需實測）；Apple 建議不要每小時送超過兩三則。https://docs.expo.dev/versions/latest/sdk/notifications/
- APNs 架構：提供者伺服器經 HTTP/2＋TLS 連 APNs，採 token 或憑證驗證，token 需定期重新產生。https://developer.apple.com/tutorials/data/documentation/usernotifications/setting-up-a-remote-notification-server.json
- Cloudflare Workers 呼叫 Expo push API 的可行性屬 HTTP POST，頁面未特別說明，需於實作票驗證。

### Web Push（Apple）
- iOS 16.4 以上的主畫面網頁 App、macOS 13 以上的 Safari 16 網頁皆可用；權限必須由使用者手勢觸發；收到推播須立即顯示，否則 Safari 會撤銷該網站的推播權限（不支援隱形推播）；需 VAPID 金鑰；不需加入 Apple Developer Program。https://developer.apple.com/tutorials/data/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers.json
- 因此電腦網頁版的提醒可走 Web Push；但 iOS 上網頁必須先加入主畫面，不適合作為 iOS 用戶預設，iOS 用戶主要靠原生 App 推播。

### 未查證項目
- Expo push service 本身是否收費、有無方案限制：發送文件未提；未去看 Expo 定價頁，未查證。
- Apple Developer Program 年費金額。
- LINE 含稅價與年繳折扣。
- 前一版 tw.linebiz.com 價格 FAQ 內容（常見問答抽出文字為跳轉與計算機說明，沒有其他價格資訊）。

## 對地圖與後續票的影響
- 通知設計：預設事件＝月結提醒、缺檔提醒；內容不放交易明細（呼應舊票的鎖定畫面隱私要求）。
- 若採 LINE 可選：需新增「綁定／解除」流程，與用戶封鎖時的靜默失敗處理。
