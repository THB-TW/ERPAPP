# 研究 25b：讓手機上的 ChatGPT（dots）或 Muse 讀帳本、記帳、分析

查證日期：2026-11-26
角色：`chief-of-staff`（產品與架構可行性；不改程式）；法規面交 `tw-legal-tax-counsel`，審核結果在本檔第七節。
起因：翰陞 2026-11-25 回 Q4「想讓手機上 ChatGPT（dots）或 Muse 直接讀帳本、記帳、分析」；2026-11-26「重查 ChatGPT/Muse 這題，載具先不做」。前一次研究中途被中斷，本檔重做。
前提（已定案）：Q3「資料只存手機、不為 AI 自建伺服器」；dot＝OpenAI ChatGPT 的 dots（Q6）；電子發票載具先不做。
前置閱讀：[24 AI 自動記帳](24-ai-bookkeeping.md)、[24 法規審核](24-ai-legal-review.md)、[24 競品](24-competitive-edge.md)、`apps/mobile/package.json`。

**查證方式與限制**：本環境連不到 `help.openai.com`、`developers.openai.com`、`support.apple.com`、`openai.com`（DNS 失敗，未繞過），所以 OpenAI 與 Apple 支援頁只能從搜尋引擎摘要取得，標【摘要】。`apps.apple.com` 讀得到原文。
標記：【官方】直接讀到一手頁面；【摘要】搜尋結果中的官方頁摘要（未開原文）；【二手】第三方文章；【未驗證】沒有可靠來源；【需實測】文件沒答案，要在 iPhone 上試；【估算】本檔推算。

---

## 結論（先讀）

1. **不蓋伺服器，ChatGPT、dots、Muse 都不能「直接連進」Afterbills。** 三者讀外部資料的正式管道（ChatGPT 的 plugin／MCP、dots 的 plugin、Muse 的 custom connector）都要求一個雲端連得到的 HTTPS 伺服器【摘要／二手】；OpenAI 的 Secure MCP Tunnel 雖不需公開網址，仍要在一台常開的電腦上跑 client 程式【二手】。iPhone App 不能當這種伺服器。這條路和 Q3 直接衝突，**不建議做**。
2. **可以做，而且不用伺服器的是「由使用者經手」的四種接法**：
   - **(A) 捷徑＋ChatGPT 記帳／問帳**：Afterbills 提供「新增草稿」「取得本月摘要」兩個捷徑動作，搭配 ChatGPT App 自己的「Ask ChatGPT」捷徑動作【二手】。例：對 Siri 說「用 ChatGPT 記帳」→ 講「午餐牛肉麵 150、捷運 30」→ ChatGPT 拆成兩筆 → 進 Afterbills 草稿收件匣 → 使用者確認。**能讀、能寫（進草稿）**。
   - **(B) 分享「AI 用帳本摘要」**：Afterbills 產生一份文字摘要（本月收支、各分類預算剩餘、明細可選；預設不含備註、帳戶名稱、貸款明細、投資），用 iOS 分享選單丟給 ChatGPT（或之後的 Muse），在那邊問分析問題。**只能讀**。
   - **(C) 貼上匯入**：ChatGPT 依我們給的固定格式列出帳目 → 使用者複製 → 在 Afterbills「貼上帳目」→ 進草稿。**只能寫（進草稿）**。
   - **(D) 自動匯出到雲端硬碟資料夾給 dots 背景讀**：每次開 App／月結後，把摘要覆寫到使用者自選的 Google 雲端硬碟資料夾，dots 透過 ChatGPT 的 Google Drive plugin 讀【摘要】；dots 若把建議帳目寫成檔案放回同資料夾，Afterbills 下次開啟時讀進草稿。**能讀、半能寫**，但資料要上 Google 與 OpenAI。
3. **dots 那種「背景自動記帳」在 Q3 下大約只能做到 3～4 成【估算】**，而且那 3～4 成都要靠 (D) 把帳本摘要放上雲端硬碟。dots 在 OpenAI 雲端執行，碰不到手機；它最有用的是背景讀 Gmail 的刷卡通知、電子帳單，整理成建議帳目，但寫回帳本仍要使用者開 App 確認。刷卡當下即時記帳，用 24 號研究的「捷徑錢包交易自動化」比 dots 更好（全在手機上）。
4. **Muse 目前在台灣不能用。** Muse 是 Meta 的個人 AI 代理 App（Muse from Meta），台灣 App Store 沒有上架（`apps.apple.com/tw/...id6760173601` 回 404【官方】），台灣媒體也說要 VPN 才能註冊【二手】。它連外部服務一樣靠遠端 MCP 伺服器或 Meta 的連接器目錄【二手】，財務連接器走 Plaid（以美加銀行為主【未驗證台灣銀行】）。**建議現在不針對 Muse 做任何東西**；(B)、(C) 是通用的，Muse 上架台灣後若能收檔案或貼文字，就能直接用。
5. **建議先做 (A)＋(B)＋(C)，約 4～6 張票，其中 2 張和 24 號研究階段 1（App Intents、草稿收件匣）共用**；(D) 先不做。三種都不需要伺服器、App 本身不連網。法規審核（第七節）：隱私標籤【推論】可維持「未蒐集」，但 B 與捷徑讀摘要要照 5.1.2(i)「分享給第三方 AI」處理（首次說明、分享前預覽、捷徑讀摘要預設關閉）；對外只能寫「可分享給 ChatGPT 等 AI App」，不能寫「ChatGPT 整合」「支援 dots」，Muse 完全不提。

