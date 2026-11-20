# App 審查備註（草稿）

> 草稿，2026-11-11。以 `.scratch/finance-product/research/17-seller-tax-legal-review.md` 第 5 節的已審版本為底，依目前實作更新（CSV 匯入、信用卡帳單 CSV、本機通知、轉帳記法、預算資料匯出）。
>
> **送審前逐句對照實作**：備註和 App 實際行為不符，比沒寫更糟。檢查清單在文末。

## 英文版（貼到 App Store Connect）

> This app is a bookkeeping and budgeting tool. Users record their own income and expenses, plan monthly budgets, reconcile their own credit card statements and account balances at month end, and keep a record of their own investment holdings (listed Taiwan stocks and cryptocurrency, entered by hand). All figures come from data the user enters by hand or imports from CSV files they download themselves.
>
> The app does not connect to any bank, brokerage, exchange or payment service. It has no feature to transfer, send, receive or store money, and it does not hold or handle users' funds. The "transfer" entry type only records a movement between the user's own accounts for bookkeeping. The app does not manage, move or invest money on the user's behalf; it only records and calculates. It has no cryptocurrency wallet, exchange, mining or token feature. The investment page calculates profit and loss from cost and market values that the user types in; it does not show quotes, give buy or sell recommendations, recommend products, forecast returns or execute trades. The only payment is the auto-renewable subscription through Apple In-App Purchase.
>
> Data is stored on the user's device. The app has no server, does not upload data, and contains no analytics, advertising or crash-reporting SDK. Users can export a backup file or CSV through the iOS share sheet to a destination they choose. Reminders are local notifications; remote push is disabled. If the user enables iCloud device backup, Apple handles that backup under iOS.
>
> No account or sign-in is required.
>
> The developer is an individual. The app does not provide banking, securities, investment advisory, electronic payment or other regulated financial services, so we understand that Guidelines 3.2.1(viii) (financial trading, investing or money management services) and 5.1.1(ix) (highly regulated fields) do not require submission by a financial institution or legal entity. If App Review sees it differently, please let us know the specific concern.
>
> How to test (the interface is in Traditional Chinese; button labels are quoted):
> 1. On the first screen choose "從零開始" (Start from scratch). Set the opening date to the 1st of last month, and enter an opening balance for each account.
> 2. On the "記帳" (Ledger) tab, add a few expenses dated last month. Budget limits and progress on the "預算" (Budget) tab are free.
> 3. Open the "月結" (Monthly close) tab. A month can be closed only after it has ended, which is why step 1 uses last month. Starting the close shows the paywall. Subscribe with a Sandbox account to unlock the monthly close wizard, reserves, loans, investments and budget data export. Backup file export and transaction CSV export are free.
> 4. "設定" (Settings) > Subscription shows price, period, renewal and cancellation terms, Restore Purchases, and links to the Terms of Use and Privacy Policy.
> 5. A sample CSV for import testing is attached. 〈附檔：待準備〉

## 中文對照（給翰陞看，不一定要貼）

> 本 App 是記帳與預算規劃工具。使用者自行記錄收支、規劃每月預算、在月底核對自己的信用卡帳單與帳戶餘額，並記錄自己的投資持股。所有數字都來自使用者手動輸入，或匯入使用者自行下載的 CSV 檔。
>
> 本 App 不與任何銀行、券商、交易所或支付服務連線，沒有轉帳、匯款、收付款或儲值功能，也不持有或經手使用者的資金。「轉帳」記法只是記錄使用者自己帳戶之間的資金移動。投資頁依使用者輸入的成本與市值計算損益，不顯示報價、不提供買賣或標的建議、不預測報酬、不執行交易。唯一的付款是透過 Apple 內購的自動續訂訂閱。
>
> 資料儲存在使用者裝置上。本 App 沒有伺服器、不上傳資料、不含分析或廣告 SDK。提醒是本機通知，遠端推播已關閉。若使用者開啟 iCloud 裝置備份，由 Apple 依 iOS 機制處理。
>
> 不需要註冊或登入。
>
> 開發者為個人。本 App 不提供銀行、證券、投資顧問、電子支付或其他受金融監理的服務，因此我們理解審查指南 3.2.1(viii) 與 5.1.1(ix) 不要求由金融機構或法人提交。如審查有不同看法，請告知具體疑慮。
>
> （測試步驟略，同英文版）

## 送審前對照清單

- [ ] `package.json` 沒有分析、廣告、當機回報或任何會連網的 SDK（2026-11-11 檢查：無；只有 expo 系列、react-native 系列）
- [ ] 程式沒有 `fetch` 或其他網路呼叫（2026-11-11 檢查：`apps/mobile/src` 無）
- [ ] `app.json` 的 expo-notifications 仍是 `enableRemoteNotifications: false`
- [ ] 測試步驟的按鈕文字與實作一致（2026-11-11：「從零開始」、分頁「記帳／預算／月結／設定」存在；付費牆觸發點與設定 > 訂閱頁在票 22，尚未合併）
- [ ] 開帳日可以選上個月 1 號（月結只能結已結束的月份，審查員要能走到付費牆）；若不行，改附一份示範備份檔
- [ ] 「開始月結」確實會跳付費牆；設定頁有還原購買與條款、隱私連結
- [ ] 正式建置沒有 `EXPO_PUBLIC_IAP=off`，沒有 dev_unlocked
- [ ] 票 22 加入的 IAP 套件（react-native-iap、expo-iap、RevenueCat 等）若會連到第三方伺服器（RevenueCat 會），隱私標籤、隱私權政策、本備註的「無 SDK」句都要改；只用 Apple StoreKit 本機驗證才維持現稿
- [ ] 沒有 `expo-updates`（OTA 更新會連 Expo 伺服器）、`expo-dev-client` 不進正式建置
- [ ] App 內「聯絡我們」若有，只能開空白信件（mailto），不得自動附帳本、備份檔或裝置資訊
- [ ] 設定頁有隱私權政策與使用條款連結（Guideline 5.1.1(i)）
- [ ] 加密出口合規：沒有自訂加密或網路傳輸，`ITSAppUsesNonExemptEncryption` 依 Apple 填寫指示處理（會計師／律師不管，開發時確認）
- [ ] 附上測試用 CSV（不能是翰陞的真實帳）
