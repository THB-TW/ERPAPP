# 研究 03：iOS＋網頁共用程式與離線同步

查證日期：2026-11-08
狀態：**主要項目已由官方網站原文確認。** 依 coordinator 指示改用 curl（預設 User-Agent，經 proxy）取得官方頁面：Cloudflare 以 `/index.md` 取 Markdown，Expo 以 llms.txt／v58 頁 HTML 抽文字。仍失敗的主機：

| 站點 | 結果 |
|---|---|
| electric-sql.com | curl 回 `CONNECT tunnel failed, 403`（WebFetch 為 ENOTFOUND）；改以 GitHub README 為佐證（二手程度較低） |
| replicache.dev | 同上 403；Replicache 維護狀態未查證 |
| WebFetch 對所有官方站 | 皆 ENOTFOUND（只有 curl 可用） |

Expo 的 v58 頁（`/versions/v58.0.0/sdk/sqlite/`）已讀到；Expo Router 的 `single` 輸出模式與 React Native Web 大表格建議仍未讀到。

## 結論

建議架構：
- **用戶端**：Expo（SDK 58）＋Expo Router，iOS 與 Web 同一份 TS；記帳／預算計算抽成共用 TS 核心（由 `cloudflare/server/ledger.ts` 演進）。大表格頁（月結精靈、匯入核對）只在 web 載入，手機不載入。
- **離線與同步**：自建「操作佇列＋UUIDv4 操作 ID」，本機用 expo-sqlite（web 需 wasm＋COOP/COEP 標頭設定，見下），伺服器端 `ON CONFLICT(owner_id,id) DO NOTHING` 冪等（repo 已實作）。第一版不引入 PowerSync／Electric／Zero。
- **雲端**：Workers＋D1，**共用庫以 owner_id 隔離**。每人一庫在 Free 方案上限 10 個，不可行；Paid 雖可至 100 萬庫，但無隔離需求前沒有收益。
- **金額**：新台幣存整數元；投資數量與價格存 TEXT 十進位字串或縮放後 INTEGER，不用 REAL。

備案：iOS 用 Expo，網頁獨立 Vite＋React，共用 TS 核心套件。觸發條件：expo-sqlite web 的 wasm／跨源隔離設定難以部署，或 React Native Web 大表格實測不合格。

Workers Paid（最低 US$5/月）是否必要：D1 Free 的每日額度（寫入 10 萬列、讀取 500 萬列）對單人記帳看似足夠，但 Workers Free 每次呼叫僅 10 ms CPU，`Ledger.budget()` 每次解析整份 JSON 並 GROUP BY，**能否在 10 ms 內完成須實測**；若超限就得上 Paid，而 US$5 對 NT$200 月費上限的占比很高（匯率未查證，請自行換算）。

## 同步選項比較

| 選項 | 與 D1／Workers 相容 | 成本 | 依據 |
|---|---|---|---|
| 自建操作佇列＋操作 ID | 已在 `ledger.ts` 實作，直接用 D1 | 僅 Workers／D1 用量 | repo 程式；效能需實測 |
| expo-sqlite（僅本機端） | 不涉及雲端 | 無 | 支援 android/ios/web 等；web 需 wasm＋跨源隔離標頭 |
| op-sqlite（僅本機端） | 不涉及雲端 | 無 | 官方文件：Expo 需 prebuild／dev build，web 需 OPFS＋COOP/COEP |
| PowerSync | 來源列 Postgres、MongoDB、MySQL(Beta)、SQL Server(Beta)、Azure DocumentDB(Alpha)、Convex(實驗)，**無 D1**；RN 端需 op-sqlite＋dev build | 託管價格未查（本次未讀定價頁）；服務端 Apache-2.0 | docs.powersync.com |
| ElectricSQL | 需 Postgres（開啟 logical replication）；**不能以 D1 為來源**；僅讀取路徑同步 | 需另備 Postgres | electric README |
| Zero（Replicache 的後繼產品線；Replicache 狀態未查） | 僅 Postgres 15+（logical replication），**不能用 D1** | 需另備 Postgres；Zero 價格未查 | zero.rocicorp.dev |

## 官方文件已確認

Cloudflare、Expo、PowerSync、Zero、op-sqlite 項目讀自官方網站（2026-11-08 curl）；Electric 僅有 GitHub README。

