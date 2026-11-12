# 上架文件草稿（未定案）

狀態：**草稿**。2026-11-11 起草，所有文字待翰陞定案；法律與稅務部分在上架前須給執業律師／會計師核對（專案內的 `tw-legal-tax-counsel` 是 AI agent，不是律師或會計師）。

| 檔案 | 內容 | 上架時放哪裡 |
|---|---|---|
| [privacy-policy.md](privacy-policy.md) | 隱私權政策 | 公開網址（App Store Connect「隱私權政策網址」）＋App 設定頁連結 |
| [terms-of-use.md](terms-of-use.md) | 使用條款（Apple 標準 EULA＋補充條款） | 公開網址＋App 設定頁、付費牆連結；App Store Connect「授權合約」可留 Apple 標準 EULA |
| [subscription-disclosure.md](subscription-disclosure.md) | 付費牆、設定頁訂閱說明、試用到期提示 | App 內（票 22） |
| [review-notes.md](review-notes.md) | App 審查備註（中英） | App Store Connect「App 審查資訊 > 備註」 |
| [store-listing.md](store-listing.md) | 名稱、副標題、宣傳文字、描述、關鍵字、隱私標籤建議 | App Store Connect「App 資訊」「版本資訊」「App 隱私」 |
| [app-name-candidates.md](app-name-candidates.md) | App 名稱候選清單，給翰陞挑 | — |

審查紀錄：
- 法規審：`.scratch/finance-product/research/launch-docs-legal-review.md`
- 行銷審：`.scratch/finance-product/research/launch-docs-marketing-review.md`

## 填空符號

| 符號 | 意思 | 何時能填 |
|---|---|---|
| ~~〈App 名稱〉~~ | 已全部換成 Afterbills（2026-11-12 定案） | — |
| 〈開發者姓名〉 | 個人賣家法定姓名（App Store 會公開顯示） | 申請 Apple Developer Program 時（票 02） |
| 〈聯絡 Email〉 | 客服信箱（建議另開專用信箱，不用私人信箱） | 翰陞決定 |
| 〈網址〉 | 隱私權政策、使用條款、支援頁的公開網址 | 決定放哪裡後（見下） |
| 〈生效日〉 | 文件生效日 | 上架前 |
| {月價}／{年價} | 由 StoreKit `displayPrice` 帶入，App 內不寫死 | 實作時 |

## 還沒決定、上架前要處理

1. **公開網址**：已定另開一個公開 GitHub repo 用 GitHub Pages 放隱私權政策、條款、支援頁（2026-11-12）；repo 名稱建議 afterbills（網址會是 <GitHub 帳號>.github.io/afterbills），待建。
2. **客服信箱**：建議另開一個專用信箱。
3. **管轄法院、退款句、含稅價字樣、責任上限金額、公開地址**：等翰陞決定與律師／會計師回覆（Q 清單與問題清單見法規審）。
4. **商標檢索**：名稱定案後到智慧局商標檢索系統查一次。
5. 首版不支援 iPad（2026-11-12 定案），`app.json` 已改 `supportsTablet: false`，不用交 iPad 截圖。

## 待翰陞決定（法規審＋行銷審合併，各附建議）

2026-11-12 翰陞回「都照建議」，12 題全部定案。細節與理由見兩份審查報告。

| # | 題目 | 建議 |
|---|---|---|
| 1 | App 名稱 | **已定（2026-11-12）：Afterbills**，商店名稱「Afterbills－預算記帳」。定案前請在 iPhone 的 App Store 搜一次，並到智慧局商標檢索查第 9、36、42 類 |
| 2 | 副標題 | **已定（2026-11-12）**：「清楚知道什麼可以花，什麼買不了」；定位原話放描述第一行與第一張截圖 |
| 3 | 隱私權政策、條款、支援頁放哪 | **已定（2026-11-12）**：另開一個公開 GitHub repo，用 GitHub Pages |
| 4 | 客服信箱與保存期間 | **已定（2026-11-12，照建議）**：另開專用信箱；來信保存 2 年 |
| 5 | 條款責任上限 | **已定（2026-11-12，照建議）**：加下限：「已付金額與新臺幣 1,000 元取較高者」 |
| 6 | 價格寫不寫「含稅」 | **已定（2026-11-12，照建議）**：先不寫，等會計師確認 |
| 7 | 「預算資料匯出」的名稱 | **已定（2026-11-12，照建議）**：改成「預算表匯出（CSV）」並在付費牆旁一行說明內容（文件已改；App 內按鈕字樣與付費牆說明屬票 22，待改） |
| 8 | 條款要不要公開地址 | **已定（2026-11-12，照建議）**：首版只公開 Email，請律師確認是否足夠；若要地址，等設公司後用公司地址 |
| 9 | iPad | **已定（2026-11-12）**：首版不支援，`app.json` 已改 `supportsTablet: false` |
| 10 | 內購做法 | **已定（2026-11-12，照建議）**：Apple 原生 StoreKit，不用 RevenueCat 等第三方（否則隱私標籤要改） |
| 11 | 描述要不要寫「備份檔未加密，請妥善保管」 | **已定（2026-11-12，照建議）**：要，放在「資料在你手上」段 |
| 12 | 關鍵字、截圖、宣傳文字 | **已定（2026-11-12，照建議）**：關鍵字不放台股／虛擬貨幣；截圖 6 張（含搬家一張）；宣傳文字不提試用 |

不需決定但要知道：審查指南 3.2.1(viii) 提到「money management」，記帳 App 仍可能被要求以法人身分送審；照票 17 路線先以個人送審，被退再設公司。
