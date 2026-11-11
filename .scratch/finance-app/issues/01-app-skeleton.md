# 01 — App 骨架：記一筆支出並在月曆看到

**What to build:** 使用者打開 App 看到本月月曆並選在今天，按「新增」輸入金額、選分類與帳戶後按「儲存」，這筆支出出現在當天的列表，關掉重開仍在。這張票建立之後每張票都要用的三層（畫面、帳本服務、純計算）與資料庫驅動的兩個實作（手機與 Node），以及在雲端跑的測試方式。分類與帳戶先用程式內建的預設表（只有名稱，不含任何個人資料）。

**Blocked by:** None — can start immediately

**Status:** done（2026-11-11；畫面與手機端驅動待票 02 在 iPhone 上驗收）

**Owner:** `ledger-entry`（見 `docs/agents/team.md`）　**Spec:** [規格](../../finance-product/spec.md)

- [x] repo 內新的獨立目錄有一個可啟動的 Expo App（TypeScript），不改動既有 ASP.NET 專案與 C# 測試
- [x] 帳本服務提供「新增交易」指令與「某月月曆」「某日交易」查詢；畫面不直接碰資料庫
- [x] 資料庫驅動有手機與 Node 兩個實作，都是真的 SQLite；資料庫記錄結構版本並有遷移機制
- [x] 資料庫檔放在會被 iCloud 裝置備份的位置
- [x] 金額為新台幣整數、日期為台北時間的日期字串；分類不存在或金額不是正整數時指令拒絕
- [x] 測試在雲端容器用 Node 執行，透過帳本服務驗證：新增後查得到、重開資料庫仍在、無效輸入被拒
- [x] 補兩份 ADR：財務文件沿用單一 JSON 文件；帳本服務是唯一測試切入點

## Comments

2026-11-11 完成（ledger-entry agent 實作，主 thread 驗證與審查）：
- App 在 `apps/mobile/`（Expo SDK 58、Expo Router）。`npm test` 18 個通過、`npm run typecheck` 無錯誤、`npx expo export --platform ios` 打包成功。
- 沒有在 iPhone 或模擬器上執行過：畫面與 expo-sqlite 驅動只過型別檢查與打包，要在票 02 實機確認；iCloud 裝置備份還原要在票 16 實測。資料庫用 expo-sqlite 的預設目錄（讀原始碼為 Documents 下的 SQLite 資料夾，會被備份）。
- 審查後補上：交易的收支別必須與分類的收支別一致（帳本服務拒絕）；畫面讀取失敗與非帳本錯誤顯示中文訊息；App 跨過午夜回到前景時「今天」會更新。
- 環境限制：`npx expo install` 與 `expo-doctor` 的兩項檢查要連 `api.expo.dev`／`exp.host`，被網路政策擋下；套件版本改讀 expo 內附的相容版本表後用 npm 安裝。之後能連線時跑一次 `npx expo install --check`。
- `app.json` 的名稱、slug、scheme 仍是暫用的 `mobile`，正式名稱定案後再改。
