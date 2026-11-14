# 12 — 信用卡帳單匯入與核對

**What to build:** 付費使用者在月結第二步選一張信用卡並匯入帳單 CSV，計算步驟自動比對記帳與帳單，對不上的列出來，全部對上才能繼續。

**Blocked by:** 08 帳戶、轉帳與帳戶餘額、11 月結精靈基本流程

**Status:** done（2026-11-11；合併票 15 後已接上手機選檔讀檔，iPhone 實機驗收待完成，見 Comments）

**Owner:** `monthly-close`（見 `docs/agents/team.md`）　**Spec:** [規格](../../finance-product/spec.md)

- [x] 支援銀行原始匯出檔（前 10 列內找「消費日、摘要、新臺幣金額」）與三欄檔；三欄檔任一列形狀不符整份拒收
- [x] 負數的繳款列不匯入、不計數
- [x] 匯入先選信用卡帳戶；重複匯入同一份帳單不新增重複列（數量式去重，鍵為日期｜店家｜金額加所屬卡）
- [x] 核對以「日期＋金額」比較該月該卡的記帳筆數與帳單筆數；不相等時列出日期、金額、兩邊筆數並拒絕完成月結
- [x] 支援 Big5 與 UTF-8；Big5 解碼器隨 App 打包（服務已驗證；手機選檔已接上共用讀檔流程，待實機驗收）
- [x] 沒有信用卡的使用者可略過這一步
- [x] 舊帳轉換程式補上信用卡明細的搬遷，比對工具補上筆數與金額加總的比對
- [x] 以上有測試，含舊系統「多一筆帳單列就拒絕月結」的案例

## Comments

2026-11-11 合併票 15 後修正：

- 已重現 `index.ts` 重複匯出 `CsvFormatError` 導致的 TS2300 與測試載入 `SyntaxError`。移除從 `csvTransactions.ts` 的間接匯出，保留從 `csv/records.ts` 的唯一匯出；兩種 CSV 匯入仍使用同一個類別，畫面的 `instanceof` 不變。
- `csv/cardFilePort.ts` 改成直接重新命名匯出共用 `csvFilePort` 與 `CsvFilePortError`，沿用信用卡畫面既有名稱；移除未再使用的 reader／factory，沒有複製選檔與讀檔實作，也沒有修改票 15 的 `filePort.ts`。共用流程以 `expo-document-picker` 選檔及產生快取副本，再由正式依賴的 `expo-file-system` 讀原始位元組，最後清除本次快取副本；UTF-8／Big5 留給帳本服務解碼。取消選檔回傳 null，讀檔錯誤仍可安全顯示，貼上 CSV 的備援保留。先前「iPhone reader 尚未接上」的限制已解決。
- 新增真 SQLite 的帳本服務回歸測試，確認信用卡與記帳 CSV 的畸形檔都能用帳本入口的 `CsvFormatError` 識別，且不留下任何帳單或交易。先確認失敗，再修正；兩種 CSV 局部測試 34／34 通過。
- 最終 `npm test` **406 個通過、0 失敗**；`npm run typecheck` 通過、0 錯誤；`git diff --check` 通過。完整測試的 `TMPDIR` 指向 worktree 內並已清除，未修改既有 legacy-compare 的 macOS `/var`／`/private/var` 路徑別名測試。
- 本次只修改 `apps/mobile/src/ledger/index.ts`、`apps/mobile/src/csv/cardFilePort.ts`、`apps/mobile/src/ledger/cardStatements.test.ts` 與本票檔。未新增套件或遷移，未改帳務規則或月結數字，未執行任何 Git 寫入指令。
- 尚待 iPhone 實機驗證：從「檔案」及 iCloud Drive 選 UTF-8／Big5 假帳單、取消選檔、讀檔錯誤後改用貼上備援，以及選檔匯入後重匯去重。此次未進行實機操作。

以下保留首次完成時的實作與驗證紀錄；其中原生讀檔缺口已由上方修正解決。

2026-11-11 完成（程式、自動測試；實機與原生讀檔限制如下）：