---

## 一、Muse 是什麼、在 iPhone 上怎麼接外部資料

| 項目 | 內容 | 來源 |
|---|---|---|
| 產品 | Meta 的個人 AI 代理 App「Muse from Meta」：「Muse is your personal AI agent that gets things done.」免費、有內購；需 iOS 18 以上；支援繁體中文介面 | 【官方】App Store 美國區頁面 |
| 模型 | Muse Spark（Meta Superintelligence Labs），也用在 Meta AI App | 【二手】 |
| 能連什麼 | 頁面寫「Link your email, calendar, Instagram, Facebook, health and fitness data, and finances.」；版本說明列出 Asana、Canva、Dropbox、Figma、QuickBooks、GitHub、Zoom、Notion、Apple Music 等連接器 | 【官方】App Store |
| 財務 | 內建 Finances 經 Plaid 連銀行；也可加自訂連接器 | 【二手】；Plaid 是否支援台灣銀行【未驗證，推測不支援】 |
| 自訂連接器 | 設定 → Connectors → Add custom connector，填遠端 MCP 伺服器網址、以 OAuth 登入；Meta 不審核自訂連接器 | 【二手】多篇開發者文章一致 |
| 動作確認 | 「Approve actions before they happen」 | 【官方】App Store |
| 隱私標籤 | 「Data Linked to You」含 Financial Info、Health & Fitness、Purchases、Location、Contacts、Search／Browsing History 等，部分也列在 Third-Party Advertising | 【官方】App Store（開發者自報） |
| 台灣 | 台灣 App Store 無此 App（404）；開放地區各來源說法不一（美加、或另加日本、新加坡、墨西哥、澳洲） | 【官方】404；【二手】地區清單 |
| 捷徑／App Intents | 沒有找到 Muse 提供捷徑動作、或能呼叫其他 App 捷徑的資料 | 【未驗證】 |

**對 Afterbills 的意義**：Muse 沒有「讀手機上其他 App 資料」的管道（Apple Health 是例外，iOS 有 HealthKit；記帳 App 沒有對應的系統資料庫）。要接只有遠端 MCP（違反 Q3）或使用者手動丟檔／貼文字。另外 Muse 自己的隱私標籤把財務資料列為「與你連結」且部分用於第三方廣告，若對外暗示「Afterbills 可接 Muse」，和我們「無廣告不追蹤」的定位反差很大，法規面另見第七節。

---

## 二、ChatGPT iOS App 與 dots 目前讀寫第三方資料的方式

| 管道 | 能讀／寫 | 需不需要伺服器 | 誰能用 | 來源 |
|---|---|---|---|---|
| **Plugins（舊稱 Apps／Connectors）** 官方目錄：Gmail、Google Drive、Dropbox 等 | 讀為主，部分可寫 | 由 OpenAI 與該服務對接，Afterbills 無法上架成目錄 plugin 而不蓋伺服器 | 依方案 | 【摘要】OpenAI help |
| **自訂 MCP 伺服器（Developer mode）** | 讀＋寫；寫入工具預設每次要使用者確認（沒標 `readOnlyHint` 的工具都算寫入） | **要**：必須是 ChatGPT 雲端連得到的遠端 HTTPS（Streamable HTTP／SSE），不支援本機 stdio | Pro、Plus、Business、Enterprise、Edu；**只能在網頁版設定**，手機 App 不能新增 | 【摘要】developers.openai.com developer-mode；help 文章與開發者文件對「哪些方案可寫入」說法不一 |
| **Secure MCP Tunnel** | 同上 | 不需公開網址，但要在公司網路內的主機跑 `openai/tunnel-client`（輸出連線、輪詢 OpenAI），所有請求與回應都經過 OpenAI | 二手資料說是企業／團隊方案【未驗證】 | 【二手】GitHub openai/tunnel-client 說明、第三方教學 |
| **dots 的資料來源** | dot 使用你在 ChatGPT 已設定的 plugins；可主動檢視並形成記憶；手機上可在 dot 個人頁「Customize → Plugins」連接 | 同 plugins | Pro、Business Premium、Enterprise、Edu、Healthcare；台灣不在排除名單但「逐步開放」 | 【摘要】help.openai.com「Getting started with your dot」；地區【二手】 |
| **雲端硬碟** | Google Drive plugin 可讀檔；**沒有 iCloud Drive plugin**（只能手動上傳）；個人帳號的 Google Drive「同步」已停止，改成工作區層級 | — | — | 【摘要】OpenAI help；iCloud【二手】 |
| **檔案上傳／分享選單** | 使用者從「檔案」App 或其他 App 的分享選單把檔案、文字丟進 ChatGPT | 不需要 | 所有方案（上傳額度依方案） | 【需實測】ChatGPT 分享選單是否接受 .md／.csv 檔與 dot 對話是否收附件 |
| **捷徑動作** | ChatGPT App 提供「Ask ChatGPT」「Start voice conversation」等捷徑動作，可接前一步的文字、回傳答案給下一步 | 不需要 | 【需實測】免費帳號能否用 | 【二手】2023 推出、2026 教學仍在 |
| **Apple Intelligence 的 ChatGPT 擴充** | Siri、書寫工具可轉交 ChatGPT；台灣繁中自 iOS 26.1 起支援 | 不需要 | 需 Apple Intelligence 機型 | 【官方】apple.com/tw newsroom 2025-11；細節（能否帶入其他 App 的捷徑結果、每次是否詢問）【未驗證】 |
| **iOS 27 Siri Extensions（第三方聊天機器人接 Siri）** | 傳聞中讓 ChatGPT、Gemini、Claude 接進 Siri | — | WWDC26 未發表，iOS 27 beta 有框架但後端關閉 | 【二手】MacRumors、TNW；**不可列入規劃** |

