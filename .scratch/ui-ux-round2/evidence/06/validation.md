# 票 06 驗證紀錄

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
- ui2-06-red.log: ✖ 調整畫面預設圖像、切換清單隨帳本備份還原，無效值不寫入 (68.837334ms)

隔離合成帳本已確認無權益唯讀、模式切換、金額預填、超額禁用、原因必填與一次 100 元補入的預覽／確認（43,500→43,400；11,000→11,100）。使用點選替代操作完成；自動化拖曳未能產生可信連續觸控，拖曳中截圖、放手命中與零餘額觸感留待 iPhone，最後截圖勾選項保留未勾。依票的依賴帶入 05 的提交，其餘變更只屬 06；draft PR 仍以 xdtlp5 為目標，請先處理 05。

Lint：目前基底沒有 ESLint 設定與依賴；嘗試 CI=1 EXPO_OFFLINE=1 npx expo lint 會啟動安裝兩個套件，已中止並還原 package 變更，以遵守本輪套件範圍。Lint 未完成，不列為通過。
