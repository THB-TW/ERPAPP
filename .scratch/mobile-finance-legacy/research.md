# 每月 200 元內的手機記帳方案研究

查證日期：2026-11-08（Asia/Taipei）。本文件是方案研究，未部署、未登入銀行、未建立排程或發送訊息。

實作階段更新：使用者已選 Cloudflare 與 LINE，正式來源也已找到並完成一致性備份。下文「來源未找到」描述的是研究階段的初查狀態，最新事實以[正式來源及舊帳基準](../../cloudflare-finance/docs/cloudflare/baseline.md)為準。使用者允許優化資料庫/語言/架構，目標是保留全部帳務與功能，並非保留原技術棧。

## 建議

主要推薦：**Cloudflare Workers Free + D1 Free + iPhone 主畫面記帳網頁（PWA）+ LINE Messaging API 免費提醒 + Google Drive 異地備份**。

在下列用量與設計條件成立時，持續服務月費預估 **NT$0**。這是根據官方費率的設計估算，不是實際部署帳單或效能測試結論。不自動啟用付費方案；第一版不購買網域、不用 AI API、不買 App Store 年費、不訂閱付費寄信服務。

選擇理由：使用者要 iPhone 快速輸入、分類預算即時更新、每月 CSV 對帳、正式月結自行確認；不要求每日銀行同步或原生手機功能。免費受管服務可避免家中設備連外，也不需自行維護 VPS 作業系統。主要代價是一次性的程式改寫和資料移轉。

若最優先考量改寫工作量，備選是 **Railway Hobby + 原 C# 網站改 SQLite + 持久磁碟**。它可保留更多 C# 程式，但至少 USD 5/月且超額另計，未測量資源消耗前，不能保證穩定低於 NT$200。

## 已確認需求

- iPhone；最新持續月費上限 NT$200。
- 願意改用同樣方便的手機網頁，避免在天天記帳和平台重複輸入。
- 生活預算每月 1 號至月底；5 號發薪；信用卡 7 號結帳。
- 記帳後立即顯示各分類剩餘預算；不做預計薪水或月底收入預測。
- 接受每月手動匯出、上傳一次銀行資料，再檢查疑似漏記。
- 7 號自動整理；每次正式月結由本人確認。缺資料或有未處理差異時不完成月結。
- 排除家中電腦/NAS 提供遠端服務。

## 官方費率與完整持續成本

| 項目 | 主要方案 | 設計下的月費 | 條件與超限處理 |
|---|---|---:|---|
| 手機網頁靜態檔案 | Workers Static Assets | 0 | 靜態請求免費；若執行 Worker 程式，仍計入動態配額 |
| API、即時預算及排程 | Workers Free / Cron | 0 | 每日 100,000 動態請求；每次 CPU 10ms，排程也受免費 CPU 限制；分批處理匯入與歷史資料 |
| 交易、分類、月結與版本資料 | D1 Free | 0 | 每日讀取 500 萬列、寫入 10 萬列；單庫最大 500MB，帳號總儲存 5GB；不可混淆兩個容量數字 |
| 登入保護 | Cloudflare Access Free | 0 | 限本人帳號；實作時驗證 iPhone 主畫面登入、續期及機器備份存取 |
| 網址和 HTTPS | workers.dev 預設網址 | 0 | 不買自有網域；官方定位為個人/hobby 用途，非業務關鍵服務 |
| 短期回復 | D1 Time Travel | 0 | Free 提供最近 7 天；不能代替長期、跨供應商備份 |
| 長期異地備份 | Apps Script + Google Drive | 0 | 使用既有 Google 帳號的可用免費空間；空間滿或授權失效須提醒，不自動升級 |
| 每月、缺檔與對帳提醒 | LINE 官方帳號輕用量 + Messaging API | 0 | 每月 200 則免費；只發摘要且設定應用程式上限，不升級付費帳號 |
| 記帳當下預算提示 | 網頁內提示 | 0 | 每次成功儲存後直接顯示，不須每筆發送 LINE |
| 備援 Email | Apps Script MailApp | 0 | 個人帳號每日 100 位收件人；需一次授權；不用另訂 SMTP 或付費寄信商 |
| iPhone Web Push（可選） | 標準 Web Push | 0 額外訂閱 | iOS 16.4 起的主畫面網頁、使用者同意；不需 Apple Developer Program；第一版可先用 LINE |
| AI、簡訊、付費監控、自有網域 | 第一版不採用 | 0 | 不讓這些非必要服務侵蝕 200 元上限 |
| **合計** | **全部保持免費方案** | **NT$0** | **不含開發人力、既有手機網路費或既有 Google 訂閱** |

