# 研究 24：AI 自動記帳、自動整理（「像 dot 那樣」）在單機 App 的可行做法

查證日期：2026-11-24
角色：`chief-of-staff`（架構與產品可行性評估；不改程式、不 commit）
起因：翰陞原話「我還希望他能直接接上像dot這樣的ai 自動記帳自動整理等等功能」。dot 是什麼產品由另一個 agent 查，本檔不描述 dot 本身。
前置閱讀：[18 純本機技術棧](18-local-first-stack.md)、[03 同步](03-stack-and-sync.md)、[04 登入與成本](04-auth-and-cost.md)、`docs/app-store/privacy-policy.md`、`docs/app-store/review-notes.md`、`CONTEXT.md`、`.scratch/finance-product/map.md`、`apps/mobile/package.json`、`apps/mobile/src/ledger/index.ts`（帳本服務）。

**查證方式**：developer.apple.com 文件以 `https://developer.apple.com/tutorials/data/documentation/<path>.json` 取原文（curl 經 proxy，python3 -I 抽文字）；apple.com、docs.expo.dev（v58 Markdown）、registry.npmjs.org、platform.claude.com、cloud.google.com、developers.cloudflare.com 皆讀到原文。**讀不到的主機**（proxy 403 或 DNS 失敗，未繞過）：`support.apple.com`（Apple Intelligence 地區清單、捷徑 App 使用手冊）、`security.apple.com`、`platform.openai.com`／`openai.com`／`developers.openai.com`（OpenAI 定價）、`ai.google.dev`（Gemini API 定價；改用 Google Cloud Vertex AI 官方定價頁）。要補查這些，需在 session 網路設定允許上述網域。

標記：【官方】＝本次直接讀到一手來源；【npm】＝套件登錄資料或其 README（第三方自述）；【未驗證】＝沒拿到一手來源；【估算】＝本檔假設推算；【需實測】＝文件沒有答案，要真機試。

> **2026-11-24 法規審核更正（見 [24-ai-legal-review.md](24-ai-legal-review.md)）**：PCC 免費門檻較像「單一 App 首次下載未滿 200 萬」而非合計；「擴充額度收費」指使用者每日額度（iCloud+），對開發者是否收費未明文；階段 1、2 隱私權政策與審查備註**仍要改**；5.1.2(i) 第一句（transmit 須先取得許可）適用於 PCC，階段 3 須預設關閉＋首次同意；投資建議界線依證券投資信託及顧問法，不是 3.2.1(viii)，AI 不接投資模組；對外不用「Apple Pay 自動記帳」；鍵盤聽寫可能經 Apple 伺服器，不算「全在手機」。

---

## 結論（先讀）

1. **「自動記帳、自動整理」有八成可以不離開手機做到。** 規則式自動分類（依過去同備註／商家的分類）、App Intents 捷徑（含 Apple Pay 刷卡後的捷徑自動化）、信用卡帳單未配對列一鍵補記、Vision OCR 讀收據，全部在手機上跑，「資料只存手機、無伺服器、隱私標籤不蒐集」都不用改。
2. **裝置端 LLM 已經可用，而且支援繁體中文**：Apple Foundation Models framework（iOS 26 起）提供 guided generation（`@Generable`，保證輸出合法結構）與 tool calling（模型可呼叫我們包好的「查帳本」工具）【官方】。Apple Intelligence 支援繁體中文【官方 apple.com】；台灣地區是否全部開放【未驗證】（support.apple.com 被擋），但 apple.com/tw 有完整 Apple Intelligence 產品頁。**限制是機型**：iPhone 15 Pro、全部 iPhone 16、iPhone 17、Air、17 Pro、18 Pro、Duo【官方】；更舊的 iPhone 沒有，所以規則式必須是底層、AI 是加值。
3. **裝置端模型的硬限制是 context 4K～8K token**，中文約 1 字 1 token【官方】。一個月 300 筆明細放不進去，所以「整理這個月」的做法必須是：**帳本服務算數字、模型只挑工具與寫句子**，數字由畫面直接顯示工具回傳值，不讓模型自己加總。這也剛好符合現有「帳本服務是唯一切入點」的架構。
4. **新選項：iOS 27 的 Private Cloud Compute（PCC）模型開放給開發者**：32K context、可推理、不用自建伺服器、不用 API key、使用者每天有額度；小型企業方案（Small Business Program）且首次下載未滿 200 萬的開發者**目前不收雲端 API 費**，但需申請受管 entitlement，且 Apple 註明「之後擴充額度會收費」【官方】。這讓「像 dot 的對話式助理」可以在**不蓋伺服器**下做到大部分。代價：資料會送到 Apple 的 PCC 處理（Apple 宣稱不儲存、Apple 也看不到【官方 apple.com 行銷頁】），所以賣點要從「資料只存手機」微調成「資料只**存**在手機；進階 AI 交由 Apple 私密雲端運算處理、不保存」，且需法規 agent 判斷是否屬 5.1.2(i) 的「第三方 AI」。
5. **使用者自帶 key（BYOK）技術上簡單，但不適合一般使用者**：開發者零成本、資料不經開發者，但大多數人不會申請 OpenAI／Anthropic key，審查要能測，App 開始有網路呼叫，隱私文件與審查備註要改。只建議當「進階設定」或不做。
6. **自建代理伺服器（Cloudflare Worker）錢不是問題、架構才是問題**：每人每月 150～300 筆＋每月一次整理報告，用 Claude Haiku 5.5（US$0.10／US$0.50 每百萬 token【官方】）約**每人每年 NT$9～27**，占年費實收 NT$511 的 2～5%【估算】；用 Sonnet 5.5 跑對話與月報則占約 35%，全用 Sonnet 會虧本（約 107%）。但它推翻「沒有伺服器」：要 App Attest＋StoreKit 收據驗證防濫用、要額度資料庫、要改隱私政策／隱私標籤／審查備註、開發者變成個資蒐集者並涉及境外傳輸，還有長期維運。**在有付費用戶數據前不建議做。**
7. **建議路線：A（無 AI 自動化）→ B（裝置端模型）→ E（裝置端＋PCC 的對話助理）三階段，全程不蓋伺服器；C／D 列為「不做，除非 B＋PCC 實測品質不足且有付費需求」。** 第一階段約 5～8 張票，第二階段約 7～8 張，第三階段約 4～7 張【估算】。

---

## 一、現況與約束（repo 事實）