**重點**：ChatGPT 能「伸手」去讀的地方都在雲端（MCP 伺服器、Google Drive、Gmail）。手機本機資料只有在使用者主動交給它（分享、上傳、捷徑傳文字）時才看得到。dots 是背景雲端代理，**只看得到雲端的東西**，所以 dots 要讀帳本，帳本（或摘要）就一定得先放到雲端某處。

---

## 三、不自建伺服器的做法比較

「資料流向」只列離開手機的部分。票數是【估算】，以現有分工（一票一分支、帳本服務為唯一入口）計。

| 做法 | 能讀 | 能寫 | 使用者設定步驟 | 資料流向 | 票數 | 主要風險／未知 |
|---|---|---|---|---|---|---|
| **A 捷徑＋ChatGPT 記帳／問帳** | ✔ 由捷徑把「本月摘要」文字交給 ChatGPT | ✔ ChatGPT 把一句話轉成固定格式 → Afterbills「新增草稿」動作 → 草稿收件匣確認 | 點我們提供的 iCloud 捷徑連結「加入捷徑」一次；之後「嘿 Siri，用 ChatGPT 記帳」或動作按鈕 | 該次的口述句子或摘要文字 → OpenAI | 3～4（App Intents 原生模組、草稿收件匣 **與 24 共用 2 張**；捷徑範本＋教學頁 1；ChatGPT 輸出格式解析＋測試 1） | Expo 放 App Intents 的 metadata 抽取【需實測，24 已列】；ChatGPT 回傳格式偶爾不合規 → 一律進草稿、格式錯就整筆留給使用者改；繁中 Siri 片語觸發【需實測】 |
| **B 分享「AI 用帳本摘要」** | ✔ | ✘ | 設定 → AI 助理 → 「分享帳本摘要」→ 選 ChatGPT | 摘要檔 → OpenAI（使用者每次手動） | 1（帳本服務產摘要＋分享按鈕＋首次說明畫面；用現有 `expo-sharing`） | 摘要大小：一個月約 200～400 筆明細，文字約 1～2 萬字，ChatGPT 讀得下；預設**不含備註與投資**、可選含明細 |
| **C 貼上匯入** | ✘ | ✔ 進草稿 | 在 ChatGPT 對話開頭貼我們的「記帳格式說明」（App 內一鍵複製）；記完複製結果 → Afterbills「貼上帳目」 | 無（從 OpenAI 回到手機） | 1（重用 CSV 匯入解析器；分類不存在照既有規則報錯；不需新套件，用輸入框貼上） | 兩次切換 App，步驟多；適合一次補很多筆（例如旅行後） |
| **D 自動匯出到雲端硬碟給 dots** | ✔ dots 背景讀（新鮮度＝最後一次開 App） | △ dots 產生建議帳目檔放回資料夾 → 下次開 App 讀進草稿 | 裝 Google 雲端硬碟 App；Afterbills 選資料夾一次；ChatGPT 連 Google Drive plugin；給 dot 任務 | 摘要 → Google → OpenAI（**持續自動**） | 3（iOS 資料夾書籤原生模組；開 App／月結後覆寫；讀回檔案進草稿） | iOS 不保證背景執行，只能在開 App 時更新；個人 Google Drive 同步已停，dots 能否主動找到更新後的檔【需實測】；需 ChatGPT Pro（台灣 NT$3,300 起／期間未標）；**帳本持續放在兩家雲端，和定位最衝突** |
| （不建議）**E 自訂 MCP／Secure Tunnel** | ✔ | ✔ | — | 帳本 → 我們的伺服器或使用者電腦 → OpenAI | 6+ 並需維運 | 違反 Q3；iPhone 不能當伺服器；Tunnel 要電腦常開 |

**共通設計原則（不論選哪幾種）**
1. **AI 寫入一律進草稿收件匣**，使用者按「確認」才走帳本服務 `addTransaction`；不讓任何外部 AI 直接改帳本（月結數字不會因 AI 出錯而變動，所以不必加派 `legacy-migration`，除非草稿確認流程動到月結）。
2. **摘要只給「帳本服務算好的數字」**，不讓 ChatGPT 自己加總原始明細再當成正式數字；摘要開頭註明「數字以 Afterbills 為準」。
3. **摘要預設不含投資、備註、帳戶名稱、貸款明細**（備註與貸款常有人名；帳戶名稱常有銀行與卡號末四碼；投資依 24 法規審核不接 AI）。明細預設關閉，開啟時只有日期、金額、分類；分享前全文預覽（第七節 §6）。
4. **分享前第一次跳說明**：會送到哪家公司、送什麼、對方可能保存；可勾「不再提醒」。捷徑「取得本月摘要」動作另有**預設關閉**的開關（設定 → AI 助理），且只在裝置解鎖時可執行（第七節 §1）。
5. **錢包交易自動化只接「新增草稿」，不接 ChatGPT**：每筆刷卡都送 OpenAI 等於變相的 D（第七節 §7）。

---

## 四、dots 那種「背景自動記帳」在 Q3 下能做到幾成

把「像 dots 一樣」拆成五件事【估算】：

