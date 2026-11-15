# 05 — 拿掉沖銷，新增「月結管理」頁

**What to build:** 調整畫面不能再新增「沖銷調整」；「撤銷最近一次月結」與「前期更正」搬到設定裡新的「月結管理」頁，月結精靈頁與調整頁的撤銷入口拿掉。

**Blocked by:** 無

**Status:** ready-for-agent

**Owner:** `monthly-close`（調整頁問 `budget-reserve`）　**Spec:** [規格](../spec.md) 第 13–14、16 點

- [ ] `src/app/adjustments.tsx` 只剩「儲備挪用」「補入儲備」；拿掉沖銷、前期更正、撤銷月結三種模式與每筆紀錄的沖銷按鈕
- [ ] 舊的沖銷紀錄在調整紀錄裡照常顯示（已沖銷／沖銷紀錄標示），帳本服務的沖銷計算與測試保留
- [ ] 新增 `src/app/close-management.tsx`（設定列「月結管理」）：撤銷最近一次月結（先預覽、原因必填）、前期更正（選已結月份、正負金額、原因、預覽）
- [ ] 月結精靈頁與預算頁上的撤銷入口拿掉，只留月結管理這一個入口
- [ ] 不改帳本服務規則；既有測試全過
- [ ] 模擬器截圖：調整頁、月結管理頁

**共同規則**：從最新 `claude/project-thread-xdtlp5` 開分支 `claude/ui2-NN-<slug>`，PR（draft）合回 xdtlp5。畫面照 `apps/mobile/AGENTS.md`「UI 風格」（只用 `theme.ts`、`kit.tsx`、`LargeTitle.tsx`）。驗收前在 `apps/mobile` 跑 `npm test`、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`；規則改動先寫帳本服務層的失敗測試（ADR 0006）。不碰翰陞的私人帳本。
