# 03 — 日期欄改用選的

**What to build:** 四個手打日期的欄位改成用選的：貸款「預計結清月份」與投資「期初月份」用 App 內月份選擇器（年份左右切換＋12 個月格子，貸款多「未定」）；投資交易「日期」與總資產核對「餘額日期」用 iOS 內建日期滾輪。

**Blocked by:** 無

**Status:** ready-for-agent

**Owner:** `investment`（貸款欄位問 `budget-reserve`、總資產核對問 `monthly-close`）　**Spec:** [規格](../spec.md) 第 6–8 點

- [ ] 翰陞 2026-11-15 同意新增 `@react-native-community/datetimepicker`；用 `npx expo install` 安裝，只加這一個套件
- [ ] 共用元件放 `src/ui/`：`MonthPicker`（可選「未定」）與日期選擇（包 datetimepicker，iOS 以面板或行內呈現）
- [ ] 檔案：`src/app/loans.tsx`、`src/app/investment.tsx`（期初月份、交易日期）、`src/app/close-assets.tsx`
- [ ] 選擇範圍與現有驗證一致（例如餘額日期不可晚於今天、交易日期限制照帳本服務規則）；拿掉 YYYY-MM／YYYY-MM-DD 格式錯誤訊息
- [ ] PR 內文寫明：新原生套件，iPhone 要 npm ci → pod install → 重新建置
- [ ] 模擬器截圖四個欄位的選擇器

**共同規則**：從最新 `claude/project-thread-xdtlp5` 開分支 `claude/ui2-NN-<slug>`，PR（draft）合回 xdtlp5。畫面照 `apps/mobile/AGENTS.md`「UI 風格」（只用 `theme.ts`、`kit.tsx`、`LargeTitle.tsx`）。驗收前在 `apps/mobile` 跑 `npm test`、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`；規則改動先寫帳本服務層的失敗測試（ADR 0006）。不碰翰陞的私人帳本。
