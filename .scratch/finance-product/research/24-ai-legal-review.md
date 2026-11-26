# 24 AI 自動記帳與競品定位：法規審

> 審核人：`tw-legal-tax-counsel`（AI agent，**不是執業律師或會計師**）。審核日 2026-11-24。所有結論上線前請律師／會計師／主管機關確認。
> 審查對象：[24-ai-bookkeeping.md](24-ai-bookkeeping.md)（三階段 AI 路線）、[24-competitive-edge.md](24-competitive-edge.md)（競品與定位）；對照現行 `docs/app-store/privacy-policy.md`、`review-notes.md`、`store-listing.md`。本檔不改程式、不改其他研究檔與文件，只給替代文字。
> 標記：【確定】法條或官方明文（本次讀到原文）；【推論】由明文推得；【不確定】官方未載或有爭議。**【†】**＝台灣官方網站（law.moj.gov.tw、president.gov.tw、law.nstc.gov.tw、einvoice.nat.gov.tw、fsc.gov.tw 等）本環境 DNS 被擋，條文依搜尋摘要或前份審核引用，請到全國法規資料庫核對原文。security.apple.com 也被擋。要補查請在 session 網路設定允許上述網域。
> 本次直接讀到的 Apple 一手頁面：App Review Guidelines（頁面標示 Last Updated 2026-10-16）、App Privacy Details、Private Cloud Compute 開發者頁、Small Business Program 頁、Foundation Models 文件（PCC 一篇、可用模型偵測一篇、PCC entitlement）、Apple 2025-11-13／2026-10-16／2025-07-24／2026-11-02 開發者新聞、apple.com/tw/apple-intelligence、Apple 法務隱私頁（Apple Intelligence）、Apple 商標使用指引。

---

## 0. 結論（先讀）

**各階段能不能做**

| 階段 | 能不能做 | 一句話理由 | 要改的文件 |
|---|---|---|---|
| 1 規則分類＋App Intents／捷徑＋帳單補記＋（紙本發票 QR） | **能做** | 全在手機上處理，不構成「蒐集」；無 AI，所以**不得宣傳「AI 自動記帳」** | 隱私權政策（加相機／捷徑段）、審查備註（描述新功能）、商店文字（用詞）。隱私標籤**不變** |
| 2 裝置端 Apple Foundation Models | **能做** | 裝置端處理不算蒐集【確定】；風險在 AI 出錯與投資建議 | 同上，再加：使用條款 AI 條、App 內 AI 標示、描述提到使用 Apple Intelligence（2.5.1）。隱私標籤**不變** |
| 3 對話助理＋iOS 27 PCC | **能做，但要先做同意畫面與文件改寫** | 資料會傳出手機到 Apple PCC。5.1.2(i) 首句「transmit」就要使用者許可；Apple 是否算「third-party AI」【不確定】，保守做法是**預設關閉＋首次明確同意** | 隱私權政策「不上傳」要改、審查備註「no server / does not upload」要改、使用條款、付費牆（若 AI 助理收費要寫機型／iOS／額度限制）。隱私標籤【推論】**可維持「未蒐集」**，但要留下判斷紀錄 |
| C BYOK（暫不做） | 法律上可做，文件代價大 | 要點名供應商、送出前同意；隱私標籤是否要申報【不確定】，保守應申報 | 全部大改 |
| D 自建代理（暫不做） | 可做但開發者變成個資蒐集者 | 個資法告知、委託監督、境外傳輸、外洩通報全部上身 | 全部大改；「沒有伺服器」不能再說 |

**最重要的五件事**

1. **5.1.2(i) 的首句比「third-party AI」那句更要緊**：「you may not use, transmit, or share someone's personal data without first obtaining their permission」【確定】。PCC 會「transmit」帳本資料出手機，不管 Apple 算不算第三方，都該先取得許可。→ 階段 3 一律做「預設關閉＋首次同意畫面＋設定可關」。
2. **PCC 資格條件核實無誤，但研究有兩處讀過頭**：「所有 App 首次下載**合計**未滿 200 萬」原文沒有「合計」，且遷移條款寫「If any app subsequently exceeds」，比較像**單一 App** 門檻【不確定】；「之後擴充額度會收費」那句腳註講的是使用者的每日額度（文件寫可升級 iCloud+），**不是**對開發者收 API 費的明文。開發者端真正的風險是「超過門檻或退出 SBP → 6 個月內遷移」【確定】。
3. **AI 不碰投資資料**：訂閱收費＋AI 對個股給分析意見，可能落入證券投資信託及顧問法第 4 條「直接或間接取得報酬…提供分析意見或推介建議」【推論†】。最乾淨的做法是階段 2～3 的 AI 工具**不接投資模組**。
4. **競品研究建議的副標有兩個詞要換**：「存進罐子」會被讀成 App 會幫你存錢（台灣數位銀行也用「存錢罐」稱子帳戶），與審查備註「no feature to … store money」衝突；「每月結一次帳」整句講的都是**付費功能**，2.3.2 要求清楚標示要另外購買。替代句見第 10 節。
5. **對外不點名競品、不說「唯一／獨家／只有我們」**：研究的「台灣主流 App 都沒有月結」是以 App Store 頁面「未見」推得，不足以支撐「唯一」的廣告宣稱（公平交易法第 21 條、比較廣告處理原則【†】）。

**現況提醒**：`store-listing.md` 的 App Store「副標題」欄位是翰陞 2026-11-12 定案的「清楚知道什麼可以花，什麼買不了」；「主動規劃預算，不要當月光族」是描述第一行與截圖 1。競品研究寫「主標不變、副標改成…」，把兩者混在一起（見第 11 節）。

---

## 1. 一手來源核實：PCC、5.1.2(i)、SBP

