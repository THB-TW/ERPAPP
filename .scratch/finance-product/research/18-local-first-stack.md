# 研究 18：純本機 iOS 財務 App 的技術棧、備份、訂閱驗證與本機通知

查證日期：2026-11-08
對應票：[18-local-first-stack](../issues/18-local-first-stack.md)
查證方式：只用 developer.apple.com（Apple 文件 JSON：`https://developer.apple.com/tutorials/data/documentation/<path>.json`）、docs.expo.dev（v58.0.0 版文件與 llms.txt）、套件 GitHub 原始檔（raw.githubusercontent.com）。WebFetch 不可用，改用 curl（預設 User-Agent，經 proxy）。以下兩處被擋、未繞過，標為未查證：`gh api` 對套件倉庫（session 未綁定這些倉庫）、`github.com/...` HTML 頁（403，改取 raw README）。support.apple.com、Apple 版本支援表等不在許可來源內，未引用。

## 結論

**建議技術棧：Expo SDK 58＋expo-sqlite（本機 SQLite）＋TS 移植的帳務核心，EAS 雲端建置。**
理由：
1. `apps/mobile` 已是 Expo 58 scaffold（package.json：expo ~58.0.23、react-native 0.88.1），不用重起。
2. 月結核心 `BudgetEngine.cs` 只有 256 行，金額全是 `int`（唯一非純算術是 `Fingerprint` 的 SHA256＋JSON 序列化），移植到 TS 風險低；投資的 `decimal` 部分（`InvestmentCalculator.cs` 94 行）需另選十進位處理（見「需實測」）。
3. 本專案需要的原生能力（SQLite、檔案、分享、文件選取、本機通知、IAP）Expo 都有官方模組或文件列出的套件，且 EAS 雲端建置不要求每次本機開 Xcode。
4. 這個階段最大不確定在「備份可靠度」與「大表格效能」，兩者都要在真機實測；實測失敗時有明確退路（下一段），且資料層是標準 SQLite 檔，換棧時可直接帶走。

**備案：原生 SwiftUI＋GRDB（SQLite）**。觸發條件任一成立就改走備案：
- 真機上月結／匯入核對大表格捲動與輸入不達標（實測項 3）。
- expo-sqlite 在 iCloud 備份還原後資料庫損毀或遺失（實測項 1），且以匯出檔補救仍不夠。
- IAP 套件（expo-iap 或 react-native-purchases）在 RN 0.88 上有無法接受的問題（實測項 6）。
備案不選 SwiftData 當主庫：它的 CloudKit 同步有「不支援唯一約束、非可選關聯」限制，且 CloudKit schema 上線後只能新增、不能刪改欄位（官方文件，見下），對需要長期遷移的財務帳不友善；若用原生，主庫用 GRDB（直接 SQLite，與 Expo 的 SQLite 檔同格式，`docs/sql` 思路可沿用）。SwiftData 的 `SchemaMigrationPlan`／`VersionedSchema` 存在，但可靠度與遷移行為本次未實測。

**建議備份做法（v1，不做 CloudKit）：三層，不做跨裝置即時同步。**
1. **iCloud 裝置備份（預設、免費、自動）**：資料庫放在「會被備份」的位置（不放 `Library/Caches`、`tmp`，也不設 `isExcludedFromBackup`）。Apple 文件：iCloud 備份「包含 App 的資料」，`Caches` 與 `tmp` 預設被排除；使用者建立的資料不該排除。這層只管「換機／重灌時還原」，不是即時同步，也不能在 iPhone 與 Mac 之間共用。
2. **手動匯出檔（主動保險）**：設定頁提供「匯出備份」，產生 SQLite 副本（`expo-sqlite` 的 `serializeAsync` 或 `backupDatabaseAsync`，一致性比直接複製 `-wal` 檔安全），用系統分享面板存到「檔案」App／iCloud Drive／AirDrop；匯入用文件選取器。每次月結完成後提示一次匯出。
3. **匯出 CSV／JSON（人可讀）**：與 `docs/budget-workspace.md` 的驗證副本思路一致，供離開產品時帶走資料。

CloudKit 私人資料庫、iCloud Drive 同步當資料庫，列為 v1 之後的選項（理由見比較）。

## 比較表：Expo 與 SwiftUI