**Cloudflare D1 限制**（來源：https://developers.cloudflare.com/d1/platform/limits/ ）
- 每帳號資料庫數：Free 10；Paid 1,000,000（前 100,000 含在內，超過每庫 US$0.10/月）。
- 單庫大小：Free 500 MB；Paid 10 GB。帳號總儲存：Free 5 GB；Paid 1 TB（可申請提高）。
- 每次 Worker 呼叫的查詢數：Free 50；Paid 1,000；`db.batch()` 算一次查詢。
- 單列／字串／BLOB 上限 2 MB；單句 SQL 100 KB；單查詢綁定參數 100；單查詢時間 30 秒；查詢結果 50 MB（頁面註明 2026-11-04 生效）。
- Time Travel 保留：Free 7 天；Paid 30 天。

**D1 價格**（來源：https://developers.cloudflare.com/d1/platform/pricing/ ）
- Free：讀取 500 萬列／日、寫入 10 萬列／日、儲存 5 GB（總計）；表中未列超額單價，用量以每日額度為上限。
- Paid：讀取前 250 億列／月含、其後 US$0.001／百萬列；寫入前 5,000 萬列／月含、其後 US$1.00／百萬列；儲存前 5 GB 含、其後 US$0.75／GB-月。
- 不執行查詢時不收運算費（pricing.mdx）。

**Durable Objects**（來源：https://developers.cloudflare.com/durable-objects/platform/pricing/ 與 https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/durable-objects/platform/limits.mdx（單物件 10 GB 一項仍引 GitHub 原始檔） ）
- Workers Free 方案只能建立與存取 SQLite 型 Durable Objects。
- Free：請求 10 萬／日、時間 13,000 GB-s／日、SQLite 讀取 500 萬列／日、寫入 10 萬列／日、儲存 5 GB（總計）；超過任一免費額度，該類操作會失敗（價格頁）。
- Paid：請求 100 萬／月含、其後 US$0.15／百萬；時間 400,000 GB-s／月含、其後 US$12.50／百萬 GB-s；SQLite 讀取前 250 億列、寫入前 5,000 萬列含；儲存 5 GB-月含、其後 US$0.20／GB-月。
- SQLite 型單一物件儲存上限 10 GB；Free 帳號總儲存 5 GB。
- 價格頁範例中出現「每月最低 US$5 使用費」；範例為示意，非完整費率表。

**Workers**（來源：https://developers.cloudflare.com/workers/platform/pricing/ ）
- Free：10 萬請求／日；每次呼叫 10 ms CPU。
- Paid：帳號最低 US$5／月；1,000 萬請求／月含、其後 US$0.30／百萬；3,000 萬 CPU ms／月含、其後 US$0.02／百萬 CPU ms；單次呼叫 CPU 預設 30 秒、最長 5 分鐘。

**expo-sqlite**（來源：https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/ ）
- 支援平台列有 android、ios、macos、tvos、web、expo-go。
- web 需設定 Metro 支援 wasm，並因 `SharedArrayBuffer` 需要在網頁伺服器加上 `Cross-Origin-Embedder-Policy` 與 `Cross-Origin-Opener-Policy`；Expo Hosting 可在 `expo-router` plugin 設定標頭。
- web 預設為不含 FTS 的預建 WebAssembly SQLite；要 FTS 須自建 wasm（`expo/wa-sqlite`）。
- v58 該頁內文沒有把 web 標為 alpha（頁面中的 ALPHA 字樣僅出現在側欄其他項目）。推翻前一版「web 為 alpha」的記憶；實際穩定度仍須實測。

**Expo Router web 輸出**（來源：https://docs.expo.dev/router/web/static-rendering/ ）
- `static`：每個路由產生 HTML，動態路由需 `generateStaticParams`；`server`：`web.output: 'server'` 每次請求渲染。`single` 模式該頁未涵蓋。該頁另載：SDK 58 起可將靜態渲染與 server 功能（API routes／server 輸出）合用。

