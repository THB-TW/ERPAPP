# 確認正式來源並建立可驗證的完整舊帳基準

Status: completed
Assignee: Codex

## Scope

確認正式專案、資料庫與外部檔案；一致性備份；保留歷史與現有功能；建立可重跑、無正式資料寫入的移轉驗證工具。

## Result

見 [基準與驗證紀錄](../../../docs/cloudflare/baseline.md)。正式來源已找到，獨立分支與唯讀副本建立完成。所有私人資料留在 `.private/`，未上傳雲端。

## Validation

- 原生備份 COPY_ONLY/CHECKSUM、VERIFYONLY、還原及 CHECKDB 通過。
- 58 個歷史月份資產一致。
- 16 張表共 7,823 列，來源與 D1 相容 SQL 重播全欄位一致；雲端資料排除舊密碼。
- 原有十組純計算案例及搬移工具四項測試通過。
- 原正式專案 tracked 檔案與 ERPDB 資料筆數、財務版本保持不變。
