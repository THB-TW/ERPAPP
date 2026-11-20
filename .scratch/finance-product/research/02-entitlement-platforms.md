# 研究 02：訂閱權益驗證與網頁收款方案成本比較

查證日期：2026-11-08
假設匯率：1 USD = NT$32（假設值，未查證，僅供量級估算）
查證方式：github.com / developer.apple.com 用 WebFetch；其餘官網用 curl（預設 User-Agent，未偽裝、未繞過任何機器人檢查）抓取後抽文字。標 [已查證] 為當日讀到的一手頁面；標 [未查證] 為仍無一手來源。

> 剩餘查證缺口只有：藍新（www.newebpay.com 回 `Access Denied`，為 Akamai 擋下，未繞過）、電子發票法定義務、Apple Server API 端點細節（JS 渲染）、各 SDK 對 Expo SDK 58 的實測相容性。其餘已一手核對，詳見下方。

## 結論

**建議：iOS 以 RevenueCat（react-native-purchases）驗證權益；網頁收款暫不做。** 理由：
1. **Stripe 目前不能在台灣開商家帳號**：Stripe 官方支援國家清單（https://stripe.com/global ）逐一列出 Australia 到 United States 共約 50 個國家／地區，**沒有 Taiwan**。RevenueCat 的網頁收款（RevenueCat Billing）以 Stripe 為 payment gateway、須連接 Stripe 帳號（https://www.revenuecat.com/docs/web/overview.md ），所以台灣個人開發者無法直接使用；Paddle Billing（Paddle 為 merchant of record）是 RevenueCat 列出的另一引擎，本輪未查 Paddle 的台灣資格，[未查證]。
2. RevenueCat 免費額度 MTR US$2,500（約 NT$80,000）/月，超過後整筆 1%，一人專案初期可零平台費 [已查證]。Adapty 為 US$5,000（約 NT$160,000）/月 [已查證]，兩者皆可。
3. 技術面可行：`react-native-purchases` 11.0.1 需 RN >= 0.80，Expo SDK 58（expo 58.0.19，RN 0.88.1）在範圍內；需 development build [已查證]。
4. 自建 StoreKit 2 + Cloudflare Workers：Apple 官方 Node 函式庫依賴 `jsonwebtoken`、`jsrsasign`、`node-fetch`，Workers 相容性未驗證，工作量與風險高。
5. 台灣店面的 App 不可放導向外部付款的連結（審核指南 3.1.1(a)，見下），網頁收款即使做了也只能是獨立管道。若要做，台灣在地金流（綠界／TapPay）可行但須自建訂閱狀態、發票。

### 比較表

| 方案 | 費率 | 免費門檻 | 工作量 | 風險 |
|---|---|---|---|---|
| A. 自建 StoreKit 2 + Server API／Notifications V2（Workers） | 平台費 0；Apple 抽成小型企業方案 15% | 無平台費 | 高：JWS 驗證、續訂／退款／寬限狀態機、重送 | 官方函式庫依賴 Node 套件，Workers 未驗證；漏事件即權益錯誤 |
| B. RevenueCat＋iOS 內購 | 超過門檻後整筆 MTR 的 1%（MTR 為扣 Apple 抽成與稅前金額） | MTR US$2,500 ≈ NT$80,000/月 | 低：SDK＋webhook 同步 Workers | 供應商依賴；定價可能調整 |
| C. RevenueCat Billing（Stripe 為閘道）網頁收款 | RevenueCat 費同 B；另付 Stripe 費（Stripe 費率頁本輪未讀，[未查證]） | 同 B | 低～中 | **台灣不在 Stripe 支援國，無法開戶（已查證）**；台灣店面 App 內不得導流 |
| D. Adapty | MTR 超過 US$5,000 後 1%（扣平台抽成前金額） | US$5,000 ≈ NT$160,000/月 | 低 | 網頁收款也依賴 Stripe／Paddle（頁面所述），同樣受 Stripe 台灣限制 |
| E. 台灣在地金流網頁收款 | 綠界：個人（線上註冊）國內卡 2.75%（最低 NT$5）＋訂單處理費 NT$1/筆，另加 5% 營業稅；特約賣家 1.85%~2.75%（議定）＋設定費 NT$5,000＋年費 NT$13,000/年起。TapPay：國內卡 2.75%、國際卡 3.5%，設定費 NT$5,000＋年費 NT$11,000。藍新：未取得 | 無免費額度；有設定／年費（特約賣家） | 中～高：自建訂閱狀態、扣款失敗、停權、電子發票、與 iOS 權益合併 | 定期定額專屬費率未在費率表列出；發票義務未查證；藍新被擋 |

## 細節

