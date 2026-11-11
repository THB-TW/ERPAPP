# 研究：App Store 訂閱與上架規則（台灣開發者、iOS＋網頁同一訂閱的財務 App）

- 對應票：`issues/01-apple-subscription-rules.md`
- 查證日期：2026-11-08
- 來源限制：只用 developer.apple.com 的官方頁面（審查指南、帳務／稅務說明、支援頁）。App Review Guidelines 頁尾標示 Last Updated: October 16, 2026（https://developer.apple.com/app-store/review/guidelines/）。
- 標記：【確定】＝Apple 頁面明文；【推論】＝由明文推得；【不確定】＝頁面未載或頁面間矛盾，需向 Apple 或專業人士確認。
- 查證方式限制：頁面由工具轉成文字後摘要，引文以頁面原文為準；Apple 頁面會更新，實作前再看一次。

## 結論

1. **數位訂閱必須走 In-App Purchase（IAP）。**【確定】審查指南 3.1.1：要解鎖 App 內功能（含訂閱），必須用 IAP。
2. **網頁版另外用 Stripe 收費、讓 iOS 登入沿用：只能在「iOS App 內也同樣提供 IAP」的前提下成立，而且 App 內不能引導去外部付款。**
   - 3.1.3(b) Multiplatform Services 允許「在其他平台或網站取得的內容、訂閱、功能」在 App 內存取，條件是「這些項目在 App 內也以 IAP 提供」。【確定】
   - 台灣沒有任何可用的外部購買連結權限：3.1.1(a) 明載，只有特定區域的 entitlement 可放連結，其餘店面（美國除外）App 及其 metadata 不得有按鈕、外部連結或其他行動呼籲導向 IAP 以外的購買方式。我在 Apple 官方頁面只找到歐盟、荷蘭（交友 App）、南韓、日本相關權限，沒有看到台灣。【確定：規則；不確定：「台灣不在任何名單」是未見到而非明文，見下文】
   - Reader app（External Link Account Entitlement）不適用：主要功能必須是雜誌、報紙、書、音訊、音樂、影片，且不可同時在 iOS 提供 IAP。財務 App 不符。【確定】
   - 3.1.3(f) 免費獨立 App 例外只列 VoIP、雲端儲存、電子郵件、網站代管，不含財務。【確定】
   - 實務含意【推論】：若網頁版同價另收費，iOS 要同時賣 IAP（Apple 抽成）；iOS 內不能寫「去網頁訂比較便宜」；可讓在網頁訂閱者登入後使用（但 3.1.2(a) 要求訂閱可跨裝置使用）。App 外（Email、網站）的溝通 3.1.3 導言說開發者可以做。
3. **帳號刪除：只要 App 支援建立帳號，就必須在 App 內提供刪除帳號。**【確定】5.1.1(v)＋Apple 帳號刪除說明頁。需刪整個帳號紀錄而非僅停用；訂閱要提醒使用者先於 Apple 取消（可連到 `showManageSubscriptions` 或 https://apps.apple.com/account/subscriptions/）；網頁導向刪除須給直接連結；用 Sign in with Apple 要撤銷 token。
4. **Sign in with Apple（4.8）：** 只要主帳號用第三方／社群登入（Google、Facebook 等），就必須同時提供「限制資料只收姓名與 email、可隱藏 email、不為廣告收集互動」的等價登入選項（實務上即 Sign in with Apple）。若只用自家帳號系統（email＋密碼）則不需要。【確定】
5. **財務類 App 審查重點：**
   - 5.1.1(ix)：銀行與金融服務等高度管制領域的 App「應由提供該服務的法律實體」提交，而非個人開發者。【確定】
   - 3.2.1(viii)：用於金融交易、投資或理財管理的 App 應由提供該服務的金融機構提交，並在上架地區具備必要執照與許可。【確定】
   - **含意【推論，風險高】：** 本產品是「記帳／預算／投資組合紀錄」，不代客交易、不放款、不經手資金，字面上較接近工具而非金融服務，但「money management」字樣可能被審查員適用。建議以公司（組織）身分上架、App 描述明確寫「僅記錄與計算，不提供投資建議、不執行交易、不經手資金」，並準備審查備註。是否被要求金融機構身分【不確定】，只能送審後得知。
   - 3.1.5 加密貨幣：本產品只是記錄虛擬貨幣桶，不做錢包／交易所，字面不適用；若日後做交易或錢包功能會觸發 3.1.5(i)(iii)（錢包須組織身分、交易所須有牌照）。【推論】
   - 1.6 資料安全、5.1.1(i) 隱私政策、第 5 章導言「須遵守所有上架地區法律」。【確定】
