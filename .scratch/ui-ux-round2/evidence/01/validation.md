# 票 01 驗證紀錄

2026-11-15，獨立分支基底 615dcc2（claude/project-thread-xdtlp5）。合成資料及臨時 SQLite；未讀寫私人帳本。

在 apps/mobile 執行三項必需檢查，全部 exit 0：

- TMPDIR=/private/tmp npm test
- npx tsc --noEmit
- EXPO_OFFLINE=1 CI=1 npx expo export --platform ios

TMPDIR 使用 macOS 正規路徑，避免既有備份測試將 /var 與 /private/var 視為不同路徑。

```text
ℹ tests 556
ℹ pass 556
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

規則測試的 Red 證據（先執行失敗、再實作；只經由帳本服務）：
本票沒有帳本規則改動，使用既有服務回歸測試；沒有新增 UI 實作鏡像測試。

模擬器已確認按鈕切換及收入完成畫面。自動化工具的 drag／scroll 在此 Simulator 未產生可辨識的連續觸控位移，無法取得可信的半途／彈回證據，因此最後一個截圖勾選項保留未勾；手勢、垂直捲動與手感仍待 iPhone 驗收。

Lint：目前基底沒有 ESLint 設定與依賴；嘗試 CI=1 EXPO_OFFLINE=1 npx expo lint 會啟動安裝兩個套件，已中止並還原 package 變更，以遵守本輪套件範圍。Lint 未完成，不列為通過。