- `apps/mobile/package.json`：`expo ~58.0.23`、`react-native 0.88.1`、`react 19.3.0`、`expo-sqlite ~58.0.15`、`expo-notifications`（`app.json` 設 `enableRemoteNotifications: false`）。**沒有任何網路、AI、分析 SDK**；IAP 套件尚未安裝（`src/subscription/storePort.ts` 是介面）。
- Expo SDK 58 最低支援 **iOS 16.4**、需 **Xcode 26.4+**【官方 https://docs.expo.dev/versions/latest/ 版本表】。Foundation Models 需 iOS 26（部分功能 iOS 26.4／27），所以 AI 功能一律要執行期判斷可用性、在舊系統隱藏。
- 帳本服務 `src/ledger/index.ts` 是**唯一**帳務指令與查詢入口（`CONTEXT.md`「帳本服務」），所有指令排成一條隊、已結月份鎖定在這裡檢查。可直接當 AI 工具的查詢有：`getBudgetProgress(month)`、`getMonthBreakdown(month, flow)`、`getCategoryMonthTransactions`、`listTransactions(from,to)`、`getDayTransactions`、`listCategories`、`listMembers`、`getCardReconciliation(month)`、`listCardStatements`、`getBudgetStatus`、`getUnmappedExpenseCategories`。寫入入口是 `addTransaction(NewTransaction)`（欄位：date、categoryId、accountId、flow、amount、note、memberId）。
- 原生能力一律走 `src/platform/*Port.ts` 轉接層（例：`notificationPort.ts`、`storePort.ts`），測試用 `node --test` 跑假實作。**AI 也應照這個模式做一個 `aiPort`**，測試不碰真模型。
- 定位決策（map.md 票 15）：「不做多人共用、發票載具、銀行連動、Android、小工具」。本檔的「Apple Pay 捷徑自動化」「紙本發票 QR」都不是銀行連動或載具，但界線要翰陞確認（見 Q 與法規點）。
- 信用卡帳單 CSV（票 21）目前只用於月結核對（`cardStatements.ts` 有 date、merchant、amount），**不會產生交易**。若要「從帳單自動帶分類記帳」，就會改變交易總量，依規則要加派 `legacy-migration`。
- 訂閱切分（票 08）：**記帳是免費功能**。任何有邊際成本的雲端 AI 若綁在記帳上，就會被免費使用者無上限消耗，必須限付費或限額度。

---

## 二、選項總覽

| 代號 | 做法 | 能做到 | 架構改動 | 資料離開手機？ | 每用戶成本 | 機型／語言限制 | 主要風險 | 票數【估算】 |
|---|---|---|---|---|---|---|---|---|
| A1 | 規則式自動分類（依備註／商家學過去分類） | 打「全聯」自動帶「日常用品」；匯入 CSV 時建議分類 | 小：帳本服務加一個查詢＋記帳畫面 | 否 | 0 | 全機型、全語言 | 新使用者沒歷史；「同備註多分類」要給選項 | 1～2 |
| A2 | App Intents「記一筆（草稿）」＋草稿收件匣＋Siri 短語 | 捷徑、動作按鈕、Siri 一句話記帳；**Apple Pay 刷卡後用捷徑自動化傳商家與金額進來** | 中：原生 Swift（App Intents）＋草稿表＋確認畫面 | 否 | 0 | iOS 16+；Apple Pay 自動化觸發條件與傳出欄位【未驗證】 | 使用者要自己在捷徑 App 設自動化；Siri AI 初期不支援中文【官方】 | 2～3 |
| A3 | 信用卡帳單未配對列「一鍵補記」帶建議分類 | 月結核對時，漏記的刷卡直接補成交易 | 中：動到交易總量 → legacy-migration | 否 | 0 | 全機型 | 與現有配對／去重規則衝突要定義 | 1～2 |
| A4 | 紙本電子發票 QR 掃描 | 掃發票帶日期、金額、店家（統編）、品項 | 中：相機＋條碼解析 | 否 | 0 | 全機型 | QR 規格與使用規範【未驗證】；與「不做發票載具」界線 | 2～3 |
| B1 | Foundation Models 分類／一句話記帳 | 規則猜不到時由模型選分類；「午餐牛肉麵 150 刷玉山」→ 草稿 | 中：Swift 原生模組或現成套件＋`aiPort` | 否 | 0 | Apple Intelligence 機型（15 Pro 以後）；繁中支援【官方】 | 模型隨 iOS 更新改版，prompt 要回歸測 | 3～4 |
| B2 | Vision OCR 讀收據 | 拍收據 → 文字 → 規則或 B1 解析 → 草稿 | 中：原生模組 | 否 | 0 | `RecognizeTextRequest` iOS 18+；`RecognizeDocumentsRequest` iOS 26+；zh-Hant 辨識品質【需實測】 | 收據格式雜亂 | 2 |
| B3 | 語音記帳 | 直接用鍵盤聽寫（零開發）或 Speech 框架 | 小～中 | 鍵盤聽寫由 iOS 處理；Speech 框架要強制裝置端 | 0 | `SpeechTranscriber` iOS 26+、語系執行期查【官方】 | 未設 `requiresOnDeviceRecognition` 會送 Apple 伺服器 | 0～2 |
| B4 | 其他裝置端小模型（llama.cpp／ExecuTorch） | 給沒有 Apple Intelligence 的機型用 | 大：模型檔數百 MB～GB 級要下載、記憶體 | 下載模型要網路，推論不出手機 | 0（下載流量另計） | 舊機記憶體不足；繁中品質未知 | App 大小／下載來源／2.5.2 解讀 | 4～6，不建議 |
| PCC | iOS 27 `PrivateCloudComputeLanguageModel` | 32K context、推理、長對話、月報整理 | 小（在 B／E 之上換一行 model） | **是，送 Apple PCC**（Apple 稱不儲存） | 目前 0（符合資格者）；未來可能收費 | iOS 27＋Apple Intelligence 機型；每人每日額度 | 需申請 entitlement；5.1.2(i) 解讀 | 1～2 |
| C | 使用者自帶 API key（BYOK） | 雲端大模型的全部能力 | 中：網路呼叫、key 存 Keychain、供應商轉接 | **是，送使用者選的 AI 供應商** | 開發者 0；使用者自付 | 全機型 | 一般人不會申請 key；審查要能測；隱私文件改 | 3～4 |
| D | 自建代理（Cloudflare Worker）代呼叫雲端 LLM | 同 C，使用者不必有 key | **大：從無伺服器變成有伺服器** | **是，經開發者伺服器到 AI 供應商** | 約 NT$9～180／年（見第六節） | 全機型 | 濫用防護、個資法、維運、隱私標籤 | 8～12＋維運 |
| E | 「像 dot」的對話式助理 | 「這個月飲食超了多少」「整理上週的帳」 | 中：對話頁＋工具定義（唯讀查詢＋產生草稿） | 裝置端版：否；PCC 版：是 | 0 | 同 B1／PCC | 數字幻覺 → 數字一律由工具回傳並由畫面顯示 | 4～7 |

