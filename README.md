# 🚀 個人財務分析 ERP 系統 (Personal Finance ERP)

這是一個基於 **ASP.NET Core MVC** 架構開發的個人財務管理系統。本專案不僅提供基礎的收支記錄，更核心的功能在於動態數據分析，透過高效的後端運算與前端視覺化技術，幫助使用者精準掌握資產流向。

## 主要功能

- 交易管理：新增、編輯、刪除、查詢交易資料，支援多條件搜尋（日期、類別、成員、帳戶、收支類型）。
- 支出分析：透過ˇ圓餅圖查看每項類別的支出項以及月平均開銷。
- 預算管理：記錄各類預算與實際開銷，並可產生預算報表與趨勢圖。
- 資產管理：追蹤每月資產變化。
- 權限與員工管理（Employee、Role）。

## 技術架構

- 後端: .NET 8.0 (ASP.NET Core MVC)
- 資料庫: PostgreSQL
- ORM: Entity Framework Core (EF Core)
- 前端: JavaScript (ES6+), Chart.js, Bootstrap 5, AJAX (Fetch API)
- 開發工具: Visual Studio / VS Code

## 資料表結構（Models）

- `transactions`：交易資料（含日期、類別、金額、成員、帳戶、收支類型）。
- `budget`：各類預算與開銷（飲食、汽車、娛樂、學習、服飾、日常用品、大型器具、美容美髮、醫療保健、其他、總預算、總開銷、盈餘、輸入日期）。
- `property`：財產分配（當月收入、可用餘額、學費、總預算、總財產）。
- `accounts`、`categories`、`members`：基本資料表。
- `employee`、`role`：員工與權限管理。

## 專案結構
# 🚀 個人財務分析 ERP 系統 (Personal Finance ERP)

這是一個基於 **ASP.NET Core MVC** 架構開發的個人財務管理系統。本專案不僅提供基礎的收支記錄，更核心的功能在於動態數據分析，透過高效的後端運算與前端視覺化技術，幫助使用者精準掌握資產流向。

## 🌟 主要功能

- **交易管理**：新增、編輯、刪除、查詢交易資料，支援多條件搜尋（日期、類別、成員、帳戶、收支類型）。
- **支出分析**：透過圓餅圖查看每項類別的支出佔比以及月平均開銷。
- **預算管理**：記錄各類預算與實際開銷，並可產生預算報表與趨勢圖。
- **資產管理**：追蹤每月資產變化（如可用餘額、學費預留、總財產）。
- **權限與員工管理**：具備 Employee 與 Role 基礎架構，用於多使用者開發環境。

## 🛠 技術架構

- **後端**: .NET 8.0 (ASP.NET Core MVC)
- **資料庫**: PostgreSQL
- **ORM**: Entity Framework Core (EF Core)
- **前端**: JavaScript (ES6+), Chart.js, Bootstrap 5, AJAX (Fetch API)
- **開發工具**: Visual Studio / VS Code

## 🗃 資料表結構 (Models)

- `transactions`：交易核心資料（含日期、金額、類別、成員、帳戶、收支類型）。
- `budget`：預算追蹤表（含飲食、交通、娛樂、醫療等各類預算與實開銷之盈餘）。
- `property`：資產分配表（含當月收入、學費、總預算、總財產）。
- `accounts` / `categories` / `members`：基礎維度表。
- `employee` / `role`：後台權限管理表。

## 🏗 專案結構與功能映射

以下根據實際專案檔案整理之核心架構：

| 模組 | 前端頁面 (Views) | 對應 Controller | 涉及資料表 | 功能重點 |
| :--- | :--- | :--- | :--- | :--- |
| **交易管理** | `Transactions/Index` | `TransactionsController` | `Transactions` | 資料列表與多條件篩選。 |
| **分析圖表** | `Transactions/Analysis` | `TransactionsController` | `Transactions` | 透過 Fetch API 呼叫 JSON，驅動 Chart.js 圓餅圖。 |
| **預算控管** | `Fiance/SummaryInput` | `FianceController` | `finance_summary` | 執行PostgreSQL Function 匯總各分類預算，計算盈餘與開銷對比。 |
| **資產追蹤** | `Fiance/BudgetReport` | `FianceController` | `Property,Budget` | 顯示目前可用餘額與總體資產配置。 |
| **系統設定** | `Accounts/` `Categories/` | 基礎資料 Controller | `Accounts` `Categories` | 維護交易所需的基礎選單內容。 |
| **權限管理** | `Employees/` `Roles/` | `EmployeesController` | `Employee` `Role` | 使用者帳號與權限層級管理。 |

## 📂 資料夾目錄說明

```text
ERPAPP/
├── Controllers/              # 商業邏輯中心
│   ├── TransactionsController.cs  # 負責交易邏輯與 AJAX 分析接口
│   └── ... 
├── Models/                   # 資料庫實體與 Context
│   ├── ErpdbContext.cs       # EF Core 映射配置
│   └── ...
├── ViewModels/               # function專用模型 (DTO)
│   └── BudgetReportViewModel.cs
├── Views/                    # Razor 頁面 (UI)
│   ├── Transactions/         # 交易相關介面
│   └── Finance/              # 財務分析介面
├── wwwroot/                  # 靜態檔案
│   ├── js/                   # 處理前端 Chart.js 與 Fetch 邏輯
│   └── lib/                  # Bootstrap & jQuery 庫
└── Program.cs                # 系統啟動與 DI 注入
```
## 其他說明

- 預設無種子資料，請自行新增員工、角色等基本資料。
- Razor Pages 介面支援下拉選單選擇資料表內容。
- 前端圖表功能需網路連線載入 Chart.js。
