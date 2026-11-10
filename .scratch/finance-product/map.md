# 台灣 iOS 訂閱制完整財務管理產品（資料存在手機）：決策地圖

Labels: wayfinder:map
Status: open
Created: 2026-11-08

## Destination

第一版產品規格定案：可直接拆成實作票的**單機 iOS App**。所有帳務只存在使用者手機上的同一個資料庫，沒有自家伺服器；涵蓋訂閱方案與權益、備份與換機、舊帳私有匯入，以及「用翰陞自己 58 個月舊帳驗收月結一致」的切換條件。走完地圖＝沒有剩下要決定的事，接著拆實作票。

> 2026-11-08 08:06 目的地重劃（使用者）：「接口應該是統一的，也就是同一個 db；理論上也不是 server 服務，而是存在手機本身；做成 App 的話本來就不會打開電腦了。」取代原先「iOS＋電腦網頁版同一訂閱同一份雲端資料」的第 3 題答案。

## Notes

- 目的地四題（2026-11-08 使用者回覆「都照建議」）：
  1. 規劃先做到**規格定案**，再拆實作票。
  2. 第一版只做**台灣／繁體中文／新台幣**。
  3. ~~iOS 與網頁版同一訂閱、同一份雲端資料、同時上架~~ → 已於 08:06 改為：**只做 iPhone App，資料存在手機本機同一個資料庫，不做自家伺服器與電腦網頁版**。月結、CSV 匯入、投資、報表都要在手機上能完成。
  4. **先用翰陞自己的舊帳驗收 58 個月月結**；通過前舊系統（ASP.NET Core + SQL Server ERPDB）照常使用，不退役、不覆寫、不重算。
- 交接檔的既定決策見[交接](handoff-20261108.md)「最新且優先於舊文件的使用者決策」，不重問：完整財務管理（預算儲備、月結、投資）是第一版價值、快速輸入是體驗要求；一開始就訂閱制；Apple 年費另計、初期雲端 NT$200／月內；LINE 提醒已選但公開產品可重審；技術棧可重審；個人舊帳只匯入本人帳號，絕不成為公開種子資料。
- 舊個人 PWA 地圖在 [mobile-finance-legacy](../mobile-finance-legacy/map.md)：只作歷史與已答個人規則（1–月底生活預算、5 號發薪、7 號信用卡結帳、月結由本人確認、缺資料不完成月結）的來源。它的「私人 Cloudflare Access／單人免費額度／PWA 優先」方向已被本地圖取代。
- 領域語言以 `CONTEXT.md` 為準；不要混用「預算／儲備／帳面總資產」。舊計算核心在 `Services/Budgeting/BudgetEngine.cs`，ADR 0001–0004 仍有效。
- 技能：每張 grilling 票用 grilling＋domain-modeling；research 票用 research（背景 subagent）；prototype 票用 prototype。
- **所有 subagent 一律 Sonnet。**
- 2026-11-08 08:18 使用者確認單機方向四題：不另做電腦版（Apple 晶片 Mac 能跑 iPhone App 當附帶）；只支援一台 iPhone，換機用備份還原、不做即時同步；不需註冊或登入，訂閱綁 Apple ID；提醒不用 LINE，改用 App 本身的本機通知。
- 2026-11-09 使用者對產品定位的一句話：「有點像天天記帳 App，再加上我預算規劃的架構。」快速記帳體驗對標天天記帳，差異化是預算儲備與月結。
- 改成單機後，Cloudflare Workers/D1、自建登入與 LINE 推播都不再是第一版的必要元件；`cloudflare/` 雛形保留不刪，僅作為帳務規則移植的參考。
- 研究成果放在 `research/`（本 repo 只允許推指定分支，因此不另開 `research/<name>` 分支）。
- 雲端作業：不在使用者 Windows 電腦上執行；成果推 GitHub。`.private/` 私人備份不在 Git，需要時請使用者提供，絕不提交。

## Decisions so far

<!-- 每張結案票一行 -->

