# 06 — 調整畫面模式開關與圖像（記帳小白）模式

**What to build:** 設定首頁加「調整畫面：圖像（記帳小白）／清單（會計）」開關，新使用者預設圖像。圖像模式用存錢罐與拖拉搬錢，完成挪用與補入儲備。

**Blocked by:** 05（同一頁）；PR #31（觸感）先合併

**Status:** ready-for-agent

**Owner:** `budget-reserve`　**Spec:** [規格](../spec.md) 第 15–17 點

- [ ] 設定值存在帳本 settings（隨備份帶走），預設圖像；設定首頁「顯示」區一個切換列
- [ ] 會計模式＝票 05 之後的清單畫面
- [ ] 圖像模式：上方「可用餘額」錢包；每個使用中的儲備類分類一個存錢罐（兩欄），水位與金額表示累積儲備；固定支出、照實支不出現
- [ ] 按住錢包／罐子拖到另一個罐子，放開才跳面板：金額（預填可搬上限，輸入框＋「+100」「+1,000」）、原因必填、預覽前後金額、確認；錢包→罐子走補入儲備，罐子→罐子走儲備挪用（沿用帳本服務 `previewAdjustment`／`confirmAdjustment`，不加新規則）
- [ ] 超過上限確認鈕停用並顯示「最多可搬 X 元」；餘額 0 的不能拿起，晃動＋`src/ui/haptics.ts` warning
- [ ] 下方最近搬錢紀錄（唯讀），白話用語「搬錢」「存進罐子」，小字標會計用語
- [ ] 用 reanimated＋gesture-handler，不加套件；無權益時唯讀（沿用 `closeEntitlement`）
- [ ] 模擬器截圖：圖像模式、拖拉中、填寫面板、會計模式

**共同規則**：從最新 `claude/project-thread-xdtlp5` 開分支 `claude/ui2-NN-<slug>`，PR（draft）合回 xdtlp5。畫面照 `apps/mobile/AGENTS.md`「UI 風格」（只用 `theme.ts`、`kit.tsx`、`LargeTitle.tsx`）。驗收前在 `apps/mobile` 跑 `npm test`、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`；規則改動先寫帳本服務層的失敗測試（ADR 0006）。不碰翰陞的私人帳本。
