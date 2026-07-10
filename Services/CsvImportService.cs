using System.Text;
using ERPAPP.Dto;
using ERPAPP.Models;
using Microsoft.EntityFrameworkCore;

namespace ERPAPP.Services;

// 負責把記帳 app 與信用卡帳單的 CSV 解析（見 CsvParsing）並寫入資料庫。
// 對齊 import_data.py：
//   - 金額去除千分位逗號（在 CsvParsing 處理）
//   - 增量匯入：已存在的資料不重覆新增（數量式去重，保留合法的重複交易）
//   - 記帳資料依日期由舊到新重新排序後才插入（與轉換後的 data.csv 一致）
public class CsvImportService
{
    private readonly ErpdbContext _context;
    private readonly IConfiguration _config;
    private readonly IHostEnvironment _env;

    public CsvImportService(ErpdbContext context, IConfiguration config, IHostEnvironment env)
    {
        _context = context;
        _config = config;
        _env = env;
    }

    // 信用卡刷卡紀錄 CSV 存檔路徑：預設為專案上一層的 creditcard.csv（SQLEXPRESS\creditcard.csv），
    // 可在 appsettings.json 以 "CreditcardArchivePath" 覆寫（相對路徑以內容根目錄為基準）。
    private string ArchivePath
    {
        get
        {
            var p = _config["CreditcardArchivePath"];
            if (string.IsNullOrWhiteSpace(p))
                p = Path.Combine("..", "creditcard.csv");
            return Path.GetFullPath(Path.IsPathRooted(p) ? p : Path.Combine(_env.ContentRootPath, p));
        }
    }

    // 去重鍵與 import_data.py 一致：僅比對 日期+類別+金額
    // （成員/帳戶/收支仍會存入，但不納入是否重複的判定，確保與既有 Python 匯入行為相同）
    private static string TxKey(DateTime d, string? cat, int amt) =>
        $"{d:yyyyMMdd}|{cat}|{amt}";

    private static string CcKey(DateTime d, string? item, int amt) =>
        $"{d:yyyyMMdd}|{item}|{amt}";

    // 記帳 CSV → Transactions
    // 支援兩種格式，自動偵測：
    //   1. 「天天記帳」原始匯出檔（含標題列、12 欄）：依標題對應取 日期/類別/金額/成員/帳戶/收支區分
    //   2. 已轉換的 6 欄檔（data.csv / 2605.csv）：日期,類別,金額,成員,帳戶,收支
    public ImportResult ImportTransactions(Stream stream, Encoding encoding)
    {
        var result = new ImportResult();
        var parsed = new List<Transaction>();

        using (var reader = new StreamReader(stream, encoding))
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

                result.TotalRows++;
                var tx = map != null
                    ? CsvParsing.ParseTransactionLine(line, map)
                    : CsvParsing.ParseTransactionLine(line);
                if (tx == null) { result.ErrorRows++; continue; }
                parsed.Add(tx);
            }
        }

        if (parsed.Count == 0) return result;

        // 重新排序：日期由舊到新（與 data.csv 一致，插入後 Id 亦為時間順序）
        parsed = parsed.OrderBy(p => p.Date).ToList();

        var min = parsed.Min(p => p.Date);
        var max = parsed.Max(p => p.Date);
        var existingCounts = _context.Transactions
            .AsNoTracking()
            .Where(t => t.Date >= min && t.Date <= max)
            .ToList()
            .GroupBy(t => TxKey(t.Date, t.Category, t.Amount))
            .ToDictionary(g => g.Key, g => g.Count());

        // 保序的數量式去重：同一鍵前 E 筆視為已存在，第 E+1 筆起才新增
        var encountered = new Dictionary<string, int>();
        var toInsert = new List<Transaction>();
        foreach (var tx in parsed)
        {
            var key = TxKey(tx.Date, tx.Category, tx.Amount);
            int existing = existingCounts.GetValueOrDefault(key, 0);
            int c = encountered.GetValueOrDefault(key, 0) + 1;
            encountered[key] = c;
            if (c > existing) toInsert.Add(tx);
            else result.Skipped++;
        }

        if (toInsert.Count > 0)
        {
            _context.Transactions.AddRange(toInsert);
            _context.SaveChanges();
        }
        result.Inserted = toInsert.Count;
        return result;
    }

    // 信用卡 CSV → creditcard（keyless，改用參數化 raw SQL 新增）
    public ImportResult ImportCreditcard(Stream stream, Encoding encoding)
    {
        var result = new ImportResult();
        var parsed = new List<(DateTime Date, string Item, int Amount)>();

        using (var reader = new StreamReader(stream, encoding))
        {
            foreach (var line in CsvParsing.ReadCsvRecords(reader))
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                result.TotalRows++;
                var cc = CsvParsing.ParseCreditcardLine(line);
                if (cc == null) { result.ErrorRows++; continue; }
                parsed.Add(cc.Value);
            }
        }

        if (parsed.Count == 0) return result;

        // 信用卡不重新排序，維持匯出檔原始順序（與 import_data.py 一致）
        var min = parsed.Min(p => p.Date);
        var max = parsed.Max(p => p.Date);
        var existingCounts = _context.Creditcards
            .AsNoTracking()
            .Where(c => c.Date >= min && c.Date <= max)
            .ToList()
            .GroupBy(c => CcKey(c.Date, c.Item, c.Amount))
            .ToDictionary(g => g.Key, g => g.Count());

        var encountered = new Dictionary<string, int>();
        var toInsert = new List<(DateTime Date, string Item, int Amount)>();
        foreach (var cc in parsed)
        {
            var key = CcKey(cc.Date, cc.Item, cc.Amount);
            int existing = existingCounts.GetValueOrDefault(key, 0);
            int c = encountered.GetValueOrDefault(key, 0) + 1;
            encountered[key] = c;
            if (c > existing) toInsert.Add(cc);
            else result.Skipped++;
        }

        // 包在單一交易內：整批全成功或全不進（避免中途失敗留下部分資料）
        if (toInsert.Count > 0)
        {
            using var dbTx = _context.Database.BeginTransaction();
            foreach (var row in toInsert)
            {
                _context.Database.ExecuteSqlRaw(
                    "INSERT INTO creditcard (Date, Item, Amount) VALUES ({0}, {1}, {2})",
                    row.Date, row.Item, row.Amount);
            }
            dbTx.Commit();
        }
        result.Inserted = toInsert.Count;

        // 同步把新紀錄補寫進 creditcard.csv 存檔（傳入全部解析結果，存檔自行去重、可自我補齊）。
        // 存檔失敗不影響資料庫匯入結果，僅回報訊息。
        try
        {
            result.ArchivedRows = CreditcardArchive.Append(ArchivePath, parsed, Encoding.GetEncoding(950));
            result.ArchivePath = ArchivePath;
        }
        catch (Exception ex)
        {
            result.ArchiveMessage = "creditcard.csv 存檔寫入失敗：" + ex.Message;
        }
        return result;
    }
}
