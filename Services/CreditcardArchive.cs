using System.Text;

namespace ERPAPP.Services;

// 信用卡刷卡紀錄的 CSV 存檔（creditcard.csv）：
// 匯入帳單時同步把新紀錄補寫進檔案，讓資料庫之外也保有一份累積的刷卡紀錄 CSV。
// 與資料庫匯入相同採「數量式去重」，重複執行不會重複寫入。
public static class CreditcardArchive
{
    // 把 rows 中「存檔裡還沒有」的紀錄補寫到 path（維持傳入順序），回傳實際補寫筆數。
    public static int Append(string path, IReadOnlyList<(DateTime Date, string Item, int Amount)> rows, Encoding encoding)
    {
        if (rows.Count == 0) return 0;

        // 讀既有存檔，建立各紀錄的數量統計
        var existing = new Dictionary<string, int>();
        bool endsWithNewline = true;
        if (File.Exists(path))
        {
            using (var reader = new StreamReader(path, encoding))
            {
                foreach (var line in CsvParsing.ReadCsvRecords(reader))
                {
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    var cc = CsvParsing.ParseCreditcardLine(line);
                    if (cc == null) continue;
                    var k = Key(cc.Value.Date, cc.Value.Item, cc.Value.Amount);
                    existing[k] = existing.GetValueOrDefault(k, 0) + 1;
                }
            }

            // 檔尾若沒換行，補寫前先補一個，避免黏在最後一列
            var fi = new FileInfo(path);
            if (fi.Length > 0)
            {
                using var fs = File.OpenRead(path);
                fs.Seek(-1, SeekOrigin.End);
                endsWithNewline = fs.ReadByte() == '\n';
            }
        }

        // 保序的數量式去重：同一鍵前 E 筆視為已存在，之後的才補寫
        var encountered = new Dictionary<string, int>();
        var toAppend = new List<(DateTime Date, string Item, int Amount)>();
        foreach (var r in rows)
        {
            var k = Key(r.Date, r.Item, r.Amount);
            int have = existing.GetValueOrDefault(k, 0);
            int c = encountered.GetValueOrDefault(k, 0) + 1;
            encountered[k] = c;
            if (c > have) toAppend.Add(r);
        }
        if (toAppend.Count == 0) return 0;

        using var writer = new StreamWriter(path, append: true, encoding);
        if (!endsWithNewline) writer.WriteLine();
        foreach (var r in toAppend)
            writer.WriteLine(FormatLine(r.Date, r.Item, r.Amount));
        return toAppend.Count;
    }

    private static string Key(DateTime d, string item, int amt) => $"{d:yyyyMMdd}|{item}|{amt}";

    // 與既有 creditcard.csv 相同格式：yyyy/M/d,店家,金額（店家含逗號/引號/換行時以引號包住）
    public static string FormatLine(DateTime d, string item, int amount)
    {
        var it = item ?? "";
        if (it.Contains(',') || it.Contains('"') || it.Contains('\n'))
            it = "\"" + it.Replace("\"", "\"\"") + "\"";
        return $"{d.Year}/{d.Month}/{d.Day},{it},{amount}";
    }
}