| 研究的說法 | 一手原文 | 判定 |
|---|---|---|
| 5.1.2(i)：「You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so.」 | 現行指南原文一字不差；同條首句：「Unless otherwise permitted by law, you may not use, transmit, or share someone's personal data without first obtaining their permission. You must provide access to information about how and where the data will be used.」 | 【確定】正確。研究漏了首句，首句才是 PCC 的主要依據 |
| 2025-11-13 Apple 公告新增此釐清 | 公告原文：「Clarifies that you must clearly disclose where personal data will be shared with third parties, including with third-party AI…」 | 【確定】 |
| 指南 2026-10-16 更新版仍有 | 頁面「Last Updated: October 16, 2026」；該次修改 1.2、2.3.14、2.5.19、3.1.1(a)、5，未動 5.1.2 | 【確定】 |
| PCC iOS 27 起 | `PrivateCloudComputeLanguageModel`「available on iOS 27, macOS 27, watchOS 27, and visionOS 27 or later」 | 【確定】 |
| 資格：SBP＋首次下載未滿 200 萬＋entitlement，「no cloud API cost」 | PCC 頁三項條件原文：「Are enrolled in the App Store Small Business Program.」「Have fewer than 2 million first-time app downloads from any of their apps on the App Store.」「Have the Private Cloud Compute entitlement assigned to their account.」SBP 頁也寫同樣的資格 | 【確定】 |
| 「所有 App 首次下載**合計**未滿 200 萬」 | 原文是「from any of their apps」，遷移條款為「If any app subsequently exceeds the 2 million first-time downloads threshold」 | **研究過度解讀**。可讀成「任一 App 未滿」或「合計」，原文沒說合計；遷移條款比較像以單一 App 計【不確定】。只上架一個 App 時兩種讀法結果一樣 |
| 超過門檻或退出 SBP，6 個月內遷移 | 「the developer will be notified and must migrate to an alternative solution within 6 months」 | 【確定】 |
| 「Apple 註明之後擴充額度會收費」→免費不是承諾 | 腳註原文：「Certain Apple Intelligence features that rely on server-side models are subject to daily usage limits, including … Developer apps using Apple Foundation Models in Private Cloud Compute. … Expanded access to such features will be available for a fee in the future. Use of these features is subject to the Apple Intelligence Terms and Conditions.」；文件另寫「People can upgrade their iCloud+ subscription to get more access」 | **部分正確**。「付費擴充」講的是使用者每日額度、看起來由使用者付（iCloud+）；**對開發者是否會開始收 API 費，Apple 沒寫**【不確定】。「免費是現況不是承諾」的結論仍成立，但依據應改為「資格條件與 6 個月遷移條款」 |
| 沒有 entitlement 送 prompt 會 crash | 「Without the PCC entitlement, your app crashes with a fatal error when you send the model a prompt for the first time.」 | 【確定】 |
| iOS 27 起 Apple Intelligence 預設開啟不能關 | 「In iOS 27 … Apple Intelligence is on by default and can no longer be turned off.」 | 【確定】 |
| PCC 隱私：不儲存、Apple 看不到 | apple.com/tw：「你的資料絕不會被儲存」「只會用於處理你的要求」，技術讓「Apple 或其他人無法存取」；Apple 法務隱私頁（2026-09-14）：「The data being processed in Private Cloud Compute is not stored or made accessible to Apple」。開發者 PCC 頁只寫「unparalleled privacy protections」，沒有逐項承諾；**沒有一份 Apple 文件明寫「第三方 App 經 Foundation Models 送的資料」適用相同保證**；PCC 技術白皮書（security.apple.com）讀不到 | 【確定】Apple 有這些對消費者的宣稱；【推論】同樣適用於開發者 App 的請求（同一個 PCC）；對外引用時一律寫「依 Apple 公開說明」，不要由我們擔保 |
| 台灣地區開放 | apple.com/tw 腳註列「繁體中文」，但「部分功能可能未在所有地區提供」；PCC 頁「Where Apple Intelligence is available」 | 【不確定】台灣地區是否可用 PCC，要真機確認；否則階段 3 在台灣店面可能根本無法提供 |
| SBP 費率與台灣 26% | SBP 頁：15%，沒有提到台灣；台灣 26%（2026-10-31 起）見 08／17 審核 | 【不確定】，維持 08 審的結論，以 App Store Connect 協議頁為準 |
| SBP 加入條件 | 「Be an Account Holder」「accept the latest Paid Apps agreement (Schedule 2)」「list all of your Associated Developer Accounts」；門檻為前一曆年與當年 proceeds 各 ≤ US$1M | 【確定】個人帳號可加入。超過 US$1M 會失去 SBP → 同時觸發 PCC 6 個月遷移 |

**(a) Apple PCC 算不算 5.1.2(i) 的「third-party AI」？**【不確定】
- 支持「不算」：PCC 是 iOS 內建框架呼叫的 Apple 服務；隱私標籤規則「You are not responsible for disclosing data collected by Apple」【確定】；使用者使用 Apple Intelligence 已受 Apple Intelligence Terms 約束【確定】。2025-11 的釐清背景是 App 把資料送到外部 AI 公司。
- 支持「算」：對開發者與使用者而言，Apple 在法律上就是另一方；指南沒有定義「third party」，也沒有替 PCC 開例外。
- **不論哪一邊，5.1.2(i) 首句的「transmit」都要先取得許可**【推論】。所以實務答案一樣：**預設關閉、首次使用前跳同意畫面、說明送什麼／送到哪／Apple 怎麼處理、設定可隨時關閉**。這樣做成本很低，也一併滿足個資法（見第 5 節）。

---

## 2. 研究列的 13 個法規點，逐項

| # | 問題 | 結論 | 詳見 |
|---|---|---|---|
| 1 | 5.1.2(i) 第三方 AI | (a) PCC 是否第三方【不確定】，但因首句「transmit」仍要事先許可 → 做同意畫面【推論】；(b) BYOK 要點名供應商並在每次送出前（至少首次＋可撤回）明確同意【確定】；(c) D 方案同 (b)，另加個資法告知 | §1、§4.4 |
| 2 | 隱私標籤 | 階段 1、2 不變；PCC【推論】不變；BYOK【不確定】保守應申報；D 必須申報 | §3 |
| 3 | 隱私權政策改寫 | 階段 1 起就要加「相機／照片」「捷徑草稿」段；階段 3 第一節的「上傳」要改 | §4 |
| 4 | 審查備註 | 每階段都要依 2.3.1(a) 具體描述新功能；階段 3 刪「does not upload data」 | §4 |
| 5 | 個資法 | C：開發者原則上不是蒐集者【推論】；D：開發者是蒐集者，第 8、19、20、4、21、27、12 條全部適用【推論†】 | §5 |
| 6 | 投資建議 | AI 不接投資模組；系統指示＋輸出過濾；3.2.1(viii) 不是這題的依據，真正依據是投信投顧法 | §6 |
| 7 | AI 錯誤責任 | 「草稿須確認才入帳」是最重要的法律防線；條款加 AI 條；廣告不得說「零錯誤」 | §7 |
| 8 | Apple Pay 捷徑 5.1.2(vii) | 【推論】不適用：本 App 不「使用 Apple Pay」收付款，資料是使用者自設的捷徑自動化傳入的；但若送雲端 AI，5.1.2(i) 照樣適用。對外**不要寫「Apple Pay 自動記帳」**，改「搭配『捷徑』App 的錢包交易自動化」（Apple 商標指引：只能以「for／compatible with」這類指涉用法，不得暗示 Apple 背書【確定】） | §2 下方 |
| 9 | 紙本電子發票 QR | 【推論†】讀紙本證明聯 QR 不是載具、不涉加值中心或財政部 API；可做。若加「自動對獎」要連網 | §9 |
| 10 | PCC 條款／SBP | 見 §1；6 個月遷移義務要在架構上預留退路（aiPort） | §1 |
| 11 | 台灣 AI 法規 | 人工智慧基本法 115-01-14 公布施行【確定†】；對一般業者沒有直接可罰的揭露義務【推論†】 | §8 |
| 12 | 年齡分級 | 沒有專門的 AI 題目；但 Apple 2025-07-24 公告要求「consider how all app features, including AI assistants and chatbot functionality, impact the frequency of sensitive content」【確定】。2026-11-16 起新增「Shared Location」「Dating and Relationships」兩題，**所有 App 須在 2027-01-12 前填完**【確定】→ 送審時兩題都答「無」；AI 助理只回答帳務、拒答其他話題，維持 4+【推論】 | — |
| 13 | 2.5.2 模型權重 | 【不確定】2.5.2 禁止下載「code which introduces or changes features or functionality」；權重是資料，但會改變行為。B4 已決定不做，不需定論；若日後要做，以「功能在送審時已完整存在、下載的只是同一功能的模型資料」並寫進審查備註，降低 2.5.19（隱藏功能）疑慮 | — |

