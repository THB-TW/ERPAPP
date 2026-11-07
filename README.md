# ERPAPP

個人記帳與預算網站，使用 ASP.NET Core 8 MVC、EF Core、SQL Server Express、Bootstrap 與 jQuery。

## 本機啟動

設定 appsettings.json 的 ConnectionStrings:ErpdbDatabase（參考 appsettings.example.json，連線設定不進版控）。

```powershell
dotnet run --launch-profile http
```

看到 Now listening on: http://localhost:5015 後開啟該網址；終端機保留執行紀錄，Ctrl+C 停止。網站由使用者自行啟動。

## 功能與程式位置

- 月結與總資產核對：Controllers/MonthlyCloseController.cs。
- 動態預算分類、上限版本與歷史快照：Controllers/BudgetCapController.cs。
- 儲備挪用、可用餘額補預備金、前期更正與沖銷：Controllers/BudgetAdjustmentsController.cs。
- 純財務規則：Services/Budgeting/BudgetEngine.cs；SQL 一致性與報表投影：BudgetWorkspace.cs。
- 交易與 CSV：Controllers/TransactionsController.cs、Services/Import/。
- 投資記錄與估值：Controllers/InvestmentController.cs。

## 資料庫與驗證

使用既有 ERPDB；結構依 docs/sql/ 腳本升級，先備份並在副本驗證。不執行 EF migration。完整說明見 [動態預算與月結調整](docs/budget-workspace.md)。舊程式以 Git 回查，不在執行專案保留重複版本。

```powershell
dotnet build ERPAPP.sln
dotnet run --project tests/ERPAPP.Tests.csproj
dotnet run --project tests/ERPAPP.Tests.csproj -- --integration
```

整合測試固定使用獨立驗證副本，詳見上述啟用文件。
