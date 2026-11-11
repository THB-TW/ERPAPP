# 02 — Apple 開發者帳號與開發版安裝

**What to build:** 翰陞能在自己的 iPhone 上打開票 01 的 App。需要本人申請 Apple Developer Program（個人身分，年費 US$99）與 Expo 帳號，並授權雲端建置。agent 準備好逐步操作清單與建置設定，翰陞照做。

**Blocked by:** 01 App 骨架：記一筆支出並在月曆看到

**Status:** ready-for-human

**Owner:** `chief-of-staff`（見 `docs/agents/team.md`）　**Spec:** [規格](../../finance-product/spec.md)

- [ ] 翰陞以個人身分加入 Apple Developer Program，並有 Expo 帳號
- [ ] 建置設定完成，能產出開發版並安裝到翰陞的 iPhone
- [ ] 憑證與金鑰不進 Git；放在哪裡寫在票的回覆裡
- [ ] 翰陞在 iPhone 上記一筆支出並在月曆看到

## Comments

2026-11-11 票 01 已完成，可以開始。注意：雲端容器連不到 `api.expo.dev`／`exp.host`，雲端建置（EAS）要嘛先在環境的網路設定放行這兩個網域，要嘛由翰陞在自己的 Mac 上執行建置指令。App 名稱、bundle identifier 要在這張票定下來。

2026-11-11 翰陞問「Apple Developer Program 一定要這麼快開通嗎」。查證後的結論（來源：Apple 會員資格比較頁、Expo「free vs paid」說明、Apple StoreKit 測試文件）：
- 不需要現在開通。Mac 模擬器不需要任何 Apple 帳號；用免費 Apple ID 經 Xcode 可裝到自己的 iPhone（每 7 天失效要重裝、最多 3 個 App、不能含內購）；EAS 雲端建置、TestFlight、真實訂閱商品、上架才需要付費帳號。
- 建議在票 23「新舊並行 2 個月」開始前才付費開通（並行期要每天記帳，不適合每週失效的安裝；審核要幾天）。
- 操作說明寫在 `docs/run-on-mac-and-iphone.md`（尚未在 Mac 實際照跑過）。這張票的前兩個勾選項改成分兩段完成：先用模擬器與免費 Apple ID，並行前再換付費帳號與正式的建置設定。
- 仍待翰陞決定：App 名稱與正式的 bundle identifier（免費簽章階段可先用暫時的）。
- 票 22 訂閱在付費帳號之前可先做：權益判斷、付費牆、試用規則，以及 Xcode 本機 StoreKit 設定檔的購買流程測試；免費簽章的實機版本不能含內購能力。