### 1. 自建 StoreKit 2 + App Store Server
- Apple 官方 Server API 文件頁（https://developer.apple.com/documentation/appstoreserverapi ）WebFetch 只得標題；端點、ES256 JWT、`signedPayload` 等為模型記憶，**[未查證]**。
- 官方 Node 函式庫 [已查證]（https://github.com/apple/app-store-server-library-node 、https://raw.githubusercontent.com/apple/app-store-server-library-node/main/package.json ）：版本 3.1.0；README 寫 Node 22+；`SignedDataVerifier` 需 Apple 根憑證、環境、bundle ID（Production 需 `appAppleId`）；依賴 `jsonwebtoken`、`jsrsasign`、`node-fetch`；README 未提 Workers／Web Crypto。能否在 Workers 運行**未驗證**，需實測。
- Apple 小型企業方案 [已查證]（https://developer.apple.com/app-store/small-business-program/ ）：前一曆年與當年累計「扣除 Apple 抽成後收益」皆不超過 US$100 萬，內購抽成 15%；頁面另稱訂閱滿一年後降為 10%，適用條件請人工確認。

### 2. RevenueCat
- 定價 [已查證]：https://www.revenuecat.com/pricing 「Pay nothing for up to $2,500 in monthly tracked revenue. Then pay 1% of what you track once you hit $2,500 in MTR」；https://www.revenuecat.com/docs/welcome/set-up-revenuecat/account-management.md ：MTR 為扣店家抽成與稅之前的金額；超過後以整體 MTR 的 1% 計（US$2,600 → US$26）；回落至門檻下恢復免費；首月超標有 30 日寬限，之後超標未付款即限制功能。
- 網頁收款 [已查證]（https://www.revenuecat.com/docs/web/overview.md 、https://www.revenuecat.com/docs/web/web-billing/configuring-overview.md ）：三種引擎 RevenueCat Billing（Stripe 為 payment gateway）、Stripe Billing、Paddle Billing（Paddle 為 merchant of record）；RevenueCat Billing 需附加已連接的 Stripe 帳號（或可領取的 Stripe 沙盒，未領取不能收真實款項）；不支援印度客戶。Stripe Managed Payments 頁稱 RevenueCat 不在標準定價外加收費用（https://www.revenuecat.com/docs/web/integrations/stripe/stripe-managed-payments.md ）；RevenueCat Billing 本身是否另有網頁專屬費率本輪未讀到，[未查證]。
- App 內導流到網頁（https://www.revenuecat.com/docs/tools/paywalls/creating-paywalls/web-purchase-button.md ）：是否可行及店家抽成「由 Apple／Google 依店面決定」，RevenueCat 另有指南頁 https://www.revenuecat.com/app-to-web-purchase-guidelines （本輪未讀，台灣店面資格 [未查證]）。
- 估算：月營收 NT$200,000（約 US$6,250）→ 1% ≈ US$62.5 ≈ NT$2,000。

### 3. Adapty [已查證]
來源：https://adapty.io/pricing/ 。免費至每月追蹤營收 US$5K，之後為該月營收 1%；追蹤金額含訂閱、續訂、一次性購買，以 USD、平台（Apple、Google、Stripe 等）抽成前計算；超過 US$5K（滾動 30 天）後開始計費；付款由 Apple、Google、Stripe、Paddle 處理，Adapty 不處理交易；網頁收款支援 Stripe 與 Paddle。第一輪的舊制（US$10K、最低 US$99）已被現行頁面取代，不再採用。

### 4. Stripe 台灣 [已查證：不支援]
- https://stripe.com/global 的「Stripe is currently supported in the following countries/regions」清單（Australia、Austria、…、Hong Kong、Japan、Malaysia、Singapore、Thailand、…、United States）不含 Taiwan。清單另有「Is your business outside of a supported country/region?」的海外方案（頁面提及 Atlas 之類途徑，細節本輪未讀）。
- Stripe Tax 的台灣頁（https://docs.stripe.com/tax/supported-countries/asia-pacific/taiwan.md ）只涵蓋稅務計算，不代表可開商家帳號。
- 第一輪第三方（shareuhack、doola）說法以官方清單為準：台灣不在清單。
- Stripe 對海外實體（Atlas 等）的條件、費率未查，**[未查證]**，且牽涉稅務與發票，不在本票範圍。

### 5. 台灣在地金流
- 綠界 [已查證]（https://www.ecpay.com.tw/Business/payment_fees ）：
  - 個人（線上註冊）：國內信用卡、Apple Pay 2.75%，每筆最低 NT$5；信用卡訂單處理費每筆 NT$1（含稅）；線上金流費用另加 5% 營業稅；國外卡限特約賣家。
  - 特約賣家：系統設定費一次 NT$5,000；金流服務費依合約年限 NT$13,000/1 年、22,100/2 年、27,300/3 年；國內卡 1.85%~2.75%、國外卡 3.5%~3.8%，實際費率依風險評估議定。
  - 首頁（https://www.ecpay.com.tw/ ）稱支援信用卡一次付清、分期與定期定額，並有「綁卡/定期扣款」服務入口；**定期定額專屬費率費率表未列，[未查證]**。
  - 費率頁提醒：個人以營利為目的於網路銷售達一定金額須辦理稅籍及商業登記（財政部令，頁面所引）。
