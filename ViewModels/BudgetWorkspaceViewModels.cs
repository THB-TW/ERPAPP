using ERPAPP.Services.Budgeting;

namespace ERPAPP.ViewModels;

public sealed class BudgetWorkspacePage
{
    public required BudgetState State { get; init; }
    public int RequestedPage { get; init; }=1;
    public List<string> UnmappedCategories { get; init; }=[];
    public string OpenMonth=>BudgetEngine.OpenMonth(State);
    public string LatestMonth=>BudgetEngine.Latest(State);
    public BudgetRevision? Effective=>BudgetEngine.Effective(State,OpenMonth);
    public MonthPosition Current=>BudgetEngine.Position(State,LatestMonth);
    public List<BudgetCategoryDefinition> Active=>State.Categories.Where(c=>Effective?.Limits.Any(l=>l.CategoryId==c.Id)==true).ToList();
    public List<string> AllHistoryMonths=>State.Months.Select(m=>m.Month).Union(State.Revisions.Select(r=>r.Month)).OrderDescending().ToList();
    public int PageCount=>Math.Max(1,(AllHistoryMonths.Count+9)/10);
    public int Page=>Math.Clamp(RequestedPage,1,PageCount);
    public IEnumerable<string> HistoryMonths=>AllHistoryMonths.Skip((Page-1)*10).Take(10);
    public string Name(string? id)=>State.Categories.SingleOrDefault(c=>c.Id==id)?.Name??id??"—";
    public static string KindName(string kind)=>kind switch {"reserve"=>"儲備類別","fixed"=>"固定支出","actual"=>"照實支",_=>kind};
    public static string ActionName(string action)=>action switch {"caps"=>"修改上限","add"=>"新增類別","retire"=>"停用類別","map"=>"修改分類歸屬",
        "transfer"=>"預算挪用","correct"=>"前期更正","reverse"=>"沖銷調整","close"=>"月結","rollback"=>"撤銷月結",_=>action};
}

public sealed record BudgetPreview(BudgetCommand Command,BudgetState Before,BudgetState After);

public sealed class BudgetActivityPage
{
    public required BudgetState State { get; init; }
    public string? Month { get; init; }
    public string Kind { get; init; }="checks";
    public int RequestedPage { get; init; }=1;
    public IEnumerable<BudgetCheck> Checks=>State.Checks.Where(c=>string.IsNullOrEmpty(Month)||c.Month==Month).OrderByDescending(c=>c.Time);
    public IEnumerable<BudgetReceipt> Operations=>State.Receipts.Where(c=>string.IsNullOrEmpty(Month)||c.Month==Month).OrderByDescending(c=>c.Time);
    public IEnumerable<BudgetAdjustment> Adjustments=>State.Adjustments.Where(c=>string.IsNullOrEmpty(Month)||c.Month==Month).OrderByDescending(c=>c.Time);
    public IEnumerable<MonthClose> Closes=>State.CloseHistory.Where(c=>string.IsNullOrEmpty(Month)||c.Month==Month).OrderByDescending(c=>c.Time);
    public int Count=>Kind switch {"checks"=>Checks.Count(),"adjustments"=>Adjustments.Count(),"closes"=>Closes.Count(),_=>Operations.Count()};
    public int PageCount=>Math.Max(1,(Count+19)/20);
    public int Page=>Math.Clamp(RequestedPage,1,PageCount);
    public int Skip=>(Page-1)*20;
    public string Name(string? id)=>State.Categories.SingleOrDefault(c=>c.Id==id)?.Name??id??"—";
}
