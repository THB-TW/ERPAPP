using ERPAPP.Models;
using Microsoft.EntityFrameworkCore;

namespace ERPAPP.Services.Import;

// 信用卡資料表 adapter：creditcard 無主鍵（HasNoKey），EF 不能 Add，改參數化 raw SQL。
public sealed class CreditcardTable : IImportDestination<Creditcard>
{
    private readonly ErpdbContext _db;

    public CreditcardTable(ErpdbContext db) => _db = db;

    // 只讀 [min,max] 日期視窗（鍵含日期，語意不變）；ToList 讓 reader 在 Write 前關掉
    public IEnumerable<Creditcard> ReadExisting(DateTime min, DateTime max) =>
        _db.Creditcards.AsNoTracking()
            .Where(c => c.Date >= min && c.Date <= max)
            .ToList();

    // 整批包在單一交易內：全成功或全不進（避免中途失敗留下部分資料）
    public void Write(IReadOnlyList<Creditcard> rows)
    {
        using var tx = _db.Database.BeginTransaction();
        foreach (var r in rows)
        {
            _db.Database.ExecuteSqlRaw(
                "INSERT INTO creditcard (Date, Item, Amount) VALUES ({0}, {1}, {2})",
                r.Date, r.Item, r.Amount);
        }
        tx.Commit();
    }
}
