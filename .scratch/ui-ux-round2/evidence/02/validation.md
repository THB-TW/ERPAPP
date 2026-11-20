# 票 02 驗證紀錄

2026-11-15，獨立分支基底 615dcc2（claude/project-thread-xdtlp5）。合成資料及臨時 SQLite；未讀寫私人帳本。

在 apps/mobile 執行三項必需檢查，全部 exit 0：

- TMPDIR=/private/tmp npm test
- npx tsc --noEmit
- EXPO_OFFLINE=1 CI=1 npx expo export --platform ios

TMPDIR 使用 macOS 正規路徑，避免既有備份測試將 /var 與 /private/var 視為不同路徑。

```text
ℹ tests 558
ℹ pass 558
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

規則測試的 Red 證據（先執行失敗、再實作；只經由帳本服務）：
- ui2-02-red.log: ✖ 明細使用所選月份的預算歸屬，未歸屬保持獨立分類，收入不套支出歸屬 (11.033625ms)

模擬器使用合成「AI 測試」未歸屬支出，已確認灰色合併、列表分列及收入彩色。

Lint：目前基底沒有 ESLint 設定與依賴；嘗試 CI=1 EXPO_OFFLINE=1 npx expo lint 會啟動安裝兩個套件，已中止並還原 package 變更，以遵守本輪套件範圍。Lint 未完成，不列為通過。
