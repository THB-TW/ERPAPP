# 03 — 明細依分類／成員／帳戶

**What to build:** 明細圓餅下方加分類／成員／帳戶標籤，帳本服務提供依成員、帳戶彙總。

**Blocked by:** 無　**Status:** done（PR #52）　**Owner:** `ledger-entry`　**Spec:** 第 5–6 點

- [ ] 帳本服務月報加 groupBy（category｜member｜account），轉帳排除
- [ ] 「其他」合併只在分類；停用成員／帳戶照樣列
- [ ] 測試三種彙總總額相同

**共同規則**：PR（draft）合回 `claude/project-thread-xdtlp5`。畫面照 `apps/mobile/AGENTS.md`「UI 風格」，不加套件。驗收前在 `apps/mobile` 跑 `npm test`、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`。不碰翰陞的私人帳本。
