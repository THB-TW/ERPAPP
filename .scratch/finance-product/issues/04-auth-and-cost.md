# 查明登入方案與 NT$200／月可支撐的使用者規模

Type: research
Labels: wayfinder:research
Status: resolved

## Question

- 公開註冊的登入選項與費用：Sign in with Apple、Google、Email magic link／Passkey；代管（Clerk、Auth0、Supabase Auth、Firebase Auth、Better Auth 自架於 Workers）的免費門檻與台灣可用性。
- 以「每位活躍用戶每日 20 筆記帳、每日開 5 次、每月一次 CSV 匯入與月結」假設，Cloudflare Workers/D1/R2（備份）在 Free 與 Paid 方案下，NT$200／月約可支撐多少活躍用戶；超過後每百人邊際成本。
- 寄信（驗證信、月結提醒）在 Cloudflare 生態的免費／低價選項。
附官方價目連結與查證日期，換算 NT$ 寫明假設匯率；明確區分估算與實測。

## Answer

建議在 Worker 上自架 Better Auth，提供 Apple、Google 與 Email magic link 登入；備案 Clerk Hobby（50,000 MRU 免費）。Free 方案受 D1 單庫 500MB 限制，約 70 位活躍用戶；Workers Paid（US$5）約 900 人且在 NT$200 內；之後每多 100 人約 NT$36／月。全部是估算，CPU 與寫入列數待實測。

詳見[研究文件](../research/04-auth-and-cost.md)（查證日期 2026-11-08）。