---

## 三、A：不用 AI 也能做到的「自動」

### A1 規則式自動分類
- 做法：帳本服務新增唯讀查詢，例如「依備註前綴／完全相同備註，找最近 N 筆交易的分類分布，回傳最常見的分類與信心」。記帳畫面輸入備註後自動選分類（可改），CSV 匯入（`importTransactionsCsv`）時分類欄空白可帶建議。信用卡帳單用 merchant 欄同理。
- 學習：不需要訓練，「使用者過去怎麼分」就是模型；使用者改了，下次就變。可加一張「備註→分類」偏好表，讓使用者明確設定規則（「全聯一律日常用品」）。
- 冷啟動：新使用者沒有歷史 → 內建一份常見台灣商家關鍵字表（全聯、7-ELEVEN、中油、台電…）當預設；這份表**不能**來自翰陞私帳（map.md Out of scope），要另外整理。
- 隱私／審查：全在本機，現行隱私政策與審查備註不用改。
- 歸屬：`ledger-entry`（畫面）＋`import-export-backup`（CSV 匯入建議）。

### A2 App Intents、Siri、捷徑、Apple Pay 自動化
- App Intents 讓 App 的動作出現在 Siri、Spotlight、捷徑、動作按鈕、控制項【官方 https://developer.apple.com/documentation/appintents 】。
- **關鍵設計：Intent 不直接寫帳本，而是寫「草稿收件匣」。** 理由：帳本服務是 TS 跑在 JS 執行環境，App Intent 是 Swift，在背景執行時不一定有 JS 環境；若讓 Swift 直接寫 SQLite，就繞過「帳本服務唯一入口」與已結月份鎖。可行的兩種：
  1. Intent 打開 App 並帶 deep link（`app.json` 已有 scheme `ledger`）→ 預填記帳表單 → 使用者按儲存。
  2. Intent 把 {金額、商家／備註、時間、來源} 寫到 App Group 的小檔或佇列 → 下次開 App 時帳本服務匯入成「草稿」→ 收件匣一鍵確認（A1／B1 先幫忙選分類）。
- **Apple Pay 刷卡自動記帳**：捷徑 App 的「個人自動化」有以「錢包／交易」為觸發的類型，可把商家與金額傳給我們的 Intent。這是「自動記帳」最像 dot 宣傳效果、又完全不需要伺服器的路。**但觸發條件、可傳出的欄位、在台灣發卡行卡片是否都觸發，本次無法查證**（說明在 support.apple.com，被擋）→【未驗證】＋【需實測】。使用者必須自己在捷徑 App 建立自動化（App 無法替使用者建立），所以要做教學頁。
- FinanceKit（讀 Apple Card／Apple Cash 交易）需組織層級開發者帳號＋受管 entitlement＋Apple 審核【官方 https://developer.apple.com/documentation/financekit 】；個人上架（票 17 決定先個人）**不能用**，且台灣沒有 Apple Card（後者【未驗證】）。不列入。
- Siri：iOS 27 的「Siri AI」初期只支援英、法、日、韓、葡、西文【官方 apple.com/tw/apple-intelligence】，所以中文的「對 Siri 說話讓它理解並記帳」短期做不到；傳統 App Shortcuts 片語（「用 Afterbills 記一筆」）在繁中下的觸發行為【需實測】。
- Expo 實作：App Intents 是 Swift，需放進 App target 或 Expo 原生模組；Expo Modules API 可用 Swift 寫原生模組，對 App 大小影響約數百 KB【官方 https://docs.expo.dev/modules/overview.md 】。App Intents 的 metadata 抽取在 Expo 模組（framework）中是否正常、是否需要 config plugin 把檔案放進主 target【需實測】。分享選單（Share Extension）需要另一個 extension target，Expo 沒有官方模板【未驗證】，列為較後順位。
- 隱私：全在本機。若之後把 Apple Pay 交易內容送到雲端 AI（C／D），要注意審查指南 5.1.2(vii)「透過 Apple Pay 取得的使用者資料只能為了交付商品服務而分享給第三方」【官方】——捷徑傳進來的資料是否算「透過 Apple Pay 取得」，交法規 agent 判斷。

### A3 信用卡帳單 CSV 自動帶分類
- 現在帳單只拿來核對。產品化的「自動」是：月結核對看到「帳單有、帳本沒有」的列時，提供「補記這筆」，帶入日期、金額、商家當備註、A1／B1 建議分類，使用者確認後走 `addTransaction`。
- 這會影響交易總量與月結數字 → 依規則加派 `legacy-migration`（58 個月比對不能因此變動舊帳），以及 `monthly-close`。舊帳驗收用的轉換程式不應觸發此功能。

### A4 紙本電子發票 QR
- Vision 可讀條碼與文件結構（`RecognizeDocumentsRequest` 擷取文字群組與條碼，iOS 26+【官方】）。台灣電子發票證明聯 QR 的欄位與編碼規格屬財政部規範，本次**未查證**；可解析出的品項與是否需加解密金鑰【未驗證】。
- 不需 AI 就能做到「掃發票記帳」，但與票 15「不做發票載具」的界線要翰陞確認（掃紙本 ≠ 介接載具雲端），且規格使用規範交法規 agent。

---

## 四、B：手機端模型

