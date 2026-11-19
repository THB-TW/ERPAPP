# 01 — 明細支出／收入跟手翻頁

**What to build:** 明細頁左右滑時，圓餅圖與下方類別列表整塊跟著手指移動，放開後翻到另一頁或彈回；上方「支出／收入」切換鈕同步。點切換鈕也用同樣的翻頁動畫。

**Blocked by:** 無

**Status:** implemented — awaiting iPhone acceptance

**Owner:** `ledger-entry`　**Spec:** [規格](../spec.md) 第 1 點

- [x] 用已安裝的 react-native-reanimated＋react-native-gesture-handler 實作，不加套件
- [x] 手指移動時內容即時跟隨；放開時依位移或速度決定翻頁或彈回；垂直捲動不受影響
- [x] 切換鈕的選取狀態在翻頁完成時同步；點切換鈕同樣有翻頁動畫
- [x] 換月份、展開類別等既有行為不變
- [ ] 模擬器錄影或截圖：拖到一半、翻頁完成、彈回三種狀態

**共同規則**：從最新 `claude/project-thread-xdtlp5` 開分支 `claude/ui2-NN-<slug>`，PR（draft）合回 xdtlp5。畫面照 `apps/mobile/AGENTS.md`「UI 風格」（只用 `theme.ts`、`kit.tsx`、`LargeTitle.tsx`）。驗收前在 `apps/mobile` 跑 `npm test`、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`；規則改動先寫帳本服務層的失敗測試（ADR 0006）。不碰翰陞的私人帳本。

## Comments

2026-11-15：

明細改成兩頁同時掛載的手勢分頁；拖曳進度、放手落點與點切換鈕共用動畫。選取狀態在落點完成後更新，離開頁面時收合分類。沿用共用 Segmented 樣式與現有套件。

測試結果：三項指定檢查皆通過，556 項測試通過。詳見[驗證紀錄](../evidence/01/validation.md)。本票沒有帳本規則改動。

模擬器已確認按鈕切換及收入完成畫面。自動化工具的 drag／scroll 在此 Simulator 未產生可辨識的連續觸控位移，無法取得可信的半途／彈回證據，因此最後一個截圖勾選項保留未勾；手勢、垂直捲動與手感仍待 iPhone 驗收。

截圖：[income-complete.png](../evidence/01/income-complete.png)。

iPhone 驗收步驟：

1. 明細頁慢慢左右拖動，確認圖表和列表一起跟手；小幅拖動後放開應彈回，快速滑動應翻頁。
2. 點支出／收入按鈕，確認動畫與選取狀態同步。
3. 展開分類後換頁，再切回應收合；換月份、上下捲動仍可正常使用。
4. 請補驗收拖到一半、翻頁完成、彈回三種狀態。

未合併分支，未碰私人帳本。

2026-11-19

在最新基底 `228b78e` 重驗。分類展開狀態由明細頁統一管理，切換月份或翻頁完成才收合。手勢確定接手才中斷現有動畫，垂直手勢在啟動前失敗時會讓動畫繼續。

`npm test` 556 項全過，`npx tsc --noEmit` 與離線 iOS 匯出通過。用暫存的 Expo SDK 58 預設 ESLint 檢查修改的四個檔案，無錯誤或警告。

隔離模擬器可開啟明細頁。AXe 回報無法取得觸控座標轉換，Simulator 視窗的拖曳也未成功送達，半途／彈回證據保留未勾。上一輪的收入完成截圖仍可參考。

iPhone 請用測試帳本開啟明細，先慢拖確認圖表、分類列表和選取底色同步位移。短拖應回原頁，長拖或快滑應翻頁。展開一列後試短拖和成功換頁，再試點按切換與垂直捲動。短拖後保留展開，換頁後收合。
