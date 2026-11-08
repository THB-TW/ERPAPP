using ERPAPP.Services;
using Microsoft.AspNetCore.Mvc;

namespace ERPAPP.Controllers;

public class FinanceController : Controller
{
    private readonly BudgetReportReader _reports;
    private readonly ILogger<FinanceController> _logger;
    private readonly ERPAPP.Services.Budgeting.BudgetWorkspace _workspace;

    public FinanceController(BudgetReportReader reports, ILogger<FinanceController> logger, ERPAPP.Services.Budgeting.BudgetWorkspace workspace)
    {
        _reports = reports;
        _logger = logger;
        _workspace = workspace;
    }

    [HttpGet]
    public async Task<IActionResult> BudgetReport()
    {
        try
        {
            var model = await _reports.GetDataAsync();
            ViewData["BudgetWorkspace"] = new ERPAPP.ViewModels.BudgetWorkspacePage {State=_workspace.Read()};
            return model == null ? View("Unavailable") : View(model);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "載入預算表失敗。");
            return View("Unavailable");
        }
    }
}
