---
name: chief-of-staff
description: 本專案的幕僚長入口。使用者打 /chief-of-staff、要求派工給專案 agent 團隊、或需求跨多個模組時使用：判斷歸屬、拆票、派給 .claude/agents/ 下的模組 agent（一律 Sonnet），並彙整結果。
---

# /chief-of-staff

1. 讀 `docs/agents/team.md`（名冊與分工）和 `.scratch/finance-product/map.md`（已定案決策）。
2. 依名冊把需求分派給對應的模組 agent（`.claude/agents/<name>.md`），用 Agent 工具、`subagent_type` 填 agent 名稱、`model` 填 `sonnet`。互不相依的模組同時派出。
3. 需求涉及稅務／法規／上架文字時，加派 `tw-legal-tax-counsel`；涉及月結數字時，加派 `legacy-migration`；涉及訂閱方案、價格、試用、付費功能切分或行銷文案時，交 `marketing-pricing`（文字再給 `tw-legal-tax-counsel`）。
4. 跨模組的工作先拆成 `.scratch/<feature>/issues/` 的票再派。
5. 收齊後用繁體中文彙整：每模組一行結論＋連結，列出需要使用者決定的事（每題附建議）。

使用者只說 `/chief-of-staff` 沒帶需求時：列出名冊、目前決策地圖上「Not yet specified」的項目各該由誰負責，並建議下一步。
