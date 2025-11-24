# ERPAPP

ERPAPP 是一套以 ASP.NET Core (.NET 8) 與 Razor Pages 架構開發的企業資源規劃（ERP）系統範例，支援多種財務、預算、成員與權限管理功能。專案結構清晰，適合中小型企業或個人財務管理學習與擴充。

## 主要功能

- 交易管理：新增、編輯、刪除、查詢交易資料，支援多條件搜尋（日期、類別、成員、帳戶、收支類型）。
- 預算管理：記錄各類預算與實際開銷，並可產生預算報表與趨勢圖。
- 資產管理：追蹤每月資產變化。
- 類別、帳戶、成員管理：支援資料表下拉選單選擇。
- 權限與員工管理（Employee、Role）。
- 支援 SQL Server LocalDB，資料結構可彈性擴充。

## 技術架構

- ASP.NET Core (.NET 8)
- Razor Pages
- Entity Framework Core
- SQL Server LocalDB
- C# 12.0
- Bootstrap 5
- Chart.js（前端圖表）

## 資料表結構（Models）

- `Transaction`：交易資料（含日期、類別、金額、成員、帳戶、收支類型）。
- `Budget`：各類預算與開銷（飲食、汽車、娛樂、學習、服飾、日常用品、大型器具、美容美髮、醫療保健、其他、總預算、總開銷、盈餘、輸入日期）。
- `Account`、`Category`、`Member`、`Property`：基本資料表。
- `Employee`、`Role`：員工與權限管理。

## 專案結構
flowchart TD direction TB
subgraph Client["使用者端 / Browser"] A[使用者 (Browser)] end
subgraph UI["表示層 (Views / Razor)"] direction LR V1[Views/Transactions/.cshtml] V2[Views/Finance/.cshtml] V3[Shared/_Layout.cshtml] end
subgraph App["應用層 (Controllers / PageModels)"] direction LR C1[TransactionsController] C2[FinanceController] PM[若有 Razor Pages: PageModel] end
subgraph VM["DTO / ViewModel"] direction LR Dto[Dto / NewsDto] VM1[BudgetReportViewModel / 其他 ViewModels] end
subgraph BIZ["商業邏輯 / Service"] Svc[Services / Business Logic] end
subgraph Data["資料層 (EF Core)"] DBCTX[ErpdbContext (DbContext)] StoredProc[Stored Procedures (Summaryaccount...)] DB[SQL Server (ERPDB)] end
subgraph FrontendJS["前端互動 (JS)"] Chart[Chart.js / custom JS] JQuery[jQuery] end
subgraph Infra["啟動與遷移"] Program[Program.cs / DI] Migrations[EF Migrations] end
%% 連線 A -->|瀏覽頁面| V1 A --> V2
V1 -->|POST/GET| C1 V2 --> C2 V1 --> PM V2 --> PM
C1 --> VM1 C2 --> VM1 C1 --> Dto C2 --> Dto
C1 -->|呼叫服務| Svc C2 --> Svc Svc --> DBCTX C2 -->|直接或 via Svc 呼叫 SP| StoredProc DBCTX --> DB StoredProc --> DB
V2 -->|傳入 JSON| Chart Chart --> V2 Chart -->|使用| JQuery
Program --> DBCTX Program --> C1 Program --> C2 Migrations --> DB
%% 樣式 classDef layer fill:#f8f9fa,stroke:#333,stroke-width:1px; class Client,UI,App,VM,BIZ,Data,FrontendJS,Infra layer;


## 快速開始

1. **安裝依賴**
   - .NET 8 SDK
   - SQL Server LocalDB

2. **資料庫設定**
   - 連線字串已預設於 `ErpdbContext.cs`，可依需求修改。

3. **建立資料庫**
dotnet ef database update

4. **啟動專案**
dotnet run
或在 Visual Studio 2022 直接 F5 執行。

## 其他說明

- 預設無種子資料，請自行新增員工、角色等基本資料。
- Razor Pages 介面支援下拉選單選擇資料表內容。
- 前端圖表功能需網路連線載入 Chart.js。
- 如需擴充功能，請參考各 Model、ViewModel 與 Controller 實作。

## 聯絡與授權

本專案僅供學習與交流，無商業授權。  
如有問題請於 GitHub Issues 留言。
