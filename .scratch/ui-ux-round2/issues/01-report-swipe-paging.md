# 01 — 明細支出／收入跟手翻頁

**What to build:** 明細頁左右滑時，圓餅圖與下方類別列表整塊跟著手指移動，放開後翻到另一頁或彈回；上方「支出／收入」切換鈕同步。點切換鈕也用同樣的翻頁動畫。

**Blocked by:** 無

**Status:** ready-for-agent

**Owner:** `ledger-entry`　**Spec:** [規格](../spec.md) 第 1 點

- [ ] 用已安裝的 react-native-reanimated＋react-native-gesture-handler 實作，不加套件
- [ ] 手指移動時內容即時跟隨；放開時依位移或速度決定翻頁或彈回；垂直捲動不受影響
- [ ] 切換鈕的選取狀態在翻頁完成時同步；點切換鈕同樣有翻頁動畫
- [ ] 換月份、展開類別等既有行為不變
- [ ] 模擬器錄影或截圖：拖到一半、翻頁完成、彈回三種狀態

**共同規則**：從最新 `claude/project-thread-xdtlp5` 開分支 `claude/ui2-NN-<slug>`，PR（draft）合回 xdtlp5。畫面照 `apps/mobile/AGENTS.md`「UI 風格」（只用 `theme.ts`、`kit.tsx`、`LargeTitle.tsx`）。驗收前在 `apps/mobile` 跑 `npm test`、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`；規則改動先寫帳本服務層的失敗測試（ADR 0006）。不碰翰陞的私人帳本。
