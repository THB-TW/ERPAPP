# 實作快速手機記帳與即時預算

Status: ready-for-agent
Assignee:
Blocked by: 01-preserve-baseline.md

## Scope

依手機驗收方向建立 TypeScript/Worker/D1 的快速輸入路徑，保留帳戶/成員/分類；明確顯示儲存狀態，防連點及弱網路重複送出。先以隔離資料副本實作，不連正式 ERPDB，不取代舊入口。

## Acceptance

見 [手機操作與效能目標](../../../docs/cloudflare/mobile-experience.md)。需分開列出本機、Cloudflare 測試環境及 iPhone 真機結果，不以 UI 預覽宣稱正式功能完成。
