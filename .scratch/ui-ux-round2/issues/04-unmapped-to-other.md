# 04 — 沒有預算歸屬的分類一律計入「其他」

**What to build:** 支出分類沒有預算歸屬時，預算頁進度與月結都計入儲備類「其他」，不再擋月結；「其他」成為固定分類。見 ADR 0007。

**Blocked by:** 無

**Status:** ready-for-agent

**Owner:** `budget-reserve`；交叉確認 `legacy-migration`（58 個月舊帳與已結月份數字不變）　**Spec:** [規格](../spec.md) 第 9–12 點

- [ ] `src/calc/budgetEngine.ts` 月結時找不到歸屬（約第 470 行「尚未設定有效的預算歸屬」）改成計入「其他」；預算頁進度同一規則
- [ ] 從開放月份起生效；已結月份快照、58 個月搬遷資料不重算、不改
- [ ] 有歸屬的分類照舊；使用者之後指定歸屬就改計到該類別
- [ ] 「其他」固定存在：不能刪除、停用、改名，只能改上限；開帳時自動建立；帳本裡若沒有「其他」（舊備份）要能補上並有測試
- [ ] 預算頁拿掉「以下支出尚未設定預算歸屬」卡片與 `unmapped` 顯示
- [ ] 帳本服務測試：沒歸屬的分類月結成功且計入「其他」、指定歸屬後改計、已結月份不變、「其他」不能停用
- [ ] 更新 `.scratch/finance-product/spec.md` 第 8 條「新分類預設照實支」與相關段落，改成本規則

**共同規則**：從最新 `claude/project-thread-xdtlp5` 開分支 `claude/ui2-NN-<slug>`，PR（draft）合回 xdtlp5。畫面照 `apps/mobile/AGENTS.md`「UI 風格」（只用 `theme.ts`、`kit.tsx`、`LargeTitle.tsx`）。驗收前在 `apps/mobile` 跑 `npm test`、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`；規則改動先寫帳本服務層的失敗測試（ADR 0006）。不碰翰陞的私人帳本。
