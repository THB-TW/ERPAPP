# 查明 iOS＋網頁共用程式與離線同步的技術選項

Type: research
Labels: wayfinder:research
Status: open

## Question

在「同一份資料、iOS 與網頁同時上架、手機記帳要快且弱網可用」的條件下：
- Expo SDK 58（`apps/mobile` 已建 scaffold）＋ Expo Router ＋ React Native Web 能否同時產出 iOS App 與桌面網頁，桌面用的大表格（月結精靈、投資、匯入核對）是否合適；替代方案（iOS 用 Expo、網頁獨立 React/Vite 共用 TS 核心）。
- 本機優先離線資料庫與同步選項（expo-sqlite、op-sqlite、PowerSync、ElectricSQL、Replicache/Zero、自建操作佇列＋操作 ID），各自與 Cloudflare D1／Durable Objects 的相容性與成本。
- 雲端端：Workers + D1 多租戶（每人一庫 vs 共用庫 owner_id 隔離）、D1 單庫與帳號容量限制、Durable Objects 價格；Workers Paid US$5 是否必要。
- 金額精度：新台幣整數與投資十進位在 JS/SQLite 的安全做法。
只用官方文件與原始碼，附連結；說明哪些需實測才能確認。
