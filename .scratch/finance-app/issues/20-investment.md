# 20 — 投資

**What to build:** 付費使用者記台股個股與虛擬貨幣的期初、買進、賣出、配息，手動填市值快照，看到成本、已實現與未實現損益、財產分配；月結的總資產核對自動帶入累計投入淨額。

**Blocked by:** 13 總資產核對

**Status:** done（2026-11-11；程式與自動測試完成，iPhone 實機與私人舊帳驗收待執行）

**Owner:** `investment`（見 `docs/agents/team.md`）　**Spec:** [規格](../../finance-product/spec.md)

- [x] 可建立台股個股標的（代號、名稱）與一個虛擬貨幣標的
- [x] 交易類型：期初、買、賣、配息；買賣標示資金來源為帳內或帳外，帳內要指定帳戶並計入該帳戶餘額
- [x] 台股用移動平均成本，賣出的已實現損益四捨五入（遠離零）到整數，賣光時成本歸零；虛擬貨幣用成本收回法、不認列損益
- [x] 數量用十進位運算，不用浮點
- [x] 缺股數、賣超、未知交易類型被拒絕並說明
- [x] 市值快照手動輸入並保留歷史；不接報價
- [x] 財產分配中非投資部分先扣掉累計投入淨額
- [x] 總資產核對自動帶入累計投入淨額（上界為結算月月底）
- [x] 舊帳轉換程式補上投資資料（標的、期初、交易、市值快照）的搬遷，比對工具補上各標的成本與累計投入淨額的比對
- [x] 計算有測試，數字與舊系統的算法一致

## Comments

2026-11-11 完成（程式與自動測試；尚未在 iPhone 操作，也未讀取私人帳本／CSV 或執行真實 58 個月驗收）：

- TDD：先新增帳本服務測試，確認 13 個失敗，再實作投資指令；審核補充的十進位時間排序與溢位案例亦先紅後綠。投資帳務測試由 `src/ledger/index.ts` 匯出的帳本服務配真 SQLite 執行，工具另有轉換／比對端到端及 CLI 參數測試，不對畫面寫自動測試。
- 舊算法逐條對照 `Services/InvestmentCalculator.cs`、`Services/InvestmentService.cs`、Controller、SQL 與 ADR 0001。數量／單價以字串輸入（舊 `decimal(18,4)` 範圍），運算用 BigInt 模擬 C# decimal 的 96 位元係數、最多 28 位小數與中間最近偶數捨入；最終金額／每筆已實現損益才遠離零。包含 5÷6×3 的中間精度邊界，另用本機 C# 對照 1,000 組合成算術，0 差異。
- 台股移動平均、賣光歸零；虛擬貨幣成本收回且可為負、不認列已實現損益。缺股數、賣超及無效輸入以繁中原因拒絕，SQLite 交易完整還原。期初部位、期初投入額分開；配息只累加標的收益，若入帳需另記一般收入。
- 新增 v13 四張投資表。沿用既有 `schema_migrations` 各版獨立判斷，不占用 v6～v12；測試涵蓋 v11 升級與 v13 之後補入 v12、重開不重做。備份動態涵蓋所有表；測試驗證完整投資資料、快照歷史、淨額、帳戶餘額往返與取代前另存復原。
- 投資寫入使用 `openLedger` 傳入的同一個 `db.transaction` 與序列佇列；`index.ts` 只接線，`errors.ts` 只增加一個投資錯誤碼。寫入前檢查集中付費權益，畫面沿用 `hasMonthlyCloseEntitlement()`；到期可查不可寫，不新增付費牆。此集中判斷目前仍是票 22 預留接點，真實 StoreKit 到期狀態待該票整合。
- 設定頁只加一列 `/investment` 入口；投資子頁提供部位、損益、財產分配、期初宣告、四種交易、手動快照及歷史。沒有修改任何 `_layout.tsx`、月結精靈或指定禁止修改的四個檔案，也沒有新增套件。
- legacy-migration 交叉確認：帳內買賣只影響帳戶實體餘額，不進一般收支。總資產核對採結算月底投入淨額，並倒回月底後至餘額日期的帳內買賣；不用市值。投資／期初異動使過期核對無法完成，單純市值異動不影響核對。八項月結計算、原始快照、歷史財務文件與既有差異標記均不改寫；合成測試確認月結計算結果守恆。未以私人基準驗收，不能宣稱真實 58 個月已通過。
- 轉換工具搬入全部投資四表，保留來源編號、小數字串、停用狀態與時間戳。舊系統沒有交易帳戶，歷史列保留空值；開帳後帳內買賣必須明確傳 `--investment-account '交易編號=帳戶名稱'`，缺漏或錯誤即停止，不能猜測。轉換後重新開檔由服務逐筆讀回；比對工具有獨立 C# decimal 算法，核對各標的成本、損益、配息、市值、期初與截止月淨額，以及全部交易／快照原貌。摘要只放統計，不含私人標的或金額。
- 驗證：在 `apps/mobile` 以 worktree 內的暫存目錄執行 `TMPDIR="$PWD/.investment-test-tmp" npm test`，411／411 通過；`npm run typecheck` 通過，`git diff --check` 通過。預設 macOS 暫存目錄的測試另重現既有 `/var` 與 `/private/var` 路徑別名單一失敗，未修改該斷言或修補既有問題。專案沒有 lint script，沒有宣稱通過 lint。
- 依指示僅改檔案，未執行 git add／commit／push、未開 PR，也未切換或建立分支。

