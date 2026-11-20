# 07 — 預算頁區段改成左右翻頁

**What to build:** 預算頁的五個區段（總覽、儲備類、固定支出、照實支、貸款）從「一整頁上下捲、點標籤跳到區段」改成「一個區段一頁、左右滑切換」；上方標籤可點，直接翻到那一頁。

**Blocked by:** PR #35–#40（第二輪 01–06）先合併，特別是 04（拿掉預算頁「尚未設定預算歸屬」卡）

**Status:** ready-for-agent

**Owner:** `budget-reserve`　**Spec:** [規格](../spec.md) 第 18–22 點

- [ ] 大標題「預算」、月份切換、五個標籤固定在上方；只有下面的內容左右翻頁（Q1）
- [ ] 手指拖動時標籤下的彩色線條跟著手指移到相鄰標籤，放開停在該頁；點標籤以翻頁動畫直接到那一頁；手感與明細支出／收入翻頁（票 01）一致，盡量共用同一個翻頁元件（Q2）
- [ ] 在第一頁往右、最後一頁往左只回彈，不循環（Q3）
- [ ] 每頁各自上下捲動並記住位置，翻走再翻回來仍在原位；換月份時所有頁回到最上面（Q4）
- [ ] 「挪用儲備」「可用餘額補入儲備」入口在總覽頁與儲備類頁都有（Q5）
- [ ] 不再需要 `src/ui/sectionNav.ts` 的跳轉計算與吸頂標籤；確認沒有其他頁使用後移除該檔與測試，或保留並說明原因
- [ ] 讀取中、錯誤重試、沒有上限設定、已結月份唯讀等既有狀態在每頁照舊
- [ ] 用已安裝的 reanimated＋gesture-handler，不加套件；搭配 `src/ui/haptics.ts` 在換頁時給 selection 回饋
- [ ] 模擬器截圖：總覽、儲備類、拖到一半、最後一頁回彈

**共同規則**：從最新 `claude/project-thread-xdtlp5` 開分支 `claude/ui2-07-budget-paging`，PR（draft）合回 xdtlp5。畫面照 `apps/mobile/AGENTS.md`「UI 風格」。驗收前在 `apps/mobile` 跑 `npm test`、`npx tsc --noEmit`、`EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`。不碰翰陞的私人帳本。研究串的預算 UX 票（`.scratch/budget-ux/`，PR #42）改的是調整畫面與預算與分類頁，不改預算分頁，可平行。