**第 8 點補充**：5.1.2(vii) 原文「Apps using Apple Pay may only share user data acquired via Apple Pay with third parties to facilitate or improve delivery of goods and services.」【確定】。本 App 沒有用 Apple Pay 收款，捷徑自動化是使用者自己在「捷徑」App 建的，傳進來的是 iOS 交給捷徑的交易摘要【推論】。即使保守認定適用，「送去 AI 分類以完成使用者要求的記帳」也可說是「facilitate delivery of services」【推論】。不構成阻礙。

---

## 3. (c) 隱私營養標籤：各階段

Apple 定義【確定】：「"Collect" refers to transmitting data off the device in a way that allows you and/or your third-party partners to access it for a period longer than what is necessary to service the transmitted request in real time.」「Data that is processed only on device is not "collected"… If you derive anything from that data and send it off device, the resulting data should be considered separately.」「"Third-party partners" refers to analytics tools, advertising networks, third-party SDKs, or other external vendors whose code you've added to your app.」「You are not responsible for disclosing data collected by Apple.」

| 階段 | 填答 | 理由 | 會讓它失效的事 |
|---|---|---|---|
| 1 | **未蒐集資料**（不變） | 規則分類、App Intents、草稿收件匣、QR 解析都在裝置上 | 用線上 API 查統編→店名、連財政部對獎 API、加任何分析 SDK |
| 2 | **未蒐集資料**（不變） | Foundation Models 裝置端模型、Vision OCR 都在裝置上 | 用 `SFSpeechRecognizer` 沒設 `requiresOnDeviceRecognition`（會送 Apple 伺服器；屬 Apple 蒐集，但對外「全在手機上」就不成立）；選用的 AI 套件含遙測 |
| 3 PCC | 【推論】**可維持未蒐集資料** | 兩個獨立理由：①開發者與其「third-party partners」都存取不到（Apple 不是我們加入程式碼的外部廠商）；②依 Apple 說明 PCC 處理完不保存，未超過即時處理所需時間 | 若 App 自己另外記錄或上傳任何 AI 對話；若 Apple 日後改變 PCC 說明。**送審前把這段判斷寫進審查備註**，讓審查員有機會提出不同看法 |
| C BYOK | 【不確定】**保守建議申報**：Other Financial Info、Other User Content（若送備註原文），「未與身分連結」、用途「App 功能」 | 供應商不是我們的夥伴、合約是使用者自己簽的，可主張不申報；但若用了供應商 SDK（Vercel AI SDK 的 anthropic()／openai() provider 也算加入程式碼）就符合「third-party partners」定義，且多數 API 供應商會保存一段時間做濫用監控（各家條款本次未驗證）。少報被退件或下架的代價大於多報 | — |
| D 自建代理 | **必須申報** | Other Financial Info、Other User Content；額度計數若以 originalTransactionId 或 App Attest key 識別 → Identifiers（User ID／Device ID）；伺服器驗收據 → Purchases；有錯誤日誌 → Diagnostics。是否「與身分連結」看識別碼是否和內容一起保存 | — |

→ 各階段都要同步更新 `store-listing.md`「App 隱私」段的「依據」與「前提」。

---

## 4. (d) 隱私權政策與審查備註：替代句

### 4.1 隱私權政策（`docs/app-store/privacy-policy.md`）

**階段 1～2：第一節第一點可保留「上傳」**，但補一句說明自動化與 AI 也在手機上：

> 你在本 App 記錄的收支、預算、帳戶餘額、信用卡帳單、貸款與投資等資料（以下稱「帳本資料」），**儲存在你的 iPhone 上**。開發者沒有伺服器，**不會蒐集、接收、上傳或查看你的帳本資料**。本 App 的自動分類、捷徑記帳、掃描發票〈階段 2 加：與 AI 功能〉都在你的 iPhone 上執行。

**階段 1 新增一節「相機、照片與捷徑」**（5.1.1(i) 要說明資料怎麼取得、怎麼用【確定】）：

> 1. **掃描發票與收據**：你使用掃描功能時，本 App 會使用相機或你選取的照片，在 iPhone 上辨識條碼與文字，只把你確認後的日期、金額、店家等存入帳本。照片〈不會被本 App 保存／會存在帳本中並隨備份檔匯出，依實作擇一〉，也不會傳給開發者。
> 2. **捷徑與 Siri**：你在「捷徑」App 設定的自動化（例如錢包交易後執行）傳給本 App 的金額、商家名稱，只會存成待你確認的草稿，留在你的 iPhone 上。
> 3. **聽寫**：你用 iPhone 鍵盤的聽寫輸入時，語音由 Apple 依 iOS 設定處理，不經過本 App。

**階段 2 新增「裝置端 AI」一段**：

> 在支援 Apple Intelligence 的 iPhone 上，本 App 使用 Apple 內建在 iPhone 的模型提供分類建議、一句話記帳與收據解析。這些處理都在你的 iPhone 上完成，不會把帳本資料傳出手機。AI 產生的內容只是草稿或說明，須經你確認才會記入帳本。

**階段 3（PCC）：第一節第一點改寫**，「上傳」一詞不能再無條件使用：

> 帳本資料**儲存在你的 iPhone 上**。開發者沒有伺服器，**不會蒐集、接收或查看你的帳本資料**。本 App 預設不會把帳本資料傳出你的 iPhone；只有在你開啟「進階 AI（Apple 私密雲端運算）」並送出問題時，才會把回答該問題所需的部分資料交給 Apple 處理（見第〇節）。

**階段 3 新增一節「進階 AI（Apple 私密雲端運算）」**（對照個資法第 8 條各項與 5.1.1(i)）：

> 1. **預設關閉**。你在設定中開啟並同意後才會使用；你可以隨時關閉，關閉後 AI 功能只在 iPhone 上執行（或無法使用）。
> 2. **傳送內容**：你輸入的問題，以及回答所需的部分帳本資料，例如分類名稱、彙總金額、相關交易的日期、金額與備註。**不會**傳送投資資料、備份檔或整本帳本。
> 3. **傳送對象與方式**：透過 Apple 的 Foundation Models 框架，傳送到 Apple 的私密雲端運算（Private Cloud Compute）處理，結果傳回你的 iPhone。開發者收不到、也看不到這些資料。
> 4. **Apple 如何處理**：依 Apple 公開說明，私密雲端運算只用你的資料處理該次要求、處理後不保存，Apple 也無法存取〈連結 https://www.apple.com/tw/apple-intelligence/ 與 Apple 隱私權政策〉。處理地點是 Apple 的伺服器，可能位於中華民國境外。你使用 Apple Intelligence 也受 Apple 相關條款約束。
> 5. **每日額度**由 Apple 決定；額度用完時可等隔日重置，或依 Apple 的方案升級 iCloud+（由 Apple 收費，與本 App 訂閱無關）。

注意：不要寫「保證不保存」「絕對安全」；Apple 的承諾只能「依 Apple 說明」轉述（消保法第 22 條：廣告內容對企業經營者有拘束力【確定†】）。