| 項目 | Expo 58＋expo-sqlite | SwiftUI＋GRDB／SwiftData |
|---|---|---|
| 現況 | `apps/mobile` 已有 scaffold（Expo 58、RN 0.88.1） | 從零開始 |
| 建置 | EAS 雲端建置，不需本機 Xcode（Expo 文件）；原生模組需 development build，不能只用 Expo Go | 本機 Xcode（翰陞有 Mac） |
| 本機 DB | expo-sqlite：官方 SQLite API，支援 WAL、預備語句、交易、`serializeAsync`、`backupDatabaseAsync`、SQLCipher 選配 | GRDB：SQLite、`DatabaseMigrator` 遷移、`DatabasePool`（WAL）、SQLCipher 選配（README）；SwiftData：`SchemaMigrationPlan`，但 CloudKit 有 schema 限制 |
| 遷移 | 自寫版本表＋SQL（可直接沿用 `docs/sql` 習慣）；`PRAGMA user_version` 自管 | GRDB 內建 migrator |
| 月結大表格效能 | 未知，需實測（JS 執行緒＋列表元件） | 原生 List／Table，預期較佳但本次未實測 |
| 舊 C# 規則移植 | 到 TS：BudgetEngine 256 行、int 為主，易；`decimal` 需十進位函式庫 | 到 Swift：`Decimal` 原生，規則表達力佳；但整份重寫、無既有 scaffold |
| IAP | expo-iap（OpenIAP，iOS 端為 StoreKit 2）或 react-native-purchases（需 RevenueCat 後端）；皆需 dev build | 原生 StoreKit 2，含 `SubscriptionStoreView` |
| 本機通知 | expo-notifications：iOS `CalendarTriggerInput`（day、hour、repeats）、`DailyTriggerInput`、`MonthlyTriggerInput` | `UNCalendarNotificationTrigger` |
| iCloud／CloudKit | 無官方 CloudKit 模組；文件選取器可開 iCloud Drive 檔案（`usesIcloudStorage`）；第三方 CloudKit 套件本次未查證 | 原生支援 CloudKit、iCloud Documents、SwiftData 同步 |
| 在 Apple silicon Mac 執行 | 與一般 iPhone App 同（見下節），未見 Expo 專屬限制文件；需實測 | 同左；另可選 Mac Catalyst／原生 Mac |

## 官方已確認

### 備份與檔案位置
- iCloud 備份會備份裝置，含 App 資料；`/tmp` 與 `/Library/Caches` 是可清除資料，iCloud 備份預設排除；使用者建立或 App 運作所需的資料不要排除：https://developer.apple.com/documentation/foundation/optimizing-your-app-s-data-for-icloud-backup
- `isExcludedFromBackup` 只是給系統的「可排除」提示，不是保證；某些檔案操作會把它重設成 false，需每次儲存都設定：同上頁；https://developer.apple.com/documentation/foundation/urlresourcekey/isexcludedfrombackupkey
- Apple 說明 iCloud 備份可用於還原既有或新裝置，備份越大還原越久：https://developer.apple.com/documentation/cloudkit/deciding-whether-cloudkit-is-right-for-your-app
- 同頁列出 iCloud Documents（同步檔案）、iCloud key-value（最多 1,024 個字串鍵）、CloudKit／SwiftData／Core Data（物件圖）三種選項。
- `UIFileSharingEnabled` 為 true 時，App 的 Documents 資料夾可由使用者經「檔案」等工具存取：https://developer.apple.com/documentation/bundleresources/information-property-list/uifilesharingenabled ；Expo 對應設定見 document-picker 文件（`supportsOpeningDocumentsInPlace`、`UIFileSharingEnabled` 說明）：https://docs.expo.dev/versions/v58.0.0/sdk/document-picker/