- 新帳單指令、查詢與核對集中在獨立模組，`index.ts` 只加型別匯出及佇列接線。匯入使用 `openLedger` 的 `db.transaction`，整份解析與月份驗證通過才寫入。三欄檔任何壞列拒收整份；銀行檔沿用舊摘要逗號與右側金額錨定，拒絕不明確的未加引號千分位。負數不寫入、不列入新增或略過筆數。CSV 匯入依產品規格維持免費；月結沿用 `closeEntitlement.ts`，未新增付費牆。
- 核對只按該月、該卡、日期、金額比較支出筆數，掃兩邊鍵的聯集，不用店家配對、日期容差、退款或分期推測。預覽、完成與相容的直接 close 指令都檢查；成功收據重送不重做。總資產頁遇到後續交易改動導致失配，也會顯示日期、金額、兩邊筆數與返回帳單核對入口。
- 遷移固定使用 **v11**，新增 `card_statements`；既有 `schema_migrations` 逐版紀錄可在 v11 後補 v6～v10。修正備份與開檔檢查原本以遷移清單長度當最高版本的假設，備份還原複本每次逐版補齊。測試涵蓋帳單與所屬卡、合法重複、整本還原、取代前另存復原、v5 舊備份及同 v11 後補 v6。
- `encoding.ts`、`big5Table.ts`、`records.ts` 從 `claude/ticket-15-csv` 以 `git show` 原封複製，逐檔位元組／SHA-256 比對完全一致。沒有新增套件。依 Expo 58 DocumentPicker 官方 API，iPhone 只有 URI，`file`／`base64` 為 Web 專用；因此選檔採 `CardStatementBytesReader` 可注入介面，未使用未宣告的 `expo-file-system`。**目前 iPhone 原生 reader 尚未接上，選檔會清楚提示改用貼上 CSV；Big5 原始位元組已經服務測試驗證，但手機直接選 Big5 檔仍待 reader 接線與實機驗證。** 未建立選檔快取副本。
- 舊帳轉換原樣搬入全部卡明細與合法重複列，不套一般匯入的去重或已結鎖定。舊 `dbo.creditcard` 沒有卡識別：唯一信用卡自動歸屬，多卡需 `--card-account` 或互動明確指定全表所屬卡；混合多卡不能自行猜測分配。輸出重開讀回驗證明細與卡歸屬。比對工具新增筆數、金額加總與逐列數量驗證；正式基準包含 605 筆。合計超出安全整數時明確停止，不用捨入值驗收。
- legacy-migration 交叉審核：本票新增核對門檻，**未改月結計算引擎或八項月結數字**；舊財務文件、歷史差異與明細原樣保存。合成資料測試驗證成功月結、失配拒絕、重送與八項數字。未讀 `.private`，未執行私人 58 個月驗收或兩個月並行，不能宣稱正式搬遷驗收通過。
- TDD 主切片均先確認失敗再實作：匯入 API 缺少、數量式去重、銀行摘要解析、帳單額外列拒絕月結、v11 備份識別，以及工具搬遷／比對與安全整數拒絕。規範審查無阻擋缺陷；規格審查發現的總資產頁失配顯示已修正。
- 最終 `npm test` **380 個通過、0 失敗**；`npm run typecheck` 通過、0 錯誤；`git diff --check` 通過。為遵守只寫 worktree，完整測試把 `TMPDIR` 指向 worktree 內且執行後清除。先前工具測試使用預設 macOS 暫存路徑時為 178／179 通過，唯一失敗是已知 `/var` 與 `/private/var` 路徑別名；該測試未修改。既有備份測試改用最高遷移號碼，修正連號假設，未放寬新版拒收或舊版升級驗證。
- 未 `git add`、commit、push、建立 PR、切分支或 rebase；未改任何 `_layout.tsx`、禁止共用檔、套件清單或鎖檔。

新增檔案（均在 `apps/mobile/`）：

- `src/ledger/cardStatements.ts`、`cardReconciliation.ts`、`legacyCardStatements.ts`、`cardStatements.test.ts`、`cardStatementBackup.test.ts`。
- `src/csv/encoding.ts`、`big5Table.ts`、`records.ts`、`cardFilePort.ts`。
- `src/app/close-card-statement.tsx`；`src/ui/CardStatementCheck.tsx`、`cardStatementError.ts`。
- `tools/legacy-convert/cardStatements.ts`、`cardStatements.test.ts`；`tools/legacy-compare/cardStatements.ts`、`cardStatements.test.ts`。

修改檔案（均在 `apps/mobile/`，另包含本票檔）：

- `src/ledger/index.ts`、`migrations.ts`、`monthlyClose.ts`、`budgetCommands.ts`、`legacyImport.ts`、`legacyImport.test.ts`、`backup.ts`、`backup.test.ts`、`inspect.ts`。
- `src/app/(tabs)/close.tsx`、`src/app/close-calculation.tsx`、`src/app/close-assets.tsx`。
- `tools/legacy-convert/legacyData.ts`、`convert.ts`、`convert.test.ts`、`baseline.ts`、`cli.ts`、`cli.test.ts`、`testExport.ts`。
- `tools/legacy-compare/compare.ts`、`run.ts`、`run.test.ts`、`report.ts`、`report.test.ts`。

待 iPhone 實機驗收（只用自行製作的假帳單）：

1. 月結 → ②信用卡帳單，先選卡再貼上三欄 CSV，確認新增筆數；同檔重匯不新增，同鍵有兩筆時兩筆保留。切另一張卡匯同檔，各卡獨立。
2. 貼上銀行格式（標題前有說明列），確認取「消費日／摘要／新臺幣金額」；負數繳款不匯入、不計數。三欄末段多一欄時整份拒收、不留下前段有效列。
3. 記帳同日同額兩筆、帳單三筆時，畫面列日期、金額、2／3 筆數且不能繼續；補記正確交易後返回，自動重新核對並可進③。
4. 已進④後回記帳改信用卡金額，再回④，確認有詳細失配清單與回②入口，不能完成月結。
5. 沒有信用卡帳戶可略過；未使用的卡兩邊皆 0 筆不阻擋。停用但有舊交易的卡仍參與核對，須啟用後才能匯入。
6. 全部核平 → ③預覽 → ④核對實際帳戶餘額 → 明確確認完成，確認備份提醒與已結鎖定；重新開 App 結果仍保存。
7. 匯出備份、匯入到另一份假帳本，核對卡別、重複筆數、差異與月結快照一致；用取代前另存復原原帳本。
8. 選檔後取消不匯入；分別從「檔案」／iCloud Drive 選 UTF-8／Big5 假檔，核對中文不亂碼、日期金額正確；讀檔失敗時仍可改用貼上 CSV 內容匯入。
