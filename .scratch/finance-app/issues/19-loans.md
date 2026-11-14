# 19 — 貸款／分期

**What to build:** 付費使用者建立貸款或分期，月結時自動提撥每月繳款並累積成該筆的儲備；記繳款支出時儲備與剩餘本金減少；結清後停止提撥。翰陞的學費儲備變成其中一筆，數字不變。

**Blocked by:** 11 月結精靈基本流程

**Status:** ready-for-human（2026-11-11 程式與自動測試完成；待 iPhone 與真實 58 個月驗收）

**Owner:** `budget-reserve`（見 `docs/agents/team.md`）　**Spec:** [規格](../../finance-product/spec.md)

- [x] 可建立、修改貸款：名稱、總額、每月繳款、剩餘本金、預計結清月份
- [x] 月結提撥當月繳款（不足一期提撥剩餘本金），計入當月總開銷並累積成該筆儲備
- [x] 分類選該筆貸款的支出，在月結時從其儲備扣掉並減少剩餘本金；沒有繳款交易時只累積
- [x] 剩餘本金為 0 後不再提撥
- [x] 帳面總資產包含各貸款儲備
- [x] 既有的學費儲備以資料庫遷移轉成一筆貸款；舊版備份檔匯入時同樣遷移
- [x] 預算頁「貸款」區顯示進度條、剩餘本金、每月繳款、預計結清月份
- [x] 測試：只提撥時與原學費儲備逐月數字相同；票 03 的全部案例仍通過
- [ ] 經 legacy-migration agent 確認 58 個月比對在遷移後仍為 0 差異

## Comments

2026-11-11 完成（程式與自動測試；真實舊帳及 iPhone 實機驗收尚未執行）：

- TDD 從帳本服務 `index.ts` 進入真正 SQLite，先確認缺少建立貸款、提撥、繳款／精靈、原因驗證、舊學費遷移與分類衝突等案例失敗，再逐步實作。新增 16 個服務測試，沒有畫面自動測試，沒有使用私人帳本或真實 CSV。
- 帳本服務新增 `createLoan`、`updateLoan`、`listLoans`、`listLoanRevisions`，指令集中 `loans.ts`，`index.ts` 僅接線。每次修改保留完整設定、生效月份、原因及時間；寫入經 `openLedger` 的 `db.transaction`，連同財務文件版本與 `ledger_meta` 原子更新。無權益拒絕新增／修改，查詢唯讀；畫面沿用 `closeEntitlement.ts` 的集中判斷，票 22 未做，沒有付費牆。
- 月結沿用 `budgetEngine.ts`，貸款純計算在 `calc/loanReserve.ts`。每月依月初剩餘本金提撥；繳款只在完成月結時扣儲備與本金，不再重複算一般支出。儲備不足可呈負數，繳款超過剩餘本金則整筆月結拒絕並要求核對。原 `Tuition` 欄位保留作全部貸款儲備合計，只計入帳面總資產一次；舊快照、上限、收據、調整與歷史差異原樣保留。
- 設定從開放月份生效，已結月份讀當次貸款快照；以仍有效的月結識別碼決定本金／儲備，撤銷重結與成功重送不會重扣，後來建立的貸款也不會追溯較早月份。修改貸款會使舊精靈預覽失效。貸款專屬分類及舊預算別名有雙向名稱防護，不能同時指定一般預算用途。
- 遷移固定使用 **v10**，新增 `loans`、`loan_terms`、`loan_closes`。現有 `schema_migrations` 逐版判斷，所以 v6～v9 後補仍會執行；備份／開檔的支援版本改取最高版本，還原暫存檔一律補跑遷移，已測同為 v10 時後補 v6。
- 原機升級、舊版備份還原、舊帳整批帶入及財務文件匯入都能承接舊學費。舊資料沒有總額、本金與結清月份，這三項保留 `null`、標示待補，補齊前沿用當月舊學費提撥，不能由儲備反推。承接時不新增交易分類，保留舊帳轉換工具的分類完整核對；補齊後才建立可供記繳款的分類。整本 SQLite 備份涵蓋三張新表與全部貸款版本／月結快照，往返後可繼續撤銷重結。
- 畫面新增「設定 → 貸款／分期」，包含五項資料與必填原因、預覽確認、鍵盤避讓、錯誤重讀、唯讀設定紀錄；預算新增第 5 個貸款跳轉區與進度卡。一般預算歸屬選單排除貸款分類。月結資產與歷史快照標籤改為貸款／分期儲備。
- legacy-migration 交叉審查確認目前未見錯帳阻擋；**合成** 58 個月遷移前後全部月結檢視與上限快照相同，17 個合成歷史差異原值保留，且只提撥時逐月與舊算法相同。這不能代替真實 58 個月比對；依私人資料限制沒有執行該驗收，最後一項保持未勾，舊系統不退役、不重算。
- 驗證：在 `apps/mobile` 執行 `TMPDIR="$PWD/.loan-test-tmp" npm test`，**362／362 通過、0 失敗**；`npm run typecheck` 通過；`git diff --check` 通過。將暫存位置放本 worktree 同時避開 macOS `/var` 與 `/private/var` 路徑別名。預設暫存位置已重現使用者告知的 `tools/legacy-compare/run.test.ts` 既有失敗，沒有修改該測試。舊轉換測試只更新新增資料表的預期清單，沒有改比對基準。專案沒有 lint 指令或設定，沒有安裝額外套件。測試暫存資料與輸出於完成時清理。
- 未新增套件，未改任何 `_layout.tsx` 或指定禁改的 4 個檔案，沒有 git add／commit／push、分支操作或 PR。