### B1 Apple Foundation Models framework
**官方已確認**（https://developer.apple.com/documentation/foundationmodels 及子頁）：
- 平台：iOS／iPadOS／macOS／visionOS 26.0 起，watchOS 27【官方】。
- 裝置端模型三代：iOS 26.0～26.3（AFM 2 Core）、26.4（AFM 2.1 Core）、27.0（AFM 3 Core／AFM 3 Core Advanced）；**App 不能選版本，每台裝置只有一個**，系統更新時模型會換【官方 detecting-available-apple-foundation-models】。
- 規格：AFM Core 3B 參數、4–8K context；AFM Core Advanced 20B 參數、8K context（iPhone Air、17 Pro 在 iOS 27、18 Pro、Duo）；`PrivateCloudComputeLanguageModel`（AFM Cloud）32K【官方】。
- 支援機型（iPhone）：iPhone 15 Pro、全部 iPhone 16、iPhone 17 → AFM Core；iPhone Air、17 Pro → iOS 26 為 Core、iOS 27 為 Core Advanced；iPhone 18 Pro、iPhone Duo → Core Advanced；以上全部可用 AFM Cloud（PCC）【官方】。另受語言、地區、儲存空間影響。
- 可用性：`SystemLanguageModel.default.availability` 回傳 `available` 或 `deviceNotEligible`／`appleIntelligenceNotEnabled`／`modelNotReady`（下載中）【官方】。**iOS 27 起 Apple Intelligence 預設開啟且不能關**【官方】，iOS 26 使用者可能沒開。
- 語言：模型多語，支援 Apple Intelligence 支援的語言；`supportsLocale()` 檢查目前語系；不支援的語言會丟 `unsupportedLanguageOrLocale`；建議在 Instructions 用固定英文句「The person's locale is zh_TW.」再要求「You MUST respond in Traditional Chinese (Taiwan)」【官方 supporting-languages-and-locales】。Apple Intelligence 支援語言含**繁體中文**【官方 https://www.apple.com/tw/apple-intelligence/ 頁尾註】；台灣地區開放狀態【未驗證】。
- token：中日韓越文約 1 字 1 token；`tokenCount(for:)`、`contextSize` 自 iOS 26.4（back-deployed）【官方 managing-the-context-window、contextSize】。
- Guided generation：`@Generable`／`@Guide` 讓模型產生指定 Swift 型別，「framework 對產生合法型別提供強保證」；分類是使用者自訂的，要用 `DynamicGenerationSchema` 在執行期建列舉【官方 topic 清單有 `DynamicGenerationSchema`；動態列舉的實際寫法【需實測】】。
- Tool calling：實作 `Tool` 協定，模型決定何時呼叫、可平行呼叫；可「查詢 App 資料庫並在回答中引用」；iOS 27 可設 `toolCallingMode`（required／allowed／disallowed）【官方 expanding-generation-with-tool-calling】。
- 影像輸入（`Attachment`，可直接丟收據照片給模型）是 **iOS 27** 起【官方】。
- `contentTagging` 專用用途：產生主題標籤（iOS 26）【官方】，可做「自動貼標」但不等於我們的預算分類。

**從 Expo／React Native 呼叫**（需原生模組，Expo Go 不行；本專案本來就因 IAP 要 dev build）：
| 套件 | 版本／日期 | 說明 | 評估 |
|---|---|---|---|
| `@react-native-ai/apple`（Callstack，MIT） | 0.13.0，2026-11-11【npm】 | Vercel AI SDK v7 的 Apple provider；iOS 26 文字／串流／結構化輸出／JS 工具；iOS 27 影像、PCC、推理等級、`toolChoice: required`；需 New Architecture | 最活躍；若之後要接 BYOK，可用同一套 AI SDK 介面切換 provider。缺點：多一層 `ai` 套件依賴（RN 內串流 fetch 行為【需實測】） |
| `expo-foundation-models`（SwiftyJunnos，MIT） | 1.0.2，2026-09-17【npm】 | Expo module；結構化輸出、JS tool calling、session；iOS 27 PCC、影像 | 個人維護 |
| `react-native-apple-llm`（MIT） | 1.0.16，2026-01-17【npm】 | 自稱 beta | 更新停在 iOS 26 |
| 自寫本地 Expo 模組（Swift） | — | 只暴露窄介面：`classify(note, categories)`、`parseEntry(text, context)`、`chat(...)` | 可審查、無多餘依賴；工作量約多 1 張票 |

建議：分類與一句話記帳用**自寫窄介面的本地 Expo 模組**（輸出型別固定、好測、不引入網路依賴）；對話助理（E）再評估 `@react-native-ai/apple`，因為 JS 工具可以直接呼叫帳本服務。不論哪種，都包在 `src/platform/aiPort.ts` 後面，帳本服務只收「草稿」。
注意：PCC、影像輸入等 iOS 27 功能需用 **Xcode 27 SDK** 建置（套件 README 也這樣寫【npm】）；Expo 58 文件寫 Xcode 26.4+，**EAS 雲端建置映像是否已提供 Xcode 27【未驗證】**。

### B2 Vision OCR（收據）
- `RecognizeTextRequest`（iOS 18+）辨識文字，可指定 `recognitionLanguages`；支援語言清單在執行期由 `supportedRecognitionLanguages` 取得，文件沒列【官方】→ 繁中品質【需實測】。`RecognizeDocumentsRequest`（iOS 26+）可理解收據等文件結構、表格與條碼【官方】。不需 Apple Intelligence，iOS 18 以上機型都能用。
- 流程：拍照／從相簿選 → OCR → A1 規則抓金額與店名，或 B1 模型用 `@Generable` 抽 {日期、金額、店家、品項} → 草稿。
- Expo：有第三方 `expo-text-extractor`（MLKit＋Vision，2.0.0，2026-02-28【npm】），但也可在 B1 的本地模組一起寫 Vision 呼叫，避免拉進 Google MLKit（MLKit 是否連網回報【未驗證】，與「不含第三方 SDK」審查備註衝突風險）。需要 `NSCameraUsageDescription`。

### B3 語音
- **零開發路線**：記帳畫面的備註欄本來就能用 iOS 鍵盤的聽寫，聽寫後交給 A1／B1 解析即可。聽寫由 iOS 處理，不是 App 蒐集。
- Speech 框架：`SpeechTranscriber`（iOS 26+，`supportedLocales` 執行期查、可能需下載資產；裝置不支援時清單為空）【官方】；舊的 `SFSpeechRecognizer` 若 `supportsOnDeviceRecognition` 為 false 會**需要網路**（送 Apple 伺服器），必須設 `requiresOnDeviceRecognition` 才保證不出手機【官方】。zh-TW 是否在清單中【需實測】。Expo 有第三方 `expo-speech-recognition`（58.0.1，2026-10-29【npm】）。需要麥克風與語音辨識權限字串。
- 建議：第一版只做「鍵盤聽寫＋解析」，不加 Speech 框架。