### CloudKit／SwiftData 同步與費用
- CloudKit 私人資料庫的資料計入**使用者自己的 iCloud 儲存空間**：https://developer.apple.com/documentation/cloudkit/ckcontainer/privateclouddatabase ；私人庫存滿時 `quotaExceeded` 要使用者去管理 iCloud 空間：https://developer.apple.com/documentation/cloudkit/ckerror/code/quotaexceeded
- 私人資料庫的資料開發者在 Developer Portal 看不到；可設定欄位加密（encrypted fields）：https://developer.apple.com/documentation/cloudkit/ckcontainer/privateclouddatabase ；https://developer.apple.com/icloud/cloudkit/
- 官方頁面形容私人資料「隨使用者增加而無限擴展」，公開資料庫上限 1 PB：https://developer.apple.com/icloud/cloudkit/ 。**開發者端是否另有費用，這頁沒有逐項寫明，標為未確認**（私人庫資料依上條計入使用者額度）。
- 啟用 CloudKit 需 Apple Developer Program 帳號（admin）加 iCloud capability：https://developer.apple.com/documentation/cloudkit/enabling-cloudkit-in-your-app
- SwiftData 同步：需 iCloud 與 Background Modes（Remote notifications）；不支援唯一約束與非可選關聯；CloudKit schema 上線後只增不減（不能刪型別或改既有屬性）：https://developer.apple.com/documentation/swiftdata/syncing-model-data-across-a-persons-devices
- Core Data＋CloudKit 鏡像：只支援特定 store 類型；不能直接接既有 CloudKit 容器；Core Data 擁有 schema：https://developer.apple.com/documentation/coredata/mirroring-a-core-data-store-with-cloudkit
- Expo：`ios.usesIcloudStorage` 僅為 DocumentPicker 的 iCloud 存取（開啟使用者的 iCloud Drive 檔案）：https://docs.expo.dev/versions/v58.0.0/config/app/ ；要 iCloud 容器需手動或由 EAS 設定 entitlements，並在 Apple Developer 建立容器：https://docs.expo.dev/versions/v58.0.0/sdk/document-picker/ ；EAS 可自動註冊 CloudKit 容器能力（iCloud capability 列為支援）：https://docs.expo.dev/build-reference/ios-capabilities/

### expo-sqlite 與 Expo 檔案／匯出
- 支援 android、ios、macos、tvos、web；含 `serializeAsync`、`backupDatabaseAsync`、`importDatabaseFromAssetAsync`、WAL 範例、SQLCipher（android／ios／macos，需 prebuild）：https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/
- Apple TV 的 DB 在 caches 目錄（官方特別註明）；**iOS 預設路徑文件只寫 `defaultDatabaseDirectory`，未明寫是 Documents 或 Library**，見「需實測」：同頁。
- expo-file-system 有 `Paths.document`、`Paths.cache`：https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/ ；document-picker 讀檔需 `copyToCacheDirectory: true` 才能馬上用 file-system 讀：https://docs.expo.dev/versions/v58.0.0/sdk/document-picker/
- expo-sharing 提供分享面板（匯出檔用）：https://docs.expo.dev/versions/v58.0.0/sdk/sharing/
- EAS Build：雲端建置 iOS／Android，可管理簽署憑證，亦可本機建置：https://docs.expo.dev/build/introduction/ 。Expo 稱 EAS 為 Expo Services，指令仍為 `eas`：https://docs.expo.dev/llms.txt
- 含原生程式的套件在 Expo Go 不可用，需 development build：https://docs.expo.dev/guides/in-app-purchases.md ；repo 內 `apps/mobile/AGENTS.md` 同樣要求。

### Apple silicon Mac 執行 iPhone App
- iOS apps on Mac：未修改的 iPhone／iPad App 可在 Apple silicon 上執行，無需移植；不想上 Mac 可在 App Store Connect 選擇不提供：https://developer.apple.com/documentation/apple-silicon/running-your-ios-apps-in-macos
- 官方列出的退出理由之一是「不想讓使用者接觸 App bundle 或資料容器內容」（暗示在 Mac 上使用者可看到容器）：同頁。
- 僅 iPhone 的 App 在 Mac 上固定視窗大小；支援 iPad 多工才可縮放視窗：https://developer.apple.com/documentation/apple-silicon/adapting-ios-code-to-run-in-the-macos-environment
- 不要假設檔案路徑固定、不要假設有多指觸控；`ProcessInfo.isiOSAppOnMac` 可判斷：同頁；https://developer.apple.com/documentation/foundation/processinfo/isiosapponmac
- 因此「Designed for iPhone」在 Mac 上執行的資料是 **Mac 上那份安裝的獨立資料**；官方文件未說它與 iPhone 資料共用或能被 iCloud 備份還原到 iPhone（此為推論，見實測項 5）。

