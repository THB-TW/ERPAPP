# 05 — 拿掉沖銷，新增「月結管理」頁

**What to build:** 調整畫面不能再新增「沖銷調整」；「撤銷最近一次月結」與「前期更正」搬到設定裡新的「月結管理」頁，月結精靈頁與調整頁的撤銷入口拿掉。

**Blocked by:** 無

**Status:** implemented — awaiting iPhone acceptance

**Owner:** `monthly-close`（調整頁問 `budget-reserve`）　**Spec:** [規格](../spec.md) 第 13–14、16 點

- [x] `src/app/adjustments.tsx` 只剩「儲備挪用」「補入儲備」；拿掉沖銷、前期更正、撤銷月結三種模式與每筆紀錄的沖銷按鈕
- [x] 舊的沖銷紀錄在調整紀錄裡照常顯示（已沖銷／沖銷紀錄標示），帳本服務的沖銷計算與測試保留
- [x] 新增 `src/app/close-management.tsx`（設定列「月結管理」）：撤銷最近一次月結（先預覽、原因必填）、前期更正（選已結月份、正負金額、原因、預覽）
- [x] 月結精靈頁與預算頁上的撤銷入口拿掉，只留月結管理這一個入口
- [x] 不改帳本服務規則；既有測試全過
- [x] 模擬器截圖：調整頁、月結管理頁

**共同規則**：從最新 `claude/project-thread-xdtlp5` 開分支 `claude/ui2-NN-<slug>`，PR（draft）合回 xdtlp5。畫面照 `apps/mobile/AGENTS.md`「UI 風格」（只用 `theme.ts`、`kit.tsx`、`LargeTitle.tsx`）。驗收前在 `apps/mobile` 跑 `npm test`、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`；規則改動先寫帳本服務層的失敗測試（ADR 0006）。不碰翰陞的私人帳本。

## Comments

2026-11-15：

調整頁只保留儲備挪用與補入；撤銷最近月結與前期更正移到設定的月結管理。兩個路由共用 AdjustmentScreen；新沖銷入口移除，歷史沖銷標示、帳本規則與服務測試保留。月結精靈移除撤銷入口。

測試結果：三項指定檢查皆通過，556 項測試通過，0 失敗。本票只調整介面，沿用既有帳本服務回歸測試。詳見[驗證紀錄](../evidence/05/validation.md)。

兩個頁面已截圖；截圖來自包含票 05 相同共用畫面的票 06 測試建置，僅合成資料。所有既有服務測試保留並通過。

截圖：[adjustments.png](../evidence/05/adjustments.png)、[close-management.png](../evidence/05/close-management.png)。

iPhone 驗收步驟：

1. 設定 → 預算挪用與調整：只看到儲備挪用、補入儲備，紀錄沒有新增沖銷按鈕。
2. 設定 → 月結管理：切換撤銷最近月結／前期更正；原因空白不能預覽。
3. 在測試帳本輸入原因、預覽前後數字；取消不得變更帳本。確認時仍遵守既有最近月結／已結月份規則。
4. 舊沖銷紀錄仍可讀，月結精靈及預算頁不再提供撤銷入口。

未合併分支，未碰私人帳本。

2026-11-19 複驗

從 `claude/project-thread-xdtlp5` 的 `228b78e` 開出 `claude/ui2-05-close-management-refresh`。沿用既有操作畫面，移除因改用共用元件而閒置的匯入及樣式。調整頁提供儲備挪用與補入，所有撤銷月結入口集中在設定的「月結管理」，前期更正也在此操作。歷史沖銷可以在調整紀錄查看。

`npm test` 556 項通過，`npx tsc --noEmit` 與 `EXPO_OFFLINE=1 CI=1 npx expo export --platform ios` 成功。以 Expo SDK 58 預設設定在暫存副本 lint 本票改動的五個檔案，0 錯誤、2 個既有的重新讀取依賴警告。畫面截圖沿用 11 月 15 日的合成帳本模擬器結果。

iPhone 驗收請使用測試帳本。到設定 → 預算挪用與調整確認只有兩種搬錢操作及歷史紀錄。到設定 → 月結管理，先確認原因留空時不能預覽，再分別預覽撤銷最近月結與正負金額的前期更正。取消預覽後確認數字未變，並在月結精靈與預算頁確認無撤銷入口。
