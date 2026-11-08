# 查明多人通知：LINE 配額與 iOS 原生推播

Type: research
Labels: wayfinder:research
Status: resolved

## Question

- LINE 官方帳號 2026 台灣方案：免費／付費則數是帳號總量，若每位用戶每月收 3–5 則月結／缺檔提醒，各人數級距的月費；用戶要先加好友並綁定的流程（LINE Login / account link）。
- iOS 原生推播（APNs，透過 Expo Notifications 或直接）與 Web Push 的成本與限制。
- 結論應能回答：公開產品的提醒預設走哪個管道、LINE 是否改為可選。
附官方連結與查證日期。

## Answer

公開產品預設用 App 內提醒＋iOS 原生推播（Expo→APNs），網頁版用 Web Push 或 Email；LINE 改為可選。LINE 的則數是全帳號共用、按收訊人數計價，5,000 人約 NT$3,200–5,200／月。翰陞本人每月 3–5 則在免費 200 則內，可以繼續用 LINE。

詳見[研究文件](../research/06-notification-channel.md)（查證日期 2026-11-08）。
