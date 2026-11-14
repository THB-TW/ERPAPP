# 17 — 翰陞把舊帳匯入 iPhone

**What to build:** 翰陞用 AirDrop 把票 06 產生的帳本檔傳到 iPhone，用「匯入備份檔」匯入，在手機上看到全部舊帳，並確認幾個月份的數字。

**Blocked by:** 02 Apple 開發者帳號與開發版安裝、06 翰陞執行舊帳轉換與比對、16 備份檔匯出與匯入還原

**Status:** ready-for-human

**Owner:** `legacy-migration`（見 `docs/agents/team.md`）　**Spec:** [規格](../../finance-product/spec.md)

- [ ] 帳本檔成功匯入 iPhone
- [ ] 翰陞抽查至少最早、最近與一個有歷史差異的月份，數字與舊系統相同
- [ ] 七千多筆交易下月曆、明細、列表的操作速度可接受；不行就開票處理

## Comments

2026-11-11（票 06 結案後）：要匯入的正式帳本檔已產出，SHA-256 `bf22415570df49c126881f312ac3a3405c169bf0b3bc17eda3e023bd7df06d5f`，在專案私人檔案區 `legacy-ledger/ledger-20261111.sqlite`（不在 Git）。開帳日 2026-11-01。它是轉換程式在 xdtlp5 c76385f 產生的帳本檔；之後 App 多了遷移時，匯入備份會補跑缺的版本。匯入後第一次月結前，11 月有一個支出分類要先歸屬到預算類別。