6. **隱私標籤：** 送審新 App 與更新都必須在 App Store Connect 填隱私資訊，含整合的第三方 SDK 的蒐集行為；答案可隨時更新，不需新版本；隱私政策 URL 必填。財務資料類型分 Payment Info、Credit Info、Other Financial Info（薪資、收入、資產、負債等）。【確定】本產品把收支、資產上傳雲端，屬「Other Financial Info」，且與使用者綁定，需照實申報。【推論】
7. **Small Business Program：** 前一曆年與當年至今 proceeds 皆 ≤ 100 萬美元，可申請，傭金 15%。【確定】訂閱細節有矛盾：訂閱頁寫加入計畫者「無論是否滿一年」皆拿 85%；計畫頁另有一句「訂閱滿一年後 Apple 提供進一步降低的 10%」，但該句文字可讀成僅適用歐盟替代條款。**滿一年後是 15% 還是 10%：【不確定】**，以 Paid Apps Agreement（Schedule 2）與 App Store Connect 實際帳單為準。未加入時：第一年 30%、滿一年 15%。【確定】（**2026-11-10 更正**：台灣店面自 2026-10-31 起標準抽成為 26%，見 https://developer.apple.com/news/?id=w9mxlhek ；Small Business Program 在台灣的費率公告未提。）
8. **台灣稅務／收款：**
   - Apple 依 Paid Apps Agreement Schedule 2 在台灣代收並代繳稅。【確定】
   - 在台灣報稅或持有台灣統編／身分證字號者，需在 App Store Connect 填台灣 TIN；填與不填，被扣的稅額不同；所有開發者仍須填美國稅表。【確定】
   - 提交後無法自行修改，要聯絡 Apple。【確定】
   - 賣家身分：個人＝App Store 顯示本人法定姓名，無需 D-U-N-S；組織＝顯示公司名稱，須為能與 Apple 簽約的法人（不收 DBA、商號、分公司）、須 D-U-N-S、公司網域信箱與公開網站。【確定】
   - 台灣個人與公司的所得稅／營業稅實際處理（開發票、扣繳率、是否需設立公司）：Apple 頁面未載，【不確定，需會計師／國稅局確認】；非 Apple 官方資料，本文不下結論。
   - 台灣是否可作為開發者註冊／收款地區：我取得的 Apple 頁面（會員比較、註冊頁）未列支援國家清單，【未能由官方頁面確認，註冊流程中可見】。
   - 年費 99 美元／年，註冊時以當地貨幣顯示。【確定】
9. **TestFlight：** 內部測試最多 100 人（須為 App Store Connect 使用者，無需審查）；外部測試最多 10,000 人；第一個外部建置送 Beta App Review（後續建置可能不需完整審查）；建置有效 90 天；24 小時內最多送 6 個建置；公開連結可設人數上限 1–10,000。【確定】需登入的 App 應在測試資訊提供審查用帳號，該頁面未明說，【不確定】，實務上準備即可。

## 細節與出處

### A. 數位訂閱與 IAP

