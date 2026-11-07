# 交易匯總獨立頁面沿革

2026-11-07 移除舊的獨立「交易匯總」入口：`GET /Finance/SummaryInput`、`POST /Finance/RunSummary` 與 `Views/Finance/SummaryInput.cshtml`。

舊頁讓使用者填年、月、當月收入，呼叫 `FinanceSpExecutor.ExecuteSummary` 執行 `sp_FinanceSummary`，再透過 TempData 顯示結果。此流程已集中於月結精靈，因此不再保留兩個執行入口。

仍在使用的共用程式包括 `SummaryInputModel`、`FinanceSummaryResult`、`FinanceSpExecutor.ExecuteSummary`、`sp_FinanceSummary` 與預算報表讀取；這些由月結精靈與預算表繼續使用。

舊版原始碼可從既有 Git 提交 `2eb88ee` 的 `Controllers/FinanceController.cs`、`Views/Finance/SummaryInput.cshtml` 讀取；本文記錄用途與移除範圍，不保留失效的執行程式。

同日後續的動態預算實作將月結寫入改由 `BudgetEngine` 與 `BudgetWorkspace` 負責，包含分類快照、原始計算、更正、挪用、撤銷及重結；已不再呼叫舊 `sp_FinanceSummary`。原 `FinanceSpExecutor.ExecuteSummary` 亦移除，報表唯讀部分獨立為 `BudgetReportReader`。資料庫中的舊預存程序與 repo 外 `SQLServer_SP.TXT` 只保留作沿革，不供新網站執行。
