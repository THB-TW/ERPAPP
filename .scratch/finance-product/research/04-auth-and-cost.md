# 04 登入方案與 NT$200／月可支撐的使用者規模

查證日期：2026-11-08
假設匯率：**US$1 = NT$33**（沿用 `mobile-finance-legacy/research.md` 的假設；非即時匯率，未含營業稅與刷卡手續費）。

## 查證狀態（先讀）

本次改用 curl（預設 User-Agent，經 proxy）讀取官方頁面；Cloudflare 文件取 `/index.md`，其餘 HTML 以 python3 -I 抽文字。結果：

| 網域 | 結果 |
|---|---|
| developers.cloudflare.com | 200，Workers 價目／限制、D1 價目／限制、R2、Email Service 全部已讀 |
| clerk.com、auth0.com、supabase.com、firebase.google.com | 200，價目頁已讀 |
| developer.apple.com | WebFetch 讀到年費頁與審核指南；client secret 頁只得標題 |
| www.better-auth.com | curl 與 WebFetch 皆失敗（proxy 對 CONNECT 回 403），**未讀到**；未嘗試繞過 |

標記：【官方・已讀】＝本次直接讀到官方頁面；【未查證】＝沒讀到官方頁面；【估算】＝本檔用假設算出。**沒有任何數字是實測。**

## 結論

1. **建議登入組合**：Better Auth 自架在同一個 Worker＋D1（無每 MAU 費用；Better Auth 本身的說明【未查證】），登入方式 Sign in with Apple＋Google＋Email magic link，Passkey 第二階段。不做密碼登入（密碼雜湊 CPU 風險；Cloudflare 指出含驗證的 Worker 通常 10–20 ms／請求【官方・已讀】，而 Free 上限 10 ms）。**App Store Guideline 4.8【官方・已讀】：用 Google 等第三方登入建立主要帳號時，必須同時提供等效選項（僅蒐集姓名與 email、可隱藏 email、不為廣告追蹤）；Sign in with Apple 符合，因此 iOS 上 Apple 登入不是可選項。** 備案：Clerk Hobby 免費至 50,000 MRU【官方・已讀】，零維運，身分資料在第三方。
2. **NT$200／月可支撐的活躍用戶**（【估算】，額度本身為【官方・已讀】）：
   - **Workers Free**：**約 70 人**（第一年資料量）。瓶頸是 **D1 Free 單一資料庫上限 500 MB**【官方・已讀】（前次檔案漏了這條）：500 ÷ 7 MB ≈ 71 人。若分片到 Free 的 10 個資料庫（總 5 GB）才可到約 650 人（D1 每日寫入 100,000 列為下一個瓶頸），尖峰 2 倍約 325 人，但分片會讓月結與 CSV 的交易寫入變複雜。Free 不能用 Cloudflare 外寄信。費用 NT$0。
   - **Workers Paid**（US$5 = NT$165，餘裕 NT$35）：約 **900 人**（第一年資料量；瓶頸 D1 儲存）。900 人約 6.3 GB，低於 Paid 單庫 10 GB 上限【官方・已讀】；資料逐年累積，人數逐年下降。
3. **每增加 100 位活躍用戶邊際成本**（Paid、超出內含後）：約 **NT$36／月**（儲存 17.3、寫入 14.9、寄信 2.3、請求 1.1、CPU 0.4、讀取 0.1）。
4. **最大不確定性**：每請求 CPU 與 D1 寫入列數是假設，需實測（`wrangler tail`、D1 `meta.rows_written`）；Better Auth 官方文件未讀到。

## 使用模型與算式（【估算】）

每位活躍用戶、每月 30 天：

| 項目 | 算式 | 結果 |
|---|---|---|
| 請求數 | 記帳 20×30 = 600；開 App 5 次×3 請求×30 = 450；CSV 匯入＋月結約 10；合計 1,060 | 取 **1,100/月**（36.7/日） |
| D1 寫入列 | 每筆約 5 列（1 資料＋3 索引＋1 彙總）×600 = 3,000；CSV 300 筆×4 = 1,200；月結與 session 約 300；合計 4,500 | **4,500/月**（150/日） |
| D1 讀取列 | 開 App 100×5×30 = 15,000；記帳檢查 5×600 = 3,000；月結掃描 2,000；CSV 去重 3,000；合計 23,000 | 取 **25,000/月**（833/日） |
| CPU | 5 ms×1,100 = 5,500，加月結／匯入 500 | **6,000 ms/月** |
| 儲存 | 1 KB×600 = 0.6 MB/月 | **7 MB／人／年** |
| 寄信 | 驗證／magic link 1＋月結提醒 1 | **2 封/月** |

索引多寫一列的計法、列大小不影響計數、讀列為掃描列數：D1 價目頁定義【官方・已讀】，支持「每筆約 5 列」的方向，但 5 這個數字仍是假設。