### 訂閱與權益（StoreKit 2，不經自家伺服器）
- StoreKit 自動驗證交易、續訂資訊與 App 交易，回傳 `VerificationResult`（verified／unverified）：https://developer.apple.com/documentation/storekit/verificationresult
- 若要自行驗證，可用 `jwsRepresentation`（JWS）在**裝置上**驗證，並以 `deviceVerification`（SHA-384，搭配 `AppStore.deviceVerificationID`）確認交易屬於這台裝置；「為了更多控制與安全」才建議送伺服器驗證，並用 App Store Server Library：https://developer.apple.com/documentation/storekit/transaction ；https://developer.apple.com/documentation/storekit/transaction/deviceverification
- `Transaction.currentEntitlements` 回傳目前有效的非消耗品與狀態為訂閱中／寬限期等的自動續訂訂閱；已退款或撤銷者不在其中：https://developer.apple.com/documentation/storekit/transaction/currententitlements
- `revocationDate` 表示退款或撤銷（含家人共享撤銷）：https://developer.apple.com/documentation/storekit/transaction/revocationdate
- `Transaction.updates` 必須在 App 啟動時就開始監聽，才不會漏掉在別台裝置、Ask to Buy 或 App Store 內完成的交易：https://developer.apple.com/documentation/storekit/transaction/updates
- 重裝或換機後，交易自動可用，不需手動還原；仍建議放「恢復購買」按鈕，它呼叫 `AppStore.sync()` 會要求使用者驗證 App Store 身分，且只能由使用者動作觸發：https://developer.apple.com/documentation/storekit/appstore/sync()
- `AppTransaction` 提供 `originalAppVersion` 等資料，可用於付費轉訂閱的舊用戶判斷：https://developer.apple.com/documentation/storekit/apptransaction
- 原生 SwiftUI：`SubscriptionStoreView` 可陳列同一訂閱群組：https://developer.apple.com/documentation/storekit/subscriptionstoreview
- Expo IAP 套件（Expo 文件列出兩個，皆需 CNG／config plugin 與 dev build）：react-native-purchases、expo-iap：https://docs.expo.dev/guides/in-app-purchases.md
  - expo-iap：README 稱符合 OpenIAP 規範，iOS 實作為 openiap-apple（StoreKit 2），以 `npx expo install expo-iap` 安裝：https://raw.githubusercontent.com/hyodotdev/openiap/main/libraries/expo-iap/README.md
  - react-native-purchases：是 RevenueCat 服務的用戶端，README 稱「提供後端」並包裝 StoreKit；RN 最低 0.80.0；Expo 需 dev build，Expo Go 內為預覽模式（無法真實購買）：https://raw.githubusercontent.com/RevenueCat/react-native-purchases/main/README.md

### 本機排程通知
- Apple：`UNCalendarNotificationTrigger` 以日期元件在指定日期時間送出本機通知，`repeats: true` 可每日固定時間重複：https://developer.apple.com/documentation/usernotifications/uncalendarnotificationtrigger
- Apple：`UNUserNotificationCenter` 可查詢、移除待送本機通知：https://developer.apple.com/documentation/usernotifications/unusernotificationcenter
- Expo：expo-notifications 可排程本機通知；本機通知在 Expo Go 仍可用（推播才需 dev build）：https://docs.expo.dev/versions/v58.0.0/sdk/notifications/
- Expo 觸發型別：`CalendarTriggerInput`（僅 iOS，支援 day、hour、minute、month、weekday、repeats、timezone，對應 `UNCalendarNotificationTrigger`）、`DailyTriggerInput`（每日 hour／minute）、`MonthlyTriggerInput`（每月 day／hour／minute；文件標示 Android、iOS），另有 `TimeIntervalTriggerInput`（iOS 重複時間間隔需 60 秒以上）、`DateTriggerInput`：同頁。
- 權限狀態有 NOT_DETERMINED、DENIED、AUTHORIZED、EPHEMERAL；被拒時無法排程送出：同頁。
- 只用本機通知時，config plugin 可關閉遠端推播（不加 APNs entitlement）：同頁。

### 其他
- GRDB 7.12.0（2026-11-01 發行），需 iOS 13+、Swift 6.1+、Xcode 16.3+；提供 migrations、WAL 的 DatabasePool、SQLCipher：https://raw.githubusercontent.com/groue/GRDB.swift/master/README.md
- 舊碼規模（repo 內）：`Services/Budgeting/BudgetEngine.cs` 256 行、`BudgetState.cs` 79 行、`BudgetWorkspace.cs` 191 行（版本化文件與 SQL 交易，含投影）、`Services/InvestmentCalculator.cs` 94 行（含 `decimal`、`Math.Round(..., AwayFromZero)`）、`Services/Import/*` 共約 360 行。`BudgetEngine` 的金額為 `int`，並用 `checked` 運算與 ±1,000,000,000 範圍檢查；操作指紋用 SHA256（JSON 序列化）；`Position` 把原始月結與調整分開計算（符合 ADR 0003／0004 的「原始月結與手動調整分開」）。移植重點是保持這些語意（整數溢位檢查、`AwayFromZero` 四捨五入、指紋的 JSON 規範化）。

