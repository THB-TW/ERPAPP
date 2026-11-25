# 01 — 預設圖示與既有帳本補圖示

**What to build:** 新帳本預設分類／帳戶／成員帶圖示、拿掉「其他收入」；遷移 v15 依名稱補空白圖示（分類、帳戶、自己）。

**Blocked by:** 無　**Status:** done（PR #52）　**Owner:** `ledger-entry`　**Spec:** [規格](../spec.md) 第 1–3 點

- [ ] accounts.icon 欄位；遷移 v15 只補空白、名稱完全相同，不動金額
- [ ] 新帳本預設分類改為規格清單（v1 seed 常數保留不動，舊帳匯入判斷照舊）
- [ ] 帳戶列表與選擇畫面顯示圖示
- [ ] 測試：新帳本預設、遷移補圖示不覆蓋使用者自訂、金額不變

**共同規則**：PR（draft）合回 `claude/project-thread-xdtlp5`。畫面照 `apps/mobile/AGENTS.md`「UI 風格」，不加套件。驗收前在 `apps/mobile` 跑 `npm test`、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`。不碰翰陞的私人帳本。
