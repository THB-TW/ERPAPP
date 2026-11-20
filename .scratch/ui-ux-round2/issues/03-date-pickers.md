# 03 — 日期欄改用選的

**What to build:** 四個手打日期的欄位改成用選的：貸款「預計結清月份」與投資「期初月份」用 App 內月份選擇器（年份左右切換＋12 個月格子，貸款多「未定」）；投資交易「日期」與總資產核對「餘額日期」用 iOS 內建日期滾輪。

**Blocked by:** 無

**Status:** implemented — awaiting iPhone acceptance

**Owner:** `investment`（貸款欄位問 `budget-reserve`、總資產核對問 `monthly-close`）　**Spec:** [規格](../spec.md) 第 6–8 點

- [x] 翰陞 2026-11-15 同意新增 `@react-native-community/datetimepicker`；用 `npx expo install` 安裝，只加這一個套件
- [x] 共用元件放 `src/ui/`：`MonthPicker`（可選「未定」）與日期選擇（包 datetimepicker，iOS 以面板或行內呈現）
- [x] 檔案：`src/app/loans.tsx`、`src/app/investment.tsx`（期初月份、交易日期）、`src/app/close-assets.tsx`
- [x] 選擇範圍與現有驗證一致（例如餘額日期不可晚於今天、交易日期限制照帳本服務規則）；拿掉 YYYY-MM／YYYY-MM-DD 格式錯誤訊息
- [x] PR 內文寫明：新原生套件，iPhone 要 npm ci → pod install → 重新建置
- [x] 模擬器截圖四個欄位的選擇器

**共同規則**：從最新 `claude/project-thread-xdtlp5` 開分支 `claude/ui2-NN-<slug>`，PR（draft）合回 xdtlp5。畫面照 `apps/mobile/AGENTS.md`「UI 風格」（只用 `theme.ts`、`kit.tsx`、`LargeTitle.tsx`）。驗收前在 `apps/mobile` 跑 `npm test`、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`；規則改動先寫帳本服務層的失敗測試（ADR 0006）。不碰翰陞的私人帳本。

## Comments

2026-11-15：

新增共用 MonthPicker 與 DatePicker；貸款支援未定（服務值 null），投資期初月份改月份格，投資交易／市值快照與資產核對改 iOS 日期滾輪。資產日期套用服務上下限，投資交易禁止套用已結月份；年份切換具有正確無障礙標籤。只新增 datetimepicker 一個套件。

測試結果：三項指定檢查皆通過；pass 557，0 失敗。詳見[驗證紀錄](../evidence/03/validation.md)。規則變更已經服務層 Red → Green；兩位 reviewer 的具體問題已修正。

已完成原生 iOS Simulator 建置，四個欄位皆載入且有截圖；貸款未定選取已確認。貸款截圖受當下捲動位置限制只露出月份格上部，完整月份格另見投資期初畫面；小螢幕捲動請在 iPhone 驗收。未簽名模擬器另有既有通知 Keychain entitlement 警告，日期選擇器正常運作。

截圖：[loan-month.png](../evidence/03/loan-month.png)、[investment-month.png](../evidence/03/investment-month.png)、[investment-date.png](../evidence/03/investment-date.png)、[asset-date.png](../evidence/03/asset-date.png)。

iPhone 驗收步驟：

1. 原生套件需重建：在 apps/mobile 跑 npm ci，接著 pod install --project-directory=ios，再重新建置安裝 iPhone App（尚未生成 ios 時先用 Expo prebuild）。
2. 設定 → 貸款／分期 → 修改：展開結清月份、切年份／月份、選未定，預覽保存後重開確認。
3. 投資 → 設定期初投入額：使用月份格；投資 → 記交易：轉動日期滾輪並套用，已結月份應不能套用。
4. 月結 → 總資產核對：日期只能選結算月底到今天，套用後餘額重算。
5. 在小螢幕捲動貸款表單，確認 12 個月與「未定」皆可看到、操作。

未合併分支，未碰私人帳本。

### 2026-11-19

從 `claude/project-thread-xdtlp5` 的 `228b78e` 建立 `claude/ui2-03-native-date-picker`，沿用四個欄位的選擇器與原生模擬器截圖。貸款可將預計結清月份設為「未定」，既有設定歷史仍可查詢。投資交易若將已結月份日期由「期初」沿用到買進、賣出或配息，畫面會提示改選日期並停用儲存。總資產核對依服務回傳的日期範圍選擇，採用的日期變更後會重新帶入對應餘額。

在最新基底先執行貸款未定的帳本服務測試，確認舊驗證拒絕未定值，再實作並確認測試通過。在 `apps/mobile` 執行 `TMPDIR=/private/tmp npm test`（557 通過、0 失敗）、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`，三項皆通過。測試使用臨時及記憶體 SQLite。

另以臨時安裝的 Expo SDK 58 內建 ESLint 設定檢查本票修改的 TypeScript 檔案，0 個錯誤，4 個警告皆來自基底原有程式碼。

iPhone 驗收請使用測試帳本。

1. 在 `apps/mobile` 跑 `npm ci`。若尚未生成 `ios/`，執行 `npx expo prebuild --platform ios`。接著跑 `pod install --project-directory=ios`，重新建置與安裝 App。原生套件重建說明也已記錄於原先的 [draft PR #37](https://github.com/THB-TW/ERPAPP/pull/37)。
2. 設定 → 貸款／分期 → 修改，從年份與 12 個月中選擇結清月份。選「未定」、預覽並儲存後重開表單，確認欄位仍是「未定」，舊設定仍可查詢。
3. 投資 → 設定期初投入額，選擇期初月份。投資 → 記交易，確認日期滾輪可套用開放月份。切到「期初」選已結月份再切回「買進」，應顯示提示且停用儲存，重新選開放日期即可繼續。
4. 月結 → 總資產核對，確認餘額日期介於結算月底與今天。套用新日期後，確認餘額依選定日期重新帶入。
