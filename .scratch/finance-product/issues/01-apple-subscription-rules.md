# 查明 App Store 訂閱與上架規則

Type: research
Labels: wayfinder:research
Status: resolved

## Question

台灣開發者上架一個「iOS＋電腦網頁同一訂閱」的財務 App，Apple 現行規則要求什麼？
- 數位訂閱是否必須走 In-App Purchase；網頁版另外收費（Stripe 等）能否讓 iOS 用戶登入沿用（multiplatform services / reader app / 外部購買連結在台灣的現況）。
- 帳號建立就必須提供 App 內刪除帳號；第三方登入時 Sign in with Apple 的要求。
- 隱私標籤、財務類 App 審查重點、Small Business Program 抽成、台灣稅務與付款收款（賣家身分：個人 vs 公司）。
- TestFlight 外部測試的審查與人數限制。
來源只用 Apple 官方文件與條款，附連結與查證日期。

## Answer

訂閱必須走 IAP；網頁訂閱可在 App 內沿用，但 iOS 也要同時賣 IAP，且台灣店面 App 內不能有導向網頁付款的按鈕或連結。App 內必須能刪帳號；有 Google 登入就必須同時提供 Sign in with Apple。財務類 App 可能被要求以法人身分提交（5.1.1(ix)、3.2.1(viii)），是最大的上架風險。加入 Small Business Program 抽 15%。TestFlight 外部測試最多 10,000 人，第一版需過 Beta 審查。

詳見[研究文件](../research/01-apple-subscription-rules.md)（查證日期 2026-11-08）。
