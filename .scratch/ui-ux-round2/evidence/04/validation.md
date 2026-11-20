# 票 04 驗證紀錄

2026-11-15，獨立分支基底 615dcc2（claude/project-thread-xdtlp5）。合成資料及臨時 SQLite；未讀寫私人帳本。

在 apps/mobile 執行三項必需檢查，全部 exit 0：

- TMPDIR=/private/tmp npm test
- npx tsc --noEmit
- EXPO_OFFLINE=1 CI=1 npx expo export --platform ios

TMPDIR 使用 macOS 正規路徑，避免既有備份測試將 /var 與 /private/var 視為不同路徑。

```text
ℹ tests 562
ℹ pass 562
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

規則測試的 Red 證據（先執行失敗、再實作；只經由帳本服務）：
- ui2-04-draft-red.log: ✖ 開帳選計入其他會覆蓋既有同月草稿歸屬，保留原草稿分類（0 !== 100）；修正後完整回歸通過。
- ui2-04-fixed-red.log: ✖ 其他只能改上限，不能停用、改名或改成非儲備類 (3.152792ms)
- ui2-04-missing-red.log: ✖ 缺少其他的舊帳可補上固定儲備，保留歷史基準與月結數字 (23.221042ms)
- ui2-04-no-caps-red.log: ✖ 只有舊期初基準且沒有上限版本的帳本也能補上其他 (7.336334ms)
- ui2-04-red.log: ✖ 未歸屬支出進度與月結計入其他，已結歷史不變；之後指定歸屬從開放月改計 (16.530666ms)
- ui2-04-review-red.log: ✖ 先明確建立收入及支出分類再匯入歷史 CSV；沿用拒收與數量式去重 (124.603875ms)

服務測試涵蓋未歸屬月結、指定新歸屬、舊快照、缺少其他／上限的舊狀態、開帳新分類、上限安全整數；58 個月合成搬遷回歸全過。未讀寫任何私人帳本。

Lint：目前基底沒有 ESLint 設定與依賴；嘗試 CI=1 EXPO_OFFLINE=1 npx expo lint 會啟動安裝兩個套件，已中止並還原 package 變更，以遵守本輪套件範圍。Lint 未完成，不列為通過。

## 2026-11-19

以 `228b78e` 為基底，在獨立工作樹驗證 `claude/ui2-04-other-reserve`。規則測試使用帳本服務、合成資料與測試建立的暫存 SQLite，未使用私人帳本。

- `TMPDIR=/private/tmp npm test` 通過 563 項，0 失敗；`TMPDIR` 沿用 macOS 正規路徑以避開暫存路徑別名差異。
- `npx tsc --noEmit` 通過。
- `EXPO_OFFLINE=1 CI=1 npx expo export --platform ios` 通過，輸出含 1,854 個模組的 iOS Hermes bundle。
- 基底先執行 `unmappedOther.test.ts` 及開帳草稿的服務測試，確認 5 項依預期失敗。補做首次建立「其他」的額外案例，確認原先未拒絕非儲備類再修改規則。
- 在 Node 啟動時移除全域 `structuredClone`，先確認兩個舊帳相容讀取案例失敗。修改後以同樣環境執行 `unmappedOther.test.ts` 和 `onboarding.test.ts`，20 項通過。
- 借用暫存目錄中的 Expo CLI 預設 ESLint 設定檢查 `src`，未改專案依賴。基底與本分支皆為 exit 1，逐檔比對的規則及訊息完全一致（29 個錯誤、46 個警告）。
