# 02 — 預算與分類改成分組清單＋編輯面板

**What to build:** 把設定的「預算與分類」從「先選四種模式再選分類」的表單，改成依組別分組的分類清單：上方彩色長條看上限分配，點分類開編輯面板改名稱、組別、上限、歸屬，每組底部新增，停用放在面板裡。

**Blocked by:** 無（可與 01 平行；票 ui-ux-round2/04「其他」固定分類若已合併，照它鎖定「其他」）

**Status:** ready-for-agent

**Owner:** `budget-reserve`　**Spec:** [規格](../spec.md) 第 10–16 點　**原型:** [prototype.html](../prototype.html)「預算設定」分頁

- [ ] `src/app/budget-settings.tsx` 改寫：拿掉 MODES 四個模式鈕
- [ ] 頂部卡片：每月上限合計＋彩色分段長條（react-native-svg 或 View 皆可）＋圖例；照實支不列入；註明「從開放月份 X 開始，已結月份不變」
- [ ] 三組分組清單，組標題旁白話說明；每列：色點、名稱、「包含：…」歸屬摘要、上限（照實支顯示「照實支」）、›
- [ ] 每組最後一列「＋ 新增 X 分類」，開空白編輯面板並預選組別
- [ ] 編輯面板（formSheet）：名稱、組別分段按鈕、上限（＋／− 500、滑桿 0～20,000 每格 100、可直接輸入）、歸屬標籤＋「＋ 加入」（列出尚未歸屬到此的支出交易分類）、常用原因標籤＋自由輸入（必填）、即時前後差異、「儲存」
- [ ] 儲存時依變動組出 `BudgetCommand`（edit／add／map），沿用 `previewBudgetCommand` → `runBudgetCommand`；歸屬變動走既有 map 指令，多個變動依序送，任何一個失敗就停下並顯示錯誤
- [ ] 面板最下方「停用這個分類…」：儲備類要選剩餘儲備轉入罐子，沿用 retire 的 `previewAdjustment`／`confirmAdjustment` 與權益檢查
- [ ] 「其他」名稱與組別鎖定，只能改上限，面板說明原因
- [ ] 頁面下方保留上限版本紀錄（可展開）
- [ ] 不改帳本服務；現有預算設定相關測試全過
- [ ] 模擬器截圖：清單全貌、編輯面板、新增面板、「其他」面板、停用流程

**共同規則**：從最新 `claude/project-thread-xdtlp5` 開分支，PR（draft）合回 xdtlp5。畫面照 `apps/mobile/AGENTS.md`「UI 風格」，不加套件。驗收前在 `apps/mobile` 跑 `npm test`、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`。不碰翰陞的私人帳本。
