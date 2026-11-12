# 22 — 訂閱與付費牆

**What to build:** 使用者第一次按付費功能時看到付費牆，選月費 NT$90 或年費 NT$690 開始 3 個月免費試用；訂閱有效時付費功能可用，到期後付費內容變成只能看；設定可看訂閱狀態、連到 Apple 訂閱管理、還原購買。

**Blocked by:** 02 Apple 開發者帳號與開發版安裝、11 月結精靈基本流程

**Status:** ready-for-agent（2026-11-11：不需付費帳號的部分已實作，見 `docs/subscription.md`；剩轉接層、App Store Connect 與沙盒實測）

**Owner:** `subscription-iap`（見 `docs/agents/team.md`）　**Spec:** [規格](../../finance-product/spec.md)

- [ ] 【翰陞】在 App Store Connect 建立同一訂閱群組的月費與年費商品、3 個月免費試用，並開啟帳單寬限期
- [x] 付費牆只在第一次碰付費功能時出現；文字採法規審核的修訂版（價格、期間、試用、續訂與取消方式、隱私政策與條款連結）
- [ ] 權益在手機上用 StoreKit 2 判斷，App 啟動就監聽交易更新；試用中與寬限期視為有效；離線用上次確認的到期時間（規則與監聽已做；StoreKit 2 轉接層待選套件）
- [x] 免費功能永遠可用；交易 CSV 匯出與備份不受訂閱影響
- [x] 預算資料匯出（`exportBudgetCsv`，匯入 CSV 畫面）是付費功能：試用中可用、到期後鎖住；目前畫面用 `hasMonthlyCloseEntitlement()` 的暫定值，要改接真正權益
- [x] 到期後：月結、調整、貸款、投資變成唯讀；預算上限仍可改；重新訂閱後可依序補做月結
- [x] 設定頁有訂閱狀態、Apple 訂閱管理連結、還原購買
- [x] 程式內沒有讓特定 Apple ID 免費的後門；家人共享不開（沒有內購的開發版全開，見 docs/subscription.md）
- [ ] 權益對帳本服務指令的影響有測試（已有）；沙盒實測訂閱、試用、續訂、到期、寬限期、還原購買
- [ ] 付費牆文字經 tw-legal-tax-counsel agent 審過

- 2026-11-12 上架文件定案（PR #27，docs/app-store/）：App 名稱 Afterbills；付費項目「預算資料匯出」對使用者的名稱改為「預算表匯出（CSV）」，付費牆列出內容（分類、上限、儲備、貸款與月結結果），App 內字樣待本票改；付費牆與設定頁文字以 docs/app-store/subscription-disclosure.md 為準；內購用原生 StoreKit、不用 RevenueCat。