來源：[Workers 費率](https://developers.cloudflare.com/workers/platform/pricing/)、[靜態檔案計費](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)、[Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)、[Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/)、[D1 費率](https://developers.cloudflare.com/d1/platform/pricing/)、[D1 容量限制](https://developers.cloudflare.com/d1/platform/limits/)、[Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)、[Access 設定](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)、[Access 免費方案](https://www.cloudflare.com/plans/zero-trust-services/)、[workers.dev 定位](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)、[Google 配額](https://developers.google.com/apps-script/guides/services/quotas)、[Google 免費儲存](https://support.google.com/googleone/answer/9004014)、[LINE 2026 年 11 月方案](https://tw.linebiz.com/column/LINEOA-2026-Price-Plan/)、[Apple Web Push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)。

### 正常用量估算與成本邊界

規劃用量假設：一人、每日約 20 筆交易、每月一次銀行 CSV、每日數次查看，不保存發票照片。這些是假設，不是實測使用量。

- 規劃每月約 10,000 次 API 請求，遠低於免費每日請求數；但讀列量與 CPU 要分開量測，不能只看請求數。
- 已有天天記帳 CSV 為 755,823 bytes，銀行 CSV 為 2,857 bytes；這只表示原始檔大小，不代表 SQL Server 實際資料庫大小、完整歷史或未來備份大小。
- 當月分類彙總應依月份及分類索引查詢，不在每次開啟畫面時載入全部歷史文件。
- 歷史匯入分批處理；新舊帳務試算都必須在實際 Cloudflare 環境驗證 CPU、D1 查詢數與記憶體。
- Workers Free 的 10ms CPU 是主要技術限制。不能先承諾任意 C# 邏輯直接轉寫後都符合免費限制；若無法透過分批與彙總達標，須重新評估方案，不能默默升級。
- D1 免費超限會拒絕操作，並非無限量免費；介面需明確顯示儲存失敗，不能假裝記帳成功。付費方案會另計用量，不能當作固定總價。
- 若日後選 Workers Paid，基本費 USD 5/月。以**假設換算率** NT$33/USD 計為 165 元，尚有稅費、刷卡費與超額風險；不是即時匯率或 200 元絕對封頂承諾。主要方案不依賴此升級。

## 其他方案比較

| 方案 | 持續費用依據 | 現有程式沿用與取捨 | 結論 |
|---|---|---|---|
| Cloudflare PWA + D1 | 免費方案下 0 元 | C# 與 SQL Server 儲存層需移植；保留業務規則與歷史資料，不是二進位直接搬家 | 200 元硬限制下的主要推薦 |
| Railway + C# + SQLite | Hobby 至少 USD 5，包含前 USD 5 資源用量；超額另計 | 保留大部分計算與頁面；改資料庫與 SQL Server 專用鎖；需持久磁碟與實測 | 降低改寫量的備選，不保證目前用量落在 200 元內 |
| 原 C# + SQL Server 原樣上雲 | 主機加資料庫需分別估算；現有記憶體及 DB 大小未量測 | 搬移較直接，但目前沒有完整、可驗證的 200 元內報價 | 不列為已證實符合預算的方案 |
| Google 試算表 + Apps Script | 個人免費配額內 0 元 | 可自動化，但既有月結、挪用、前期更正、防重送及投資規則要重做；手機輸入要另做介面 | 低成本備選，對既有複雜帳務沒有明顯搬移優勢 |
| Notion | 免費資料庫可用；完整內建資料庫自動化有付費限制，也可外接程式 | 模板不會自行抓銀行資料；複雜帳務仍須另寫計算及對帳 | 可作看板，不推薦作主要帳本 |
| 原生 iPhone App | 開發與發佈成本另計，後端需求仍存在 | 目前沒有必須靠原生 App 才能達成的首版需求 | 暫不推薦 |

Railway 官方單價：RAM USD 10/GB-month、CPU USD 20/vCPU-month、磁碟 USD 0.15/GB-month、流出流量 USD 0.05/GB。**示意**：平均 0.25GB RAM、0.02 vCPU、1GB 磁碟、每月 1GB 流出，資源約 USD 3.10，帳單仍至少 USD 5；若平均 RAM 0.5GB，其餘相同，資源約 USD 5.60。這不是現有程式量測結果；可見不能把 USD 5 說成全包固定價。Compute hard limit 可減少超額，但觸頂會停站，且不應當作新台幣稅後帳單保證。

來源：[Railway 單價](https://docs.railway.com/pricing/plans)、[訂閱含用量的計費方式](https://docs.railway.com/pricing/understanding-your-bill)、[成本控制](https://docs.railway.com/pricing/cost-control)、[SQLite EF Core 限制](https://learn.microsoft.com/en-us/ef/core/providers/sqlite/limitations)、[Notion 自動化](https://www.notion.com/help/database-automations)。

## 現有功能如何搬

以下基於 `.diagnostics/budget-commit-check` 的程式副本，**不是正式執行中版本已確認一致的結論**。本工作目錄沒有 Git repository，常見本地專案位置也尚未找到正式來源。正式移轉前必須定位原始碼版本、備份資料庫、取得完整資料副本。

| 功能 | 本地證據 | Cloudflare 搬移方式 |
|---|---|---|
| 交易、帳戶、分類、成員與信用卡資料 | `Models/ErpdbContext.cs`、`Models/Transaction.cs`、`Models/Creditcard.cs` | 匯出並映射為 D1 資料表，保留舊 ID、日期、來源與關聯；保留一份未變更原始匯出 |
| 分類預算、挪用、更正、沖銷、撤銷與重結 | `Services/Budgeting/BudgetEngine.cs`、`BudgetState.cs` | 將規則移植成可測試的計算模組，以原 C# 輸出和既有案例當比對依據；不可重新發明算法 |
| 版本、原因、月結快照與核對紀錄 | `BudgetWorkspace.cs`、`BudgetState.cs` | 保留版本、快照與調整歷史，依月份/文件分開保存；避免把所有歷史塞入一個不斷增長的 D1 大欄位 |
| 同時操作與重送保護 | `BudgetWorkspace.Write`、`FinanceWriteLock.cs`、`ErpdbContext.PeriodLock.cs` | SQL Server 的 `sp_getapplock`、dbo SQL、Serializable 鎖不能照搬；改為 D1 可行的原子寫入、版本檢查、唯一操作 ID，必須測試競爭與失敗回滾 |
| 天天記帳 CSV 和銀行 Big5 CSV 匯入 | `CsvParsing.cs`、`Import/ImportSource.cs`、`ImportRun.cs` | 保留日期、編碼、引號、數量式去重、拒收與略過的區別；新手機交易使用穩定 ID，歷史匯入避免重複入帳 |
| 信用卡對帳 | `BudgetWorkspace.Execute` | 現有是同日期、同金額的筆數比較，不足以直接宣稱智慧配對；保留原始日期/摘要，將日期差、同額多筆等列為疑似差異供確認 |
| 投資組合 | `InvestmentCalculator.cs`、`InvestmentService.cs`、投資 Models | 有使用時連同成本、市值、投入、已實現損益與估值搬移；decimal 與四捨五入須保持一致，不因轉語言而失真 |
| 登入 | `Controllers/LoginController.cs` | 副本直接比較資料庫密碼欄位與輸入；不把這套直接公開，改用受管登入並限制本人帳號 |
| 手機記帳與日常預算 | `BudgetReportReader.cs`、`FinanceController.cs` | 目前報表讀月結投影；需要新增當月交易彙總與儲存後刷新，不能只把舊報表放上雲端 |

本地程式重點：[預算引擎](../../.diagnostics/budget-commit-check/Services/Budgeting/BudgetEngine.cs)、[財務儲存與對帳](../../.diagnostics/budget-commit-check/Services/Budgeting/BudgetWorkspace.cs)、[SQL Server 寫入鎖](../../.diagnostics/budget-commit-check/Services/Budgeting/FinanceWriteLock.cs)、[匯入來源](../../.diagnostics/budget-commit-check/Services/Import/ImportSource.cs)、[舊報表讀取](../../.diagnostics/budget-commit-check/Services/BudgetReportReader.cs)、[登入](../../.diagnostics/budget-commit-check/Controllers/LoginController.cs)、[投資計算](../../.diagnostics/budget-commit-check/Services/InvestmentCalculator.cs)、[既有驗收案例](../../.diagnostics/budget-commit-check/tests/Program.cs)。

### 搬移順序與必要驗收

1. 找到正式來源並備份：交易 CSV **不足以取代** 月結快照、預算版本、歷史更正、核對紀錄及投資資料；需完整資料匯出。
2. 先用資料副本建立唯讀新帳本。逐月比對可用餘額、學費儲備、總儲備金與帳面總資產，保留已知舊差異，不自動修補。
3. 以原 C# 規則驗證新計算模組：挪用守恆、更正只套一次、撤銷再重結、歷史快照不變、防重送、未知分類及同額多筆匯入。
4. 新增當月即時預算顯示，明確分開「當月額度減已記支出」與「歷史累積儲備」。上月尚未確認時也要能看本月支出，不能沿用單一開放月份設定而把畫面卡在上月；跨月暫估顯示與版本沿用須另定案。
5. 對帳功能要區分銀行帳期與生活月份。現有匯入會略過負數列，不能直接假定所有負數都是繳款；退款、撤銷與分期需用實際樣本驗證，未明確分類時不得自動認定完整。
6. 在測試環境驗證 iPhone 主畫面輸入、重新開啟登入、Big5 上傳、斷線不重複送出、月結手動確認、每日備份及還原；量測 CPU 和 D1 配額後才切換。
7. 設定切換日期與唯一寫入入口，舊帳本保留唯讀及原始備份，避免新舊平台同時記帳造成分歧。

這是一項**有實際改寫工作的移轉**。目前不提供外包價格或工時承諾；開發與驗證工作不包含在每月雲端費用中。若選 Railway 備案，可保留較多 C#，但仍須處理資料庫差異、登入、即時報表和通知。.NET 8 支援將於 2026-11-10 結束，繼續採 C# 時應把升到受支援版本列入搬移工作，而不是長期部署舊 runtime。[Microsoft 支援政策](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core)

## 提醒方式與月結流程

建議第一版：**網頁內即時預算提示 + LINE 月結/差異提醒 + Email 備援**。LINE 只發「有幾筆待核對」與登入連結，不發完整交易明細或銀行帳號。這是方案推薦，使用者尚未選定最終通知管道。

| 時機 | 行為 | 通知策略 |
|---|---|---|
| 每次手機記帳成功 | 更新該分類本月已花與剩餘，超支明顯提示 | 網頁內立即顯示；不必每筆 LINE |
| 台北時間每月 7 號 | 整理上月生活帳、檢查銀行資料覆蓋範圍 | 缺檔就提醒匯入；不假裝已核對 |
| 銀行 CSV 上傳後 | 分批解析、防重複、對帳並更新摘要 | 一次彙整疑似漏記/日期差異，不每筆連發 |
| 資料完整且差異處理完 | 顯示待確認月結 | 提醒一次，使用者確認才凍結月份 |
| 備份失敗或長時間未成功 | 保留前次可用備份、記錄錯誤 | Email 備援；不只依賴同一網站自己報錯 |

7 號結帳不等於當天已取得完整帳單；排程不會自行登入中信，也不持有銀行登入密碼。CSV 晚到時，先顯示待匯入，上傳後再更新。實際執行時段尚未選定；排程要正確換算 Asia/Taipei，避免 UTC 日期錯一天。

LINE 需開設免費官方帳號、啟用 Messaging API、本人加好友並綁定收件者。建議每月應用程式通知上限 50 則，重複提醒去重；達限留在網頁並使用 Email 備援，不升級付費。2026-11-01 起付費方案已調整，但免費輕用量仍是 0 元/200 則。舊 LINE Notify 已於 2025-03-31 結束，不能採用舊教學方案。[LINE 最新方案](https://tw.linebiz.com/column/LINEOA-2026-Price-Plan/)、[發送訊息條件](https://developers.line.biz/en/docs/messaging-api/sending-messages/)、[Notify 結束公告](https://notify-bot.line.me/closing-announce)

iPhone Web Push 可作不用 LINE 的選項：iOS 16.4 以上，先加入主畫面、由本人點選允許通知，不需 App Store 或 Apple 開發者年費。但需驗證手機版本、權限與登入相容性，不承諾每次通知都即時送達。[Apple 官方文件](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)

Google Apps Script 可由使用者帳號授權，定期取得**唯讀、驗證身分**的匯出，保存到私人 Drive；不得設公開匿名備份網址。保留最近 30 份每日及 12 份月結備份並檢查還原。若每份 20MB，42 份約 840MB；這是容量試算，實際備份大小未量測。完整跨頁匯出須有一致版本，不能把不同時間點的分頁拼成一份快照。若 API/Drive 配額或大小不適用，就需調整分批/壓縮設計，不能把未驗證的備份流程當成已完成。[Apps Script 時間觸發器](https://developers.google.com/apps-script/guides/triggers/installable)、[DriveApp](https://developers.google.com/apps-script/reference/drive/drive-app)、[Google 配額](https://developers.google.com/apps-script/guides/services/quotas)

## 銀行與天天記帳資料研究的界線

- 天天記帳官方有 CSV 匯出說明；本輪沒有找到可據以承諾外部即時同步的官方介面。這不等於證明所有版本都沒有介面。已接受新手機入口，因此首版不依賴這項能力。[官方 FAQ](https://tiantianjizhang-tw-faq.swalloworkstudio.com/)
- 中信官方提供 LINE/App 刷卡通知，但授權通知不等於最終入帳，刷退也不發同類通知。不可從「手機收得到通知」推論本平台能讀銀行的 LINE 對話或其他 App 推播。[中信說明](https://service.ctbcbank.com/FAQ/Page01?kmid=4825)
- 首版採使用者已接受的每月銀行 CSV，不依賴自動登入、簡訊攔截、手機讀其他 App 通知或未驗證的銀行 API。未實測 iPhone 上中信網頁下載 CSV 的支援程度；可以保留既有電腦下載後上傳的做法，不承諾所有銀行操作都能只靠 iPhone 完成。

## 尚未完成的驗證與待使用者決定事項

- 正式程式版本、實際資料庫大小、全量快照與投資資料是否完整：實作前需定位與驗證。
- 免費方案 CPU/查詢限制、帳務原子寫入、備份一致性、手機登入與通知送達：尚未實作或壓測。
- 最終採用 Cloudflare 推薦案或 Railway 備案、通知是否用 LINE、跨月即時預算如何顯示暫估累積儲備：仍是使用者決策，不以研究建議冒充同意。
- 結論的可信程度：官方費率與本地副本程式行為已核對；月費及用量為有條件估算；銀行手機下載、正式來源一致性與部署效能尚未證實。
