# 每月預算上限可調整（不寫死在 SP）＋ 歷史快照

Status: ready-for-agent

## 需求（使用者 2026-10-09）

「我要每月的上限可調整，不要寫死在 SP 裡面，但過去就會留快照，每次只會改當月。」

## 現況

`sp_FinanceSummary`（原始碼 `..\SQLServer_SP.TXT`）寫死 12 個上限與學費儲備：

- 10 個儲備類別（food 10000、car 1000、fun 3000、study 1500、cloth 2000、articles 1500、furniture 500、hair 700、health 300、other 1000）：
  結餘＝上限－實支，寫進 budget 當月列並累加到總儲備金（budget date=1911-01-01 那列）。
- 2 個固定支出（phone 599、gogoro 849）：結餘只回到當月盈餘，不進儲備。
- 總開銷 `@expenditure = -37948` ＝ -(12 個上限合計 22948 ＋ 學費儲備 15000)；學費儲備另在 `tuitionfee + 15000` 寫一次。
- 撤銷分支（own=-1）用「同一組上限」重算結餘去扣累計列——上限若在月結後改了，撤銷就扣錯。這就是一定要留快照的原因。

由 budget 結餘＋Transactions 實支反推（2026-10-09 唯讀查詢）：2024-08 起上限一直是現值；
2023-05～2024-07 飲食是 7500，更早各月不同；學費儲備 2026-06 起 15000、之前 0。

## 決定

1. **新表 `dbo.BudgetCap`**（`docs/sql/budget-cap.sql`）：一個月份一列，欄位 = 10 個儲備類別＋phone＋gogoro＋tuition＋updatedAt。
   類別集合固定（budget 表是固定欄位），只有數值可調。值 ≥ 0、month 必為 1 號（CHECK 約束）。
2. **開放月份 (Open Month)** ＝ Property 最新月的次月（今天 = 2026-10）。網站上**只有開放月份可以改**；
   伺服器端也要擋（存檔時重算開放月份，不符就拒絕）。沒有 Property 時以本月 1 號為開放月份。
3. **沿用 (Carry-forward)**：某月沒有自己的列 → 用最近一個較早月份的列。開放月份還沒存過就顯示沿用值。
4. **月結時凍結**：SP 月結某月時，若該月沒有自己的列，就把沿用值寫成該月的列（快照）。之後該月只要是已結月份，網站就不能改。
5. **撤銷**：SP 撤銷分支用該月的快照重算，剛好抵銷；撤銷後快照保留，該月重新變成開放月份，可再改。
6. **總開銷由上限算出**：`-(12 個上限＋tuition)`；學費儲備改讀 `tuition`。SP 裡不再有任何金額常數。
7. **回填**：2024-08～2026-09 用現值（學費 2026-06 前 0、之後 15000），回填檔在 repo 外 `..\BudgetCap_backfill.sql`
   （個人預算數字跟 SP 原始碼一樣不進 repo）。2024-07 以前不回填：那些月份不能再撤銷，用不到快照。
8. **找不到任何快照** → SP `THROW 50001`，訊息「找不到 yyyy-MM（含）以前的預算上限（BudgetCap），請先到「預算上限」頁設定。」，不寫任何東西；
   精靈原本就會把例外訊息顯示成「執行彙總失敗：…」。
9. SP 的參數、輸出欄位、狀態碼都不變——舊版網站（未重啟前）照常可用。

## 介面（網站）

```
Models/BudgetCap.cs                 Month(DateTime, key, 欄位 month) + 13 個 int + UpdatedAt
Models/ErpdbContext.cs              DbSet<BudgetCap> BudgetCaps；ToTable("BudgetCap")、HasKey(Month)
Services/BudgetCapService.cs        GetOpenMonth() / GetEffective(month) / GetHistory() / SaveOpenMonth(input)
Dto/BudgetCapDtos.cs                BudgetCapInput、EffectiveCapsResult
ViewModels/BudgetCapViewModels.cs   BudgetCapIndexViewModel、BudgetCapHistoryRow
Controllers/BudgetCapController.cs  GET Index、POST Save（Edit 角色＋防偽）、GET Effective(year, month) → JSON
Views/BudgetCap/Index.cshtml        開放月份表單（即時算合計與總開銷）＋歷史快照表
Views/Shared/_Layout.cshtml         導覽列「預算上限」
Views/Finance/BudgetReport.cshtml   連結到預算上限頁
Views/MonthlyClose/Index.cshtml     步驟 ③ 顯示「本月採用的上限」與來源月份
Program.cs                          AddScoped<BudgetCapService>
```

## 驗證

- SQL（已完成，見下方紀錄）：兩份 ERPDB 複本（舊 SP／新 SP）跑同一串月結＋撤銷，輸出與 budget、Property 全表一字不差；
  新行為 20 項檢查全過。
- 網站：建置 0 錯誤（`-p:OutDir=<scratch>/out/...`，網站執行中會鎖 bin\Debug，不要停掉）；
  harness 對 ERPDB_T_NEW 複本驗證 service 的開放月份、沿用、存檔守門、歷史狀態。

## 紀錄

- 2026-10-09 SQL：新 SP vs 舊 SP 850 行輸出一字不差（T1 撤銷 9 月、T2 重結、T3 已存在、T4 信用卡不匹配、T5 月結 10 月、
  T6 撤銷 10 月、T7 連續撤銷、T8 重結兩個月）；新行為 N0～N5 共 20 項 PASS。
- 2026-10-09 套用腳本 `..\BudgetCap_apply.sql`（建表＋回填＋SP，一個指令）在第三份新複本上跑兩次：成功且可重複執行，
  套上去的 SP 與受測版本只差結尾空白。`..\SQLServer_SP.TXT` 已換成新版，舊版留在 `..\SQLServer_SP.before-budgetcap.TXT`；
  整庫備份 `MSSQL\Backup\ERPDB_before_budgetcap_20261009.bak`（COPY_ONLY、CHECKSUM 驗證過）。
- **尚未套用到真實 ERPDB**：自動模式的權限分類把它判為正式環境部署而拒絕，需使用者自己執行
  `sqlcmd -S .\SQLEXPRESS -E -d ERPDB -b -f 65001 -i BudgetCap_apply.sql`（在 SQLEXPRESS 資料夾）。
  先套 SQL 再重啟網站；SP 的參數與輸出不變，舊版網站在套用後照常可用。
- 2026-10-09 網站：dotnet-backend 子代理實作，建置 0 錯誤（11 個既有警告）；harness 對 ERPDB_T_NEW 複本 H1～H9 全過。
  主管補上 `[BindRequired]`＋ModelState 檢查（缺欄位或非數字不再默默存成 0）。
  瀏覽器實測（新建置的網站接 ERPDB_T_NEW、port 5099、複本內的拋棄式測試帳號）：
  預算上限頁顯示正確；改飲食 11000 → 即時合計 −38,948、差額 −1,000、欄位標黃；儲存後出現「開放」列且只標黃飲食；
  偽造已結月份、非數字、缺欄位、負數四種送出全被擋且資料不變；只有 Select 角色時全欄唯讀、送出停用、偽造 POST 被拒；
  月結精靈步驟③對已結月（快照＋註記）、開放月（自己的快照）、2020-01（黃色警告）都正確，執行按鈕不受影響。
  測試完已刪除所有複本與測試帳號。
