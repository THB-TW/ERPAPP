# 04 — 財產趨勢頁

**What to build:** 明細第三頁「財產」：已月結月份的帳面總資產＋投資市值折線。

**Blocked by:** 無　**Status:** done（PR #52）　**Owner:** `investment`（月結數字讀取由 `monthly-close` 確認）　**Spec:** 第 7–10 點

- [ ] 帳本服務 `getAssetTrend()`：每個已月結月份 {month, book, investment, total, investmentAtCost}
- [ ] 投資市值與 `getInvestmentPortfolio(月底)` 相同；第一次估值前用成本並標記
- [ ] 畫面：總和／帳面／投資切換、近 12 個月／全部、svg 折線
- [ ] 測試：與財產分配報表一致、只含已月結月份

**共同規則**：PR（draft）合回 `claude/project-thread-xdtlp5`。畫面照 `apps/mobile/AGENTS.md`「UI 風格」，不加套件。驗收前在 `apps/mobile` 跑 `npm test`、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`。不碰翰陞的私人帳本。