### B4 其他裝置端小模型
- 套件存在：`llama.rn`（llama.cpp 的 RN 綁定，0.13.0-rc.12，2026-11-17）、`react-native-executorch`（Software Mansion，0.11.1，2026-11-19）【npm】；MLC 沒有找到現成 RN 套件（`react-native-mlc-llm` 在 npm 不存在）。
- 代價【估算】：1B～3B 參數模型 4-bit 量化後約 0.6～2 GB 檔案，加上執行時記憶體；不能塞進 App 本體，只能首次使用時下載 → 需要放模型的 CDN（Hugging Face 或自己的），等於有一個外部連線；舊 iPhone 記憶體吃緊；繁體中文與台灣用語品質未知【未驗證】；App Review 2.5.2 禁止下載「會改變功能的程式碼」，模型權重是否被視為程式碼【未驗證，交法規 agent】。
- 結論：工作量大、體驗不穩，**不建議**。沒有 Apple Intelligence 的機型用 A1 規則式就好。

---

## 五、PCC：iOS 27 的 Apple 雲端模型（本次新發現，改變了取捨）

【官方】https://developer.apple.com/documentation/foundationmodels/adding-server-side-intelligence-with-private-cloud-compute 、https://developer.apple.com/private-cloud-compute/ 、https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.private-cloud-compute
- `PrivateCloudComputeLanguageModel`：iOS 27 起；與裝置端同一套 API（`LanguageModelSession(model: PrivateCloudComputeLanguageModel())`），工具與 instructions 原封不動沿用。
- 比較表（官方）：保護隱私 ✅／✅；離線 ✅／🚫；用量 無限／每日上限；推理 無／多級；context 4K／32K。
- 不用處理驗證與 API key；使用者需有 Apple Intelligence 機型，每天有請求額度，可升級 iCloud+ 取得更多；App 要顯示額度狀態（`quotaUsage`）。
- **資格**：加入 App Store Small Business Program、所有 App 首次下載合計未滿 200 萬、帳號被指派 PCC entitlement；符合者「no cloud API cost」。超過門檻或退出 SBP，6 個月內要改用其他方案。沒有 entitlement 時第一次送 prompt 會 crash（文件明寫）。
- 頁尾：包含開發者 App 使用 PCC 在內的伺服器端功能有每日上限，「Expanded access to such features will be available for a fee in the future」。→ **免費是現況，不是承諾**。
- 隱私：apple.com 稱 PCC 讓 Apple Intelligence 使用大型伺服器模型「without making your data accessible to Apple or anyone else」「Your data is never stored」【官方 apple.com 行銷頁】；技術白皮書（security.apple.com）本次讀不到【未驗證】。
- App Store 隱私標籤：官方定義「蒐集＝把資料傳出裝置，且你或第三方夥伴可存取超過即時處理所需的時間」；「只在裝置上處理的資料不算蒐集」；「你不需揭露 Apple 蒐集的資料」【官方 https://developer.apple.com/app-store/app-privacy-details/ 】。PCC 很可能不需要改標籤，但要不要在 App 內另外取得同意（5.1.2(i)「third-party AI」是否包含 Apple）→ 交法規 agent。

意義：**「像 dot 的對話與整理」中需要長 context 與推理的部分，可以不蓋伺服器、不付 token 錢就做到**，只限 iOS 27＋Apple Intelligence 機型，且受每日額度。

---

## 六、C 與 D：雲端 LLM

### C 使用者自帶 API key（BYOK）
- 做法：設定頁貼上 key → 存 iOS Keychain（`expo-secure-store`，Expo 官方；iOS 用 Keychain `kSecClassGenericPassword`；**注意：同 bundle ID 重裝後 Keychain 資料可能還在**；歷史上 iOS 對超過約 2048 bytes 的值可能拒絕【官方 https://docs.expo.dev/versions/v58.0.0/sdk/securestore.md 】）→ App 直接從手機用 HTTPS 呼叫供應商 → 只送必要文字（例如「備註＋候選分類名」或「工具回傳的彙總數字」，不送整本帳）。
- 優點：開發者零成本、資料不經開發者伺服器、沒有濫用問題（用的是使用者自己的錢）。
- 問題：
  1. 一般使用者不會申請 key、不懂計費，「訂閱了還要另外付 AI 錢」體驗差。
  2. App 開始有網路程式碼 → `review-notes.md` 的「no server, does not upload data」與送審清單「`src` 無 `fetch`」要改；隱私政策第一節「不會蒐集、接收、上傳」要改寫。
  3. 5.1.2(i) 要在送出前清楚揭露資料送到哪個第三方 AI 並取得明確同意【官方】。
  4. 審查員要能測：需在審查備註提供可用的 key 或把功能做成可選且不影響主要功能。
  5. Key 外洩風險由使用者承擔，但 App 要提供刪除 key、並避免 key 進入匯出的備份檔（備份檔是 SQLite，key 放 Keychain 不放 DB 即可）。
- iOS 27 的 Foundation Models `LanguageModel` 協定允許把任何伺服器模型包成同一個 API【官方】；JS 端則可用 Vercel AI SDK 同一介面切換 apple()／anthropic()／openai()。技術上 C 可以共用 B／E 的工具定義，追加成本不高。

### D 自建輕量代理（例如 Cloudflare Worker）
**必要元件**：
1. Worker 代理：收 App 請求 → 驗證 → 轉呼叫 LLM 供應商（key 只在伺服器）。
2. 防濫用：App Attest（硬體金鑰證明請求來自真 App；需伺服器驗證、要處理不支援的裝置【官方 https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity 】；Expo SDK 58 有官方 `@expo/app-integrity`【官方 https://docs.expo.dev/versions/v58.0.0/sdk/app-integrity.md 】）＋StoreKit 交易 JWS 送伺服器驗證是否有效訂閱（18 研究：更高安全才送伺服器驗證）＋以 `originalTransactionId` 之類的匿名識別做每日額度（需 KV／D1／Durable Object 存計數）。
3. 日誌政策：不記錄內容；但 AI 供應商端的保留期與用途（濫用監控、是否訓練）要看各家條款【未驗證】。
4. 文件：隱私政策、隱私標籤（「Other Financial Info：薪資、收入、資產、負債或其他財務資訊」與「Other User Content」【官方定義】很可能要申報）、審查備註、5.1.2(i) 同意畫面、服務條款。

**成本試算【估算】**（官方單價，查證日 2026-11-24；匯率沿用 04 研究的 US$1＝NT$33，非即時）：