新增檔案（以下相對 `apps/mobile/`）：

- `src/app/investment.tsx`
- `src/calc/investment.ts`、`src/calc/investmentDecimal.ts`
- `src/ledger/investment.ts`、`investmentCashFlows.ts`、`legacyInvestments.ts`、`investment.test.ts`、`investmentBackup.test.ts`、`investmentReview.test.ts`
- `tools/legacy-convert/investments.ts`、`investments.test.ts`、`investmentConvert.test.ts`
- `tools/legacy-compare/investments.ts`、`investments.test.ts`

修改檔案（以下相對 `apps/mobile/`，最後兩項為 repo 根目錄）：

- `src/app/(tabs)/settings.tsx`
- `src/ledger/accounts.ts`、`assetCheck.ts`、`cardStatementBackup.test.ts`、`errors.ts`、`index.ts`、`legacyImport.ts`、`migrations.ts`
- `tools/legacy-convert/cli.ts`、`cli.test.ts`、`convert.ts`、`convert.test.ts`、`legacyData.ts`、`testExport.ts`
- `tools/legacy-compare/compare.ts`、`report.ts`、`report.test.ts`、`run.ts`、`run.test.ts`、`run.checks.test.ts`
- `docs/legacy-migration.md`、本票檔

待 iPhone 實機驗收：

1. 設定 → 投資，建立台股（代號／名稱）與一個虛擬貨幣桶；確認重複代號／第二桶被拒絕。
2. 設定獨立期初投入額，另建期初部位；記台股小數股數買進、部分賣出、全賣與配息，確認成本／已實現損益／收益；測缺股數與賣超的繁中原因。
3. 帳內買賣選帳戶，返回帳戶確認扣款／入帳；帳外買賣不動帳戶。虛擬貨幣賣出大於成本時，確認負成本且不認列損益。
4. 台股填單價、虛擬貨幣填總市值各兩次，展開歷史確認都有保留；檢查未實現損益與財產分配的非投資部分已扣淨額。
5. 在可結月份新增月底投資與次月買賣，進月結核對，確認淨額只含月底以前且次月買賣有倒回；市值變動不改核對。保留核對後再變更投資，確認須重新核對。
6. 匯出備份到「檔案」後還原，確認投資、期初、全部交易／快照、帳戶餘額仍一致，再試取代前另存復原。
7. 小螢幕與鍵盤彈出時捲動表單，儲存／取消可按；票 22 接上真實權益後測試到期只讀、既有資料仍可看且不能新增／修改。