**同步引擎**
- PowerSync：官方文件列來源資料庫 Postgres、MongoDB、MySQL（Beta）、SQL Server（Beta）、Azure DocumentDB（Alpha）、Convex（Experimental），**無 D1／SQLite**；用戶端為本機 SQLite。來源：https://docs.powersync.com/intro/powersync-overview 。React Native／Expo SDK 需 `@op-engineering/op-sqlite`（要求 1.17.0 以上），不相容 Expo Go（Expo Go 需改用 JS 版 `@powersync/adapter-sql-js`）。來源：https://docs.powersync.com/client-sdks/reference/react-native-and-expo 。服務端 Apache-2.0：https://github.com/powersync-ja/powersync-service
- Zero：官方文件「Today only Postgres is supported」，需 Postgres 15 以上並開啟 logical replication；狀態頁稱 generally available。來源：https://zero.rocicorp.dev/docs/connecting-to-postgres 、https://zero.rocicorp.dev/docs/status 。**不能以 D1 為來源。**
- ElectricSQL（僅 GitHub README，electric-sql.com 不可達）：需 Postgres 並開啟 logical replication；定位為 Postgres 的讀取路徑同步引擎（Shapes、HTTP API）。來源：https://github.com/electric-sql/electric 。README 徽章寫 1.0 但 alt 為 Beta，**成熟度說法不一致**。
- op-sqlite：Expo 可用但**不能用 Expo Go**，需 `npx expo prebuild`（development build）；web 為選配（裝 `@sqlite.org/sqlite-wasm`）、須用 `openAsync()`、同步 API 會丟錯、需 OPFS，且需 `Cross-Origin-Opener-Policy: same-origin` 與 `Cross-Origin-Embedder-Policy: require-corp`；web 不支援 SQLCipher／libsql／turso。與 expo-sqlite 同裝會有 iOS 重複 sqlite 符號衝突（需設定）。來源：https://op-engineering.github.io/op-sqlite/docs/installation 、特色清單 https://github.com/OP-Engineering/op-sqlite
- 因此：PowerSync、Electric 都需要 Postgres／MySQL 等外部源庫，與 D1 不直接相容，會多一套後端與費用。

**repo 內事實**（來源：repo 檔案）
- `apps/mobile/package.json`：expo ~58.0.23、react-native 0.88.1、react 19.3.0；尚未安裝 expo-router、expo-sqlite、react-native-web。
- `apps/mobile/AGENTS.md`：路由放 `src/app/`；原生模組需 development build；用 `npx expo install`。
- `cloudflare/server/ledger.ts`：owner_id 隔離；UUIDv4 操作 ID；`ON CONFLICT(owner_id,id) DO NOTHING`＋指紋比對，同 ID 不同內容回 409；金額限 safe integer 1～1,000,000,000；已月結月份拒寫入。

## 需實測

1. **Workers Free 10 ms CPU**：`Ledger.budget()`（JSON.parse 整份 `app_workspaces` 文件＋GROUP BY）與 `save()`（內含 `bootstrap()`＋`budget()`，一次儲存約十個以上 D1 查詢）在真實資料量下的 CPU 與延遲；決定是否需要 Workers Paid。
2. **D1 讀寫列數**：`entries()` 的 LIKE 搜尋為全月掃描，月資料量大時的 rows read 是否仍在 Free 額度內。
3. **expo-sqlite web**：wasm＋COOP/COEP 在實際部署位置（Cloudflare 靜態資源或 Pages）是否能設標頭、是否影響第三方內嵌；SDK 58 版本專屬文件（docs.expo.dev/versions/v58.0.0）需網站可連後比對。
4. **op-sqlite 與 Expo SDK 58／React Native 0.88 的相容性**與 web 實際行為（文件有安裝說明，但未標註支援的 RN／SDK 版本）。
5. **React Native Web 大表格**（月結精靈、投資、匯入核對）的捲動與互動效能，對比獨立 Vite 版；本次未讀到官方大表格建議。
6. **Expo Router `single` 輸出模式**的行為與限制（本次未讀到）。
7. **Replicache** 維護狀態（replicache.dev 不可達）、**Electric 官方站內容**（electric-sql.com 不可達）；**PowerSync、Zero 託管價格**（本次未讀定價頁）。
8. 真機 iPhone 4G 冷啟動至可輸入時間、首屏 gzip 大小；弱網重送、連點、跨帳號離線隔離。
9. Workers Paid 以台幣換算後對 NT$200／月上限的實際占比（匯率未查證）。

## 金額精度（工程建議，非官方查證）

- 新台幣：整數元；`ledger.ts` 已用 `Number.isSafeInteger` 且單筆上限 10 億，加總遠低於 2^53。
- 投資：以十進位字串傳輸，儲存用 TEXT 或縮放後 INTEGER（如 1e-8）；SQLite 無原生 decimal，REAL 為 float，不可存精準數量。SQLite 官方 REAL／INTEGER 型別行為本次未查證；十進位函式庫待評估。