- 3.1.1：「If you want to unlock features or functionality within your app, (by way of example: subscriptions, ...), you must use in-app purchase.」https://developer.apple.com/app-store/review/guidelines/
- 3.1.2(a)：訂閱須提供持續價值、期間至少 7 天、可在使用者所有裝置使用；SaaS 與雲端支援屬適當用途；使用者不應被要求做額外任務才能得到已付費內容。同一頁。
- 3.1.2(c)：訂閱前須清楚說明價格與內容，並遵守 Schedule 2 的要求。同一頁。
- 訂閱頁：可用 App Store Server API「Get All Subscription Statuses」與 App Store Server Notifications 在自家後端確認訂閱狀態（網頁版以此判斷 iOS 訂閱者權限）。https://developer.apple.com/app-store/subscriptions/ 【確定：API 存在；「用它做跨平台授權」為推論】

### B. 網頁另收費與外部購買

- 3.1.3(b) Multiplatform Services 全文：「Apps that operate across multiple platforms may allow users to access content, subscriptions, or features they have acquired in your app on other platforms or your web site, ... provided those items are also available as in-app purchases within the app.」https://developer.apple.com/app-store/review/guidelines/
- 3.1.3 導言：此節 App 不得在 App 內鼓勵使用者用 IAP 以外的購買方式（美國店面及 3.1.1(a)、3.1.3(a) 例外）；開發者可在 App 外對使用者群溝通其他購買方式。同一頁。
- 3.1.1(a)：外部購買連結 entitlement 僅限特定區域、特定平台；其他店面（美國除外）不得有導向 IAP 以外購買方式的按鈕、外部連結或行動呼籲，App 及其 metadata 皆然。同一頁。
- Apple 官方頁面中明確出現的區域權限：
  - 歐盟：https://developer.apple.com/support/communication-and-promotion-of-offers-on-the-app-store-in-the-eu/
  - 荷蘭（僅交友 App）：https://developer.apple.com/support/storekit-external-entitlement/
  - 南韓（僅限只在南韓上架的 App）：https://developer.apple.com/support/storekit-external-entitlement-kr/
  - 美國：審查指南明載無須 entitlement 即可放連結（3.1.1(a)）。
  - 日本、巴西：我只從搜尋結果看到開發者論壇討論，沒有取得 Apple 官方頁面全文，不採信。
  - **台灣：我檢視的上述頁面與搜尋結果均未見台灣名單，故判斷「台灣店面目前沒有外部購買連結權限」。**【不確定：此為未見到，並非 Apple 明文排除；Apple 的 StoreKit 文件頁 https://developer.apple.com/documentation/storekit/externalpurchase 無法由工具取得內文，送審前請在 Apple 文件確認 `com.apple.developer.storekit.custom-purchase-link.allowed-regions` 可填的區域。】
- Reader app 條件：https://developer.apple.com/support/reader-apps/ （主要功能須為雜誌／報紙／書／音訊／音樂／影片；須能登入存取站外已購買內容；使用該 entitlement 時不得在 iOS 提供 IAP。頁面稱可用於任何有 App Store 的國家或地區，但財務 App 不符資格。）

### C. 帳號與登入

- 5.1.1(v)：若 App 支援建立帳號，必須同時在 App 內提供刪除帳號。https://developer.apple.com/app-store/review/guidelines/
- 帳號刪除說明（要點）：https://developer.apple.com/support/offering-account-deletion-in-your-app/
  - 不可僅停用；須提供刪除整個帳號與相關個資的選項（法律要求保留者除外，且須告知保留內容）。
  - 允許確認步驟（例如寄送驗證碼），但不得刻意刁難。
  - 不屬高度管制行業的 App 不得要求以電話、Email、聊天等客服流程才能刪除。若屬 5.1.1(ix) 高度管制行業，可用額外客服流程確認。（本產品是否算高度管制：見上方結論 5，【不確定】；建議一律做 App 內完整自助刪除。）
  - 網頁註冊也不免除 App 內刪除義務。
  - 自動訂閱：須提醒使用者帳務仍由 Apple 處理，應先取消；可排程在訂閱到期日刪除，但須另提供立即刪除。
  - 刪除義務適用所有使用者，不限於有 GDPR／CCPA 的地區。
