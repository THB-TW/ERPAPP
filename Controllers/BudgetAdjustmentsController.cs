using ERPAPP.Services.Budgeting;
using ERPAPP.ViewModels;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPAPP.Controllers;

public sealed class BudgetAdjustmentsController(BudgetWorkspace workspace,ILogger<BudgetAdjustmentsController> logger) : Controller
{
    [HttpGet]
    public IActionResult History(string? month,string kind="checks",int page=1)
    {
        if(!string.IsNullOrEmpty(month))
            try {_=BudgetEngine.MonthDate(month);} catch(FormatException) {return BadRequest("月份格式不正確。");}
        if(kind is not ("checks" or "adjustments" or "closes" or "operations")) return BadRequest("紀錄類型不正確。");
        return View(new BudgetActivityPage {State=workspace.Read(),Month=month,Kind=kind,RequestedPage=page});
    }

    [HttpPost,ValidateAntiForgeryToken,Authorize(Roles="Edit")]
    public IActionResult Preview(BudgetCommand command)
    {
        if(!ModelState.IsValid || command.Action is not ("transfer" or "correct" or "reverse")) return BadRequest("調整資料不正確。");
        try
        {
            var before=workspace.Read();
            var after=BudgetEngine.Apply(before,command,User.Identity!.Name!,DateTimeOffset.Now);
            return View(new BudgetPreview(command,before,after));
        }
        catch(Exception ex) when(ex is ArgumentException or InvalidOperationException or FormatException or OverflowException)
        {
            TempData["BudgetMessage"]=ex.Message;
            return RedirectToAction("BudgetReport","Finance");
        }
    }

    [HttpPost,ValidateAntiForgeryToken,Authorize(Roles="Edit")]
    public IActionResult Apply(BudgetCommand command)
    {
        if(!ModelState.IsValid || command.Action is not ("transfer" or "correct" or "reverse")) return BadRequest("調整資料不正確。");
        try {workspace.Execute(command,User.Identity!.Name!);TempData["BudgetSuccess"]=true;TempData["BudgetMessage"]="調整已儲存，可在調整紀錄查看原因及影響。";}
        catch(Exception ex) when(ex is ArgumentException or InvalidOperationException or FormatException or OverflowException) {TempData["BudgetMessage"]=ex.Message;}
        catch(Exception ex) {logger.LogError(ex,"儲存財務調整失敗。");TempData["BudgetMessage"]="儲存失敗，請重新載入後再試。";}
        return command.Action=="correct" ? RedirectToAction("Index","MonthlyClose") : RedirectToAction("BudgetReport","Finance");
    }
}