新增檔案：

- `apps/mobile/src/ledger/loans.ts`、`loanMigration.ts`、`loans.test.ts`、`loanLegacy.test.ts`、`loansBackup.test.ts`
- `apps/mobile/src/calc/loanReserve.ts`
- `apps/mobile/src/app/loans.tsx`、`apps/mobile/src/ui/LoanCards.tsx`

修改檔案：

- `apps/mobile/src/ledger/index.ts`、`migrations.ts`、`budgetCommands.ts`、`budgetPage.ts`、`monthlyClose.ts`、`financeDocument.ts`、`backup.ts`、`inspect.ts`、`backup.test.ts`
- `apps/mobile/src/calc/budgetEngine.ts`
- `apps/mobile/src/app/(tabs)/budget.tsx`、`settings.tsx`；`apps/mobile/src/app/budget-settings.tsx`、`close-snapshot.tsx`
- `apps/mobile/src/ui/MonthlyCloseSummary.tsx`、`apps/mobile/tools/legacy-convert/convert.test.ts`、本票

待 iPhone 實機驗收：

1. 設定新增貸款，填五項資料與原因，先預覽再確認；修改後查看設定紀錄，檢查鍵盤不遮按鈕、空值／小數／本金超過總額／每月超過 1,000,000／錯誤月份會提示。
2. 預算頂部「貸款」可跳轉；卡片顯示進度、剩餘本金、每月繳款、結清月份與累積儲備；切換歷史月份應讀當時快照。
3. 沒有繳款交易時完成一個月結，只增加貸款儲備，剩餘本金不變；帳面總資產含貸款儲備且不重複加總。
4. 記一筆支出並選該貸款分類，月結預覽不改本金，確認完成才扣儲備與本金；一般預算歸屬選單不出現這個貸款分類。
5. 測試剩餘本金小於一期、付清後再月結，最後一期只提撥剩餘本金，歸零後停止；撤銷最近月結再重結，數字不重複扣減。
6. 匯入合成 v5 備份，確認學費儲備與舊月結數字保留、三項本金資料顯示待補；補齊後能以該分類記繳款。再匯出／還原備份，確認設定紀錄、各月儲備與本金完整，並保留還原前另存檔。
7. 票 22 接上後，無權益時既有貸款及設定紀錄可看，新增／修改停用；目前權益集中函式仍為票 11 的暫時啟用狀態。