**BYOK（若日後做）新增一節**，並在 5.1.1(i) 要求下處理第三方保護條款：

> 你在設定中貼上自己的〈供應商〉API 金鑰並開啟後，本 App 會在你每次送出時，從你的 iPhone 直接把問題與所需的部分帳本資料傳給〈供應商〉。〈供應商〉依其條款與隱私權政策處理，可能保存一段時間，伺服器可能位於美國等境外地區；開發者收不到、也無法刪除這些資料。金鑰只存在 iPhone 的鑰匙圈，不會放進備份檔。

5.1.1(i) 要求政策「Confirm that any third party with whom an app shares user data … will provide the same or equal protection」【確定】。BYOK 下我們無法替供應商擔保，這句怎麼寫才過審【不確定】，要做時再審。

### 4.2 App 內同意畫面（階段 3 必做；BYOK 每個供應商各一份）

> **開啟進階 AI？**
> 開啟後，當你送出問題，本 App 會把問題和回答所需的部分帳本資料（例如分類、金額、日期、備註）傳送到 Apple 的私密雲端運算處理。開發者看不到這些資料。依 Apple 說明，資料只用來處理你的要求、不會被保存。投資資料不會傳送。你可以隨時在「設定 > 進階 AI」關閉。
> 〔先不要〕〔同意並開啟〕

要點：①預設「先不要」，不要預先勾選；②同意後才建立 `PrivateCloudComputeLanguageModel`；③設定頁可關、可再看說明；④不同意不影響記帳與付費功能以外的使用（5.1.1(ii)「Paid functionality must not be dependent on or require a user to grant access to this data」【確定】→ **若對話助理是付費功能，不同意 PCC 的付費者仍要能用裝置端版本**，否則有爭議【推論】）。

### 4.3 審查備註（`docs/app-store/review-notes.md` 英文版）

依 2.3.1(a)：「All new features … must be described with specificity in the Notes for Review」【確定】；2.5.19：不得有「hidden, dormant, or undocumented features」【確定】（只在 Apple Intelligence 機型出現的功能要寫明，避免被當隱藏功能）。

**階段 1**，把「Data is stored…」段改成：

> Data is stored on the user's device. The developer operates no server, and the app does not send ledger data off the device. The app makes no network requests of its own and contains no analytics, advertising or crash-reporting SDK. 〈其餘不變〉
>
> New in this version: (1) Category suggestions, calculated on the device from the user's own past entries. (2) An App Intent, "Add draft transaction", for Shortcuts and Siri. It saves a draft to an in-app inbox; nothing is recorded until the user confirms it in the app. Users may connect it to a Wallet transaction automation they create themselves in the Shortcuts app; the app cannot create automations. (3) Scanning the QR codes printed on Taiwan paper e-invoices with the camera. The codes are parsed on the device. The app does not access any e-invoice carrier, government e-invoice API or value-added service center.

**階段 2**，再加：

> (4) On devices that support Apple Intelligence, the app uses the on-device Apple Foundation Models (SystemLanguageModel) to suggest categories, turn a sentence into a draft and read receipts. Processing happens entirely on the device. On other devices these buttons are hidden and the rule-based suggestions are used. AI output is only a draft or an explanation; the user must confirm before anything is recorded. Investment data is never given to the model. To test, please use a device with Apple Intelligence enabled 〈附：示範影片連結〉.

**階段 3**，刪掉「The app has no server, does not upload data」，改成：

> The developer operates no server and never receives user data. Ledger data is stored on the device. The only off-device processing is the optional "Advanced AI" feature, which is off by default. When the user turns it on through a consent screen and sends a question, the app sends that question and the minimum ledger details needed to answer it to Apple Foundation Models on Private Cloud Compute through the FoundationModels framework (PrivateCloudComputeLanguageModel). The app makes no other network requests. Our account is enrolled in the App Store Small Business Program and has the Private Cloud Compute entitlement. We treat this as transmitting personal data under Guideline 5.1.2(i), so we ask for explicit permission first. Because the developer and its partners cannot access the data and Apple states that it is not retained, our App Privacy answer remains "Data Not Collected"; please let us know if App Review sees it differently. The assistant reads data only through read-only tools, cannot record or change entries without the user confirming a preview, and does not receive investment holdings or give investment, buy or sell recommendations.

**送審前對照清單要改的項目**：
- 「程式沒有 `fetch` 或其他網路呼叫」→ 階段 3：「除 FoundationModels 框架（PCC）外，`apps/mobile/src` 與原生模組沒有 fetch／URLSession／其他網路呼叫；選用的 AI 套件（例如 `@react-native-ai/apple`、`ai`）沒有遙測，也沒有 provider 會在沒有 key 時自動連線」。
- 新增：「Info.plist 的 `NSCameraUsageDescription`、`NSPhotoLibraryUsageDescription`（若用相簿）、`NSMicrophoneUsageDescription`／`NSSpeechRecognitionUsageDescription`（若用 Speech）文字與實際用途一致」。用途字串範例：「用相機掃描發票或收據，在 iPhone 上辨識金額與日期，結果須由你確認後才記帳。」
- 新增：「年齡分級問卷已回答 2026-11-16 新增的 Shared Location、Dating and Relationships 兩題（期限 2027-01-12）」。
- 新增（階段 3）：「PCC entitlement 已指派；未取得前正式建置不得呼叫 `PrivateCloudComputeLanguageModel`（文件明寫會 crash）」。

### 4.4 商店文字（`store-listing.md`）

- 「資料存在你的 iPhone，不用註冊帳號，開發者沒有伺服器、看不到你的帳」：階段 1～2 照用；階段 3 改「資料只**存**在你的 iPhone，不用註冊帳號，開發者沒有伺服器、看不到你的帳。進階 AI 開啟時，問題會交由 Apple 私密雲端運算處理（可關閉）。」
- 2.5.1：「Apps should use APIs and frameworks for their intended purposes and indicate that integration in their app description」【確定】→ 階段 2 起描述寫「在支援 Apple Intelligence 的 iPhone 上……」，並寫明機型／iOS 版本需求。
- 商標：「Apple Intelligence」「Siri」「Apple Pay」只能用於指涉相容性，不能放進產品名稱、不能暗示 Apple 背書【確定，Apple 商標指引】。不要用 Apple 標誌。
- 階段 1 **不得出現「AI」**；用「自動帶分類」「捷徑快速記帳」「一鍵補記」，不要用「全自動記帳」（使用者要自己建自動化、草稿要自己確認）。

---

## 5. (e) 個資法（BYOK、自建代理）

前提：帳本資料（收支、財務狀況、備註裡的人名）屬個資法第 2 條第 1 款「財務情況…及其他得以直接或間接方式識別該個人之資料」【確定†，https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021】；即使不含姓名，備註常有可識別內容，保守當成個資【推論】。財務情況不是第 6 條特種個資【確定†】。

