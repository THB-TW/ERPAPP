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
