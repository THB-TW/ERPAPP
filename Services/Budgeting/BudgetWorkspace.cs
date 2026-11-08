using ERPAPP.Models;
using System.Data;
using System.Data.Common;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace ERPAPP.Services.Budgeting;

public sealed class BudgetWorkspace(ErpdbContext db)
{
    public BudgetState Read() => Locked(ReadLocked);
    public List<string> Unmapped(BudgetState state,string? month=null)
    {
        var target=month??BudgetEngine.OpenMonth(state);
        var start=BudgetEngine.MonthDate(target);var end=start.AddMonths(1);
        var revision=BudgetEngine.Effective(state,target);
        return db.Transactions.AsNoTracking().Where(t=>t.Date>=start&&t.Date<end&&t.TransactionType=="支")
            .Select(t=>t.Category??"").Distinct().ToList()
            .Where(c=>revision==null || !revision.Mapping.TryGetValue(c,out var id) || !revision.Limits.Any(l=>l.CategoryId==id)).Order().ToList();
    }
    public ERPAPP.Dto.AssetCheckResult Check(ERPAPP.Dto.AssetCheckRequest input,string actor) => Locked(() =>
    {
        if(input.Year is <1900 or >9998 || input.Month is <1 or >12 || input.OperationId==Guid.Empty)
            throw new ArgumentException("核對年月或操作識別碼不正確。");
        var reason=(input.Reason??"").Trim();input.Reason=reason;
        if((input.Adjust!=0 && string.IsNullOrWhiteSpace(reason)) || reason.Length>300)
            throw new ArgumentException("其他調整需填寫原因，原因最多 300 字。");
        input.AsOfDate=(input.AsOfDate??DateTime.Today).Date;
        var start=new DateTime(input.Year,input.Month,1);
        var next=start.AddMonths(1);
        if(input.AsOfDate<next.AddDays(-1) || input.AsOfDate>DateTime.Today)
            throw new ArgumentException("餘額日期須介於結算月底與今天之間。");
        var before=ReadLocked();
        var id=input.OperationId.ToString();
        var old=before.Checks.SingleOrDefault(c=>c.Id==id);
        if(old!=null)
        {
            if(JsonSerializer.Serialize(old.Input)!=JsonSerializer.Serialize(input)) throw new InvalidOperationException("核對識別碼已用於不同內容，請重新載入。");
            return old.Result;
        }
        var result=new ERPAPP.Dto.AssetCheckResult {RecordId=id,AsOfDate=input.AsOfDate,
            ActualRaw=checked(input.Cash+input.Ipass+input.Bank+input.UnbilledCredit+input.NetDeployed+input.Adjust)};
        if(input.AutoRollback)
        {
            var rows=db.Transactions.AsNoTracking().Where(t=>t.Date>=next && t.Date<=input.AsOfDate.Value).ToList();
            foreach(var account in new[] {"現金","銀行"})
            {
                var expense=rows.Where(t=>t.Account==account&&t.TransactionType=="支").Sum(t=>t.Amount);
                var income=rows.Where(t=>t.Account==account&&t.TransactionType=="收").Sum(t=>t.Amount);
                if(expense==0&&income==0) continue;
                var net=checked(expense-income);
                result.Rollbacks.Add(new() {Account=account,NextMonthExpense=expense,NextMonthIncome=income,Net=net});
                result.RollbackTotal=checked(result.RollbackTotal+net);
            }
        }
        result.ActualAdjusted=checked(result.ActualRaw+result.RollbackTotal);
        var month=start.ToString("yyyy-MM");
        if(before.Months.Any(m=>m.Month==month))
        {
            result.HasBook=true;result.BookTotalproperty=BudgetEngine.Position(before,month).Total;
            result.Diff=checked(result.ActualAdjusted-result.BookTotalproperty.Value);
        }
        result.Version=checked(before.Version+1);
        before.Checks.Add(new(id,month,DateTimeOffset.Now,actor,reason.Length==0?"例行核對":reason,input,result,before.Version));
        var previousVersion=before.Version;before.Version=checked(before.Version+1);
        Write(before,previousVersion);
        return result;
    });
    public BudgetState Execute(BudgetCommand command,string actor) => Locked(() =>
    {
        var before=ReadLocked();
        if(before.Receipts.Any(r=>r.Id==command.OperationId.ToString()))
            return BudgetEngine.Apply(before,command,actor,DateTimeOffset.Now);
        var sourceName=command.Action=="add" ? command.Name?.Trim() : command.Action=="map" ? command.SourceCategory?.Trim() : null;
        if(sourceName!=null && db.Categories.Any(c=>c.CategoryName==sourceName && c.Type!="支"))
            throw new InvalidOperationException("這個名稱已用於收入分類，請使用其他支出名稱。");
        var start=BudgetEngine.MonthDate(command.Month);
        List<BudgetExpense>? expenses=null;
        if(command.Action=="close")
        {
            var end=start.AddMonths(1);
            var transactions=db.Transactions.AsNoTracking().Where(t=>t.Date>=start && t.Date<end && t.TransactionType=="支").ToList();
            var bank=db.Creditcards.AsNoTracking().Where(t=>t.Date>=start && t.Date<end).ToList();
            var appCounts=transactions.Where(t=>t.Account=="信用卡").GroupBy(t=>(t.Date,t.Amount)).ToDictionary(g=>g.Key,g=>g.Count());
            var bankCounts=bank.GroupBy(t=>(t.Date,t.Amount)).ToDictionary(g=>g.Key,g=>g.Count());
            var errors=appCounts.Keys.Union(bankCounts.Keys).Where(k=>appCounts.GetValueOrDefault(k)!=bankCounts.GetValueOrDefault(k))
                .Select(k=>new ERPAPP.Dto.UnmatchedRecord {Date=k.Date,Amount=k.Amount,Category="信用卡筆數不符",ProblemType=$"記帳 {appCounts.GetValueOrDefault(k)} 筆／帳單 {bankCounts.GetValueOrDefault(k)} 筆"}).ToList();
            if(errors.Count>0) throw new CreditcardMismatchException(errors);
            expenses=transactions.Select(t=>new BudgetExpense(t.Category??"",t.Amount)).ToList();
        }
        var after=BudgetEngine.Apply(before,command,actor,DateTimeOffset.Now,expenses);
        if(ReferenceEquals(before,after)) return after;
        Synchronize(before,after);
        if(sourceName!=null && !db.Categories.Any(c=>c.CategoryName==sourceName))
            db.Categories.Add(new Category {CategoryName=sourceName,Type="支"});
        db.SaveChanges();
        Write(after,before.Version);
        return after;
    });

