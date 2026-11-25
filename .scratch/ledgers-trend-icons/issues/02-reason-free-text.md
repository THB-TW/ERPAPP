# 02 — 挪用原因拿掉快選

**What to build:** 搬錢面板與預算設定拿掉預設原因標籤，原因仍必填 1–300 字。

**Blocked by:** 無　**Status:** done（PR #52）　**Owner:** `budget-reserve`　**Spec:** 第 4 點

- [ ] `src/ui/VisualAdjustments.tsx`、`src/app/budget-settings.tsx` 刪 REASONS 標籤
- [ ] 空白原因不能確認（按鈕停用＋提示）

**共同規則**：PR（draft）合回 `claude/project-thread-xdtlp5`。畫面照 `apps/mobile/AGENTS.md`「UI 風格」，不加套件。驗收前在 `apps/mobile` 跑 `npm test`、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`。不碰翰陞的私人帳本。
