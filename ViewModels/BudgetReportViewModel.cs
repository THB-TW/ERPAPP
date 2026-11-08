using ERPAPP.Models;

namespace ERPAPP.ViewModels;

public sealed class BudgetReportViewModel
{
    public required Budget InitialBudget { get; init; }
    public required Budget LatestBudget { get; init; }
    public List<Budget> AllMonthlyBudgets { get; init; }=[];
    public List<Property> AllPropertyData { get; init; }=[];
    public required string LatestMonthDisplay { get; init; }
}