    private void Write(BudgetState state,long expectedVersion)
    {
        using var update=Sql("UPDATE dbo.FinanceWorkspace SET Version=@next,Document=@document WHERE Id=1 AND Version=@expected",
            ("@next",state.Version),("@document",JsonSerializer.Serialize(state)),("@expected",expectedVersion));
        if(update.ExecuteNonQuery()!=1) throw new InvalidOperationException("資料版本已改變，未套用本次操作。");
    }

    private void Synchronize(BudgetState before,BudgetState after)
    {
        var properties=db.Properties.ToList().ToDictionary(p=>p.Date.ToString("yyyy-MM"));
        foreach(var month in before.Months)
        {
            var expected=BudgetEngine.Position(before,month.Month);
            if(!properties.TryGetValue(month.Month,out var stored) || stored.Sparemoney!=expected.Spare || stored.Budget!=expected.Reserve ||
                stored.Tuitionfee!=expected.Tuition || stored.Totalproperty!=expected.Total || stored.Own!=expected.Income)
                throw new InvalidOperationException($"{month.Month} 帳面與快照不一致，請先查核；本次操作未套用。");
        }
        foreach(var old in before.Months.Where(m=>!after.Months.Any(n=>n.Month==m.Month)))
        {
            var property=properties[old.Month];
            var start=BudgetEngine.MonthDate(old.Month);
            using var delete=Sql("DELETE dbo.budget WHERE date>=@date AND date<@end",("@date",start),("@end",start.AddMonths(1)));
            delete.ExecuteNonQuery();db.Properties.Remove(property);
        }
        foreach(var month in after.Months)
        {
            var position=BudgetEngine.Position(after,month.Month);
            if(!properties.TryGetValue(month.Month,out var property))
            {
                property=new Property {Date=BudgetEngine.MonthDate(month.Month),Inputdate=DateTime.Today};
                db.Properties.Add(property);
                InsertLegacyMonth(month);
            }
            property.Own=position.Income;property.Sparemoney=position.Spare;property.Tuitionfee=position.Tuition;
            property.Budget=position.Reserve;property.Totalproperty=position.Total;
        }
        var latest=BudgetEngine.Position(after,BudgetEngine.Latest(after));
        var legacy=BudgetSeeder.LegacyBalances(latest);
        using var cumulative=Sql("UPDATE dbo.budget SET "+string.Join(",",legacy.Keys.Select(k=>$"[{k}]=@{k}"))+",total=@total WHERE date='19110101'",
            legacy.Select(p=>("@"+p.Key,(object)p.Value)).Append(("@total",(object)latest.Reserve)).ToArray());
        if(cumulative.ExecuteNonQuery()!=1) throw new InvalidOperationException("總儲備金基準列缺漏或重複。");
    }

