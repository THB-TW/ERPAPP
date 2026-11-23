# UI/UX Pro Max 與 Archify skills（內建副本）

## UI/UX Pro Max（`.claude/skills/ui-ux-pro-max/`）
- 來源：https://github.com/nextlevelbuilder/ui-ux-pro-max-skill（v2.15.0，commit `7e935ad`，2026-11-23 複製）
- 授權：MIT，全文見同資料夾 `UI-UX-PRO-MAX-LICENSE`（複製時須保留）。
- 內容：只收其 `.claude/skills/ui-ux-pro-max/`（SKILL.md、data、references、scripts）。上游同 repo 的 `design`、`brand`、`slides`、`design-system`、`ui-styling`、`banner-design` 未收（名稱太泛、易與其他 skill 衝突，且與本專案 iOS App 無關）。
- 使用：需要 `python3`。SKILL.md 內的 `${CLAUDE_PLUGIN_ROOT}` 在本 repo 沒有值，改在 repo 根目錄執行：`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<關鍵字>" --domain <ux|style|color|typography|chart|web>`。App 是 React Native，可加 `--stack react-native`。

## Archify（`.claude/skills/archify/`）
- 來源：https://github.com/tt-a1i/archify（skill 版本 3.3.0，commit `3ca198d`，2026-11-23 複製）
- 授權：**Apache-2.0**（`archify/LICENSE`、`archify/NOTICE`），舊版 MIT 條文在 `archify/LICENSE-MIT`、第三方聲明在 `archify/THIRD_PARTY_NOTICES.md`；複製時整包保留，不可刪。
- 內容：上游 repo 的 `archify/` 技能資料夾整包（約 25 MB，含 renderers、modules）。未收上游 repo 的文件、benchmarks、範例網站。
- 使用：需要 Node.js。產出放在工作目錄 `.archify/`（已加進 `.gitignore`，不入版控）。

## 共通
- 未修改原文（僅 `.gitignore` 加了 `bin/` 例外，因為原本會把 archify 的 `bin/` 擋掉）。
- 更新：重新 clone 上游，用同名資料夾覆蓋，並改上面的版本與 commit。
- 與 PR #48 的 Matt Pocock skills、自有 `chief-of-staff` skill 及 agent 分派表並行，無同名衝突。
