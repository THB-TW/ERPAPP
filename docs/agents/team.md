# 專案長期 agent 團隊

定義檔在 `.claude/agents/`，每個都固定 `model: sonnet`。入口是 `/chief-of-staff`（`.claude/skills/chief-of-staff/`）或直接派給下表的 agent。

| Agent | 負責 | 何時找它 |
|---|---|---|
| `chief-of-staff` | 幕僚長：分派、拆票、彙整、維護本名冊與決策地圖 | 跨模組或不知道找誰 |
| `ledger-entry` | 記帳月曆、當天帳目、新增交易、明細圓餅圖 | 記帳畫面、交易／分類資料 |
| `budget-reserve` | 預算三組、儲備、可用餘額、貸款／分期、預算頁跳轉列 | 預算計算或預算頁 |
| `monthly-close` | 月結精靈：信用卡核對、收入帶入、自動計算、總資產核對 | 月結流程與月結數字 |
| `investment` | 台股個股＋虛擬貨幣桶、兩個成本數字、手動市值 | 投資頁與投資計算 |
| `import-export-backup` | CSV 匯入（含天天記帳）、匯出、SQLite 備份與還原 | 匯入規則、去重、備份 |
| `local-notifications` | 本機通知（記帳、月結、備份提醒） | 任何提醒 |
| `subscription-iap` | 訂閱、StoreKit 2、試用、到期、付費牆 | 訂閱與權益 |
| `legacy-migration` | 舊帳轉換程式、58 個月 0 元誤差驗收、舊系統退役 | 舊帳與驗收 |
| `marketing-pricing` | 行銷／定價：方案切分、月費年費、試用、到期、優惠代碼、競品定價、抽成後實收、上架文案草稿 | 收多少錢、哪些功能收費、怎麼讓人付費 |
| `tw-legal-tax-counsel` | 台灣稅務、營業登記、公司設立、App Store 審查、個資／消保法、上架文字 | 稅務法規與任何對外文字 |

## 固定交叉審核

- 稅務、法規、App Store 文案、審查備註、隱私權政策、服務條款、付費牆 → `tw-legal-tax-counsel`
- 影響八項月結數字或交易／信用卡／投資總量 → `legacy-migration`
- 訂閱方案、價格、試用、付費功能切分 → `marketing-pricing` 提案，`subscription-iap` 落實，文字再交 `tw-legal-tax-counsel`
- 備份檔格式變更 → `import-export-backup` 與 `legacy-migration` 同時確認

## 注意

- `tw-legal-tax-counsel` 不是執業律師或會計師；它的結論附出處與「要問會計師的問題清單」，上線前仍由真人專業確認。
- `.claude/agents/` 的定義在 Claude Code 啟動時載入；新加的 agent 要開新 session 才會出現在 agent 清單。
