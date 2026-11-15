# 票 03 驗證紀錄

2026-11-15，獨立分支基底 615dcc2（claude/project-thread-xdtlp5）。合成資料及臨時 SQLite；未讀寫私人帳本。

在 apps/mobile 執行三項必需檢查，全部 exit 0：

- TMPDIR=/private/tmp npm test
- npx tsc --noEmit
- EXPO_OFFLINE=1 CI=1 npx expo export --platform ios

TMPDIR 使用 macOS 正規路徑，避免既有備份測試將 /var 與 /private/var 視為不同路徑。

```text
ℹ tests 557
ℹ pass 557
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

規則測試的 Red 證據（先執行失敗、再實作；只經由帳本服務）：
- ui2-03-red.log: ✖ 貸款預計結清月份可選未定，之後可指定或再清空，歷史設定保留 (17.076875ms)

已完成原生 iOS Simulator 建置，四個欄位皆載入且有截圖；貸款未定選取已確認。貸款截圖受當下捲動位置限制只露出月份格上部，完整月份格另見投資期初畫面；小螢幕捲動請在 iPhone 驗收。未簽名模擬器另有既有通知 Keychain entitlement 警告，日期選擇器正常運作。

Lint：目前基底沒有 ESLint 設定與依賴；嘗試 CI=1 EXPO_OFFLINE=1 npx expo lint 會啟動安裝兩個套件，已中止並還原 package 變更，以遵守本輪套件範圍。Lint 未完成，不列為通過。
