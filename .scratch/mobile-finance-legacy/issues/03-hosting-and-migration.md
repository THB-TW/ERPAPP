# 查明雲端候選方案的完整成本與既有規則沿用程度

Parent: ../map.md
Labels: wayfinder:research
Type: research
Mode: AFK
Status: resolved
Assignee: Codex
Blocked by:

## Question

在最新月費上限 200 元內，比較現有 ASP.NET Core 加 SQL Server 搬上雲端、重做輕量 PWA、Google 試算表加 Apps Script、Notion、原生 App。分列主機、資料庫、備份、排程、登入、通知、網域、超額及一次性重寫工作；區分官方價格、估算與尚未測量事項。提供最低費用、正常用量與上限控制方式。盤點可取得副本的既有財務規則與正式來源確認程度，不把副本當成已驗證的正式版本。

## Research leads

2026-11-08 官方文件初查，尚未結案：

- [Railway plans](https://docs.railway.com/pricing/plans)：Hobby 每月 USD 5 起，不能當作網站加資料庫的全包價格；需估算資源用量。
- [Railway billing](https://docs.railway.com/pricing/understanding-your-bill)：訂閱含部分用量，超出另計。
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) 與 [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)：有免費用量；不得推論現有 ASP.NET Core/SQL Server 可直接搬入同一執行環境。
- [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)：個人帳號配額需計入，排程失敗必須可察覺。
- [Notion database automations](https://www.notion.com/help/database-automations)：完整資料庫自動化有付費方案限制，模板不等於銀行串接。

## Answer

2026-11-08 主代理直接查證官方費率及本地副本，完成[完整研究](../research.md)。子代理未提供指定的 sonnet，因此不以其他模型替代；工作目錄沒有 Git，未建立或推送虛構分支。

主要推薦 Cloudflare Workers Free + D1 Free + PWA，配合免費 LINE 提醒與 Google Drive 備份，在文件列出的用量及免費限制內持續服務費估 NT$0。必須移植 C# 計算與 SQL Server 儲存層，不能把這當成零工作搬家。免費 CPU 限制、實際容量、備份還原與 iPhone 登入都列為實作前驗證條件，未宣稱已測量通過。

備選 Railway Hobby + 原 C# 改 SQLite，可保留較多程式；USD 5 是最低承諾費，資源超額另計，不保證台幣 200 元封頂。文件提供含主機、資料庫、網域、HTTPS、排程、登入、提醒、備份、超額與一次性改寫的比較。

正式來源未找到；已把證據明確限於診斷副本，正式移轉前需比對。此票結案的是方案研究與成本邊界，沒有完成部署驗證，也不代表使用者已選定推薦案。