### Free 方案（額度【官方・已讀】：Workers 100,000 請求/日、10 ms CPU／次；D1 讀 5,000,000 列/日、寫 100,000 列/日、儲存總計 5 GB、單庫 500 MB、最多 10 個庫）
- 儲存（單庫）：500 ÷ 7 = **71 人**（瓶頸）
- 儲存（10 庫分片）：5,000 ÷ 7 = 714 人
- D1 寫入：100,000 ÷ 150 = 667 人
- 請求：100,000 ÷ 36.7 = 2,727 人
- D1 讀取：5,000,000 ÷ 833 = 6,000 人
- 結論：單庫約 70 人；分片後約 650 人，尖峰 2 倍：650 ÷ 2 = 325 人。超額時 D1 當日拒絕查詢，不加收費用。

### Paid 方案（額度【官方・已讀】：US$5 基本費；10M 請求含、超出 US$0.30/百萬；30M CPU ms 含、超出 US$0.02/百萬 ms；D1 讀 25B 列含、超出 US$0.001/百萬；寫 50M 列含、超出 US$1.00/百萬；儲存 5 GB 含、超出 US$0.75/GB-月；Email 3,000 封含、超出 US$0.35/千封）
- 請求：10,000,000 ÷ 1,100 = 9,090 人
- CPU：30,000,000 ÷ 6,000 = 5,000 人（若每請求 15 ms：1,100×15 + 500 = 17,000 ms，30,000,000 ÷ 17,000 ≈ 1,765 人，仍高於 900）
- D1 寫入：50,000,000 ÷ 4,500 = 11,111 人
- 寄信：3,000 ÷ 2 = 1,500 人
- 儲存：5,000 ÷ 7 = 714 人
- 預算：5×33 = NT$165；200 − 165 = NT$35；35 ÷ (0.75×33 = 24.75) = 1.41 GB；1,414 ÷ 7 ≈ 202 人；714 + 202 ≈ **900 人**。未計稅、刷卡費、R2 備份，實際更少。

### 每 100 人邊際成本（匯率 33）
| 項目 | 算式 | NT$/月 |
|---|---|---:|
| 請求 | 110,000 ÷ 1M × 0.30 × 33 | 1.1 |
| CPU | 600,000 ÷ 1M × 0.02 × 33 | 0.4 |
| D1 寫入 | 450,000 ÷ 1M × 1.00 × 33 | 14.9 |
| D1 讀取 | 2,500,000 ÷ 1M × 0.001 × 33 | 0.1 |
| D1 儲存（第一年） | 0.7 GB × 0.75 × 33 | 17.3 |
| 寄信 | 200 ÷ 1,000 × 0.35 × 33 | 2.3 |
| **合計** | | **約 36** |

各項只在超出各自內含額度後才收費；內含額度內邊際只有儲存。

## 登入方案比較

| 方案 | 免費門檻／費用 | 狀態 | 來源 |
|---|---|---|---|
| Better Auth（自架 Workers＋D1） | 開源、無每 MAU 費、耗用自己的 Workers／D1 | 【未查證】官方站無法連線 | https://www.better-auth.com/ |
| Clerk | Hobby 免費，50,000 MRU／app；Pro 每月 US$20（年繳）含 50,000 MRU，50,001–100,000 每人 US$0.02／月、之後遞減；MRU＝註冊 24 小時後回訪者；Hobby 含自訂網域 | 【官方・已讀】（月繳價未顯示） | https://clerk.com/pricing |
| Auth0 | Free 至 25,000 MAU；Essentials US$35／月（頁面顯示 500 MAU 檔位）；Professional 同頁，另有 Enterprise 客製 | 【官方・已讀】（Essentials 在較高 MAU 的價格頁面未顯示，未查證） | https://auth0.com/pricing |
| Supabase Auth | Free 50,000 MAU，Free 專案閒置 1 週暫停、最多 2 個活躍專案；Pro 自 US$25／月含 100,000 MAU，超出 US$0.00325／MAU | 【官方・已讀】 | https://supabase.com/pricing |
| Firebase Auth | 一般登入（Identity Platform）無費用至 50K MAU，超出「依 Google Cloud 定價」（頁面未列單價）；SAML/OIDC 50 MAU；電話登入依簡訊計費 | 【官方・已讀】；超額單價與是否強制 Blaze【未查證】（前次的 US$0.0055 未能在此頁重現） | https://firebase.google.com/pricing |
| Sign in with Apple | 無每次登入費；Apple Developer Program US$99／會員年（或當地幣別等值），符合資格的非營利、教育、政府可免費 | 【官方・已讀】 | https://developer.apple.com/programs/whats-included/ 、https://developer.apple.com/app-store/review/guidelines/ |
| Google 登入 | 費用與條款 | 【未查證】 | — |
| Email magic link | 本身免費；寄信見下 | — | — |
| Passkey | Better Auth 1.4 起拆為 `@better-auth/passkey` | 【未查證】 | https://www.better-auth.com/blog/1-4 |

台灣可用性：各服務及 Apple 在台灣的可用性本次**皆未查證**（各價目頁未載明地區限制）。

## 細節

