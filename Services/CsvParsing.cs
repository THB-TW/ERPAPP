using System.Globalization;
using System.Text;
using ERPAPP.Models;

namespace ERPAPP.Services;

// 純解析邏輯（無資料庫相依），方便獨立單元測試。
// 對應 import_data.py 的清洗做法：金額去除千分位逗號、日期容錯、可重複匯入。
public static class CsvParsing
{
    // 記帳 CSV 日期可能是 yyyy/M/d 或 yyyyMMdd；信用卡多為 yyyy/M/d。
    private static readonly string[] DateFormats =
        { "yyyy/M/d", "yyyy/MM/dd", "yyyy/M/dd", "yyyy/MM/d", "yyyyMMdd", "yyyy-M-d", "yyyy-MM-dd" };

    // 逗號分隔，支援雙引號包住的欄位（引號內的逗號不切分，例如 "1,580"）。
    public static List<string> SplitCsv(string line)
    {
        var result = new List<string>();
        var sb = new StringBuilder();
        bool inQuotes = false;
        for (int i = 0; i < line.Length; i++)
        {
            char c = line[i];
            if (c == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"') { sb.Append('"'); i++; } // "" -> "
                else inQuotes = !inQuotes;
            }
            else if (c == ',' && !inQuotes) { result.Add(sb.ToString()); sb.Clear(); }
            else sb.Append(c);
        }
        result.Add(sb.ToString());
        return result;
    }

    // 讀取「一筆完整 CSV 紀錄」：引號內的換行不結束紀錄（天天記帳的備註可含多行文字）。
    // 判斷方式：累計引號數為奇數表示引號未閉合，需併入下一實體行（"" 跳脫計為兩個，不影響奇偶）。
    public static IEnumerable<string> ReadCsvRecords(TextReader reader)
    {
        var sb = new StringBuilder();
        int quotes = 0;
        bool inRecord = false;
        string? line;
        while ((line = reader.ReadLine()) != null)
        {
            if (inRecord) sb.Append('\n');
            sb.Append(line);
            inRecord = true;
            foreach (var ch in line) if (ch == '"') quotes++;

            if (quotes % 2 == 0)
            {
                yield return sb.ToString();
                sb.Clear();
                quotes = 0;
                inRecord = false;
            }
        }
        if (inRecord) yield return sb.ToString(); // 引號未閉合的殘缺紀錄也吐出，由解析端判為錯誤列
    }

    public static bool TryParseDate(string s, out DateTime date) =>
        DateTime.TryParseExact(s.Trim(), DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out date);

    // 金額：移除千分位逗號與空白後轉整數（對齊 import_data.py 的 str.replace(',','')）。
    public static bool TryParseAmount(string s, out int amount) =>
        int.TryParse(s.Replace(",", "").Replace(" ", "").Trim(),
            NumberStyles.Integer, CultureInfo.InvariantCulture, out amount);

    // 欄位去除逗號/空白後是否為純數字（用來從右側辨識被逗號拆開的金額）。
    private static bool IsAmountField(string s)
    {
        var t = s.Replace(",", "").Replace(" ", "").Trim();
        return t.Length > 0 && t.All(char.IsDigit);
    }

    // 帶正負號的數字群組（例如未加引號的負數金額 "-1,580" 會被切成 ["-1","580"]，
    // 最高位群組 "-1" 需允許前導符號才能正確還原）。
    private static bool IsSignedAmountField(string s)
    {
        var t = s.Replace(",", "").Replace(" ", "").Trim();
        return t.Length > 1 && (t[0] == '-' || t[0] == '+') && t.Substring(1).All(char.IsDigit);
    }

    // 「天天記帳」原始匯出檔的標題列欄位對應。
    // 原始格式：日期,類別,大類別,金額,幣別,成員,帳戶,標籤,備註,收支區分,上次更新,UUID
    // 只取 Transactions 需要的六欄，其餘（大類別/幣別/標籤/備註/上次更新/UUID）忽略。
    public sealed class TxHeaderMap
    {
        public int Date;
        public int Category;
        public int Amount;
        public int Member;
        public int Account;
        public int TypeFromRight; // 收支區分「距列尾」的偏移：備註含逗號使欄位增多時仍能從右錨定
        public int MinColumns;    // 標題列的欄位數（資料列至少要有這麼多欄）
    }