| dots 能力 | 在 Q3 下 | 怎麼做 | 成數 |
|---|---|---|---|
| 1. 背景定期看我的帳、主動提醒（例如「餐費快超支」） | 部分 | 本機通知已能做預算提醒（現有功能，不用 AI）；要 dots 來看只能靠 D | 6 成（但其實本機通知就夠） |
| 2. 背景讀 Gmail 刷卡通知／電子帳單 → 整理成帳目 | 部分 | dots 讀 Gmail 是它的強項；寫回只能經 D 的檔案或 C 的貼上，再由使用者確認 | 4 成 |
| 3. 刷卡當下自動記一筆 | 不靠 dots | 24 號研究的「捷徑錢包交易自動化 → 新增草稿」，全在手機 | dots 0 成；改用捷徑可達 7～8 成 |
| 4. 對話式分析（「這個月為什麼超支」） | 可以 | A 或 B，使用者手動交摘要 | 7 成（要手動一步） |
| 5. 不用確認直接改帳本 | 不做 | 原則上不讓外部 AI 直接寫帳 | 0 成（刻意） |

**整體：dots 的「背景、自動」那部分約 3～4 成；若接受「每次手動交一下」，ChatGPT 對話記帳與分析可到 7 成。** 差的那幾成就是「不開 App 也自動更新、自動寫入」，這正是 Q3 拿掉的東西。若之後真的想補，那時候要談的就是放寬 Q3，不是再加功能。

---

## 五、建議路線

**1.1 版（首版上架後）約 4～6 張票：**
1. 草稿收件匣（與 24 階段 1 同一張；若 24 先做就不重複）。
2. App Intents「新增草稿」「取得本月摘要」（與 24 階段 1 同一張，多一個唯讀動作；摘要動作預設關閉、需解鎖）。
3. 「AI 用帳本摘要」產生器＋分享按鈕＋首次說明畫面（做法 B）。
4. 「貼上帳目」匯入草稿＋一鍵複製記帳格式說明（做法 C）。
5. ChatGPT 捷徑範本（記帳、問本月）＋設定內教學頁（做法 A）；繁中 Siri 片語、ChatGPT 免費帳號可否用 Ask ChatGPT 在 iPhone 實測。
6. （選配）ChatGPT 輸出格式容錯測試集：固定 50 句台灣記帳句子 → 期望的草稿欄位，在 iPhone 實測時跑。

**先不做**：D（等翰陞本人用過 A／B／C，且確定要 dots 才評估，屆時預設關閉＋明確同意）、E（違反 Q3）、Muse 專屬功能（等台灣上架）。

**同步要改的文件**（隨功能同一版上）：隱私權政策新增「搭配其他 AI App 使用」一節、審查備註改「no server」句與新功能說明、使用條款加第 6、7 點、商店描述只用「可分享給 ChatGPT 等 AI App」並加無背書聲明，名稱／副標題／關鍵字／截圖不出現 ChatGPT、dots、Muse（建議文字都在第七節）。

**模組分工**：帳本服務摘要與草稿 → `ledger-entry`；分享、貼上匯入 → `import-export-backup`；App Intents 原生模組 → `ledger-entry`＋`chief-of-staff` 協調；首次說明文字、隱私權政策、審查備註、商店文字 → `tw-legal-tax-counsel`；AI 相關功能放免費或付費 → `marketing-pricing`。

---

## 六、需要翰陞決定的問題

**Q25b-1　先做哪幾種接法？**
建議：**A（捷徑＋ChatGPT 記帳／問帳）＋B（分享摘要）＋C（貼上匯入），放 1.1 版，約 4～6 張票。** 三種都不需要伺服器、App 本身不連網、AI 寫入都要你確認；dots 的背景整理先放棄。

**Q25b-2　要不要做「自動匯出到雲端硬碟給 dots 背景讀」（D）？**
建議：**先不做。** 它是唯一能讓 dots 在背景看帳的方法，但帳本摘要會持續放在 Google 和 OpenAI，等於放寬 Q3；而且要 ChatGPT Pro 才有 dots，一般使用者很少。等你自己用 A／B／C 一段時間、仍覺得需要 dots 再談；屆時預設關閉、只匯出摘要、明確同意。

**Q25b-3　Muse 怎麼處理？**
建議：**現在不為 Muse 做任何專屬功能，對外也不提 Muse。** 它在台灣還沒上架，連外部資料要遠端伺服器；B、C 是通用做法，Muse 上架台灣後若能收檔案或貼文字就能直接用。

---

## 七、法規審核（`tw-legal-tax-counsel`）

> 審核人：`tw-legal-tax-counsel`（AI agent，**不是執業律師或會計師**），2026-11-26。沿用 [24 法規審核](24-ai-legal-review.md) 已核實的部分（5.1.2(i) 原文、隱私標籤「蒐集」定義、Apple 商標用法、AI 不接投資），不重查。本次重讀 App Review Guidelines（Last Updated 2026-10-16）的 2.3.7、4.1、5.2.1、5.2.2。OpenAI／Meta 頁面本環境連不到，只能依搜尋摘要，標【摘要】。台灣法規條文標【†】＝依搜尋摘要，請到 law.moj.gov.tw 核對。上線前請律師確認。