| 情境 | 開發者角色 | 義務 |
|---|---|---|
| 階段 1～2（全在手機） | 不蒐集、不處理【推論】 | 只有客服信（已在政策第六節） |
| 階段 3 PCC | 【不確定】開發者不取得資料，但 App 是傳輸工具。最可能的看法是使用者本人透過 Apple 服務處理自己的資料 | 保守做法：§4.2 的同意畫面已涵蓋第 8 條告知要素（目的、類別、對象、地區、方式、權利／不提供之影響），即使被認定為蒐集者也有第 19 條第 1 項第 5 款「經當事人同意」可依【推論†】 |
| C BYOK | 【推論】開發者原則上**不是**蒐集者：資料由使用者自己的帳號、自己的金鑰直送供應商，開發者無法存取；供應商是使用者的契約相對人 | 仍要在同意畫面清楚說明（5.1.2(i) 與消保法資訊揭露）；不要讓金鑰或對話紀錄進備份或任何開發者可取得之處 |
| D 自建代理 | **開發者是非公務機關蒐集／處理者**【推論†】（第 51 條「單純個人或家庭活動」例外不適用，因為是營利【推論†】） | 見下 |

**D 方案的個資法清單**【†，條號請核對】：
1. **第 8 條告知**：首次使用前在 App 內告知名稱、目的、類別、期間／地區／對象／方式、第 3 條權利、不提供的影響。
2. **第 19 條蒐集要件**：契約關係＋適當安全措施（第 1 項第 2 款），或書面同意（第 5 款，電子同意依電子簽章法）。兩者都備。
3. **第 20 條**：只在特定目的內利用；**不得**拿去訓練模型、行銷、分析。
4. **第 4 條委託**：AI 供應商是受託者，「視同委託機關」；**施行細則第 8 條**要求委託機關對受託者「適當監督」，至少確認：蒐集處理利用的範圍、類別、目的與期間；受託者的安全措施；複委託；違約或事故通知；委託結束時資料返還或刪除；定期確認執行狀況並記錄【推論†】。實務：只選有書面「不訓練、保存期限明確、可簽 DPA」的 API 方案，留存條款版本。
5. **第 21 條境外傳輸**：現行規定是「中央目的事業主管機關得限制」的四種情形，不是原則禁止【確定†】；此條在 2025-11-11 修正公布的條文之列（施行日由行政院定），新條文內容本次未讀到【不確定】。D 上線前必須重查。
6. **第 27 條安全維護**；**第 12 條外洩通知**：2025-11-11 修正後，非公務機關除通知當事人外，符合一定範圍者須向個人資料保護委員會通報，違反可罰 2 萬～20 萬元、按次處罰【確定†，修正條文施行日由行政院另定，本次未查到施行日】。
7. 隱私權政策要大改；「沒有伺服器」從所有文件刪除。

---

## 6. (f) AI 回答避免構成投資建議

- **法律依據**：證券投資信託及顧問法第 4 條第 1 項：證券投資顧問指「直接或間接自委任人或第三人取得報酬，對有價證券、證券相關商品或其他經主管機關核准項目之投資或交易有關事項，提供分析意見或推介建議」；第 63 條須經許可；第 107 條第 1 款未經許可經營，處 5 年以下有期徒刑，併科新臺幣 100 萬～5,000 萬元罰金【確定†，全國法規資料庫「證券投資信託及顧問法」】。
- **為什麼 AI 讓風險變高**：現在投資頁只依使用者輸入算損益，不顯示報價、不建議（17 審【推論】不適用）。對話助理若回答「台積電漲了 30%，可以考慮獲利了結」，就是對個股的「推介建議」；訂閱費可能被看成「間接取得報酬」【推論†】。3B 模型很難保證完全不說，系統指示不夠。
- **建議（由強到弱）**：
  1. **階段 2～3 的 AI 工具不接投資模組**（不提供 `investment_*` 工具，也不把投資資料放進 context）。問到投資時回固定句：「投資紀錄請到『投資』頁查看你自己輸入的成本與市值。本 App 不提供投資建議。」這也維持審查備註「does not … give buy or sell recommendations」為真。
  2. 系統指示（英文寫給模型，回覆繁中）：「Never give investment, tax or legal advice. Never recommend buying, selling, holding or allocating any security, fund or cryptocurrency, and never predict prices or returns. If asked, reply with the fixed refusal text.」
  3. 輸出過濾（規則，在帳本服務外的 aiPort 做）：出現「買進、賣出、加碼、減碼、停利、停損、目標價、推薦、配置比例、會漲、會跌」等字，整句改為固定拒答。
  4. 月度回顧只談收支與預算，不談投資報酬。
- 加密貨幣通常不是有價證券，投顧法未必適用【推論†】，但同樣不給建議（審查指南與一致性）。
- 金管會「金融業運用人工智慧指引」的適用對象是金融機構，不及於本 App【推論†】。

---

## 7. (g) AI 分類／金額出錯：免責與消保法界線

- **能免的與不能免的**：民法第 222 條故意或重大過失責任不得預先免除；第 247-1 條、消保法第 12 條定型化條款顯失公平者無效；消保法第 11 條第 2 項疑義作有利消費者解釋；消保法第 22 條廣告內容為契約義務【確定†】。所以「AI 結果一律不負責」寫了也不一定有效；**真正的防線是設計**：
  1. AI 只產生草稿／預覽，**使用者確認後才由帳本服務寫入**（研究第七節原則 1）【推論：這讓「錯帳」的最後決定在使用者手上，消費者自己確認過的資料，難以歸責於 App】。
  2. 數字一律由工具回傳、畫面直接顯示，不讓模型算或改寫（研究原則 2）。
  3. AI 文字旁標「AI 產生，可能有誤」（也呼應人工智慧基本法透明原則，見 §8）。
  4. 草稿確認畫面顯示日期、金額、分類、帳戶四欄，金額不可由模型自動帶入後跳過確認。
- **使用條款新增一條（替代文字，放在現行第七條責任上限之前）**：

> **第〇條 自動分類與 AI 功能**
> 1. 本 App 的自動分類、掃描辨識與 AI 功能（包括由 Apple 模型產生的文字）只會產生「草稿」或說明，可能辨識錯誤或與事實不符。草稿須經你確認才會記入帳本；確認前請核對日期、金額、分類與帳戶。
> 2. 預算、月結、儲備等數字，以帳本依你確認的資料計算並顯示在畫面上的結果為準；AI 說明文字與畫面數字不同時，以畫面數字為準。
> 3. AI 功能不提供投資、稅務、法律或其他專業建議，也不推薦任何金融商品或買賣時機。
> 4. 進階 AI 功能由 Apple 提供的模型與服務處理，支援機型、iOS 版本、地區與每日額度由 Apple 決定。Apple 變更或停止該服務時，我們可能調整或停止該功能，並於 App 內告知。
> 5. 除因故意或重大過失，或依法不得排除的責任外，本條所述錯誤依第七條處理。

- **付費面**：若「對話助理／整理上週」放進付費版（24 研究 Q3 建議），付費牆與描述要寫明「需支援 Apple Intelligence 的 iPhone；進階 AI 需 iOS 27 並受 Apple 每日額度限制」（3.1.2(c)「clearly describe what the user will get for the price」【確定】；2.3.2【確定】）。不要把 PCC 功能當付費主賣點，否則 Apple 收回或台灣不開放時，付費者權益有爭議【推論】。
- **廣告禁語**：「AI 保證正確」「零錯誤」「全自動不用確認」「自動幫你記好所有帳」（消保法第 22 條、公平交易法第 21 條【確定†】；2.3.1(a)「promoting … services that it does not actually offer」【確定】）。