### Cloudflare Workers【官方・已讀】
- Free：100,000 請求／日、每次 10 ms CPU；Standard：10M 請求含，超出 US$0.30/百萬；30M CPU ms 含，超出 US$0.02/百萬；不計時間長度與 egress；基本費最低 US$5／月。子請求不計費；靜態資源請求免費。來源：https://developers.cloudflare.com/workers/platform/pricing/ （頁面更新 2026-10-02）、https://developers.cloudflare.com/workers/platform/limits/ 。
- 限制頁指出平均 Worker 約 2.2 ms／請求，含驗證、SSR 或解析大型 payload 的約 10–20 ms；Free 子請求 50／請求。這與本檔 5 ms 假設的差距見 Paid CPU 敏感度。

### Cloudflare D1【官方・已讀】
- 讀／寫／儲存額度與單價如上；Free 資料庫上限 10 個，Paid 內含 100,000 個，超出每個 US$0.10／月。單庫上限 **10 GB（Paid）／500 MB（Free）**，10 GB 不可提高。Free 超額後查詢被拒；儲存滿需刪資料才能再寫入。無 egress 費。索引使寫入多一列。來源：https://developers.cloudflare.com/d1/platform/pricing/ （更新 2026-10-30）、https://developers.cloudflare.com/d1/platform/limits/ 。

### R2（備份）【官方・已讀】
- Standard：US$0.015／GB-月；Class A US$4.50／百萬；Class B US$0.36／百萬；egress 免費；免費額度每月 10 GB-月、100 萬 Class A、1,000 萬 Class B。來源：https://developers.cloudflare.com/r2/pricing/ 。
- 備份未納入 900 人算式：900 人一年約 6.3 GB（【估算】）；保留 3 份約 19 GB，超出 10 GB 免費的 9 GB × 0.015 × 33 ≈ NT$4.5／月；保留 8 份約 50 GB 則 40 × 0.015 × 33 ≈ NT$20／月（均【估算】）。D1 備份亦可考慮 Time Travel（本次未讀）。

### 寄信【官方・已讀】
- Email Service 外寄：Free「不可用」；Paid 含每月 3,000 封，超出 US$0.35／千封；寄到帳號內已驗證目的地信箱免費且不計額度；被 API 邊界拒絕（含抑制名單）的不計額度；Email Routing（收信）兩方案皆不限量。來源：https://developers.cloudflare.com/email-service/platform/pricing/ （更新 2026-06-09）。頁面未再標示 beta（前次稱 beta，本次未見，不下結論）。
- 影響：Free 起步若要 magic link 或月結提醒，需第三方寄信（未查）或以 Apple／Google 登入為主。

### Apple
- 年費與 Sign in with Apple 列為會員服務【官方・已讀】。US$99 × 33 = NT$3,267／年 ≈ NT$272／月（【估算】）——已超過 NT$200 預算，但上架 iOS App 本來就需會員資格，不應算作登入邊際成本。
- Guideline 4.8 要點見結論【官方・已讀】（該頁後 14,428 字元未讀，例外條款以已讀部分為準：僅用自家帳號系統、企業／教育登入等可免）。
- client secret 為 ES256 JWT、上限約 6 個月：WebFetch 回覆自稱是模型知識，**【未查證】**（https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret ）。

### Better Auth
- 官方站無法連線，下列均【未查證】：Apple／Google／magic link／passkey 設定、D1 支援。前次引述的第三方 PR（https://github.com/bowenlabs/louise-toolkit/pull/773 ）稱舊版 OAuth state 可被當 magic link token，修正在 1.7.7；本次未對照官方公告，實作時須查官方並固定新版。

## 估算與實測

- 實測：無。
- 估算：全部人數、成本、CPU、rows_written、儲存、備份大小、Apple 月均攤。
- 官方已讀：Cloudflare 各價目與限制、Clerk／Auth0／Supabase／Firebase 價目頁、Apple 年費與 4.8。

## 與前次版本的更正

1. Free 方案支撐人數由約 650／325 人更正為單庫約 70 人（D1 Free 單庫 500 MB），分片 10 庫才回到約 650／325。
2. Clerk Pro 為 US$20／月年繳（前次 US$25）。
3. Auth0 Essentials US$35 由「疑」改為頁面確認（500 MAU 檔位）。
4. Firebase 超額單價 US$0.0055 未能在官方頁重現，改標未查證。
5. Email Service 頁面本次未見 beta 標示。

## 仍未查證

1. Better Auth 官方文件（proxy 403，需確認網域是否真的在允許清單）。
2. Apple client secret 有效期官方頁面；Developer Program 台幣年費與台灣可用性。
3. Google 登入條款；Clerk、Auth0、Supabase、Firebase、Google 在台灣可用性。
4. Firebase 超額單價與是否強制 Blaze；Auth0 較高 MAU 檔位的實價；Clerk 月繳價。
5. 實測每請求 CPU、每筆 `rows_written`、每開 App `rows_read`。
6. 備份保留策略（含 D1 Time Travel）與 Free 起步時的第三方寄信。
