# 預算介面與全站樣式定案

Decision: accepted C with B ledger tables (2026-11-07)
Implementation: completed on master

使用者選定 C 的柔和紫色、分步引導、來源與影響分開呈現；明細保留 B 的緊湊表格。網站由使用者自行啟動。

正式介面已重新實作為共用樣式及預算資金安排流程，套用登入、交易與信用卡、支出分析、投資、預算上限、月結、預覽與財務紀錄。保留原有表單端點、防偽欄位、權限及計算流程；沒有把模擬狀態帶入正式功能。

原型主要來源：分支 prototype/budget-ui-20261107，提交 4e698ac。三版候選與切換器只保留在該分支，master 不含原型路由或資產。預算表使用既有 /Finance/BudgetReport，不需 variant 參數。

實作與驗證說明見 docs/ui.md。使用者啟動後可在桌面與手機寬度查看正式頁面。
