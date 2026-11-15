# 02 — 明細圓餅圖：有預算分類彩色、其餘灰色「其他」，列表列出全部分類

**What to build:** 支出圓餅圖中，有預算歸屬的交易分類各自一塊彩色；沒有預算歸屬的分類和預算的「其他」合成一塊灰色「其他」（只在圖上合併）。下方列表照記帳的交易分類列出全部，不再有合併的「其他分類」列。收入頁每個分類各自彩色。

**Blocked by:** PR #31（SVG 圓餅圖）先合併

**Status:** ready-for-agent

**Owner:** `ledger-entry`（預算歸屬判斷問 `budget-reserve`）　**Spec:** [規格](../spec.md) 第 2–5 點

- [ ] 帳本服務提供明細需要的「這個分類有沒有預算歸屬」（以所選月份採用的歸屬為準）；有測試
- [ ] 支出：有歸屬的分類依金額大到小上色，前 7 個用現有 `chartColors`，第 8 個起同色系淺一階；灰色只給「其他」
- [ ] 灰色「其他」＝預算類別「其他」的分類＋所有沒有歸屬的分類
- [ ] 列表列出每個交易分類（含沒有歸屬的），色點與圖上對應；拿掉 `MAX_SLICES` 與「其他分類」合併列
- [ ] 收入頁每個分類各自彩色，列表全部列出
- [ ] 模擬器截圖：支出（含沒有歸屬的分類）、收入

**共同規則**：從最新 `claude/project-thread-xdtlp5` 開分支 `claude/ui2-NN-<slug>`，PR（draft）合回 xdtlp5。畫面照 `apps/mobile/AGENTS.md`「UI 風格」（只用 `theme.ts`、`kit.tsx`、`LargeTitle.tsx`）。驗收前在 `apps/mobile` 跑 `npm test`、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`；規則改動先寫帳本服務層的失敗測試（ADR 0006）。不碰翰陞的私人帳本。