用量假設（每人每月）：
| 項目 | 次數 | 每次 input／output token | 月 input | 月 output |
|---|---|---|---:|---:|
| 一句話記帳／分類（重度 300 筆） | 300 | 1,000／60（指示＋分類清單＋近期範例＋備註；中文約 1 字 1 token 的假設來自 Apple 文件，其他家 tokenizer【未驗證】） | 300,000 | 18,000 |
| 收據解析（先 OCR 成文字） | 30 | 2,500／150 | 75,000 | 4,500 |
| 每月整理報告（給彙總＋明細摘要） | 1 | 15,000／1,500 | 15,000 | 1,500 |
| 對話提問（含一次工具往返） | 20 題×2 次 | 3,000／300 | 120,000 | 12,000 |
| **重度合計** | | | **510,000** | **36,000** |
| **輕度合計**（150 筆＋月報，無收據無對話） | | | **165,000** | **10,500** |

官方單價：
- Claude Haiku 5.5：input US$0.10／MTok、output US$0.50／MTok（prompt ≤100K token）；Sonnet 5.5：US$2／US$10【官方 https://platform.claude.com/docs/en/about-claude/pricing ，2026-11-24 讀取】。
- Gemini 3.1 Flash-Lite（Vertex AI，Global，≤200K input）：input US$0.25、output US$1.50；Gemini 3.5 Flash-Lite：US$0.30／US$2.50【官方 https://cloud.google.com/vertex-ai/generative-ai/pricing ，2026-11-24 讀取；Gemini API（ai.google.dev）價目頁被擋，可能不同【未驗證】】。
- OpenAI：定價頁全部被擋，**未驗證，不列數字**。
- Cloudflare Workers AI（若想用 Cloudflare 自己的開源模型）：llama-3.1-8b-instruct-fp8-fast US$0.045／US$0.384；每天 10,000 Neurons 免費【官方 https://developers.cloudflare.com/workers-ai/platform/pricing/ 】；繁中品質【未驗證】。AI Gateway 核心功能免費【官方】。
- Workers Paid 最低 US$5／月（04 研究【官方】）；Free 每日 10 萬請求、每次 10 ms CPU，代理多數時間在等上游（不算 CPU），但 App Attest／JWS 驗簽的 CPU 是否在 10 ms 內【需實測】。

| 模型方案 | 重度 US$／月 | 重度 NT$／年 | 占年費實收 NT$511 | 輕度 NT$／年 | 占比 |
|---|---:|---:|---:|---:|---:|
| 全用 Claude Haiku 5.5 | 0.069 | 27 | 5.3% | 9 | 1.7% |
| 全用 Gemini 3.1 Flash-Lite | 0.18 | 72 | 14% | 23 | 4.4% |
| Haiku 記帳＋Sonnet 5.5 對話／月報 | 0.45 | 180 | 35% | — | — |
| 全用 Claude Sonnet 5.5 | 1.38 | 546 | **107%（虧本）** | 172 | 34% |

算式例（Haiku 重度）：0.51M×0.10＋0.036M×0.50＝0.051＋0.018＝US$0.069／月；×12×33＝NT$27.3／年。tokenizer 若中文每字 2 token，數字約加倍，Haiku 仍約 NT$55／年（11%）。
另計：Workers Paid 固定 US$5／月＝NT$1,980／年，約等於 4 位年費用戶的實收；3 個月試用期的使用者也會產生成本（Haiku 重度約 NT$7／人，混合方案約 NT$45／人）。

**判斷**：token 費用在便宜模型下可承受；真正的成本是「多了一台伺服器」帶來的資安、個資法責任、維運、濫用、文件與審查風險，且永久推翻「沒有伺服器」的賣點。

---

## 七、E：「像 dot」的對話式助理

設計原則（不論在哪個模型上）：
1. **模型只讀不寫**：工具只包唯讀查詢；要寫入時模型產生「草稿／預覽」，使用者在畫面按確認後才由帳本服務寫（沿用 `previewAdjustment`→`confirmAdjustment`、`previewMonthlyClose`→`completeMonthlyClose` 的預覽／確認模式）。已結月份鎖、操作識別碼重送等保護因此不變。
2. **數字不由模型算、也不由模型寫**：工具回傳結構化數字，畫面用卡片直接顯示；模型的文字只做引導與解釋。避免 3B 模型算錯或幻覺。
3. 工具候選：`budget_progress(month)`（→`getBudgetProgress`）、`category_breakdown(month, flow)`（→`getMonthBreakdown`）、`find_transactions(from,to,keyword,category)`（→`listTransactions` 再篩）、`card_unmatched(month)`（→`getCardReconciliation`）、`draft_transaction(...)`（只產生草稿）。
4. 不提供投資建議：投資頁的工具只回成本與使用者填的市值，系統指示禁止買賣建議（與審查備註一致）。

| 問法 | 裝置端 AFM（4K） | PCC（32K，iOS 27） | 必須雲端 LLM（C／D） |
|---|---|---|---|
| 「這個月飲食超了多少」 | ✅ 一次工具呼叫＋一句話 | ✅ | 不需要 |
| 「幫我記午餐 120 刷玉山」 | ✅ 產生草稿 | ✅ | 不需要 |
| 「上週有哪些沒分類／可能重複／金額怪的」 | ✅ 規則先篩，模型只解釋 | ✅ | 不需要 |
| 「幫我把上週的帳整理一下」（逐筆建議改分類、合併備註） | ⚠️ 筆數多時要分批，品質【需實測】 | ✅ | 品質不足時 |
| 「寫一份這個月的財務回顧，跟前三個月比」 | ⚠️ 彙總數字由工具給，敘述品質有限 | ✅ 推理＋長 context | 若要更高品質 |
| 多輪長對話、記住使用者偏好 | ❌ context 會滿；偏好可另存 SQLite 摘要 | ✅（每日額度內） | 沒有 iOS 27／額度用完時 |
| 沒有 Apple Intelligence 的 iPhone | ❌ | ❌ | 只有 C／D 能給 |

結論：**對話助理的核心體驗在「裝置端＋PCC」就能做到**；雲端 LLM 只在「舊機型也要有」或「品質要更好」時才有必要。

---

## 八、對「資料只存手機」賣點的影響