---

## 8. (h) 人工智慧基本法

- 【確定†】立法院 2025-12-23 三讀；總統 115 年（2026）1 月 14 日公布全文 20 條，自公布日施行；中央主管機關為國家科學及技術委員會（多個轉載來源一致；總統府公報與全國法規資料庫原文本環境無法連線）。
- 【確定†】內容以政府義務與原則為主：原則之一「透明與可解釋」——人工智慧之產出應做適當資訊揭露或標記；數位發展部推動與國際接軌的 AI 風險分類框架，各目的事業主管機關依框架訂定以風險為基礎的管理規範；經中央目的事業主管機關會商數位發展部認定為**高風險**的產品或系統，應明確標示注意事項或警語；政府應就高風險應用明確責任歸屬並建立救濟、補償或保險機制；施行後二年內檢討法規【條號未能核實，請對照原文】。
- 【推論†】對本 App 目前**沒有直接、可處罰的揭露義務**：基本法本身沒有罰則對業者；高風險標示要先經主管機關認定，個人記帳助理被列入的可能性低。
- **建議**：①仍主動標示「AI 產生，可能有誤」（成本低，符合透明原則，也是消保法上的資訊揭露）；②追蹤數位發展部風險分類框架與金管會、法務部個資會的子法，2028-01 前（二年檢討期）每半年查一次；③不必為基本法改架構。

---

## 9. (i) 紙本電子發票 QR 掃描

- 【確定†】財政部《電子發票證明聯一維及二維條碼規格說明》（最新見 Ver 1.9，111-05-10）：二維條碼為兩個並列 QR Code；左側含發票字軌號碼、開立日期、4 碼隨機碼、銷售額、總計額、買方統編、賣方統編、加密驗證資訊等，並含品目資料；右側接續品目（品名、數量、單價）。規格公開供營業人列印與一般讀取。
- 【推論†】掃描紙本證明聯、把資料存在手機：
  - **不是「載具」**：載具是把發票歸戶儲存的工具（例如手機條碼），涉及財政部電子發票整合服務平台；讀紙本 QR 不歸戶、不連平台。與票 15「不做發票載具」不衝突，但對外說法要分清楚：「掃描紙本發票 QR 帶入金額」，**不要寫「支援電子發票」「發票自動匯入」**（會被讀成載具，2.3、公平交易法第 21 條）。
  - **不涉加值服務中心、不需申請財政部 API**：只有查詢載具發票、對獎等線上服務才要申請 API（AppID）並遵守其使用規範。
  - 解析時**不需要也不要嘗試解密「加密驗證資訊」**（那是營業人用金鑰產生的驗證欄位），只取明文欄位。
  - 買方統編通常是公司統編，非個人資料；品名留在手機。
- 【不確定】規格文件是否附帶對第三方讀取的使用限制：本次讀不到原檔（einvoice.nat.gov.tw 被擋）。上線前請下載原檔確認，並問財政部財政資訊中心一句。
- 若日後加「自動對獎」：要連網抓中獎號碼（不送個資，隱私標籤可不變【推論】），但審查備註的「no network requests」要改。

---

## 10. 競品研究的文案審（`24-competitive-edge.md`）

### 10.1 副標「每月結一次帳，花剩的錢存進罐子，數字對到每一塊錢。」

（25 字，在 30 字內。）

| 片段 | 風險 | 依據 |
|---|---|---|
| 「每月結一次帳」 | 月結是**付費功能**；副標無法標「進階版」，整句又全是付費功能，2.3.2 要求描述與截圖清楚標示哪些要另外購買 | 2.3.2【確定】；消保法第 22 條【確定†】 |
| 「花剩的錢存進罐子」 | ①App 不移動、不保管任何錢，累積的是**預算**不是錢；使用者其他分類超支時，「花剩的錢」實際可能不存在 → 引人錯誤；②台灣數位銀行常用「存錢罐」稱子帳戶，容易被讀成會幫你存錢；③與審查備註「no feature to transfer, send, receive or store money」、3.2.1(viii)「money management」敏感點正面衝突 | 公平交易法第 21 條【確定†】；3.2.1(viii)【確定】 |
| 「數字對到每一塊錢」 | 結果保證式說法。App 實際做的是「差額為 0 才能結帳」，正確性仍取決於使用者輸入；2.3.7 要求副標不得有「unverifiable product claims」。風險低到中 | 2.3.7【確定】；消保法第 22 條【確定†】 |
| 未點名他牌 | 好。2.3.7 副標不得「reference other apps」 | 【確定】 |

**替代寫法**（擇一；字數含標點）：

1. 「每月對帳，差額歸零才結帳，沒花完的預算留著用」（22 字）— 講功能事實，「預算」取代「錢」。
2. 「沒花完的預算累積成儲備，月底對帳差額歸零」（20 字）。
3. 「先分預算再花錢，月底對帳差額歸零才結帳」（19 字）— 前半是免費功能，降低 2.3.2 疑慮。

**另外兩點**：①現行副標「清楚知道什麼可以花，什麼買不了」已定案，換副標是翰陞的決定；②任何一句上線，描述第一段與截圖都要標「（進階版）」，宣傳文字也一樣（前份審核已要求）。

### 10.2 其他比較性宣稱

| 宣稱 | 用在哪 | 意見與替代寫法 |
|---|---|---|
| 「無廣告、不追蹤」 | 自家文案 | **可用**，但要精確並與隱私標籤一致：「無廣告、不用註冊、不使用追蹤或分析工具」。「不追蹤」在 Apple 語意（ATT tracking）下各階段都成立；若加了 BYOK／D，「未蒐集資料」就不再成立，相關句要同步改 |
| 「天天記帳有廣告、會追蹤你」等點名比較 | 研究建議不放在商店；官網、社群可能用 | **App Store 一律不點名**（2.3.7 副標與關鍵字、2.3.10、2.3.14 創意素材「references to other apps with an intent to mislead」【確定】；`store-listing.md` 也已規定）。官網／社群：公平會比較廣告處理原則要求自身與他事業的表示都與事實相符，且以公正、客觀、基準相當的方式比較【確定†】；違反可能構成公平交易法第 21 條（不實廣告）、第 24 條（為競爭目的陳述不實、損害他人營業信譽）、第 25 條【確定†，條號以現行法為準】。實務上：**不點名**；真要比，只比可查證的公開事實（例如「隱私標籤：未蒐集資料」對照對方標籤截圖），寫明查證日期，並定期更新。不要寫「會追蹤你」這類解讀，對方標籤寫的是「可能被用來追蹤你的資料」類別 |
| 「台灣主流 App 都沒有月結」「只有我們做月結核對」「真正的空缺」 | 研究結論 1、§5.3 | **不得對外使用**。依據是 App Store 頁面「未見」，研究自己也註明「不代表 App 一定沒有」；Moze 有信用卡「對帳模式」與「餘額調整」。對外改成只描述自己：「月結精靈帶你核對信用卡帳單與總資產，差額歸零才結帳」。不要用「唯一、獨家、第一、只有」 |
| 「匯出永遠免費」 | 研究比較表 Afterbills 欄「CSV 匯出：永遠免費」 | 研究已收回「獨有」說法；但「永遠」也不要用（使用條款 4.4 已改「不需訂閱即可使用」）。改「交易 CSV 匯出不需訂閱」 |
| 「可以用語音叫 AI 助理幫你記帳」 | 研究 Q3 | **目前不能對外說**：24-ai 研究自己查到 Siri AI 初期不支援中文、App Shortcuts 繁中觸發需實測；Emotion Computer 的 Dot 是另一個 App，不能在商店點名。等真機驗證後，可說「可用『捷徑』與 Siri 快速新增一筆（需自行設定）」 |
| 「帳本只在你的手機，但可以用 iPhone 捷徑讓 AI 助理幫你記」 | 研究 Q4 | 階段 1 無 AI；「AI 助理」指的是第三方或 Apple 的，要說清楚是「與支援捷徑的助理 App 搭配」，且不暗示合作 |
| 「不需要給 App 你的網銀帳密」 | 研究 §5.2 | 可用，屬自家事實描述 |