**結論**
1. **A／B／C 法規上可做，隱私標籤【推論】可維持「未蒐集資料」**：資料由使用者自己操作才離開 App，經 iOS 交給使用者選的 App；開發者與其「third-party partners」（我們加進程式的外部程式碼）都拿不到。前提是 App 內**不放任何 OpenAI、Google 或 AI 的 SDK**，App 本身仍不連網。
2. **5.1.2(i) 對 B、A 的「讀摘要」【推論】要照「分享給第三方 AI」處理**：功能是我們為了給 AI 用而設計的，審查員很可能這樣看。做法：**首次說明＋使用者自己按下分享（逐次的明確動作）就夠，不必每次跳同意**；捷徑讀摘要另加一個預設關閉的開關。C（貼回來）不涉及 5.1.2(i)。
3. **D 是唯一「App 自動、持續把帳本送出手機」的做法**，【推論】5.1.2(i) 首句「transmit」直接適用；要做就得預設關閉＋明確同意，且只能經 iOS「檔案」寫入，不嵌 Google SDK，否則隱私標籤與「App 不連網」都不成立。同意研究「先不做」。
4. **對外可以寫「ChatGPT」，但只能描述使用者能做的事**（例如「可分享給 ChatGPT 等 AI App」），不放進名稱、副標題、關鍵字、圖示、截圖 logo，並加「與 OpenAI 無合作或背書關係」。**「支援 dots」「Muse」都不能寫**：前者是我們沒做的功能，後者在台灣店面沒上架。
5. **個資法【推論†】開發者在 A／B／C／D 都不是蒐集／處理者**（拿不到資料）；使用者把自己的帳交給 OpenAI，屬第 51 條第 1 項第 1 款「單純個人或家庭活動」。仍要在 App 與政策裡寫清楚資料去哪、對方可能保存與用於改進模型、在境外。

### 1. 5.1.2(i) 在 A／B／C／D 是否適用

5.1.2(i) 原文已在 24 核實【確定】：首句「you may not use, transmit, or share someone's personal data without first obtaining their permission」；第三句「clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so」。

| 做法 | 適用？ | 理由 | App 要做的事 |
|---|---|---|---|
| A「新增草稿」動作 | 【推論】不適用 | 資料是流進 App，不是流出 | 只進草稿、須確認；動作不得提供「略過確認」參數 |
| A「取得本月摘要」動作＋使用者自組捷徑 | 【推論】適用（保守） | 送給 ChatGPT 的是 ChatGPT App 的動作，但摘要是我們特地做給 AI 用的，教學頁與捷徑範本都指向 ChatGPT；而且任何捷徑（包括別人分享的捷徑）都能呼叫這個動作，把帳送到任何地方 | ①「設定 > AI 助理 > 允許捷徑取得帳本摘要」**預設關閉**，打開前顯示說明（等同首次同意）；②動作設成裝置解鎖才可執行；③不必每次詢問（iOS「捷徑」本身在跨 App 傳資料時是否會跳詢問【不確定，需實測】，不能拿它代替我們的說明） |
| B 分享摘要 | 【推論】適用 | 同上；使用者在分享選單選 App 已是逐次的明確動作 | **第一次分享前**顯示說明（可勾「不再提醒」）；每次分享前讓使用者看到完整摘要文字（滿足「access to information about how and where」）；按鈕不預選 ChatGPT |
| C 貼上匯入 | 【推論】不適用 | 資料從 ChatGPT 回到手機；一鍵複製的「記帳格式說明」若含使用者的分類／帳戶名稱，才有少量資料出去 | 格式說明預設只放格式與分類名稱，不放帳戶名稱；用貼上按鈕／輸入框讀剪貼簿，不在背景讀 |
| D 自動寫入雲端硬碟 | 【推論】首句「transmit」直接適用 | App 每次開啟就自動把帳送出手機（經雲端硬碟 App 上傳），不是使用者逐次操作 | 預設關閉；同意畫面點名 Google 與 OpenAI、寫明送什麼、多久一次、怎麼停；設定頁常駐狀態；關閉時詢問是否刪除雲端檔案；擴大摘要內容要重新同意（5.1.2(ii)） |

首次說明畫面建議文字（B；A 的開關說明同義改寫）：
> **把帳本摘要交給其他 App？**
> 你按「分享」後選的 App（例如 ChatGPT）會收到這份摘要。資料離開本 App 後，由該 App 的公司（例如 OpenAI）依它的條款處理，可能保存在對話紀錄、可能依你在該服務的設定用於改進模型，伺服器可能在國外。開發者收不到、也無法替你刪除。摘要預設不含備註、帳戶名稱、貸款明細與投資資料。
> 〔取消〕〔我了解，繼續分享〕　☐ 不再提醒

### 2. App Store 隱私標籤

- 【確定】Apple 定義：「蒐集」指資料傳出裝置，且讓開發者或其 third-party partners（「whose code you've added to your app」）能存取超過即時處理所需的時間（24 已核實原文）。
- **A／B／C：【推論】維持「未蒐集資料」。** 與現行「匯出備份檔經分享面板」同一性質；OpenAI 不是我們加入程式碼的廠商，取得資料是基於使用者自己與 OpenAI 的關係。
- **D：【推論】只要用 iOS「檔案」介面（使用者選資料夾、App 寫檔、由 Google 雲端硬碟 App 上傳）就仍可維持；若改用 Google Drive SDK／REST API，App 自己連網且 Google SDK 屬「third-party partner」，【推論】要改申報「財務資訊」等類別，「App 不連網」「無 SDK」的所有文字都要撤。** 送審時把判斷寫進審查備註，讓審查員有機會提出不同看法。
- `store-listing.md`「App 隱私」依據段補一句：「使用者自行用分享選單或捷徑把帳本摘要交給其他 App（例如 AI 助理）時，由該 App 依其政策處理，開發者與其夥伴無法存取」【推論】。

