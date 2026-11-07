using ERPAPP.Models;
using ERPAPP.ViewModels;
using Microsoft.EntityFrameworkCore;

namespace ERPAPP.Services;

// Legacy read projection for the existing charts; all financial writes use BudgetWorkspace.
public sealed class BudgetReportReader(ErpdbContext context)
{
    public async Task<BudgetReportViewModel?> GetDataAsync()
    {
        var initialDate=new DateTime(1911,1,1);
        var initial=await context.Budgets.AsNoTracking().SingleOrDefaultAsync(b=>b.Date==initialDate);
        var months=await context.Budgets.AsNoTracking().Where(b=>b.Date!=initialDate).OrderBy(b=>b.Date).ToListAsync();
        var properties=await context.Properties.AsNoTracking().OrderBy(p=>p.Date).ToListAsync();
        if(initial==null || months.Count==0) return null;
        return new() {InitialBudget=initial,LatestBudget=months[^1],AllMonthlyBudgets=months,
            AllPropertyData=properties,LatestMonthDisplay=months[^1].Date.ToString("yyyy-MM")};
    }
}