- 4.8 Login Services（引文見結論 4）。https://developer.apple.com/app-store/review/guidelines/ 例外含：只用自家帳號系統。
- 使用 Sign in with Apple 者，刪除帳號時需撤銷 token（帳號刪除說明頁）。

### D. 隱私標籤與隱私政策

- https://developer.apple.com/app-store/app-privacy-details/ ：新 App 與更新送審前必填；含第三方夥伴（分析工具、廣告、SDK）蒐集的資料；可隨時更新；Privacy Policy URL 必填；Financial Info 分 Payment Info／Credit Info／Other Financial Info 三類。若付款資訊完全由外部付款服務收集且你無法取得，則該項不算你蒐集。
- 5.1.1(i)：隱私政策須在 App Store Connect 與 App 內易取得處提供，並說明蒐集內容、第三方保護、保存／刪除政策與撤回同意方式。https://developer.apple.com/app-store/review/guidelines/

### E. 抽成

- 訂閱頁：首年 70%（抽 30%）、滿一年 85%（抽 15%）；Small Business Program 成員從第一個計費週期起拿 85%。https://developer.apple.com/app-store/subscriptions/
- Small Business Program：https://developer.apple.com/app-store/small-business-program/ ：上一曆年與當年至今 proceeds ≤ 100 萬美元；加入條件為 Account Holder、接受最新 Paid Apps 協議（Schedule 2）、申報關聯開發者帳號（持股超過 50% 或有最終決策權者）；超過門檻後標準傭金適用於之後的銷售；若之後降到門檻下可於次年重新適用。核准後調整自該財政月結束後第 15 天起生效。非美元銀行帳戶以每財政月月底公開匯率換算。
- 「滿一年後 10%」的矛盾見結論 7。

### F. 稅務與賣家身分

- 台灣稅務說明（台灣 TIN、Apple 代收代繳）：https://developer.apple.com/help/app-store-connect/manage-tax-information/provide-tax-information/
- 賣家名稱與註冊差異：https://developer.apple.com/programs/enroll/
- 該頁指出，個人以法定姓名簽約並顯示為賣家，不需 D-U-N-S；組織須為法人並有 D-U-N-S；年費 99 美元。
- 「Business Unified Number／Personal ID Number」只出現在外部購買與替代發行的 B2B 稅務資訊頁，且該頁標註與歐盟 Alternative Terms 有關、自 2026-10-01 起對最新 DPLA 簽署者不適用，與一般 IAP 無關：https://developer.apple.com/help/app-store-connect/manage-tax-information/provide-tax-information-for-business-to-business-status/ 【確定：頁面內容；不要把它當成一般 IAP 的要求】

### G. TestFlight

- https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview ：內部最多 100 人；外部最多 10,000 人；第一個建置需 Beta App Review；建置可測試 90 天。
- https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers ：公開連結人數上限 1–10,000；每個送外部群組的建置提交 TestFlight App Review，同一版本第一個建置完整審查，之後可能不用；24 小時內最多 6 個建置；同一版本同時只能有一個建置在審；須提供測試資訊（回饋 Email、聯絡資料）。

## 未解問題（交給後續票）

1. 台灣店面外部購買連結權限是否存在（Apple 文件頁無法取得內文；需在 developer.apple.com 文件或向 Apple Developer Support 確認）。
2. Small Business Program 下訂閱滿一年是 15% 還是 10%。
3. 本產品是否被審查認定為 5.1.1(ix)／3.2.1(viii) 範疇，及是否需公司身分（建議公司身分並在審查備註說明）。
4. 台灣個人或公司的營業稅、所得稅、發票處理：非 Apple 範圍，需會計師。
5. 台灣可否作為開發者註冊與收款地區的官方清單（本次未由官方頁面取得）。
6. 網頁版另收費的產品決策：需決定「iOS 一律賣 IAP、網頁賣 Stripe、價差如何處理」；App 內不得提示網頁較便宜。
