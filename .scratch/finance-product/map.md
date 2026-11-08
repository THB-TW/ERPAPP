# 台灣 iOS 訂閱制完整財務管理產品＋電腦網頁版：決策地圖

Labels: wayfinder:map
Status: open
Created: 2026-11-08

## Destination

第一版產品規格定案：可直接拆成實作票，涵蓋 iOS App 與電腦網頁版（同一訂閱、同一份資料、同時上架）、訂閱方案與權益、帳號與同步、舊帳私有匯入，以及「用翰陞自己 58 個月舊帳驗收月結一致」的切換條件。走完地圖＝沒有剩下要決定的事，接著拆實作票。

## Notes

- 目的地四題（2026-11-08 使用者回覆「都照建議」）：
  1. 規劃先做到**規格定案**，再拆實作票。
  2. 第一版只做**台灣／繁體中文／新台幣**。
  3. iOS 與網頁版**同一訂閱、同一份資料、同時上架**，各自把該平台常用的功能放前面（手機：快速記帳；電腦：月結、匯入、投資、報表）。
  4. **先用翰陞自己的舊帳驗收 58 個月月結**；通過前舊系統（ASP.NET Core + SQL Server ERPDB）照常使用，不退役、不覆寫、不重算。
- 交接檔的既定決策見[交接](handoff-20261108.md)「最新且優先於舊文件的使用者決策」，不重問：完整財務管理（預算儲備、月結、投資）是第一版價值、快速輸入是體驗要求；一開始就訂閱制；Apple 年費另計、初期雲端 NT$200／月內；LINE 提醒已選但公開產品可重審；技術棧可重審；個人舊帳只匯入本人帳號，絕不成為公開種子資料。
- 舊個人 PWA 地圖在 [mobile-finance-legacy](../mobile-finance-legacy/map.md)：只作歷史與已答個人規則（1–月底生活預算、5 號發薪、7 號信用卡結帳、月結由本人確認、缺資料不完成月結）的來源。它的「私人 Cloudflare Access／單人免費額度／PWA 優先」方向已被本地圖取代。
- 領域語言以 `CONTEXT.md` 為準；不要混用「預算／儲備／帳面總資產」。舊計算核心在 `Services/Budgeting/BudgetEngine.cs`，ADR 0001–0004 仍有效。
- 技能：每張 grilling 票用 grilling＋domain-modeling；research 票用 research（背景 subagent）；prototype 票用 prototype。
- **所有 subagent 一律 Sonnet。**
- 研究成果放在 `research/`（本 repo 只允許推指定分支，因此不另開 `research/<name>` 分支）。
- 雲端作業：不在使用者 Windows 電腦上執行；成果推 GitHub。`.private/` 私人備份不在 Git，需要時請使用者提供，絕不提交。

## Decisions so far

<!-- 每張結案票一行 -->

- [查明 App Store 訂閱與上架規則](issues/01-apple-subscription-rules.md)：訂閱必須用 IAP；台灣 App 內不能導向網頁付款；必須能在 App 內刪帳號；有 Google 登入就要提供 Apple 登入；財務類 App 可能被要求以法人提交。
- [比較訂閱權益驗證與網頁收款方案的成本](issues/02-entitlement-platforms.md)：iOS 用 RevenueCat（US$2,500 MTR 內免費）；Stripe 不支援台灣，第一版建議只在 iOS 收款、網頁以同帳號取得權益。
- [查明 iOS＋網頁共用程式與離線同步的技術選項](issues/03-stack-and-sync.md)：Expo 58＋Router 共用 iOS／網頁；自建操作佇列＋expo-sqlite；Workers＋共用 D1、以 owner_id 隔離；CPU 待實測。
- [查明登入方案與 NT$200／月可支撐的使用者規模](issues/04-auth-and-cost.md)：Better Auth 自架（Apple／Google／magic link）；Workers Paid 約 900 人在 NT$200 內，每多 100 人約 NT$36。
- [調查台灣記帳 App 的功能與訂閱定價](issues/05-competitors-pricing.md)：在地年費 NT$600–1,500；競品未見累積儲備、月結核對、台股成本追蹤與網頁版。
- [查明多人通知：LINE 配額與 iOS 原生推播](issues/06-notification-channel.md)：公開產品預設用原生推播／Email，LINE 改為可選；本人的 LINE 仍在免費額度內。

## Not yet specified

- 產品名稱、品牌、App Store 文案與截圖；等定位與競品研究後再談。
- 新使用者的開帳體驗（初始帳戶餘額、沒有歷史月結時的第一次月結）。依「產品預設 vs 個人設定」結論再細分。
- 銀行／信用卡 CSV 對一般使用者的支援範圍（哪些銀行格式、退款、分期、同額多筆）；舊配對規則不得改義。
- 投資模組對一般使用者的範圍（台股個股、虛擬貨幣桶以外是否要支援、報價來源與授權成本）。
- 客服、營運、隱私權政策、服務條款、資料外洩應變；等帳號與付款模型定了再拆。
- Android 是否、何時推出（使用者未提，第一版目的地不含，但未明確排除）。
- 雲端成本監控與超過 NT$200 時的處理規則；等 Worker 實測量出每人用量後再定門檻（約 900 人是估算）。
- 網頁版日後是否也直接收款（在地金流＋電子發票）；第一版建議只在 iOS 收款。
- 舊系統退役的最後切換步驟（58 個月驗收通過之後）。

## Out of scope

- 台灣以外市場、多語系、多幣別（目的地第 2 題）。
- 通過完整驗收前退役、覆寫或重新計算舊平台與舊帳。
- 把翰陞的個人帳務放進公開產品的種子資料、demo 或測試 fixture。
