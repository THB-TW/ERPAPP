# 01 — 搬錢改成小罐子牆（點兩下＋拖拉）

**What to build:** 把 PR #40 圖像模式的兩欄大罐子改成一排 4 個的小罐子牆，點來源再點目標就開搬錢面板；拖拉保留但不用捲動。搬錢面板加快捷金額、常用原因與即時前後金額。

**Blocked by:** PR #40（ui-ux-round2/06）。直接在分支 `claude/ui2-06-visual-adjustments` 之上開新分支，或等 #40 合併後從 xdtlp5 開。

**Status:** ready-for-agent

**Owner:** `budget-reserve`　**Spec:** [規格](../spec.md) 第 1–9 點　**原型:** [prototype.html](../prototype.html)「A 小罐子牆」分頁

- [ ] `src/ui/VisualAdjustments.tsx`：罐子格子改 4 欄（>16 個改 5 欄），罐子圖示約 30×36、名稱與金額 12 級字，一個畫面（iPhone 15 尺寸）放得下錢包＋10 罐
- [ ] 錢包改為格子上方一整列，標「只能存進罐子」
- [ ] 點兩下：選來源後來源浮起、其他罐子淡藍底；底部提示列「從 X 搬出 → 點要放進去的罐子」＋取消；再點來源取消
- [ ] 長按約 0.3 秒拖拉保留，拖拉中 ScrollView 停用捲動；放開在罐子上才開面板
- [ ] 0 或負餘額不能當來源：晃動＋`haptics.warning`
- [ ] 搬錢面板：來源 → 目標小罐子、⇄ 對調（錢包時無）、大字金額、快捷鈕（補到 0／全部／+100／+1,000／清除）、超額停用並顯示「最多可搬 X 元」
- [ ] 原因：常用原因標籤＋自由輸入，必填
- [ ] 面板內即時「搬完以後」前後金額（小字標儲備挪用／補入儲備）；「確認搬 X 元」才呼叫 `previewAdjustment` → `confirmAdjustment`；拿掉另外的「預覽」按鈕
- [ ] 成功後水位動畫（尊重減少動態效果）＋`haptics.success`，最近搬錢紀錄更新
- [ ] 不改帳本服務；現有搬錢相關測試全過
- [ ] 模擬器截圖：小罐子牆全貌、已選來源、搬錢面板（含補到 0）、超額狀態

**共同規則**：PR（draft）合回 `claude/project-thread-xdtlp5`。畫面照 `apps/mobile/AGENTS.md`「UI 風格」（只用 `theme.ts`、`kit.tsx`、`LargeTitle.tsx`），不加套件。驗收前在 `apps/mobile` 跑 `npm test`、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`。不碰翰陞的私人帳本。