    // 判斷此列是否為「天天記帳」標題列；是則回傳欄位對應，否則回傳 null。
    public static TxHeaderMap? TryParseTransactionHeader(string rawLine)
    {
        if (string.IsNullOrWhiteSpace(rawLine)) return null;
        var parts = SplitCsv(rawLine.Trim().TrimStart('﻿')).Select(p => p.Trim()).ToList();

        int date = parts.IndexOf("日期");
        int cat = parts.IndexOf("類別");
        int amt = parts.IndexOf("金額");
        int mem = parts.IndexOf("成員");
        int acc = parts.IndexOf("帳戶");
        int type = parts.FindIndex(p => p == "收支區分" || p == "收支");
        if (date < 0 || cat < 0 || amt < 0 || mem < 0 || acc < 0 || type < 0) return null;

        return new TxHeaderMap
        {
            Date = date,
            Category = cat,
            Amount = amt,
            Member = mem,
            Account = acc,
            TypeFromRight = parts.Count - type,
            MinColumns = parts.Count
        };
    }

    // 依標題對應解析「天天記帳」原始資料列。
    // 備註若含未加引號的逗號會使欄位數 > MinColumns：所需欄位中 日期/類別/金額/成員/帳戶
    // 都在備註左側（左側索引不受影響），收支區分在備註右側（改由列尾倒數錨定），故仍可正確取值。
    public static Transaction? ParseTransactionLine(string rawLine, TxHeaderMap map)
    {
        if (string.IsNullOrWhiteSpace(rawLine)) return null;
        var parts = SplitCsv(rawLine.Trim().TrimStart('﻿')).Select(p => p.Trim()).ToList();
        if (parts.Count < map.MinColumns) return null;

        if (!TryParseDate(parts[map.Date], out var d)) return null;
        if (!TryParseAmount(parts[map.Amount], out var amount)) return null;

        var type = parts[parts.Count - map.TypeFromRight];
        if (string.IsNullOrEmpty(type)) return null;

        return new Transaction
        {
            Date = d,
            Category = parts[map.Category],
            Amount = amount,
            Member = parts[map.Member],
            Account = parts[map.Account],
            TransactionType = type
        };
    }

    // 記帳：日期,類別,金額,成員,帳戶,收支
    // 金額若含千分位逗號會被拆成多欄；由於「類別」在 index 1、「成員/帳戶/收支」固定在最後三欄，
    // 金額即為中間欄位合併去逗號，因此可正確還原。
    public static Transaction? ParseTransactionLine(string rawLine)
    {
        if (string.IsNullOrWhiteSpace(rawLine)) return null;
        var line = rawLine.Trim().TrimStart('﻿');
        var parts = SplitCsv(line).Select(p => p.Trim()).ToList();
        if (parts.Count < 6) return null;

        if (!TryParseDate(parts[0], out var d)) return null;

        var category = parts[1];
        var type = parts[^1];
        var account = parts[^2];
        var member = parts[^3];
        // amount = index 2 .. (Count-4)，共 Count-5 欄合併
        var amountRaw = string.Concat(parts.GetRange(2, parts.Count - 5));
        if (!TryParseAmount(amountRaw, out var amount)) return null;

        return new Transaction
        {
            Date = d,
            Category = category,
            Amount = amount,
            Member = member,
            Account = account,
            TransactionType = type
        };
    }

    // 信用卡：日期,店家,金額
    // 金額可能因千分位逗號被拆成多欄（例：1,580）；店家可能含數字或空白但通常不含逗號。
    // 策略：從右側收集連續的「純數字」欄位當金額（保留 index 1 給店家），合併去逗號。
    public static (DateTime Date, string Item, int Amount)? ParseCreditcardLine(string rawLine)
    {
        if (string.IsNullOrWhiteSpace(rawLine)) return null;
        var line = rawLine.Trim().TrimStart('﻿');
        var parts = SplitCsv(line).Select(p => p.Trim()).ToList();
        if (parts.Count < 3) return null;

        if (!TryParseDate(parts[0], out var d)) return null;

        int j = parts.Count - 1;
        var amtGroups = new List<string>();
        while (j >= 2 && IsAmountField(parts[j]))
        {
            amtGroups.Insert(0, parts[j]);
            j--;
        }
        // 吸收帶正負號的最高位群組（未加引號的負數金額，例：-1,580 → ["-1","580"]）
        if (amtGroups.Count > 0 && j >= 2 && IsSignedAmountField(parts[j]))
        {
            amtGroups.Insert(0, parts[j]);
            j--;
        }

        string amountRaw;
        string item;
        if (amtGroups.Count == 0)
        {
            // 保底：最後一欄當金額，其餘為店家
            amountRaw = parts[^1];
            item = string.Join(",", parts.GetRange(1, parts.Count - 2));
        }
        else
        {
            amountRaw = string.Concat(amtGroups);
            item = string.Join(",", parts.GetRange(1, j)); // parts[1..j]
        }

        if (!TryParseAmount(amountRaw, out var amount)) return null;
        return (d, item, amount);
    }
}
