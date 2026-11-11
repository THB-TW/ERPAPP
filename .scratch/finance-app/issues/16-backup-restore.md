# 16 — 備份檔匯出與匯入還原

**What to build:** 使用者在設定一鍵匯出整本帳的備份檔（經分享面板存到檔案、iCloud Drive 或 AirDrop），也能匯入備份檔整本還原；設定顯示上次備份日期。

**Blocked by:** 01 App 骨架：記一筆支出並在月曆看到

**Status:** 程式完成（2026-11-11）；待真機實測（票 02 之後）與設定頁入口（票 07 合回後）

**Owner:** `import-export-backup`（見 `docs/agents/team.md`）　**Spec:** [規格](../../finance-product/spec.md)

- [x] 匯出用 SQLite 備份機制產生單一檔案，帶識別標記、結構版本與最後修改時間
- [x] 匯入前驗證識別標記、結構版本與完整性；不是本 App 的檔案或版本比 App 新時拒絕並說明；版本較舊時先遷移
- [x] 匯入是整本取代、不合併；取代前自動把目前的帳另存一份可復原
- [x] 要匯入的備份比目前的帳舊時先警告
- [x] 設定頁顯示上次備份日期
- [x] 測試：匯出再匯入後所有查詢結果相同；錯誤檔案被拒；取代前有另存
- [ ] 真機實測並記錄：iCloud 裝置備份還原後資料庫完整

## Comments

2026-11-11（票 04 完成後）：舊帳轉換程式的輸出目前是純 SQLite（`user_version` 3），沒有備份檔識別標記與最後修改時間。這張票定出格式後，要回頭讓轉換程式補寫，並驗一次「轉換輸出能被匯入備份檔吃進去」。

2026-11-11 完成（主 thread 實作；規範、規格、`import-export-backup`、`legacy-migration`、正確性五路審查各配一位反駁驗證，全 Sonnet）：
- **備份檔格式（定案）**：就是帳本的 SQLite 檔，用 `VACUUM INTO` 產生單一一致的檔案。識別標記＝SQLite 檔頭 `application_id = 0x45525041`（ASCII「ERPA」）；結構版本＝`PRAGMA user_version`；時間在新資料表 `ledger_meta`（`last_modified_at` 帳本最後變動、`last_backup_at` 匯出時間）。標記由遷移 v4 寫入，所以**帳本檔本身與舊帳轉換程式的輸出都已是合格的備份檔**，轉換程式不用改；`convert.test.ts` 已加一條「輸出檔用匯入備份檔在全新手機還原，內容相同」。
- **最後修改時間**：帳本服務的每個寫入交易結束前，若真的改了資料就記一次（`trackModifications`，之後新增的指令自動算進來）。升級前就有帳的帳本在遷移 v4 以升級當下補記。
- **匯入**：驗證（標記、版本、`integrity_check`、`foreign_key_check`）→ 複製成暫存檔（原檔不動，較舊結構在暫存檔上遷移）→ 目前的帳另存 `before-restore-*.db` → 單一交易內逐表取代 → 清暫存。另存檔只留最近一次，檔名記在 `ledger_meta`，重開 App 仍可在備份頁「復原到匯入前」。
- **上次備份日期**：iOS 分享面板被取消與存好了回報相同，所以面板關閉後問一句「備份檔存好了嗎？」，答已存好才記（`recordBackupDelivered`）。
- 帳本服務新增：`getBackupStatus`、`exportBackup`、`recordBackupDelivered`、`inspectBackup`、`restoreBackup`；錯誤碼 `invalid_backup`、`backup_too_new`、`backup_corrupt`、`backup_older`、`backup_failed`、`backup_unavailable`。邏輯在 `src/ledger/backup.ts`，畫面 `src/app/settings-backup.tsx`（路徑 `/settings-backup`），原生能力 `src/platform/backupTransfer.ts`。
- 新增套件（翰陞同意）：`expo-sharing ~58.0.22`、`expo-document-picker ~58.0.4`。雲端連不到 api.expo.dev，是用 npm 指定 SDK 58 的版本裝的；到 Mac 上請跑一次 `npx expo install --check` 確認。
- `legacy-migration` 確認：對月結數字影響為 0（沒碰 `src/calc`、財務文件與舊帳帶入）。
- 審查後留著沒改、交給之後決定的：(a) 六個錯誤碼沒有合併（測試靠它區分情境）；(b) 設定頁的「超過 35 天」紅字是規格外加的，常數 `BACKUP_REMINDER_DAYS` 在 `src/ui/backupText.ts`，票 21 做通知時共用。

**待真機實測（票 02 之後）**
- [ ] iCloud 裝置備份還原後資料庫完整（含 `before-restore-*.db` 另存檔也在）
- [ ] 匯出：分享面板開得起來，存到「檔案」、iCloud Drive、AirDrop 到 Mac 都拿得到 `ledger-backup-日期-時間.db`，檔案在 Mac 上打得開
- [ ] 匯入：從「檔案」選備份檔 → 兩段確認 → 整本取代；回記帳頁看到的是備份內容（畫面有重新整理）
- [ ] 選到不是備份的檔案（照片、PDF）時顯示「不是這個 App 的備份檔」，帳不變
- [ ] 「復原到匯入前」可用；關掉 App 重開後按鈕還在
- [ ] expo-sqlite 上 `VACUUM INTO ?`、`ATTACH DATABASE ?` 帶參數可執行（雲端只在 Node 的 SQLite 驗過；原始碼核對可行）
- [ ] 選檔器複製進暫存區的檔案用完有刪掉、分享完的暫放檔有刪掉（App 佔用空間不長大）
- [ ] 七千多筆交易的帳，匯出與匯入各花多久
- [ ] 舊帳轉換程式的輸出 AirDrop 到 iPhone 後能匯入（票 17）
