using System.Data;
using ERPAPP.Services.Budgeting;
using Microsoft.EntityFrameworkCore;

namespace ERPAPP.Models;

public partial class ErpdbContext
{
    private bool HasTransactionWrites()
    {
        ChangeTracker.DetectChanges();
        return ChangeTracker.Entries<Transaction>().Any(e=>e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted);
    }

    private void ValidateTransactionPeriods()
    {
        foreach(var entry in ChangeTracker.Entries<Transaction>().Where(e=>e.State is EntityState.Added or EntityState.Modified))
            if(entry.Entity.Amount<=0 || entry.Entity.TransactionType is not ("收" or "支") || entry.Entity.Date.Year is <1900 or >9998)
                throw new InvalidTransactionException("交易須有有效日期、正整數金額及收／支類型。");
        var latest=Properties.AsNoTracking().Max(p=>(DateTime?)p.Date);
        if(!latest.HasValue) return;
        var end=new DateTime(latest.Value.Year,latest.Value.Month,1).AddMonths(1);
        foreach(var entry in ChangeTracker.Entries<Transaction>().Where(e=>e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted))
        {
            var original=entry.State==EntityState.Added ? entry.Entity.Date : entry.OriginalValues.GetValue<DateTime>(nameof(Transaction.Date));
            if(original<end || entry.Entity.Date<end) throw new ClosedPeriodException($"{original:yyyy-MM} 或目標月份已結，請先撤銷相應月份月結再修改交易。");
        }
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        if(!HasTransactionWrites()) return base.SaveChanges(acceptAllChangesOnSuccess);
        using var transaction=Database.CurrentTransaction==null ? Database.BeginTransaction(IsolationLevel.Serializable) : null;
        FinanceWriteLock.Acquire(this);
        ValidateTransactionPeriods();
        var result=base.SaveChanges(acceptAllChangesOnSuccess);
        transaction?.Commit();
        return result;
    }

    public override async Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess,CancellationToken cancellationToken=default)
    {
        if(!HasTransactionWrites()) return await base.SaveChangesAsync(acceptAllChangesOnSuccess,cancellationToken);
        await using var transaction=Database.CurrentTransaction==null ? await Database.BeginTransactionAsync(IsolationLevel.Serializable,cancellationToken) : null;
        await Database.ExecuteSqlRawAsync(FinanceWriteLock.Sql,cancellationToken);
        ValidateTransactionPeriods();
        var result=await base.SaveChangesAsync(acceptAllChangesOnSuccess,cancellationToken);
        if(transaction!=null) await transaction.CommitAsync(cancellationToken);
        return result;
    }
}

public sealed class ClosedPeriodException(string message) : InvalidOperationException(message);
public sealed class InvalidTransactionException(string message) : InvalidOperationException(message);
