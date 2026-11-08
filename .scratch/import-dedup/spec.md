# 匯入去重收斂：三份實作 → 一個 seam

Status: ready-for-agent

## 動機

數量式去重（鍵 → 既有數量 → 逐筆累計 → 累計 > 既有才新增）在
`CsvImportService.ImportTransactions`、`CsvImportService.ImportCreditcard`、`CreditcardArchive.Append`
各寫一份；信用卡的重複判定鍵定義兩次。零 locality。
（來源：2026-09-03 架構審查候選 5；grilling 決定於 2026-09-09。）

## 決定（grilling 結果，不再重談）

1. seam ＝ **匯入目的地**（CONTEXT.md「## 匯入」）：一個 interface、三個真實 adapter
   （交易資料表、信用卡資料表、信用卡存檔 creditcard.csv）。流程與去重只寫一次。
   `CsvImportService` 對外 interface 不變（兩個方法、`ImportResult` 形狀），controller／精靈 JS 不動。
2. 重複判定鍵不變：交易＝日期｜類別｜金額；信用卡＝日期｜店家｜金額。
3. `../import_data.py` 原地不動。
4. 各目的地獨立成敗、互不回滾；存檔失敗只回報 `ArchiveMessage`，DB 結果不受影響。
5. 排序政策照舊：交易依日期穩定排序後寫入；信用卡維持檔案順序。
6. 不開測試專案。驗證＝scratchpad 的 SQLite in-memory harness，重構前後輸出必須一字不差
   （`sqlitespike/before.txt` vs `after.txt`）。

## 採用的 interface（design-it-twice 三案評審後的 hybrid）

骨架取「宣告式」案（來源宣告＋`ImportRun.Execute`＋三個 adapter 各一檔），
再加「最小」案的兩個行為保持細節：`ArchiveMessage` 前綴維持字面 `creditcard.csv 存檔寫入失敗：`；
存檔 adapter 以工廠延遲到 primary 寫完後、try 之內才建立（`GetFullPath`／Big5 取得時序與舊碼相同）。
死成員 `Name` 不進 seam；存檔型目的地另以 `IArchiveDestination<TRow>.FilePath` 回報路徑。

```
Services/Import/IImportDestination.cs   IImportDestination<TRow> { ReadExisting(min,max); Write(rows) }
                                        IArchiveDestination<TRow> : IImportDestination<TRow> { FilePath }
Services/Import/ImportSource.cs         ImportSource<TRow>(Parse, Key, Date, SortByDate)；ImportSources.TransactionCsv / CreditcardCsv
Services/Import/ImportRun.cs            Execute(source, stream, encoding, primary, archive?)；QuantityDedup（唯一實作）
Services/Import/TransactionTable.cs     EF AddRange + SaveChanges
Services/Import/CreditcardTable.cs      raw SQL + BeginTransaction（creditcard 無主鍵）
Services/Import/CreditcardCsvArchive.cs FromConfig 路徑規則、Big5、讀全檔、檔尾補換行、FormatLine
Services/CsvImportService.cs            兩個方法各縮成一次 Execute 呼叫
Services/CreditcardArchive.cs           刪除
```

## 已知取捨

- `ImportRun` 內的存檔失敗訊息前綴是常數 `creditcard.csv`（目前唯一的存檔）。
  若日後有第二個存檔，具名槽 primary/archive 與 `ImportResult` 的一組 `Archived*` 欄位都要一起擴。
- 信用卡列型別由 tuple 改為 EF 的 `Creditcard`（`Item` 可為 null，鍵插值與舊碼的 `""` 相同）。

## 驗證

1. `dotnet build` 零錯誤。
2. `scratchpad/sqlitespike` 跑 `dotnet run`，輸出與 `before.txt` diff 為空。
3. 對抗式審查（行為保持／seam／標準三個鏡頭）。

## 實作後審查（2026-09-09，sonnet 子代理）

- 行為保持鏡頭：0 項；spec 相符鏡頭：0 項（含重跑 harness 確認 before/after 相同）。
- 標準鏡頭 2 項 → 反方 3 人各投：
  - `QuantityDedup` public 但只有 `Execute` 呼叫 → 2:1 成立 → **已改 private**。
  - `ArchiveFailurePrefix` 常數寫死 `creditcard.csv` → 3:0 推翻（即上方「已知取捨」）。
- 修後重建 0 錯誤、harness diff 仍為空。