## 需實測（官方文件沒有直接答案）

1. **iCloud 備份還原後 DB 完整性**：expo-sqlite 在 iOS 預設的 DB 路徑（Documents 還是 Library）、WAL 模式下 `-wal`／`-shm` 檔在備份與還原的一致性。做法：真機建資料、強制 iCloud 備份、抹除後還原、`PRAGMA integrity_check` 並比對月結結果。沒測過前，不可宣稱「換機自動還原」。
2. **使用者關閉 iCloud 備份或空間不足時的行為**，以及 App 內如何偵測並提示（官方只提供 `quotaExceeded` 用於 CloudKit）。
3. **月結大表格效能**：58 個月、數千筆交易的月結精靈、匯入核對、投資頁，在低階 iPhone 上的捲動、編輯、重算時間；Expo 與原生各做同一個最小原型比較。
4. **EAS 實際流程**：免費額度、排隊時間、憑證與 iCloud／IAP capability 自動註冊在翰陞帳號上的實況（本次只讀到功能文件，未讀 EAS 定價頁，費用標為未查證）。
5. **Mac 上執行 iPhone App**：Expo 建置的 IPA 能否出現在 Mac 版 App Store／在 Apple silicon 上正常開啟；其資料容器是否與 iPhone 獨立；備份還原不跨裝置。用 Mac 做舊帳 58 個月驗收時，資料需靠匯出匯入帶入（官方沒說共用）。
6. **IAP 套件相容性**：expo-iap 與 react-native-purchases 對 Expo 58／RN 0.88.1 的實際相容、StoreKit 2 沙盒測試（續訂、退款、家人共享、寬限期）。兩個套件的維護活躍度、授權、版本支援本次因 GitHub API 受限未查（只讀到 README）。
7. **裝置端驗證的安全邊界**：Apple 文件只說裝置端可驗證、更高安全才送伺服器。沒有伺服器時，被改過的 App（越獄）可略過檢查，這是**推論**；本專案資料本來就在使用者手機上，風險是盜用訂閱而非洩漏，是否接受屬產品決定，不是技術問題。RevenueCat 是否仍值得：訂閱群組只有一個、單平台、無伺服器時，直接用 StoreKit 2 已足夠；RevenueCat 的價值在跨平台、網頁收款、報表，且會多一個第三方收集購買資料的後端（與「隱私標籤可申報不蒐集」的方向衝突，屬推論，需對照 RevenueCat 資料處理說明，本次未讀）。
8. **本機通知**：`MonthlyTriggerInput`（每月 7 號）在 iOS 實際行為，不行就用 `CalendarTriggerInput { day: 7, hour, minute, repeats: true }`；月底沒有 31 號等邊界；iOS 同時待送本機通知的數量上限（本次官方文件未查到明確數字，不可引用 64）；重新安裝、時區變更、系統升級後排程是否仍在；使用者拒絕權限的引導。
9. **十進位**：TS 移植投資的 `decimal` 與四捨五入（AwayFromZero）時，用整數縮放或十進位函式庫，並以舊系統輸出做對拍測試（也適用 Swift `Decimal`）。
10. **CloudKit 在 Expo 的可行性**：Expo 沒有官方 CloudKit 模組；第三方套件或自寫 Expo Module（Swift）本次未查證。若 v1 之後要跨裝置同步，原生 SwiftUI＋CloudKit 顯著較順；若要維持 Expo，需評估自寫原生模組。
11. **遷移策略**：App 版本升級時 SQLite schema 遷移（失敗回復、先備份副本）；Expo 與 GRDB 都需自訂流程測試。
12. **CloudKit 開發者端費用**：官方頁面未逐項寫明，實際用量（私人庫）是否有開發者端計費需查 CloudKit 定價／配額說明。

## 與其他研究的關係
- 02（權益平台）：改單機後，StoreKit 2 裝置端驗證為預設，RevenueCat 為可選。
- 03（stack-and-sync）：Expo 58＋expo-sqlite 結論沿用；Workers／D1／同步引擎（PowerSync、Electric、Zero）全部不適用於單機。op-sqlite 與 expo-sqlite 的比較仍可作備選，但 v1 不需要。
- 06（通知）：單機後以本機排程通知取代 LINE 與推播；見上節。