| 路線 | 儲存 | 處理 | 隱私政策／標籤／審查備註 | 對外說法 |
|---|---|---|---|---|
| A＋B（不含 PCC） | 只在手機 | 只在手機 | 不用改（加相機／麥克風權限說明；Speech 要強制裝置端） | 「資料只存手機」完全成立，還能加「AI 在你的 iPhone 上執行」 |
| ＋PCC | 只在手機 | 進階 AI 時送 Apple PCC（Apple 稱不儲存） | 政策要加一段；標籤可能不變（Apple 蒐集不必由我們揭露）；5.1.2(i) 是否要同意畫面待審 | 「資料只**存**在手機；進階 AI 由 Apple 私密雲端運算處理、不保存、開發者看不到」，且做成可關閉 |
| ＋C（BYOK） | 只在手機 | 使用者自選的 AI 供應商 | 要改；同意畫面點名供應商 | 「你自己選擇送出時才送出」 |
| ＋D（自建代理） | 只在手機（若不記錄） | 經開發者伺服器到 AI 供應商 | 大改；很可能要申報財務資訊；審查備註「沒有伺服器」要刪 | 「沒有伺服器」不再成立 |

---

## 九、建議路線

**階段 1（不用 AI，全機型，約 5～8 張票）**
1. 帳本服務：依備註／商家的分類建議查詢＋記帳畫面自動選分類（`ledger-entry`）。
2. 草稿收件匣（帳本服務新增草稿的新增／確認／捨棄；確認時走 `addTransaction`）。
3. App Intents「記一筆草稿」＋Siri 片語＋「Apple Pay 刷卡自動記帳」捷徑教學（先做 1 天實測確認錢包交易觸發與欄位）。
4. CSV 匯入與信用卡帳單未配對列的分類建議／一鍵補記（`import-export-backup`、`monthly-close`，加派 `legacy-migration`）。
5. （待 Q 確認）紙本電子發票 QR 掃描。

**階段 2（裝置端模型，Apple Intelligence 機型，約 7～8 張票）**
1. `aiPort`＋本地 Expo 模組（可用性判斷、`DynamicGenerationSchema` 分類、guided generation 解析）。
2. 規則猜不到時用模型分類。
3. 一句話記帳（文字＋鍵盤聽寫 → 草稿）。
4. 收據拍照 → Vision OCR → 草稿。
5. 評測集與回歸（固定 100～200 句台灣記帳句子與期望輸出；系統更新換模型時重跑；在 Mac／真機跑，不進 node 測試）。

**階段 3（對話助理，約 4～7 張票）**
1. 對話頁＋唯讀工具＋數字卡片。
2. 「整理上週」：規則篩出未分類／疑似重複／異常，模型解釋並產生批次草稿。
3. iOS 27 PCC：申請 entitlement、額度 UI、可關閉的開關與說明、失敗退回裝置端。

**不做（除非條件成立再提）**：C（BYOK）、D（自建代理）、B4（自帶小模型）。重新評估條件：階段 2～3 真機評測品質不達標，且有足夠付費用戶要求舊機型或更高品質。屆時優先 C（不蓋伺服器），D 最後。

開發方式備註：原生 Swift 模組在 Mac 上用 Codex＋雲端 Claude 寫沒有問題，但 **Foundation Models 只能在真機或 macOS 26+ 的 Mac 上執行**，雲端 Linux 容器無法驗證 AI 行為；每張 AI 票都要有「翰陞在 Mac／iPhone 上跑評測」的驗收步驟。

---

## 十、要交給 `tw-legal-tax-counsel` 審的點

1. **5.1.2(i) 第三方 AI**：原文「You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so.」（2025-11-13 Apple 公告新增此釐清【官方 https://developer.apple.com/news/?id=ey6d8onl 】；現行指南 2026-10-16 更新版仍有【官方 https://developer.apple.com/app-store/review/guidelines/ 】）。要判斷：(a) Apple PCC 是否算「third-party AI」、是否需 App 內明確同意；(b) BYOK 的同意畫面文字；(c) D 方案的揭露與同意流程。
2. **App Store 隱私標籤**：裝置端處理不算蒐集；PCC 是否屬「Apple 蒐集、不必由我們揭露」；BYOK 由使用者自帶 key 直連供應商時，供應商是否算我們的「third-party partners」；D 方案應申報哪些類型（Other Financial Info、Other User Content、Purchases／Identifiers）。
3. **隱私權政策改寫範圍**：第一節「不會蒐集、接收、上傳或查看帳本資料」在 PCC／C／D 下的正確說法；新增相機、麥克風、語音辨識的用途說明與 Info.plist 權限字串文案。
4. **審查備註**：「The app has no server, does not upload data」在每個方案下怎麼改；送審清單「`src` 無 `fetch`」的更新；審查員如何測 AI 功能（PCC 需真機、BYOK 需 key）。
5. **個資法**：D 方案開發者成為蒐集／處理者——告知義務、委託 AI 供應商處理的監督、安全維護、境外傳輸（供應商在美國等）；C 方案下開發者的角色是否仍不是蒐集者。
6. **投資建議界線**：AI 回答不得構成買賣建議（審查指南 3.2.1(viii)、台灣證券投資顧問相關規定），系統指示與免責文字。
7. **AI 錯誤責任**：AI 建議的分類／金額錯誤、整理報告錯誤的免責與「需使用者確認」的服務條款文字（消保法角度）。
8. **Apple Pay 捷徑自動化**：5.1.2(vii)（Apple Pay 取得的資料只能為交付商品服務分享給第三方）是否適用於經捷徑傳入的交易資料；若之後送雲端 AI 是否觸及。
9. **紙本電子發票 QR**：財政部 QR 規格的使用規範、是否涉及載具或加值中心介接規定、與定位「不做發票載具」是否衝突。
10. **PCC 條款**：entitlement 申請條件、Small Business Program 申報（關聯帳號等）、「未來收費」與超過門檻 6 個月遷移義務；SBP 與台灣 26% 費率的關係（呼應 08 審核的不確定點）。
11. **台灣 AI 相關法規**：是否有對 AI 服務提供者的揭露或標示義務（例如人工智慧基本法或其子法）【未驗證，請查】。
12. **年齡分級問卷**：App Store Connect 年齡分級是否有 AI 對話功能的題目要勾選【未驗證】。
13. **下載模型權重**（僅 B4）：2.5.2「不得下載會改變功能的程式碼」是否涵蓋模型權重。

其他交叉審核：`marketing-pricing`（AI 功能免費／付費切分、對外說法）、`legacy-migration`（A3 補記會動交易總量）、`subscription-iap`（PCC 需 SBP；D 需伺服器驗收據）、`import-export-backup`（CSV 匯入建議分類、草稿是否進備份檔——草稿要進備份檔、API key 絕不進）。

---

## 十一、需要翰陞決定的問題