### 3. 隱私權政策、審查備註要改的句子

**隱私權政策**
- 第一節第一點：A／B／C 下「不會蒐集、接收、上傳或查看」仍成立，句末加：「你可以自行把帳本摘要分享給其他 App（例如 AI 助理），詳見第〇節。」（做 D 時「上傳」要改成「本 App 本身不會上傳」。）
- 第二節第 3 點「你自己匯出的檔案」：「匯出備份檔」「匯出 CSV」後加「、分享『AI 用帳本摘要』」。
- 新增一節（建議放第三節前）：
> **〇、搭配其他 AI App 使用（捷徑、分享、貼上）**
> 1. 本 App 本身不連網，不會把帳本資料傳給 OpenAI 或其他 AI 公司。只有在你自己操作時，資料才會交給你選擇的 App：（1）你按「分享帳本摘要」並在 iOS 分享選單選擇 App（例如 ChatGPT）；（2）你在「設定 > AI 助理」開啟「允許捷徑取得帳本摘要」後，你自己加入或建立的捷徑取得本月摘要，交給捷徑中的下一個動作（例如 ChatGPT App 的動作）。
> 2. 摘要內容：預設只有所選月份的收支合計與各分類的預算、已花、剩餘；你可以選擇加入明細（日期、金額、分類）。預設不含備註、帳戶名稱、貸款明細與投資資料。分享前可在畫面上看到完整內容。
> 3. 資料交給其他 App 後，由該 App 的提供者（例如 OpenAI）依其服務條款與隱私權政策處理，可能保存在對話紀錄中、可能依你在該服務的設定用於改進模型，伺服器可能位於中華民國境外。開發者收不到、看不到，也無法替你刪除；請到該服務的設定管理。
> 4. 你用捷徑新增的帳目或貼上的文字，只在 iPhone 上轉成草稿，須經你確認才會記入帳本。
> 5. 本 App 與 OpenAI 或其他 AI 服務提供者沒有合作或背書關係。

**審查備註（英文）**：把「The app has no server, does not upload data, and contains no analytics, advertising or crash-reporting SDK.」改成：
> The developer operates no server and never receives user data. The app makes no network requests of its own and contains no analytics, advertising, crash-reporting or AI SDK (no OpenAI SDK).

並加一段（2.3.1(a) 新功能要具體描述【確定】）：
> New in this version: (1) App Intents for Shortcuts and Siri. "Add draft transaction" saves a draft to an in-app inbox; nothing is recorded until the user confirms it. "Get monthly summary" returns a text summary of a month (totals and category budgets; no notes, account names, loan details or investment data). It is off until the user enables it in Settings > AI Assistant after reading an explanation, and it requires the device to be unlocked. (2) "Share ledger summary": the user previews the text and shares it through the iOS share sheet to an app of their choice. (3) "Paste entries": the user pastes text, for example produced by ChatGPT in our format, and the app parses it on the device into drafts for confirmation.
> The app does not include, call or automate ChatGPT. Users who want to use ChatGPT install the ChatGPT app themselves and may add our sample shortcut, which uses the ChatGPT app's own action. We treat sending the summary to another app, including a third-party AI, as sharing under Guideline 5.1.2(i): before the first share, and before enabling the summary action, the app explains what is sent and that the receiving provider handles it under its own terms. Because data leaves the app only when the user sends it to an app they choose, and neither the developer nor its partners can access it, our App Privacy answer remains "Data Not Collected"; please let us know if App Review sees it differently. AI-generated text never changes the ledger without the user's confirmation, and investment data is never included. The app is not affiliated with or endorsed by OpenAI. A demo video is attached because the ChatGPT part requires the reviewer's own ChatGPT account.

送審前對照清單加：「`package.json`／原生模組沒有 OpenAI、Google、AI SDK」「捷徑範本只用 ChatGPT App 的公開動作」。

### 4. 對外文案：ChatGPT／dots／Muse

依據：5.2.1 不得未經許可使用第三方商標【確定】；4.1(c) 不得在 App 名稱或圖示使用其他開發者的品牌或產品名【確定】；2.3.7 副標題不得「reference other apps」、不得用商標詞堆關鍵字【確定】；OpenAI 品牌指引：不得用其 logo、不得暗示背書或扭曲與 OpenAI 的關係、不得讓 OpenAI 標記比自家名稱醒目、App 名稱不得含 GPT／模型名【摘要，openai.com/brand 讀不到原文】；2023 年 plugin 時期指引曾建議避免「compatible with」「integrated with」【二手，現行是否仍有【不確定】】；Meta 商標須經許可使用【摘要】。

| 位置 | 可以 | 不可以 |
|---|---|---|
| 名稱、副標題、關鍵字、圖示 | — | 任何「ChatGPT」「GPT」「OpenAI」「dots」「Muse」「Meta」字樣 |
| 描述（一段、不放第一行） | 「可把帳本摘要分享給 ChatGPT 等 AI App，或把 AI 整理好的帳目貼回來，先進草稿、你確認後才記帳。需自行安裝並登入該 App。ChatGPT 是 OpenAI 的商標；本 App 與 OpenAI 無合作或背書關係。」 | 「ChatGPT 記帳」「ChatGPT 整合」「官方」「與 OpenAI 合作」「支援 dots」「AI 自動記帳」「全自動」 |
| 截圖、預覽影片 | 只出現 Afterbills 自己的畫面與文字 | ChatGPT／OpenAI logo、ChatGPT App 畫面（含他人商標與介面） |
| App 內教學頁 | 用名稱指涉：「在 ChatGPT App 中…」「ChatGPT 的『Ask ChatGPT』動作」 | 使用 logo；把 ChatGPT 字樣做得比 Afterbills 醒目 |
| Muse、dots | 不寫（理由見第 7 點） | 任何對外文案 |

