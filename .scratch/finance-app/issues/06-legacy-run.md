# 06 — 翰陞執行舊帳轉換與比對

**What to build:** 翰陞把 Windows 上 2026-11-08 的私人備份匯出複製到 Mac，照說明執行轉換與比對，回報摘要。這是驗收門檻的前兩項。

**Blocked by:** 05 58 個月比對工具與報告

**Status:** ready-for-human

**Owner:** `legacy-migration`（見 `docs/agents/team.md`）　**Spec:** [規格](../../finance-product/spec.md)

- [ ] 備份匯出已在 Mac 的私人位置，未進 Git
- [ ] 轉換成功產生帳本檔
- [ ] 比對結果為 58 個月 0 差異、17 個月歷史差異同額重現、交易與信用卡與投資總量相同；摘要已提交
- [ ] 重算差異報告已由翰陞看過；需要處理的差異另開票

## Comments

2026-11-11（票 04 完成後）：照 `docs/legacy-migration.md` 做。第一次成功後請回報摘要印出的「來源清冊 SHA-256」，補記進 `docs/cloudflare/baseline.md`。工具若停下（分類收支混用、不合規定的列、名稱只差大小寫），把清單回報，由翰陞決定，不手改匯出檔。信用卡、一卡通在 2026-10 月底的餘額要自己填（信用卡填未繳金額的負數）。
