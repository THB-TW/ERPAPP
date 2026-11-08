using ERPAPP.Models;
using Microsoft.EntityFrameworkCore;

namespace ERPAPP.Services.Import;

// 交易資料表 adapter：EF AddRange + SaveChanges（單批）。
public sealed class TransactionTable : IImportDestination<Transaction>, IImportAcceptance<Transaction>
{
    private readonly ErpdbContext _db;

    public TransactionTable(ErpdbContext db) => _db = db;

    // 只讀 [min,max] 日期視窗（鍵含日期，語意不變）；ToList 讓 reader 在 Write 前關掉
    public IEnumerable<Transaction> ReadExisting(DateTime min, DateTime max) =>
        _db.Transactions.AsNoTracking()
            .Where(t => t.Date >= min && t.Date <= max)
            .ToList();

    public void Write(IReadOnlyList<Transaction> rows)
    {
        _db.Transactions.AddRange(rows);
        _db.SaveChanges();
    }

    public List<Transaction> Accept(IReadOnlyList<Transaction> fresh, ERPAPP.Dto.ImportResult result)
    {
        var latest=_db.Properties.AsNoTracking().Max(p=>(DateTime?)p.Date);
        if(!latest.HasValue) return fresh.ToList();
        var end=new DateTime(latest.Value.Year,latest.Value.Month,1).AddMonths(1);
        var accepted=new List<Transaction>();
        foreach(var row in fresh)
        {
            if(row.Date<end) result.Rejections.Add(new(row.Date,row.Category??"",row.Amount,"已結月份，須先撤銷月結"));
            else accepted.Add(row);
        }
        result.RejectedRows=result.Rejections.Count;
        return accepted;
    }
}
