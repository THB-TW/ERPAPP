using ERPAPP.Models;

namespace ERPAPP.Services.Import;

// 匯入來源：一種 CSV 格式 ↔ 一種列型別。
// 重複判定鍵與排序政策隨「列型別」而變、不隨目的地而變，所以住在來源。
public sealed record ImportSource<TRow>(
    // 讀整個 reader，逐「資料紀錄」產出：解析成功 → 列；解析失敗 → null（ImportRun 計入 ErrorRows）。
    // 空白紀錄與標題列不產出（不計入 TotalRows）。引號內換行由 CsvParsing.ReadCsvRecords 併成一筆。
    // 產出順序 = 檔案順序。串流／解碼例外往外丟。
    // 信用卡的繳款列（負數）不產出、不計數；三欄檔遇到形狀不符的列丟 InvalidDataException
    // （整份檔不寫入任何匯入目的地）。
    Func<TextReader, IEnumerable<TRow?>> Parse,
    // 重複判定鍵 (Dedup Key)：同鍵 ⇔ 同一筆。
    Func<TRow, string> Key,
    // 用來算 [min,max] 視窗與排序。
    Func<TRow, DateTime> Date,
    // true：去重／寫入前先依 Date 由舊到新「穩定」排序；false：維持檔案順序。
    bool SortByDate) where TRow : class;

public static class ImportSources
{
    private const int BankHeaderSearchLimit = 10; // 銀行原始匯出檔的標題列前只有兩行說明，前 10 筆內找不到就當三欄檔

    // 記帳 CSV：自動偵測「天天記帳」12 欄標題列 / 已轉換 6 欄檔（解析在 CsvParsing，這裡只接線）。
    // 鍵＝日期｜類別｜金額，刻意不含帳戶／收支／成員（沿用 import_data.py；改鍵是另一個決定，見 CONTEXT.md）。
    // 排序：插入後 Id 亦為時間序（與 data.csv 一致）。
    public static readonly ImportSource<Transaction> TransactionCsv = new(
        Parse: ParseTransactions,
        Key: t => $"{t.Date:yyyyMMdd}|{t.Category}|{t.Amount}",
        Date: t => t.Date,
        SortByDate: true);

    // 信用卡 CSV：自動偵測銀行「帳單明細查詢」原始匯出檔（標題列前可有說明行，取 消費日／摘要／新臺幣金額）／已轉換的三欄檔（日期,店家,金額）。
    // 鍵＝日期｜店家｜金額。維持檔案順序。
    public static readonly ImportSource<Creditcard> CreditcardCsv = new(
        Parse: ParseCreditcard,
        Key: c => $"{c.Date:yyyyMMdd}|{c.Item}|{c.Amount}",
        Date: c => c.Date,
        SortByDate: false);

    private static IEnumerable<Transaction?> ParseTransactions(TextReader reader)
    {
        CsvParsing.TxHeaderMap? map = null;
        bool first = true;
        // ReadCsvRecords：引號內含換行的多行備註會併成一筆完整紀錄
        foreach (var line in CsvParsing.ReadCsvRecords(reader))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;

            // 第一個非空白紀錄：若是「天天記帳」標題列則記下欄位對應（標題本身不算資料列）
            if (first)
            {
                first = false;
                map = CsvParsing.TryParseTransactionHeader(line);
                if (map != null) continue;
            }

            yield return map != null
                ? CsvParsing.ParseTransactionLine(line, map)
                : CsvParsing.ParseTransactionLine(line);
        }
    }

    // 先物化所有非空白紀錄，才能在前 BankHeaderSearchLimit 筆內找銀行原始匯出檔的標題列。
    // 銀行模式：標題列與其前的說明行不產出；三欄模式：每列先過形狀檢查，不合就整份拒收。
    // 兩種模式都略過負數的繳款列（不產出、不計數）。
    private static IEnumerable<Creditcard?> ParseCreditcard(TextReader reader)
    {
        var records = CsvParsing.ReadCsvRecords(reader).Where(l => !string.IsNullOrWhiteSpace(l)).ToList();

        int h = -1;
        CsvParsing.CcHeaderMap? map = null;
        for (int i = 0; i < Math.Min(records.Count, BankHeaderSearchLimit); i++)
        {
            map = CsvParsing.TryParseCreditcardHeader(records[i]);
            if (map != null) { h = i; break; }
        }

        if (map != null)
        {
            // 銀行模式
            for (int i = h + 1; i < records.Count; i++)
            {
                var cc = CsvParsing.ParseCreditcardLine(records[i], map);
                if (cc == null) { yield return null; continue; }
                if (cc.Value.Amount < 0) continue; // 繳款列：不寫入、不計數
                yield return ToCreditcard(cc.Value);
            }
        }
        else
        {
            // 三欄模式
            for (int n = 1; n <= records.Count; n++)
            {
                var line = records[n - 1];
                var cc = CsvParsing.ParseCreditcardLine(line);
                if (cc == null) { yield return null; continue; }

                var problem = CsvParsing.ThreeColumnShapeProblem(line);
                if (problem != null)
                    throw new InvalidDataException($"第 {n} 筆不是「日期,店家,金額」三欄格式：{problem}。整份檔未匯入。");

                if (cc.Value.Amount < 0) continue; // 繳款列：不寫入、不計數
                yield return ToCreditcard(cc.Value);
            }
        }
    }

    private static Creditcard ToCreditcard((DateTime Date, string Item, int Amount) cc) =>
        new() { Date = cc.Date, Item = cc.Item, Amount = cc.Amount };
}
