using System.Text;
using ERPAPP.Dto;
using ERPAPP.Models;
using ERPAPP.Services.Import;
using Microsoft.EntityFrameworkCore;

namespace ERPAPP.Services;

// 匯入（見 CONTEXT.md「## 匯入」）：對外只有兩個入口，簽章與 ImportResult 形狀不變。
// 流程（解析 → 依來源排序 → 數量式去重 → 寫入各匯入目的地 → 回報筆數）只在 Services/Import/ImportRun.cs 寫一次；
// 來源（解析、重複判定鍵、排序政策）在 ImportSources；三個匯入目的地各是一個 adapter。
// 對齊 import_data.py：金額去除千分位逗號（CsvParsing）、數量式去重（保留合法的重複交易）、
// 記帳資料依日期由舊到新排序後才插入、信用卡維持匯出檔原始順序。
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

    // 記帳 CSV → 交易資料表。自動偵測「天天記帳」原始匯出檔（12 欄）／已轉換的 6 欄檔。
    public ImportResult ImportTransactions(Stream stream, Encoding encoding)
    {
        using var transaction=_context.Database.CurrentTransaction==null
            ? _context.Database.BeginTransaction(System.Data.IsolationLevel.Serializable) : null;
        Budgeting.FinanceWriteLock.Acquire(_context);
        var result=ImportRun.Execute(ImportSources.TransactionCsv, stream, encoding,primary:new TransactionTable(_context));
        transaction?.Commit();
        return result;
    }

    // 信用卡 CSV → 信用卡資料表 + 信用卡存檔 creditcard.csv（存檔失敗不影響資料表結果，只回報訊息）。
    public ImportResult ImportCreditcard(Stream stream, Encoding encoding) =>
        ImportRun.Execute(ImportSources.CreditcardCsv, stream, encoding,
            primary: new CreditcardTable(_context),
            archive: () => CreditcardCsvArchive.FromConfig(_config, _env));
}
