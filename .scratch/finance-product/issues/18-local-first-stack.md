# 查明純本機 iOS 財務 App 的技術選項、備份與訂閱驗證

Type: research
Labels: wayfinder:research
Status: open

## Question

資料只存在 iPhone 本機、沒有自家伺服器的條件下：
- 技術棧比較：Expo SDK 58＋expo-sqlite（`apps/mobile` 已有 scaffold，可用 EAS 雲端建置） vs 原生 SwiftUI＋SwiftData／GRDB／SQLite。比較開發與建置方式（翰陞有 Mac）、本機資料庫可靠度與遷移、月結大表格在手機上的效能、舊 C# `BudgetEngine` 規則移植到 TS 或 Swift 的難易。
- Apple Silicon Mac 能否直接執行 iPhone App（"Designed for iPhone" on Mac），對 Expo 與 SwiftUI 各自的限制。
- 備份與換機：iCloud 裝置備份是否包含 App 的 SQLite 檔；CloudKit 私人資料庫、iCloud Drive 文件、手動匯出檔案各自的做法、費用（是否吃使用者自己的 iCloud 空間、開發者是否付費）與 Expo 可用性。
- 訂閱：StoreKit 2 在手機上直接驗證交易與權益（不經伺服器）是否足夠安全可靠；Expo 下可用的套件；RevenueCat 是否仍值得。
- 本機排程通知（7 號月結提醒、每日記帳提醒）在兩種技術棧的做法與限制。
只用 Apple、Expo 官方文件與套件原始碼，附連結與查證日期；區分「官方已確認」與「需實測」。
