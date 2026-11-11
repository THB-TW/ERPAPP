# Cloudflare 移轉：正式來源與舊帳基準

確認日期：2026-11-08。此階段只備份、讀取與驗證，不改正式交易或啟用雲端。

## 正式來源

- 正式專案：`C:\Users\User\Documents\記帳\SQLEXPRESS\ERPAPP`。
- Git 基準：`aa309580634af449f0b543ef3b21830e13c4a82f`，原分支 `master`。兩份實際設定都指向 `.\SQLEXPRESS / ERPDB`；密碼未複製到移轉程式或輸出。
- 原專案 tracked 檔案沒有未提交修改；原有四份未追蹤開發文件保留，也另存私人備份。
- 獨立 worktree：`C:\Users\User\Documents\記帳\cloudflare-finance`，分支 `cloudflare/mobile-finance`。
- 先前研究讀取的是 `.diagnostics/budget-commit-check`；正式版本包含「可用餘額補儲備」等後續行為，移轉以正式程式及 `CONTEXT.md` 為準。

## 一致性備份與資料清冊

以 SQL Server `COPY_ONLY + CHECKSUM` 建立完整原生備份，`RESTORE VERIFYONLY` 成功；還原至獨立資料庫 `ERPDB_CloudflareBaseline_20261108_115129`，設定 `READ_ONLY`，`DBCC CHECKDB` 通過。正式 `ERPDB` 保持原狀，原有驗證庫亦未修改。

私人資料均位於本 worktree 的 `.private/ERPDB_CloudflareBaseline_20261108_115129/`，Git 忽略；不得直接放入網站、部署檔或公開版本庫。

| 保存項目 | 數量／範圍 |
|---|---|
| SQL 資料表 | 16 張，共 7,823 列 |
| 交易 | 7,033 筆；2017-06-04 至 2026-11-06 |
| 信用卡明細 | 605 筆 |
| 資產月份 | 58 個；2022-01 至 2026-10 |
| 舊預算投影 | 55 列，和資產月份數不同，不補造缺失月份 |
| 預算上限 | 28 列 |
| 財務文件 | 1 份，版本 1；58 個月結、28 個上限版本、1 筆調整 |
| 投資資料 | 3 標的、1 期初、3 交易、12 估值 |
| 帳戶／分類／成員 | 3／11／2 |
| 登入與權限原始資料 | 3 員工、3 權限；原生備份保存，登入密碼不帶入雲端暫存 |
| 外部原始檔 | 10 份，包括原始 CSV、年度財報、銀行數字與設定指定的信用卡累積存檔 |
| 原始碼 | Git 全部 refs 的 bundle，加四份未追蹤開發文件 |

備份 SHA-256：`aa73b94440f68db28dca1c8fa43babea6de856e784fe75db58339ea0d23549de`。原生備份約 6.18 MiB；SQL 配置容量約 80MB，不能把配置容量當實際 D1 資料量。

## 已完成驗證

- 唯讀 SQL 匯出保存所有欄位、NULL、日期、原始財務文件與 SQL 物件定義；每份檔案都有 SHA-256。
- decimal、money 與 bigint 以字串匯出，避免 JavaScript 數字轉換造成投資數量或版本精度流失。
- 58 個月的可用餘額、學費儲備、總儲備金、帳面總資產，與財務文件逐月比對，**差異 0 個月**；原本歷史差異保留，不自動修補。
- 建立本機 SQLite/D1 相容的暫存結構；保留沒有主鍵表的每一列和合法重複交易，不做 `DISTINCT`。
- 對 16 張表、7,823 列逐欄比對來源與輸出 SQL 重播結果，全部相同；唯一刻意排除欄位是 `Employee.Password`。完整密碼仍只在私人舊系統備份中保存。
- 本機 SQLite 檔案完整性檢查通過。這是**本機搬移驗證**，尚未證明 Cloudflare D1 實際部署成功。
- 原有十組預算純計算案例通過，包括更正、挪用、補入儲備、防重送、撤銷重結與歷史快照；不對正式庫執行整合測試。
- 新搬移工具四項測試通過：重複列/中文/NULL/精度保存、密碼排除、來源篡改拒收、私有輸出路徑與清冊完整性。

## 執行工具

需 Windows PowerShell 7、整合驗證可讀 SQL Server，以及含 `node:sqlite` 的 Node 24。新工具沒有第三方 runtime 套件。

```powershell
# 只接受特定命名且 READ_ONLY 的還原副本；不接受 ERPDB。
.\tools\export-finance-baseline.ps1 `
  -SnapshotDatabase ERPDB_CloudflareBaseline_20261108_115129 `
  -OutputDirectory '<本 worktree 的 .private 下全新匯出目錄>'

node tools/prepare-d1-baseline.mjs '<已驗證私人匯出目錄>' '<全新私人輸出目錄>'
node --test tools/test/prepare-d1-baseline.test.mjs
dotnet run --project tests/ERPAPP.Tests.csproj
```

工具拒絕覆寫既有輸出。這些檔案是移轉證據，**不是可直接公開的網站內容**。`legacy_*` 是完整舊帳保留層，後續仍需新的業務資料模型、權限與移轉版本，不能把暫存資料表當作完成的新平台。

## 原有功能保留範圍

- 交易新增、修改、刪除、查詢、分析；已結期間修改限制及原有成員/帳戶/類別。
- 分類預算、上限版本、分類歸屬、停用、儲備挪用、可用餘額補儲備、沖銷與更正。
- 月結、月結撤銷與重結、核對紀錄、原始快照與既有異常標記。
- 天天記帳/銀行 CSV、Big5、數量式去重、信用卡明細及 CSV 累積存檔能力。
- 投資標的、交易、成本、市值、投入淨額、估值與資產分配。
- 個人資料的登入與存取限制；保留員工/權限歷史，但不公開舊密碼驗證。

Cloudflare 版本逐項驗收通過前，舊平台不退役。現有缺失與改善應另外列案，不能在搬移時偷偷重算或刪資料。

## 2026-11-11 由原生備份重新匯出（雲端工作環境）

原本在 Windows 產生的 JSON 匯出沒有帶到 Mac／雲端，改由同一份原生備份重新匯出，供 App 的舊帳轉換與 58 個月比對使用（見 `docs/legacy-migration.md`）。

- 來源：上面記錄的原生備份檔，SHA-256 `aa73b94440f68db28dca1c8fa43babea6de856e784fe75db58339ea0d23549de`，重新計算相符；`RESTORE VERIFYONLY ... WITH CHECKSUM` 成功。
- 還原成 `ERPDB_CloudflareBaseline_20261108_115129`（SQL Server 2022 Linux 容器），`DBCC CHECKDB` 無訊息，設為 `READ_ONLY` 後才匯出。16 張表、7,823 列，與上表相同。
- 用 `tools/export-finance-baseline.ps1`（PowerShell 7，`-Server` 指到容器、`-SqlUser` 搭配環境變數 `ERPAPP_SQL_PASSWORD`）匯出：16 張表、58 個資產月份、歷史資產不符 0 個月。
- **這份匯出的清冊（`manifest.json`）SHA-256：`636041caf67752429e49124595e325328306da773d45f64661ad40ec2ab5ded0`**。之後跑轉換或比對時可用 `--manifest-sha256` 釘住。清冊含產生時間，所以每次重新匯出雜湊都不同；資料內容以備份檔雜湊為準。
- 私人資料只在工作環境的 `.private/`，沒有進 Git。
