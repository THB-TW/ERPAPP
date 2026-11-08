# 在真實 Cloudflare Worker 量測記帳與預算的 CPU 和 D1 用量

Type: task
Labels: wayfinder:task
Status: open

## Question

在真實的 Workers＋D1（不是本機 SQLite）部署 `cloudflare/` 雛形，用假資料（不得用私人舊帳）量測記帳、即時預算查詢與月結試算每次請求的 CPU 時間與 D1 讀寫列數。結果決定第一版能不能留在 Workers Free（每次 10ms CPU），還是一開始就要 Workers Paid（US$5／月）。需要翰陞建立或提供 Cloudflare 帳號（HITL）；完成後記錄量測數字與部署網址。
