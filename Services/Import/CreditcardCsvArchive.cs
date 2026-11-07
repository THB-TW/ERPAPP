using System.Text;
using ERPAPP.Models;

namespace ERPAPP.Services.Import;

// 信用卡存檔 adapter：creditcard.csv（Big5 / code page 950），append。
// 匯入帳單時同步把新紀錄補寫進檔案，讓資料庫之外也保有一份累積的刷卡紀錄 CSV；
// 可落後於資料庫、自我補齊（ImportRun 把全部解析列交給它，由它自己數量式去重）。
public sealed class CreditcardCsvArchive : IArchiveDestination<Creditcard>
{
    private readonly Encoding _encoding;

    public string FilePath { get; }

    // path 必須是絕對路徑；encoding 預設 Big5（Program.cs 已 RegisterProvider）。
    public CreditcardCsvArchive(string path, Encoding? encoding = null)
    {
        FilePath = path;
        _encoding = encoding ?? Encoding.GetEncoding(950);
    }

    // 存檔路徑：預設為專案上一層的 creditcard.csv（SQLEXPRESS\creditcard.csv），
    // 可在 appsettings.json 以 "CreditcardArchivePath" 覆寫（相對路徑以內容根目錄為基準）。
    public static CreditcardCsvArchive FromConfig(IConfiguration config, IHostEnvironment env)
    {
        var p = config["CreditcardArchivePath"];
        if (string.IsNullOrWhiteSpace(p))
            p = Path.Combine("..", "creditcard.csv");
        var full = Path.GetFullPath(Path.IsPathRooted(p) ? p : Path.Combine(env.ContentRootPath, p));
        return new CreditcardCsvArchive(full);
    }

    // 忽略視窗、讀全檔（檔案不存在 → 空）。無法解析的列略過。
    public IEnumerable<Creditcard> ReadExisting(DateTime min, DateTime max)
    {
        var rows = new List<Creditcard>();
        if (!File.Exists(FilePath)) return rows;

        using var reader = new StreamReader(FilePath, _encoding);
        foreach (var line in CsvParsing.ReadCsvRecords(reader))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            var cc = CsvParsing.ParseCreditcardLine(line);
            if (cc == null) continue;
            rows.Add(new Creditcard { Date = cc.Value.Date, Item = cc.Value.Item, Amount = cc.Value.Amount });
        }
        return rows;
    }

    // 檔尾若沒換行，補寫前先補一個，避免黏在最後一列；維持傳入順序。
    public void Write(IReadOnlyList<Creditcard> rows)
    {
        bool endsWithNewline = true;
        if (File.Exists(FilePath) && new FileInfo(FilePath).Length > 0)
        {
            using var fs = File.OpenRead(FilePath);
            fs.Seek(-1, SeekOrigin.End);
            endsWithNewline = fs.ReadByte() == '\n';
        }

        using var writer = new StreamWriter(FilePath, append: true, _encoding);
        if (!endsWithNewline) writer.WriteLine();
        foreach (var r in rows)
            writer.WriteLine(FormatLine(r.Date, r.Item, r.Amount));
    }

    // 與既有 creditcard.csv 相同格式：yyyy/M/d,店家,金額（店家含逗號/引號/換行時以引號包住）
    private static string FormatLine(DateTime d, string? item, int amount)
    {
        var it = item ?? "";
        if (it.Contains(',') || it.Contains('"') || it.Contains('\n'))
            it = "\"" + it.Replace("\"", "\"\"") + "\"";
        return $"{d.Year}/{d.Month}/{d.Day},{it},{amount}";
    }
}
