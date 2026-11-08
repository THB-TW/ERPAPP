# 第一階段審查

Date: 2026-11-08
Baseline: aa309580634af449f0b543ef3b21830e13c4a82f
Scope: 本機來源確認、備份及可攜式移轉工具；不含手機網站或雲端功能完成宣告。

## Standards

- 沿用本地 Markdown tracker，不建立 GitHub issue。
- 未使用舊 EF migration；正式專案與業務程式保持不變。
- 新工具不含第三方 runtime 依賴。財務資料、密碼、原始匯出及 SQL 均在 `.private/` 且已實測 Git 忽略。
- PowerShell 匯出只接受特定命名且唯讀的副本，對 ERPDB 的拒收檢查通過。
- SQL 產物中的字串使用 UTF-8 hex literal，保留引號、換行及 NUL，避免文字 SQL 插值遺失內容。
- 已修正實際測試發現的 Node SQLite TEXT 內嵌 NUL 讀取截斷問題：驗證時以 BLOB 取得完整 UTF-8 bytes。

## Spec

- 正式專案設定與 SQL 實庫已確認，不再使用診斷副本作為移轉依據。
- 16 表全列保留，不刪除重複交易，不重算舊月份；精度、NULL、原始文檔與投資資料保留。
- 舊密碼保留於私人原生備份，但排除新的 D1 相容資料層。
- 已保存正式庫之外的信用卡累積 CSV、原始 CSV、年度財報與 Git 歷史。
- 本機 SQLite 重播不代表已通過 Cloudflare D1 CPU/容量/部署驗證；文件有明確標示。
- 手機便利性與速度要求已寫入實作驗收；新網站尚未實作，不冒充完成。

## Validation

- COPY_ONLY/CHECKSUM、RESTORE VERIFYONLY、獨立還原與 DBCC CHECKDB 通過。
- 原生備份檔 SHA-256 及完整 Git bundle 驗證通過。
- 58 個月四項資產比對一致。
- 16 表 7,823 列排除 Password 後的逐欄比對一致；本機 SQLite 檔案 630,784 bytes，integrity_check 通過。
- 新工具四項行為測試通過；原 C# 純計算十組案例通過，保留既有 nullable 警告。
- PowerShell 語法檢查、Node 語法檢查及 git diff --check 通過。

## Independence

使用者指定子代理必須 sonnet，但目前工具未提供該模型；因此由主代理檢查標準與需求兩個面向，未宣稱完成獨立子代理審查。正式部署前仍須另驗證雲端環境、本人登入、LINE 授權、備份還原與真機速度。