【推論】「搭配 ChatGPT」可用在描述內文，但「可分享給 ChatGPT 等 AI App」更準確（我們不接 ChatGPT，只交給使用者選的 App），且避開「整合」暗示，建議用後者。

### 5. 個資法

- 帳本屬第 2 條「財務情況」等個人資料【確定†】；非第 6 條特種個資【確定†】。
- **A／B／C**：【推論†】開發者不取得、不控制資料，不是蒐集／處理者；把自己的帳交給 OpenAI 的是使用者，屬第 51 條第 1 項第 1 款「自然人為單純個人或家庭活動之目的」（國發會函釋說明立法理由，條文本身不在 2025-11-11 修正之列）【確定†】。OpenAI 是使用者的契約相對人，不是我們的受託者（第 4 條不適用）【推論】。備註裡第三人的姓名由使用者自行分享，同受第 51 條處理；預設排除備註可再降低風險。
- **D**：【推論†】仍不是開發者蒐集——開發者拿不到，寫入的是使用者自己的雲端帳號、依使用者指定、資料夾由使用者選。但 App 是「自動、持續」送出，消費者資訊揭露與 5.1.2(i) 要求更高，同意畫面要比照第 8 條告知要素（類別、對象 Google／OpenAI、地區境外、方式、如何停止）。【不確定】主管機關沒有「單機 App 開發者」角色的函釋。
- 所有路線：開發者不得從 App 取得任何摘要、捷徑紀錄或對話；客服信不要請使用者附摘要。

### 6. 摘要預設與 AI 草稿責任

- **預設內容**：「不含備註、不含投資」方向正確，【推論】再加：①**不含帳戶名稱**（常含銀行名、卡名、末四碼），以「現金／信用卡／銀行」代替；②**不含貸款明細**（貸款人、借款對象常是人名），只給月繳合計；③明細預設關閉，開啟時只有日期、金額、分類；④只限所選月份；⑤分享前全文預覽。摘要開頭固定寫：「數字由 Afterbills 計算，以 App 畫面為準；本摘要不含投資資料。請不要提供投資、稅務建議。」
- **捷徑範本與格式說明的提示詞**：只寫記帳拆欄位與預算分析，不得請 ChatGPT 推薦理財產品、買賣、節稅方案（沿用 24：AI 不接投資）。
- **草稿**：來源標「來自捷徑」「來自貼上」；金額、日期、分類、帳戶四欄確認；格式錯整筆留給使用者改；同一段文字重貼要提示可能重複；「全部確認」可以有，但要先顯示清單，不得提供「自動確認」設定。
- **使用條款**：24 §7 建議的「自動分類與 AI 功能」條再加兩點：
> 6. 你可以自行把帳本摘要分享給第三方 App（例如 ChatGPT），或把第三方 AI 產生的文字貼回本 App。第三方 App 與 AI 服務由其提供者依其條款提供，開發者與其無合作關係，不對其內容、可用性或其如何處理你分享的資料負責。
> 7. 由第三方 AI 產生並貼回的帳目，與本 App 自己產生的草稿一樣，須經你確認才會記入帳本；確認後的帳目以你確認的內容為準。
- 消保法第 12 條、民法第 247-1 條：上述免責不得及於本 App 自己的解析錯誤（例如把 150 解析成 1500）【確定†／推論】；真正的防線仍是「進草稿、全欄確認」。

### 7. 其他要注意

1. **OpenAI 服務條款**：禁止「automatically or programmatically extract data or Output」【摘要，openai.com/terms 讀不到原文】。我們只用 ChatGPT App 自己提供的捷徑動作、由使用者觸發，【推論】不屬禁止的程式化擷取；**不得**用未公開的 URL scheme、網頁自動化或非官方 API 去操作 ChatGPT。也因此 5.2.2（使用第三方服務須經其條款許可）【確定】對本 App 【推論】不構成障礙——App 本身不存取 ChatGPT。
2. **不要宣傳「刷卡自動送 ChatGPT」**：錢包交易自動化接 ChatGPT 技術上可行，但每筆消費都送 OpenAI，等於變相的 D；教學頁只教「錢包自動化 → 新增草稿」（全在手機上），ChatGPT 範本只做手動觸發。
3. **Muse**：台灣 App Store 無此 App（研究已查 404）。在台灣店面或 App 內提及，會讓消費者以為可用（消保法第 22 條、公平交易法第 21 條【確定†】；2.3.1(a)）；Meta 商標使用須經許可【摘要】；Muse 的標籤把財務資料列入第三方廣告用途，推薦它與「無廣告不追蹤」定位衝突。**完全不提**；B、C 的文案用「其他 AI App」即可涵蓋。
4. **dots**：限 ChatGPT Pro 等方案、逐步開放【摘要】，而且沒有 D 就讀不到帳本。寫「支援 dots」屬宣傳未提供的功能（2.3.1(a)【確定】）。
5. **付費面**：A／B／C 若放進付費版，要寫明「需另外安裝並登入 ChatGPT（或其他 AI App），其方案與費用由該服務決定」（3.1.2(c)【確定】）；不要以 ChatGPT 功能當付費主賣點，ChatGPT 改動作或停服時付費者權益有爭議【推論】。
6. **年齡分級**：App 本身不含聊天機器人，【推論】維持 4+；OpenAI 自訂使用年齡限制，教學頁可加「ChatGPT 的使用年齡依 OpenAI 規定」。
7. **檔案殘留**：B 優先分享純文字；若分享檔案，用暫存檔並在分享後刪除，不放「檔案」App 可見處。

