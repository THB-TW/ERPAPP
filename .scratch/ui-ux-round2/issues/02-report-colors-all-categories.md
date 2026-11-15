# 02 — 明細圓餅圖：有預算分類彩色、其餘灰色「其他」，列表列出全部分類

**What to build:** 支出圓餅圖中，有預算歸屬的交易分類各自一塊彩色；沒有預算歸屬的分類和預算的「其他」合成一塊灰色「其他」（只在圖上合併）。下方列表照記帳的交易分類列出全部，不再有合併的「其他分類」列。收入頁每個分類各自彩色。

**Blocked by:** PR #31（SVG 圓餅圖）先合併

**Status:** implemented — awaiting iPhone acceptance

**Owner:** `ledger-entry`（預算歸屬判斷問 `budget-reserve`）　**Spec:** [規格](../spec.md) 第 2–5 點

- [x] 帳本服務提供明細需要的「這個分類有沒有預算歸屬」（以所選月份採用的歸屬為準）；有測試
- [x] 支出：有歸屬的分類依金額大到小上色，前 7 個用現有 `chartColors`，第 8 個起同色系淺一階；灰色只給「其他」
- [x] 灰色「其他」＝預算類別「其他」的分類＋所有沒有歸屬的分類
- [x] 列表列出每個交易分類（含沒有歸屬的），色點與圖上對應；拿掉 `MAX_SLICES` 與「其他分類」合併列
- [x] 收入頁每個分類各自彩色，列表全部列出
- [x] 模擬器截圖：支出（含沒有歸屬的分類）、收入

**共同規則**：從最新 `claude/project-thread-xdtlp5` 開分支 `claude/ui2-NN-<slug>`，PR（draft）合回 xdtlp5。畫面照 `apps/mobile/AGENTS.md`「UI 風格」（只用 `theme.ts`、`kit.tsx`、`LargeTitle.tsx`）。驗收前在 `apps/mobile` 跑 `npm test`、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`；規則改動先寫帳本服務層的失敗測試（ADR 0006）。不碰翰陞的私人帳本。

## Comments

2026-11-15：

帳本服務依所選月份／已結快照回傳分類的預算歸屬。支出圖將未歸屬與預算「其他」合成灰色切片，列表保留所有交易分類；收入全部彩色。超過七個彩色分類使用同色系淺色，不再截斷列表。

測試結果：三項指定檢查皆通過；pass 558，0 失敗。詳見[驗證紀錄](../evidence/02/validation.md)。規則變更已經服務層 Red → Green；兩位 reviewer 的具體問題已修正。

模擬器使用合成「AI 測試」未歸屬支出，已確認灰色合併、列表分列及收入彩色。

截圖：[expense-unmapped.png](../evidence/02/expense-unmapped.png)、[income.png](../evidence/02/income.png)。

iPhone 驗收步驟：

1. 在測試帳本新增未指定預算歸屬的支出分類，與「其他」各記一筆支出。
2. 明細支出圖確認兩者合成灰色「其他」，下方仍各一列；其他有歸屬分類各自彩色。
3. 切到收入確認每個分類都有彩色與列表列；切歷史月份確認依當時歸屬顯示。

未合併分支，未碰私人帳本。
