# 06 — 調整畫面模式開關與圖像（記帳小白）模式

**What to build:** 設定首頁加「調整畫面：圖像（記帳小白）／清單（會計）」開關，新使用者預設圖像。圖像模式用存錢罐與拖拉搬錢，完成挪用與補入儲備。

**Blocked by:** 05（同一頁）；PR #31（觸感）先合併

**Status:** implemented — awaiting iPhone acceptance

**Owner:** `budget-reserve`　**Spec:** [規格](../spec.md) 第 15–17 點

- [x] 設定值存在帳本 settings（隨備份帶走），預設圖像；設定首頁「顯示」區一個切換列
- [x] 會計模式＝票 05 之後的清單畫面
- [x] 圖像模式：上方「可用餘額」錢包；每個使用中的儲備類分類一個存錢罐（兩欄），水位與金額表示累積儲備；固定支出、照實支不出現
- [x] 按住錢包／罐子拖到另一個罐子，放開才跳面板：金額（預填可搬上限，輸入框＋「+100」「+1,000」）、原因必填、預覽前後金額、確認；錢包→罐子走補入儲備，罐子→罐子走儲備挪用（沿用帳本服務 `previewAdjustment`／`confirmAdjustment`，不加新規則）
- [x] 超過上限確認鈕停用並顯示「最多可搬 X 元」；餘額 0 的不能拿起，晃動＋`src/ui/haptics.ts` warning
- [x] 下方最近搬錢紀錄（唯讀），白話用語「搬錢」「存進罐子」，小字標會計用語
- [x] 用 reanimated＋gesture-handler，不加套件；無權益時唯讀（沿用 `closeEntitlement`）
- [ ] 模擬器截圖：圖像模式、拖拉中、填寫面板、會計模式

**共同規則**：從最新 `claude/project-thread-xdtlp5` 開分支 `claude/ui2-NN-<slug>`，PR（draft）合回 xdtlp5。畫面照 `apps/mobile/AGENTS.md`「UI 風格」（只用 `theme.ts`、`kit.tsx`、`LargeTitle.tsx`）。驗收前在 `apps/mobile` 跑 `npm test`、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`；規則改動先寫帳本服務層的失敗測試（ADR 0006）。不碰翰陞的私人帳本。

## Comments

2026-11-15：

帳本 settings 保存 visual/list 模式，預設圖像且隨備份還原。圖像頁提供錢包、兩欄儲備罐、水位、長按拖曳與點來源／目標的無障礙替代操作。沿用預覽／確認服務，具上限、原因、預覽失效、重複提交與權益防護；最近紀錄唯讀並正確顯示舊補入沖銷退回錢包。清單模式沿用票 05。

測試結果：三項指定檢查皆通過；pass 557，0 失敗。詳見[驗證紀錄](../evidence/06/validation.md)。規則變更已經服務層 Red → Green；兩位 reviewer 的具體問題已修正。

隔離合成帳本已確認無權益唯讀、模式切換、金額預填、超額禁用、原因必填與一次 100 元補入的預覽／確認（43,500→43,400；11,000→11,100）。使用點選替代操作完成；自動化拖曳未能產生可信連續觸控，拖曳中截圖、放手命中與零餘額觸感留待 iPhone，最後截圖勾選項保留未勾。依票的依賴帶入 05 的提交，其餘變更只屬 06；draft PR 仍以 xdtlp5 為目標，請先處理 05。

截圖：[read-only.png](../evidence/06/read-only.png)、[visual.png](../evidence/06/visual.png)、[amount-sheet.png](../evidence/06/amount-sheet.png)、[preview.png](../evidence/06/preview.png)、[list.png](../evidence/06/list.png)。

iPhone 驗收步驟：

1. 設定 → 顯示 → 調整畫面切換圖像／清單；重開 App 及測試備份還原後設定應保留。
2. 圖像頁長按錢包拖到罐子，放開應開面板；再測罐子拖到另一罐，途中可上下捲動而不誤觸。
3. 確認預填來源上限，+100／+1,000 可增加；超額顯示最多可搬並停用，原因空白不能預覽。
4. 輸入可用金額與原因 → 預覽 → 確認，核對兩邊餘額及新紀錄；修改金額後應重新預覽。
5. 零餘額來源不能拿起且有晃動／warning 觸感；無權益只可查看。檢查清單、舊沖銷與待重結標示。

未合併分支，未碰私人帳本。