**對 Q25b-1～3 的法規意見**
- **Q25b-1**：A＋B＋C 法規上可做，隱私標籤可維持「未蒐集」【推論】；條件是不嵌 AI／Google SDK、B 首次說明＋分享前預覽、捷徑讀摘要預設關閉、摘要預設不含備註／帳戶名稱／投資／貸款明細，並同步改隱私權政策、審查備註、使用條款（第 3、6 點）。
- **Q25b-2**：同意先不做 D；若日後要做，必須預設關閉＋點名 Google 與 OpenAI 的明確同意、只走 iOS「檔案」不嵌 Google SDK，並把所有「資料只存在手機」的對外文字改寫。
- **Q25b-3**：同意不做也不提 Muse；台灣未上架時提及有誤導與 Meta 商標風險，上架台灣後再審。

來源：App Review Guidelines（2026-10-16）2.3.1(a)、2.3.7、3.1.2(c)、4.1(c)、5.1.2(i)(ii)、5.2.1、5.2.2 https://developer.apple.com/app-store/review/guidelines/ ；App Privacy Details（24 已核實）；OpenAI 品牌指引 https://openai.com/brand/ 與使用條款 https://openai.com/policies/row-terms-of-use/ 【摘要】；Meta 商標 https://about.meta.com/brand/resources/meta/our-trademarks 【摘要】；個資法第 2、4、6、8、51 條 https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021 【†】、國發會第 51 條函釋 https://laws.gov.taipei/Law/Interpretation/Content/FE367127 【摘要】。需律師確認：使用者自組捷徑時開發者是否仍負 5.1.2(i) 揭露義務、D 的開發者角色、第三方 AI 免責條款的效力。

---

## 附錄 A：來源

- Muse from Meta App Store（美國區，已讀原文）：https://apps.apple.com/us/app/muse-from-meta/id6760173601 ；台灣區 https://apps.apple.com/tw/app/muse-from-meta/id6760173601 回 404。
- Muse 連接器與自訂 MCP（二手）：https://technspire.com/en/blog/muse-connectors-decoded-meta-directory-vs-open-mcp 、https://cellcog.ai/blog/muse-connector-platform/ 、https://builtwithmuse.com/blog/muse-plaid-connector 、https://www.datacamp.com/blog/muse-agent
- Muse 台灣狀況（二手）：https://mrmad.com.tw/muse-launches-taiwan-vpn-access 、https://www.inside.com.tw/article/42443-meta-muse-app-store-number-one-us-2026 、https://udn.com/news/story/7240/9431074
- dots 入門（摘要）：https://help.openai.com/en/articles/20001530-getting-started-with-your-dot
- dots 方案與台灣（二手）：https://www.ssdnodes.com/learn/lang/zh-hant/chatgpt-dots-what-they-do-and-who-gets-them 、https://www.bernama.com/en//world/news.php?id=2613531
- dots 用 plugin／MCP（二手）：https://docs.zapier.com/mcp/get-started/connect/openai-dots 、https://zerosettle.io/blog/chatgpt-dots-zerosettle-plugin/
- 自訂 MCP、Developer mode（摘要）：https://help.openai.com/en/articles/12584461 、https://developers.openai.com/api/docs/guides/developer-mode 、https://developers.openai.com/apps-sdk/deploy
- Secure MCP Tunnel（摘要／二手）：https://developers.openai.com/api/docs/guides/secure-mcp-tunnels 、https://github.com/openai/tunnel-client
- Google Drive plugin（摘要）：https://help.openai.com/en/articles/10948259-google-drive-app-with-sync-self-service-setup ；iCloud Drive（二手）：https://thedrive.ai/blog/can-ai-access-icloud-drive
- ChatGPT 捷徑動作（二手）：https://news.ycombinator.com/item?id=37671821 、https://www.izoate.com/blog/how-to-use-chatgpt-with-apple-shortcuts-on-iphone-in-2026-10-useful-shortcuts/
- Apple Intelligence 繁中（官方 newsroom）：https://www.apple.com/tw/newsroom/2025/11/apple-intelligence-features-are-now-available-in-traditional-chinese
- iOS 27 Siri Extensions 未發表（二手）：https://www.macrumors.com/2026/03/26/apple-ios-27-siri-chatbot-integration/ 、https://thenextweb.com/news/apple-siri-extensions-third-party-ai-missing-wwdc

## 附錄 B：需實測／未驗證

1. ChatGPT 分享選單收 .md／.csv 檔；dot 對話能否收附件。
2. ChatGPT「Ask ChatGPT」捷徑動作：免費帳號能否用、能否接前一步文字並回傳純文字給下一步。
3. 繁中 Siri 片語觸發 Afterbills 捷徑。
4. Apple Intelligence 的 ChatGPT 擴充能否接收捷徑傳入的 App 資料、每次是否詢問。
5. （僅 D）dots 能否找到並讀取 Google 雲端硬碟中被覆寫的檔案；個人帳號在 Drive 同步停止後的行為。
6. Muse 在台灣的上架時程；Plaid 是否支援台灣銀行。
7. 讀不到原文的主機：help.openai.com、developers.openai.com、support.apple.com、openai.com。要補查需在 session 網路設定允許。
