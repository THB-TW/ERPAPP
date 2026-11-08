# 查明 iPhone 與銀行資料取得方式及提醒限制

Parent: ../map.md
Labels: wayfinder:research
Type: research
Mode: AFK
Status: resolved
Assignee: Codex
Blocked by:

## Question

以官方文件驗證天天記帳的 CSV 分享、自動匯出或可供外部讀取的介面，及中信銀行 CSV、帳單、通知各能提供什麼資料、何時取得。釐清 iPhone 可行的自動化與必要手動操作，不把通知可收到等同第三方程式可讀取。研究結論需提供來源、未證實項目及降級流程；不索取銀行密碼或操作使用者銀行帳戶。

## Research leads

- [天天記帳 FAQ](https://tiantianjizhang-tw-faq.swalloworkstudio.com/)：有 CSV 匯出相關文件；是否有外部即時介面尚未證實。
- [中信消費通知](https://service.ctbcbank.com/FAQ/Page01?kmid=4825)：有 LINE/App 通知；官方說明刷退不發通知，授權通知也不保證最終交易成立。通知只能作線索，不能取代正式帳務。
- 使用者已接受每月手動匯出一次銀行資料；在此資料頻率下，系統無法提前確定尚未收到的銀行消費是否漏記。

## Answer

2026-11-08 完成[資料取得與提醒研究](../research.md)。首版依使用者決定採新手機入口直接記帳與每月銀行 CSV，不依賴未確認的天天記帳即時介面、銀行 API 或手機讀取其他 App 通知。

- 天天記帳官方有 CSV 說明，但本輪未找到足以承諾外部即時同步的官方介面；不把搜尋無結果當成絕對不存在。
- 中信官方確認 LINE/App 消費通知，但授權及正式交易可能不同，刷退不發同類通知；不可將通知當正式帳單或假定平台可讀取銀行 LINE 對話。
- 官方確認 iOS 16.4 起主畫面網頁可 Web Push，無需 Apple 開發者年費。推薦另比較 LINE Messaging API 免費 200 則/月（2026-11 最新方案）與 Apps Script Email 備援；LINE Notify 已結束。
- 尚未在使用者 iPhone 實測銀行 CSV 下載；第一版可沿用電腦下載後上傳，不承諾全手機銀行下載或全自動抓取。
- 對帳需區分帳期、生活月份、退款、同額多筆與日期差；本地副本原本只比同日同額筆數，且略過負數列，故不能照搬後宣稱已處理完整退款。

技術驗證的未證實事項已在研究文件保留；提醒管道留給使用者決定。本票不代表已連接任何帳號或發送訊息。