---

## 11. 兩份研究的錯誤與過度宣稱

**24-ai-bookkeeping.md**
1. **PCC 門檻寫成「所有 App 首次下載合計未滿 200 萬」**：原文是「from any of their apps」＋「If any app subsequently exceeds」，沒有「合計」（§1）。
2. **「Apple 註明之後擴充額度會收費」被當成開發者成本風險**：腳註講的是使用者的每日額度，文件寫使用者可升級 iCloud+；對開發者是否收費沒有明文。開發者端的實際風險是 SBP／200 萬門檻與 6 個月遷移（§1）。
3. **「A＋B 隱私政策、審查備註都不用改」**（結論 1、第八節）：隱私標籤不用改是對的，但隱私權政策要加相機／照片／捷徑段（5.1.1(i)），審查備註必須依 2.3.1(a) 具體描述新功能，Info.plist 要加用途字串（§4）。
4. **5.1.2(i) 只引第三句**：漏了首句「may not use, transmit, or share … without first obtaining their permission」。這句讓「PCC 要不要同意畫面」的答案變成「要」，不必等「Apple 是否第三方」的爭議有結論。
5. **投資建議界線引 3.2.1(viii)**：3.2.1(viii) 規定的是交易／投資／理財 App 須由金融機構提交，不是規範 AI 回答內容；應以證券投資信託及顧問法第 4、63、107 條為準（§6）。
6. **「Apple Pay 刷卡自動記帳」**：名稱有商標與誤導風險（本 App 不使用 Apple Pay，靠的是使用者自建的捷徑自動化），對外改說法（§2 第 8 點）。
7. **「AI 在你的 iPhone 上執行」**（第八節對外說法）：鍵盤聽寫可能由 Apple 伺服器處理，不要把聽寫算進「全在手機上」。
8. 「Apple 宣稱不儲存、Apple 也看不到」引用正確（apple.com/tw、Apple 法務隱私頁），但 Apple 沒有一份文件明說「第三方 App 經 Foundation Models 送的資料」適用同樣承諾，對外要寫「依 Apple 公開說明」。
9. 台灣地區是否能用 Apple Intelligence／PCC 仍未驗證（研究自己也標了）。這不只是體驗問題，是**階段 3 在台灣店面能不能交付**的前提。

**24-competitive-edge.md**
1. **主標／副標混用**：研究寫「主標不變（主動規劃預算，不要當月光族），副標改成…」，但 App Store 的「副標題」欄位現為「清楚知道什麼可以花，什麼買不了」（已定案），「主動規劃預算…」在描述第一行與截圖 1。要先確定新句要放哪個欄位（§0）。
2. **「月結是真正的空缺／只有我們做月結核對」**：以頁面「未見」推得，不足以當對外宣稱的依據（§10.2）。
3. **「可以用語音叫 AI 助理幫你記帳」**：與 24-ai 研究的 Siri 中文限制相互矛盾，尚未驗證。
4. 比較表 Afterbills 欄「CSV 匯出：永遠免費」：「永遠」已在使用條款中移除，對外不要再用。
5. 「花剩的錢存進罐子」：累積的是預算不是錢（§10.1）。

---

## 12. 各階段「上線前必做清單」

### 階段 1（無 AI）
- [ ] 隱私權政策加「相機、照片與捷徑」一節（§4.1）；生效日更新；政策網址內容與 App 內一致。
- [ ] 審查備註依 §4.3 加新功能描述；附測試步驟（如何觸發 App Intent、測試用發票照片或 QR 圖檔，不能用翰陞真實發票）。
- [ ] Info.plist：`NSCameraUsageDescription`（及相簿）用途字串，寫清楚「在 iPhone 上辨識，確認後才記帳」。
- [ ] 隱私標籤維持「未蒐集資料」，確認沒有線上統編查詢、對獎 API、任何新 SDK；`store-listing.md`「App 隱私」依據段補「QR 與捷徑資料只在裝置上處理」。
- [ ] 商店文字：不出現「AI」「全自動」「支援電子發票」「Apple Pay 自動記帳」；改用「掃描紙本發票 QR」「搭配『捷徑』App」。
- [ ] 內建台灣商家關鍵字表：只用公開店名，**不得**取自翰陞私帳；不要用他牌商標圖示。
- [ ] 下載財政部條碼規格原檔，確認有無第三方讀取限制（§9）。
- [ ] 年齡分級問卷回答 2026-11-16 新增兩題（期限 2027-01-12）。
- [ ] A3 帳單補記：交 `legacy-migration` 確認不影響舊帳比對（非法規項，但影響月結數字的對外宣稱）。

### 階段 2（裝置端模型）
- [ ] 階段 1 全部。
- [ ] 隱私權政策加「裝置端 AI」段（§4.1）。
- [ ] 使用條款加「自動分類與 AI 功能」條（§7）。
- [ ] App 內 AI 文字旁標「AI 產生，可能有誤」；草稿確認畫面顯示四欄。
- [ ] AI 工具**不接投資模組**；系統指示禁止建議；輸出過濾；拒答固定句（§6）。
- [ ] 描述寫明需支援 Apple Intelligence 的 iPhone（2.5.1、2.3）；截圖中 AI 畫面標示機型需求。
- [ ] 審查備註加 Foundation Models 段＋示範影片；寫明非支援機型會隱藏（2.5.19）。
- [ ] 不用 Speech 框架；若要用，強制 `requiresOnDeviceRecognition`，並加麥克風／語音辨識用途字串與政策段。
- [ ] 選用的 AI 套件審查：無遙測、無自動連網；或用自寫窄介面模組。
- [ ] 評測集用虛構句子，不得用翰陞真實帳。
- [ ] 若 AI 功能放付費：付費牆寫明機型需求（3.1.2(c)）；不同意任何資料傳輸的付費者仍能用（5.1.1(ii)）。