- 綠界電子發票（https://www.ecpay.com.tw/Business/invoice ）：為產品功能說明（B2C 開立後 48 小時內上傳財政部、免費載具與對獎通知、Turnkey 代傳等），**未陳述法定開立義務與費用，[未查證]**。
- TapPay [已查證]（https://www.tappaysdk.com/taiwan-en/help/pricing ）：系統設定費 NT$5,000（一次）、會員年費 NT$11,000/年；線上交易信用卡國內卡 2.75%、國際卡 3.5%；分期 3 期 3%、6 期 3.5%（限玉山、中信）；定期扣款專屬費率未列。
- 藍新 www.newebpay.com：curl 回 `Access Denied`（Akamai 擋下，未繞過），**費率與定期定額條件未取得**。
- 電子發票義務：以上頁面皆未陳述法規義務，**[未查證]**，建議另向財政部或金流商確認。

### 6. Expo 與 IAP 套件
- Expo 官方指南 [已查證]（https://docs.expo.dev/guides/in-app-purchases/ ，頁尾 Last updated September 25, 2026）：IAP 函式庫需自訂原生程式碼，Expo Go 不可用，須建 development build；列出兩個支援 CNG 與 Config Plugins 的函式庫：`react-native-purchases`（含 RevenueCat 整合）與 `expo-iap`（符合 OpenIAP 規格、可用於 development build）。頁面不再列舊 `expo-in-app-purchases`。
- Expo SDK 58 [已查證]：https://raw.githubusercontent.com/expo/expo/main/packages/expo/package.json 為 expo 58.0.19、react-native 0.88.1；https://github.com/expo/expo/releases 有 58.x 套件發布。
- `react-native-purchases` [已查證]（https://github.com/RevenueCat/react-native-purchases ，https://raw.githubusercontent.com/RevenueCat/react-native-purchases/main/package.json ）：11.0.1；peer `react-native >= 0.80.0`；Expo Go 為 Preview API Mode（JS mock），真購買需 development build；README 未列支援的 Expo SDK 版本。
- `expo-iap` [已查證]（https://github.com/hyochan/expo-iap 已封存；https://raw.githubusercontent.com/hyodotdev/openiap/main/libraries/expo-iap/package.json ）：6.4.3；peer `expo: *`、`react-native: *`（無版本限制，不等於已驗證相容 SDK 58）。
- expo-iap 需自建伺服器端驗證、react-native-purchases 內建：僅見 Adapty 部落格（非中立），本輪未重抓，[未查證]。

### 7. App Store 審核指南 [已查證]
來源：https://developer.apple.com/app-store/review/guidelines/ （讀前 100,000／114,428 字元）。
- 3.1.1：解鎖功能的訂閱須用 App 內購。
- 3.1.1(a)：美國店面可放外部連結與按鈕、不需 entitlement；其他特定地區須取得 StoreKit External Purchase Link Entitlement；其餘店面不得放導向其他付款方式的按鈕、連結或行動呼籲。台灣是否在可申請地區本輪未查，[未查證]。
- 3.1.3：特定類型 App 可用其他付款方式，但 App 內不得鼓勵；可在 App 外向用戶溝通。

## 仍未查證清單
1. 藍新（newebpay.com）費率、定期定額條件：站台回 Access Denied，需人工或另行授權。
2. 電子發票的法定開立義務、對個人消費者的規定、費用（財政部或金流商一手說明）。
3. 綠界、TapPay 的定期定額（定期扣款）專屬費率。
4. Stripe 費率頁、Stripe 對海外實體／Atlas 開戶條件；Paddle 的台灣資格與費率。
5. RevenueCat Billing 網頁專屬費率（本輪只讀到標準 1% 與「不外加 Managed Payments 費用」）。
6. RevenueCat app-to-web 指南對台灣店面的資格；Apple 外部購買連結 entitlement 是否涵蓋台灣。
7. Apple App Store Server API 端點／JWT／Notifications V2 細節（頁面為 JS 渲染）；Apple Node 函式庫能否在 Cloudflare Workers 運行。
8. `react-native-purchases`、`expo-iap` 對 Expo SDK 58 的實測相容性（只有 peer 版本範圍）。
9. 小型企業方案訂閱第二年 10% 的適用條件。
10. 匯率 NT$32 為假設值。
