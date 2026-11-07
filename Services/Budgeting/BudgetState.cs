namespace ERPAPP.Services.Budgeting;

public sealed class BudgetState
{
    public long Version { get; set; }
    public List<BudgetCategoryDefinition> Categories { get; set; } = [];
    public List<BudgetRevision> Revisions { get; set; } = [];
    public List<MonthClose> Months { get; set; } = [];
    public List<MonthClose> CloseHistory { get; set; } = [];
    public List<BudgetAdjustment> Adjustments { get; set; } = [];
    public List<BudgetReceipt> Receipts { get; set; } = [];
    public List<BudgetCheck> Checks { get; set; } = [];
}

public sealed record BudgetCategoryDefinition(string Id, string Name, string Kind);
public sealed record BudgetLimit(string CategoryId, int Amount);
public sealed class BudgetRevision
{
    public string Id { get; set; } = "";
    public string Month { get; set; } = "";
    public List<BudgetLimit> Limits { get; set; } = [];
    public Dictionary<string, string> Mapping { get; set; } = [];
    public int Tuition { get; set; }
    public string Reason { get; set; } = "";
    public string Actor { get; set; } = "";
    public DateTimeOffset Time { get; set; }
}
public sealed class MonthClose
{
    public string Id { get; set; } = "";
    public string Month { get; set; } = "";
    public int Income { get; set; }
    public int Surplus { get; set; }
    public int RawSpare { get; set; }
    public int Tuition { get; set; }
    public Dictionary<string, int> Balances { get; set; } = [];
    public Dictionary<string, int> Changes { get; set; } = [];
    public Dictionary<string, int> Expenses { get; set; } = [];
    public BudgetRevision? Revision { get; set; }
    public bool Migrated { get; set; }
    public int LegacyTotalDifference { get; set; }
    public int LegacyBalanceAnchor { get; set; }
    public DateTimeOffset Time { get; set; }
    public string Actor { get; set; } = "";
}
public sealed record BudgetAdjustment(string Id, string Month, string Kind, int Amount,
    string? From, string? To, string Reason, string Actor, DateTimeOffset Time, string? Reverses = null)
{
    public List<BudgetAmountChange> Changes { get; init; }=[];
}
public sealed record BudgetAmountChange(string Month,string Field,string? CategoryId,int Before,int After);
public sealed record BudgetReceipt(string Id, string Fingerprint, string Action, string Month,
    string Reason, string Actor, DateTimeOffset Time);
public sealed record BudgetCheck(string Id, string Month, DateTimeOffset Time, string Actor,
    string Reason, ERPAPP.Dto.AssetCheckRequest Input, ERPAPP.Dto.AssetCheckResult Result, long Version);
public sealed record MonthPosition(string Month, int Income, int Spare, int Tuition,
    Dictionary<string, int> Balances, int LegacyTotalDifference = 0)
{
    public int Reserve => Balances.Values.Sum();
    public int Total => checked(Spare + Tuition + Reserve + LegacyTotalDifference);
}
public sealed class BudgetCommand
{
    public string Action { get; set; } = "";
    public Guid OperationId { get; set; }
    public long Version { get; set; }
    public string Month { get; set; } = "";
    public string Reason { get; set; } = "";
    public string? From { get; set; }
    public string? To { get; set; }
    public int Amount { get; set; }
    public string? Name { get; set; }
    public string Kind { get; set; } = "reserve";
    public List<BudgetLimit> Limits { get; set; } = [];
    public int Tuition { get; set; }
    public string? SourceCategory { get; set; }
    public string? Reverses { get; set; }
}
public sealed record BudgetExpense(string Category, int Amount);