    private void InsertLegacyMonth(MonthClose month)
    {
        var changes=BudgetSeeder.LegacyBalances(new(month.Month,0,0,0,month.Changes));
        var names=changes.Keys.ToList();
        var sql="INSERT dbo.budget(date,"+string.Join(",",names.Select(n=>$"[{n}]"))+",total,expenditure,gete,inputdate) VALUES(@date,"+
            string.Join(",",names.Select(n=>"@"+n))+",@total,@expense,@surplus,@time)";
        var values=changes.Select(p=>("@"+p.Key,(object)p.Value)).ToList();
        values.AddRange([("@date",BudgetEngine.MonthDate(month.Month)),("@total",month.Changes.Values.Where(v=>v>0).Sum()),
            ("@expense",checked(month.Surplus-month.Income)),("@surplus",month.Surplus),("@time",DateTime.Today)]);
        using var insert=Sql(sql,values.ToArray());insert.ExecuteNonQuery();
    }

    private T Locked<T>(Func<T> operation)
    {
        using var transaction=db.Database.CurrentTransaction==null?db.Database.BeginTransaction(IsolationLevel.Serializable):null;
        FinanceWriteLock.Acquire(db);
        var result=operation();
        transaction?.Commit();
        return result;
    }

    private DbCommand Sql(string text,params (string Name,object Value)[] parameters)
    {
        var command=db.Database.GetDbConnection().CreateCommand();
        command.Transaction=db.Database.CurrentTransaction!.GetDbTransaction();
        command.CommandText=text;
        foreach(var (name,value) in parameters) {var p=command.CreateParameter();p.ParameterName=name;p.Value=value;command.Parameters.Add(p);}
        return command;
    }

    private BudgetState ReadLocked()
    {
        using var read=Sql("SELECT Document FROM dbo.FinanceWorkspace WITH(UPDLOCK,HOLDLOCK) WHERE Id=1");
        var document=read.ExecuteScalar() as string;
        if(document!=null) return JsonSerializer.Deserialize<BudgetState>(document)??throw new InvalidOperationException("財務快照格式錯誤。");
        var initial=BudgetSeeder.Import(db);
        using var insert=Sql("INSERT dbo.FinanceWorkspace(Id,Version,Document) VALUES(1,@version,@document)",
            ("@version",initial.Version),("@document",JsonSerializer.Serialize(initial)));
        insert.ExecuteNonQuery();
        return initial;
    }
}

public sealed class CreditcardMismatchException(List<ERPAPP.Dto.UnmatchedRecord> errors) : InvalidOperationException("信用卡記帳與帳單筆數不符。")
{
    public List<ERPAPP.Dto.UnmatchedRecord> Errors { get; }=errors;
}
