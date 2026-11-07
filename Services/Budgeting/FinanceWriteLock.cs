using ERPAPP.Models;
using Microsoft.EntityFrameworkCore;

namespace ERPAPP.Services.Budgeting;

public static class FinanceWriteLock
{
    public const string Sql = "DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=N'ERPAPP.Finance', @LockMode=N'Exclusive', @LockOwner=N'Transaction', @LockTimeout=15000; IF @r<0 THROW 51000,N'財務資料正在更新，請稍後重試。',1;";
    public static void Acquire(ErpdbContext db) => db.Database.ExecuteSqlRaw(Sql);
}
