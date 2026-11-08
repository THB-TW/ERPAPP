# 決定 58 個月舊帳月結的驗收方法

Type: grilling
Labels: wayfinder:grilling
Status: open
Blocked by: 18-local-first-stack

## Question

新引擎怎麼證明和舊系統一致？比對哪些數字（每月當月盈餘、可用餘額、總儲備金、學費儲備、帳面總資產、各分類儲備、上限快照、前期更正）、容許誤差（應為 0）、比對資料從哪來（`docs/cloudflare/baseline.md` 的私人匯出，由翰陞提供，不進 Git）？是把 `BudgetEngine.cs` 移植成 TS 後跑同一批案例，還是新舊並行一段時間？驗收通過的簽核方式。