### 階段 3（對話助理＋PCC）
- [ ] 階段 2 全部。
- [ ] 加入 App Store Small Business Program（申報關聯帳號）；申請並取得 PCC entitlement；正式建置未取得前不得呼叫 PCC。
- [ ] 真機確認台灣地區、繁中可用 PCC；不可用就不要在台灣店面宣傳。
- [ ] 同意畫面（§4.2）：預設關閉、首次明確同意、設定可關、可重看說明。
- [ ] 隱私權政策改第一節並新增「進階 AI」一節（§4.1）；所有 Apple 隱私承諾以「依 Apple 公開說明」轉述並附連結。
- [ ] 審查備註刪「does not upload data」，改 §4.3 階段 3 版；送審前對照清單改 fetch 一項。
- [ ] 隱私標籤維持「未蒐集」的判斷寫進 `store-listing.md` 依據段，標【推論】；若審查員有意見，改申報。
- [ ] 商店文字「資料存在你的 iPhone」改成「資料只存在你的 iPhone；進階 AI 開啟時交由 Apple 私密雲端運算處理（可關閉）」。
- [ ] 每日額度 UI（文件要求）；額度用完、離線、未取得資格時退回裝置端。
- [ ] 遷移預案：超過 200 萬首次下載、proceeds 超過 US$1M（失去 SBP）時，6 個月內的替代方案（只用裝置端，或另行審查 C／D），並預留政策改版時間。
- [ ] 付費牆：若對話助理收費，寫明 iOS 27、機型、Apple 每日額度；不把 PCC 當付費主賣點。
- [ ] 2.3.12「What's New」寫明新增進階 AI 與其資料處理。
- [ ] 請律師看同意畫面與政策新節。

### C BYOK／D 自建代理（目前不做；若重啟）
- [ ] 回到本檔 §3、§4.1、§5 重新審；D 另外要 DPA、境外傳輸、外洩通報流程、隱私標籤申報、「沒有伺服器」全面撤除。

---

## 13. 要問律師／會計師的問題

**律師**
1. App 透過 Apple Foundation Models 把使用者帳本片段送到 Apple PCC 處理，開發者完全取不到資料：在個資法下，開發者是否算「蒐集／處理」者？若算，App 內同意畫面（§4.2）是否足以作為第 19 條第 1 項第 5 款的同意與第 8 條的告知？
2. 隱私權政策轉述 Apple 的 PCC 隱私說明（「依 Apple 公開說明不保存」），若 Apple 實際作法不同，開發者在消保法第 22 條、公平交易法第 21 條下是否有責任？轉述方式怎麼寫最安全？
3. 對話助理若完全不接投資資料，只談收支預算，是否已確定落在證券投資信託及顧問法第 4 條「分析意見或推介建議」之外？若使用者在備註寫了股票名稱、AI 在月度回顧中提到，是否構成？
4. 使用條款「AI 功能」條（§7）在消保法第 12 條、民法第 247-1 條下是否有效？「以畫面數字為準」這種條款能否對抗 AI 文字錯誤造成的損害主張？
5. 對話助理若列為付費功能，而 Apple 停止 PCC 或台灣不開放，對已付費訂閱者要負什麼義務（退費、減價）？付費牆要怎麼寫才能事先排除爭議？
6. 人工智慧基本法施行後，個人開發者的 AI 記帳助理目前有沒有任何主管機關（國科會、數發部、金管會、個資會）發布的子法或指引會適用？
7. 個資法 2025-11-11 修正條文（第 12、21 條等）的施行日與境外傳輸新規定，對 D 方案（AI 供應商在美國）有何影響？
8. 官網或社群若引用他牌 App Store 隱私標籤做比較（附截圖與查證日期），是否仍有公平交易法第 24 條、比較廣告處理原則的風險？
9. 讀取紙本電子發票證明聯 QR（不解密、不連平台）是否需要財政部任何許可或受其使用規範限制？

**會計師**
10. 加入 App Store Small Business Program 後，台灣店面適用 15% 還是 26%？（同 08／17 審的未決問題）
11. SBP 申報的「Associated Developer Accounts」與 proceeds 門檻，個人帳號日後改由公司接手時怎麼計算？公司化會不會讓 PCC 資格中斷、觸發 6 個月遷移？
12. 若日後採 D 方案，AI API 費用（美元、境外公司）可否列為執行業務費用？有無境外勞務扣繳或營業稅問題？

---

## 14. 來源

Apple（本次直接讀到）：
- App Review Guidelines（Last Updated 2026-10-16）：https://developer.apple.com/app-store/review/guidelines/ — 1.2、2.1(a)、2.3、2.3.1、2.3.2、2.3.6、2.3.7、2.3.10、2.3.12、2.3.14、2.5.1、2.5.2、2.5.19、3.1.2(c)、3.2.1(viii)、4.7、5.1.1(i)(ii)(ix)、5.1.2(i)–(vii)
- 2025-11-13 指南更新（5.1.2(i) third-party AI）：https://developer.apple.com/news/?id=ey6d8onl
- 2026-10-16 指南更新：https://developer.apple.com/news/?id=92th7e5i
- 年齡分級 AI 提醒（2025-07-24）：https://developer.apple.com/news/?id=ks775ehf ；新增描述項（2026-11-02 公告，2026-11-16 起、2027-01-12 期限）：https://developer.apple.com/news/?id=yxkh08us ；定義：https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/
- App Privacy Details：https://developer.apple.com/app-store/app-privacy-details/
- Private Cloud Compute（開發者）：https://developer.apple.com/private-cloud-compute/
- Small Business Program：https://developer.apple.com/app-store/small-business-program/
- Foundation Models：https://developer.apple.com/documentation/foundationmodels/adding-server-side-intelligence-with-private-cloud-compute 、https://developer.apple.com/documentation/foundationmodels/detecting-available-apple-foundation-models 、https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.private-cloud-compute
- Apple Intelligence（台灣）：https://www.apple.com/tw/apple-intelligence/ ；Apple 法務隱私頁（2026-09-14）：https://www.apple.com/legal/privacy/data/en/intelligence-engine/
- Apple 商標使用指引：https://www.apple.com/legal/intellectual-property/guidelinesfor3rdparties.html

台灣法規（【†】本環境無法連線官方網站，依搜尋摘要與前份審核；請到 https://law.moj.gov.tw 核對）：
- 個人資料保護法（第 2、4、6、8、12、19、20、21、27、51 條；2025-11-11 修正公布部分條文）：https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021 ；施行細則第 8 條
- 消費者保護法（第 11、12、22 條）、民法（第 222、247-1 條）、公平交易法（第 21、24、25 條）、公平會比較廣告案件處理原則（2010-12-10 發布）
- 證券投資信託及顧問法（第 4、63、107 條）
- 人工智慧基本法（115-01-14 公布施行，國科會主管）：搜尋摘要來源含中央社 https://www.cna.com.tw/news/aipl/202512230036.aspx 、數位時代 https://www.bnext.com.tw/article/85606/ai-basic-law-taiwan ；原文請查全國法規資料庫或總統府公報
- 財政部電子發票證明聯一維及二維條碼規格說明 Ver 1.9（111-05-10）：https://www.einvoice.nat.gov.tw/ （原檔本次未能下載）

讀不到、需開網域：law.moj.gov.tw、president.gov.tw、law.nstc.gov.tw、einvoice.nat.gov.tw、fsc.gov.tw、security.apple.com、6laws.net。

備註：本檔沒有對應的「票 24」檔案（`.scratch/finance-product/issues/` 目前到 21），所以未在任何票的 `## Comments` 加摘要；開票後請補一行連結到本檔。