- [查明 App Store 訂閱與上架規則](issues/01-apple-subscription-rules.md)：訂閱必須用 IAP；台灣 App 內不能導向網頁付款；必須能在 App 內刪帳號；有 Google 登入就要提供 Apple 登入；財務類 App 可能被要求以法人提交。
- [比較訂閱權益驗證與網頁收款方案的成本](issues/02-entitlement-platforms.md)：iOS 用 RevenueCat（US$2,500 MTR 內免費），或改單機後直接用 StoreKit 2 在手機上驗證；Stripe 不支援台灣，網頁收款不做。
- [查明 iOS＋網頁共用程式與離線同步的技術選項](issues/03-stack-and-sync.md)：（改單機後雲端部分失效，見重劃）Expo 58＋Router 共用 iOS／網頁；自建操作佇列＋expo-sqlite；Workers＋共用 D1、以 owner_id 隔離；CPU 待實測。
- [查明登入方案與 NT$200／月可支撐的使用者規模](issues/04-auth-and-cost.md)：（改單機後大多失效：沒有伺服器就不需自建登入與雲端費用）Better Auth 自架（Apple／Google／magic link）；Workers Paid 約 900 人在 NT$200 內，每多 100 人約 NT$36。
- [調查台灣記帳 App 的功能與訂閱定價](issues/05-competitors-pricing.md)：在地年費 NT$600–1,500；競品未見累積儲備、月結核對、台股成本追蹤與網頁版。
- [查明多人通知：LINE 配額與 iOS 原生推播](issues/06-notification-channel.md)：（改單機後：LINE 需要伺服器才能發，待重新決定）公開產品預設用原生推播／Email，LINE 改為可選；本人的 LINE 仍在免費額度內。
- [查明純本機 iOS 財務 App 的技術選項、備份與訂閱驗證](issues/18-local-first-stack.md)：Expo 58＋expo-sqlite、規則移植 TS；備份用 iCloud 裝置備份＋手動匯出檔；StoreKit 2 手機驗證即可；Apple 晶片 Mac 可直接跑 iPhone App。
- [決定公開產品的提醒管道](issues/11-reminder-channel.md)：不用 LINE，所有提醒都用 App 本身的 iPhone 本機通知。
- [決定哪些舊規則是產品預設、哪些是個人設定](issues/09-personal-vs-defaults.md)：三種預算組照舊為核心；學費儲備一般化為「貸款／分期」；有資料者依平均開銷建議預算、否則用翰陞的預設；匯入規格只強制類別與金額，未知分類報錯不自動新增；新增電子支付帳戶；成員選填。
- [做可操作的手機快速記帳與儲備預算原型](issues/12-mobile-entry-prototype.md)：第五版定案；首頁是記帳（上方月曆、點日期看當天帳再新增）、明細是可左右滑切支出／收入的圓餅圖、預算有頂端橫排跳轉列、月結精靈四步且收入與核對自動帶出、調整類功能放設定。
- [決定 58 個月舊帳月結的驗收方法](issues/14-legacy-acceptance.md)：逐月 0 元誤差比對八項月結數字＋交易／信用卡／投資總量；舊帳原樣匯入不重算，再用移植規則重算 58 個月比對；17 個月舊差異原樣保留須同額重現；用 11/08 唯讀備份在翰陞 Mac 上比對、私資料不進 Git；再並行 2 個月後由翰陞簽核。

## Not yet specified

- 產品名稱、品牌、App Store 文案與截圖；等定位與競品研究後再談。
- 新使用者的開帳體驗（初始帳戶餘額、沒有歷史月結時的第一次月結、依匯入資料平均開銷建議預算的計算方式）。
- 銀行／信用卡 CSV 對一般使用者的支援範圍（哪些銀行格式、退款、分期、同額多筆）；舊配對規則不得改義。
- 投資模組對一般使用者的範圍（台股個股、虛擬貨幣桶以外是否要支援、報價來源與授權成本）。
- 客服、營運、隱私權政策、服務條款；資料只在手機上，隱私標籤可能可以申報「不蒐集」，等備份方式定了再確認。
- 手機上月結精靈、CSV 匯入核對、投資頁的大表格怎麼在小螢幕操作；等技術選型與原型後再拆。
- Android 是否、何時推出（使用者未提，第一版目的地不含，但未明確排除）。
- 舊系統退役的最後切換步驟（58 個月驗收通過之後）。

## Out of scope

- 自家伺服器、雲端資料庫與電腦網頁版（08:06 目的地重劃）：[離線同步規則](issues/07-sync-rules.md)、[登入與帳號模型](issues/10-account-model.md)、[電腦網頁版原型](issues/13-desktop-web-prototype.md)、[Worker 實測](issues/16-measure-worker-cpu.md) 已關閉。

- 台灣以外市場、多語系、多幣別（目的地第 2 題）。
- 通過完整驗收前退役、覆寫或重新計算舊平台與舊帳。
- 把翰陞的個人帳務放進公開產品的種子資料、demo 或測試 fixture。