**Q1：「資料只存手機、沒有伺服器」要不要守成硬性賣點（也就是 AI 不蓋自家伺服器，D 不做）？**
建議答案：**守。** 階段 1～3 全部不需要自家伺服器；D 的 token 費雖然只占實收 2～35%，但會多出資安、個資法、維運、濫用防護與整套文件改寫，且賣點無法再說「沒有伺服器」。等有付費用戶、且真機評測證明裝置端＋PCC 不夠時再談。

**Q2：AI 功能（一句話記帳、收據解析、對話助理）只支援有 Apple Intelligence 的 iPhone（15 Pro 以後），可以接受嗎？**
建議答案：**接受。** 舊機型仍有規則式自動分類、捷徑／Apple Pay 自動記帳、草稿收件匣，「自動記帳」的主體不受影響；為舊機做自帶小模型（B4）或雲端（C／D）的成本與風險都高。iOS 27 起 Apple Intelligence 預設開啟，覆蓋率會隨換機上升。

**Q3：AI 相關功能放免費還是付費？**
建議答案：**規則式自動分類、捷徑記帳、本機 AI 一句話記帳與收據解析放免費**（記帳本來就免費，且裝置端零邊際成本，可當吸客點）；**對話助理與「整理上週／月度回顧」放付費**（它們是預算與月結的延伸）。最後由 `marketing-pricing` 提案、`subscription-iap` 落實。

**Q4：要不要申請 App Store Small Business Program 與 PCC entitlement，為 iOS 27 的 Apple 雲端模型做準備？**
建議答案：**要，先申請。** 申請不花錢，PCC 是「不蓋伺服器又能做長對話與推理」的唯一路線；SBP 也可能影響抽成（台灣 26% 與 SBP 費率的關係待 `subscription-iap`／法規 agent 確認）。PCC 功能做成可關閉，且保留裝置端退路，以應對 Apple 未來收費或資格變動。

---

## 附錄 A：官方已確認（出處）

- Foundation Models 總覽、平台、PCC 與自訂模型 provider：https://developer.apple.com/documentation/foundationmodels
- `SystemLanguageModel`（三代模型版本、可用性）：https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel
- 可用模型、規格、機型對照表、iOS 27 預設開啟：https://developer.apple.com/documentation/foundationmodels/detecting-available-apple-foundation-models
- 語言與語系：https://developer.apple.com/documentation/foundationmodels/supporting-languages-and-locales-with-foundation-models
- context 與中文 token：https://developer.apple.com/documentation/foundationmodels/managing-the-context-window
- Tool calling：https://developer.apple.com/documentation/foundationmodels/expanding-generation-with-tool-calling
- 影像輸入（`Attachment` iOS 27）：https://developer.apple.com/documentation/foundationmodels/analyzing-images-with-multimodal-prompting 、https://developer.apple.com/documentation/foundationmodels/attachment
- PCC：https://developer.apple.com/documentation/foundationmodels/adding-server-side-intelligence-with-private-cloud-compute 、https://developer.apple.com/private-cloud-compute/
- Apple Intelligence 支援語言（含繁體中文）、Siri AI 初期語言、PCC 隱私宣稱：https://www.apple.com/apple-intelligence/ 、https://www.apple.com/tw/apple-intelligence/
- Vision：https://developer.apple.com/documentation/vision/recognizetextrequest 、https://developer.apple.com/documentation/vision/recognizedocumentsrequest
- Speech：https://developer.apple.com/documentation/speech/speechtranscriber 、https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition
- App Intents：https://developer.apple.com/documentation/appintents
- FinanceKit（需組織帳號）：https://developer.apple.com/documentation/financekit
- App Attest：https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity
- 審查指南（5.1.2(i)、5.1.2(vii)、2.5.2、3.2.1(viii)；2026-10-16 更新）：https://developer.apple.com/app-store/review/guidelines/ ；2025-11-13 更新公告：https://developer.apple.com/news/?id=ey6d8onl
- 隱私標籤定義：https://developer.apple.com/app-store/app-privacy-details/
- Expo 版本表（SDK 58：iOS 16.4+、Xcode 26.4+）：https://docs.expo.dev/versions/latest/ ；Modules API：https://docs.expo.dev/modules/overview.md ；SecureStore：https://docs.expo.dev/versions/v58.0.0/sdk/securestore.md ；AppIntegrity：https://docs.expo.dev/versions/v58.0.0/sdk/app-integrity.md
- Claude 定價：https://platform.claude.com/docs/en/about-claude/pricing
- Gemini（Vertex AI）定價：https://cloud.google.com/vertex-ai/generative-ai/pricing
- Cloudflare Workers AI／AI Gateway 定價：https://developers.cloudflare.com/workers-ai/platform/pricing/ 、https://developers.cloudflare.com/ai-gateway/reference/pricing/
- npm 套件資料（第三方自述）：`@react-native-ai/apple`、`expo-foundation-models`、`react-native-apple-llm`、`llama.rn`、`react-native-executorch`、`expo-text-extractor`、`expo-speech-recognition`（registry.npmjs.org，2026-11-24）

## 附錄 B：未驗證／需實測

1. Apple Intelligence 在台灣地區的完整開放狀態與限制（support.apple.com/zh-tw/121115 被擋）。
2. 捷徑 App「錢包交易」自動化的觸發條件、傳出欄位、台灣發卡行卡片是否觸發（support.apple.com 被擋）——**階段 1 開工前用真機實測 1 天**。
3. 繁中 App Shortcuts 片語的 Siri 觸發；App Intents 放在 Expo 模組中的 metadata 抽取。
4. Vision `RecognizeTextRequest` 對繁中收據的辨識品質；`SpeechTranscriber` 是否支援 zh-TW。
5. AFM Core（3B）對台灣記帳句子的分類與解析準確率；`DynamicGenerationSchema` 動態分類列舉寫法；iOS 26→27 模型改版後的回歸差異。
6. EAS 雲端建置是否已提供 Xcode 27（PCC、影像輸入需要）。
7. `@react-native-ai/apple`＋`ai` v7 在 RN 0.88／Expo 58 的相容性與串流行為。
8. OpenAI 與 Gemini API（ai.google.dev）官方定價（頁面被擋）；各 AI 供應商的資料保留與訓練條款。
9. PCC 技術隱私白皮書（security.apple.com 被擋）與每日額度的實際數字。
10. Workers Free 10 ms CPU 是否足夠做 App Attest／JWS 驗簽（僅 D）。
11. 紙本電子發票 QR 規格（財政部）。
12. 台灣 AI 相關法規的揭露義務。
