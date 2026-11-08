# 手機即時預算與每月自動對帳：決策地圖

Labels: wayfinder:map
Status: open
Created: 2026-11-08

## Destination

選定每月新台幣 200 元內、適合 iPhone 的方案，逐步完成舊帳與現有功能保留的移轉。使用者已選 Cloudflare 與 LINE，並授權開始實作；先完成正式來源與資料確認，再驗證手機版、雲端與切換。

## Notes

- 使用者已確認：iPhone；最新月費上限 200 元（原 300 元已被取代）；生活預算每月 1 號至月底；5 號發薪；7 號信用卡結帳。
- 接受每月手動匯出一次銀行資料，其餘自動；願意採手機網頁輸入，條件是同樣方便；實際方案仍待成本比較。
- 第一版只需各分類剩餘預算即時更新，不需要預計薪水或月底收入預測。
- 每月 7 號自動整理，正式月結一律由使用者確認；有差異或必要資料缺漏時維持待處理。
- 使用者有家中設備，但不願承擔連外風險；本次比較排除家中設備提供遠端服務。雲端方案仍需登入、授權與備份，不承諾零風險。
- 7 號銀行結帳、銀行資料可取得、生活預算月結是不同事件。不得把缺資料或尚未入帳視為已核對或確定漏記。
- 技能：wayfinder、grilling、domain-modeling；研究票依 research 技能處理。
- 最新官方費率、本地副本盤點與推薦見[研究文件](research.md)。持續月費估算不含開發人力；研究結案不等於部署或效能已驗證。
- 本地 Markdown tracker：每張票獨立檔案；Type 與 Labels 記種類；Status: open/claimed/resolved；Assignee 是認領；Blocked by 使用實際檔名；解答追加於票的 Answer，地圖只留摘要連結。
- 已找到正式來源 `SQLEXPRESS/ERPAPP`，基準 aa309580634af449f0b543ef3b21830e13c4a82f；設定指向 `.\SQLEXPRESS / ERPDB`。新工作位於 `cloudflare-finance` 獨立 worktree/分支，執行追蹤見[實作規格](../../cloudflare-finance/.scratch/cloudflare-migration/spec.md)。
- 使用者補充：資料庫、語言、架構與套件可優化，不綁 SQL Express/C#；以完整保留資料及業務行為為準，手機輸入必須方便快速。
- 現有副本使用 ASP.NET Core 8、SQL Server，已有月結、預算版本與匯入去重設計；選方案須盤點這些規則，不能因換平台而默默捨棄。
- Subagent 必須 sonnet；本次工具可用模型未提供 sonnet，因此不以其他模型替代。使用者已明確要求繼續研究，本輪由主代理直接核對官方文件及本地程式，將研究成果保存在此地圖下。工作目錄沒有 Git，因此不虛構研究分支或推送。

## Decisions so far

- [決定手機記帳入口與漏記提醒速度](issues/01-input-and-alerts.md)：接受方便的手機網頁輸入、日常即時預算，以及每月銀行匯入後才提醒疑似漏記。
- [決定預計收入與每月自動整理的界線](issues/02-income-and-close.md)：只更新分類剩餘預算；7 號自動整理，月結每次由使用者確認，缺資料或差異未處理不完成月結。
- [查明雲端候選方案的完整成本與既有規則沿用程度](issues/03-hosting-and-migration.md)：免費 Cloudflare 輕量網頁為主要推薦，需移植規則；Railway 沿用 C# 為備案，尚無 200 元內實測帳單保證。
- [查明 iPhone 與銀行資料取得方式及提醒限制](issues/04-source-feasibility.md)：首版採每月銀行 CSV；LINE 免費摘要、網頁提示及 Email 備援可行，手機銀行下載與實際登入/通知仍需驗證。
- [選定手機記帳與自動對帳方案](issues/05-choose-solution.md)：使用者已選 Cloudflare、LINE 與月費上限 200 元，授權先確認正式來源與資料後開始實作。
- [正式來源與舊帳基準](../../cloudflare-finance/docs/cloudflare/baseline.md)：完整備份與獨立唯讀副本建立；16 表 7,823 列及 58 個資產月份本機搬移核對通過。

## Not yet specified

- 選定平台後，正式來源確認、完整資料搬遷、備份還原及登入復原的具體驗收與切換安排。
- 取得完整銀行樣本後，釐清退款、分期與同額多筆等差異處理的細部互動。
- 平台可行性查明後，判斷是否需要手機操作原型來選方案。

## Out of scope

- 未通過完整驗收前覆寫或退役舊平台，以及自動更正歷史帳務。
- 家中電腦或 NAS 提供遠端服務。
- 第一版的預計薪水、月底收入預測，以及每日銀行漏記提醒；使用者確認目前不需要。

