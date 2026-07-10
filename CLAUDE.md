# ERPAPP

個人記帳／預算網站。ASP.NET Core 8 MVC + EF Core + SQL Server Express，前端 jQuery + Bootstrap。
每月月結流程（匯入 CSV → 信用卡核對 → 計算彙總 → 總資產核對）集中在「月結精靈」頁面
（`Controllers/MonthlyCloseController.cs`、`Views/MonthlyClose/Index.cshtml`）。

核心計算在預存程序 `sp_FinanceSummary`，其原始碼放在 repo 之外（`../SQLServer_SP.TXT`）。

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature>/` in this repo — not on GitHub. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical labels, unchanged, written as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` and one `docs/adr/` at the repo root. See `docs/agents/domain.md`.
