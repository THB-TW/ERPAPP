# ERPAPP

個人記帳／預算網站。ASP.NET Core 8 MVC + EF Core + SQL Server Express，前端 jQuery + Bootstrap。
每月月結流程（匯入 CSV → 信用卡核對 → 計算彙總 → 總資產核對）集中在「月結精靈」頁面
（`Controllers/MonthlyCloseController.cs`、`Views/MonthlyClose/Index.cshtml`）。

月結與調整的純計算在 `Services/Budgeting/BudgetEngine.cs`；`BudgetWorkspace` 負責版本化財務文件、
SQL 交易與舊報表投影，`BudgetSeeder` 原樣帶入舊帳。修改分類、上限、挪用、前期更正或撤銷時，
先讀 `.scratch/budget-adjustments/design-interview.md` 及 ADR 0003／0004；原始月結與手動調整分開，
重結不能重複套用前期更正。舊 `sp_FinanceSummary` 僅留沿革，新網站已停止呼叫。

資料結構直接套用 `docs/sql/budget-workspace.sql`；啟用與副本驗證流程見 `docs/budget-workspace.md`。
所有交易異動透過 `ErpdbContext.PeriodLock.cs` 與月結共用寫入鎖，CSV 的拒收與重複略過分開回報。
測試入口為 `dotnet run --project tests/ERPAPP.Tests.csproj`，加 `-- --integration` 只操作指定驗證副本。

CSV 匯入的流程與數量式去重只在 `Services/Import/ImportRun.cs` 寫一次；來源（解析、重複判定鍵、排序）在
`Services/Import/ImportSource.cs`，三個匯入目的地（交易資料表、信用卡資料表、信用卡存檔）各一個 adapter。
`Services/CsvImportService.cs` 只是兩個入口。術語見 `CONTEXT.md`「## 匯入」，決定見 `.scratch/import-dedup/spec.md`。

投資組合（台股個股＋虛擬貨幣桶）在 `Controllers/InvestmentController.cs`；
成本／市值／累計投入淨額的計算集中在 `Services/InvestmentCalculator.cs`（純函式）與
`Services/InvestmentService.cs`。資料表用 `docs/sql/investment.sql` 直接建——
**本專案不跑 EF migration**；舊 migration 與現行 schema 衝突，已移除，可由 Git 回查。
資料結構依 `docs/sql/` 的腳本升級，先備份並在副本驗證。
「為什麼投資要記兩個成本數字」見 `docs/adr/0001`。

## 專案 agent 團隊

產品化（iOS App）的工作依模組分給 `.claude/agents/` 的長期 agent，名冊與交叉審核規則見 `docs/agents/team.md`；入口 `/chief-of-staff`。所有 subagent 一律用 Sonnet。稅務／法規／上架文字一律經 `tw-legal-tax-counsel` 審核；訂閱方案與定價由 `marketing-pricing` 研究提案。

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature>/` in this repo — not on GitHub. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical labels, unchanged, written as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` and one `docs/adr/` at the repo root. See `docs/agents/domain.md`.
