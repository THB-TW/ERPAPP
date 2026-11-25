# 05 — 多帳本

**What to build:** 每本獨立 DB 的多帳本、切換、管理頁、整包備份、通知分屬。

**Blocked by:** 01（新帳本預設）　**Status:** done（PR #52，待 iPhone 實機驗收）　**Owner:** `chief-of-staff`（帳本服務 `ledger-entry`、備份 `import-export-backup`、通知 `local-notifications`、權益 `subscription-iap`）　**Spec:** 第 11–17 點　**ADR:** 0008

- [ ] 帳本清單（App 層設定檔／目錄 DB）：id、名稱、排序、檔名；現有 DB 成為第一本，不搬動檔案
- [ ] 切換：記帳大標旁帳本名；各分頁顯示目前帳本；切換重排通知
- [ ] 設定→帳本：新增（名稱→開帳流程）、改名、排序、刪除（確認＋建議備份、最後一本不能刪）；上限 10
- [ ] 備份一包：全部帳本；匯入整包取代；舊單帳本備份可匯入
- [ ] 上次備份日期、35 天提醒、記帳提醒改全域
- [ ] 第二本起進階（總開關關著不鎖）
- [ ] legacy-migration 確認第一本 58 個月數字不變

**共同規則**：PR（draft）合回 `claude/project-thread-xdtlp5`。畫面照 `apps/mobile/AGENTS.md`「UI 風格」，不加套件。驗收前在 `apps/mobile` 跑 `npm test`、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`。不碰翰陞的私人帳本。
