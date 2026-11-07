using ERPAPP.Services.Budgeting;
using ERPAPP.ViewModels;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPAPP.Controllers;

public sealed class BudgetCapController(BudgetWorkspace workspace,ILogger<BudgetCapController> logger) : Controller
{
    [HttpGet]
    public IActionResult Index(int page=1)
    {
        var state=workspace.Read();
        return View(new BudgetWorkspacePage {State=state,RequestedPage=page,UnmappedCategories=workspace.Unmapped(state)});
    }

    [HttpGet]
    public IActionResult Effective(int year,int month)
    {
        if(year is <1900 or >9998 || month is <1 or >12) return BadRequest(new {message="年月不正確。"});
        var target=$"{year:0000}-{month:00}";
        var state=workspace.Read();
        var frozen=state.Months.SingleOrDefault(m=>m.Month==target);
        var caps=frozen?.Revision??BudgetEngine.Effective(state,target);
        if(caps==null) return NotFound(new {message="這個月份尚無上限快照，請先到預算上限設定。"});
        var reserve=caps.Limits.Where(l=>state.Categories.Single(c=>c.Id==l.CategoryId).Kind=="reserve").Sum(l=>l.Amount);
        var fixedTotal=caps.Limits.Where(l=>state.Categories.Single(c=>c.Id==l.CategoryId).Kind=="fixed").Sum(l=>l.Amount);
        return Json(new {version=state.Version,month=target,sourceMonth=caps.Month,isOwnSnapshot=caps.Month==target,isClosed=frozen!=null,
            reserveCapSum=reserve,fixedCapSum=fixedTotal,tuition=caps.Tuition,expenditure=checked(-(reserve+fixedTotal+caps.Tuition)),
            phone=caps.Limits.FirstOrDefault(l=>l.CategoryId=="phone")?.Amount??0,gogoro=caps.Limits.FirstOrDefault(l=>l.CategoryId=="gogoro")?.Amount??0});
    }

    [HttpPost,ValidateAntiForgeryToken,Authorize(Roles="Edit")]
    public IActionResult Save(BudgetCommand command)=>Write(command,"caps");
    [HttpPost,ValidateAntiForgeryToken,Authorize(Roles="Edit")]
    public IActionResult Add(BudgetCommand command)=>Write(command,"add");
    [HttpPost,ValidateAntiForgeryToken,Authorize(Roles="Edit")]
    public IActionResult Retire(BudgetCommand command)=>Write(command,"retire");
    [HttpPost,ValidateAntiForgeryToken,Authorize(Roles="Edit")]
    public IActionResult Map(BudgetCommand command)=>Write(command,"map");

    private IActionResult Write(BudgetCommand command,string action)
    {
        if(!ModelState.IsValid) {TempData["BudgetMessage"]="有欄位格式不正確，未儲存。";return RedirectToAction(nameof(Index));}
        command.Action=action;
        try {workspace.Execute(command,User.Identity!.Name!);TempData["BudgetSuccess"]=true;TempData["BudgetMessage"]="已儲存新的上限版本與原因。";}
        catch(Exception ex) when(ex is ArgumentException or InvalidOperationException or FormatException or OverflowException) {TempData["BudgetMessage"]=ex.Message;}
        catch(Exception ex) {logger.LogError(ex,"儲存預算設定失敗。");TempData["BudgetMessage"]="儲存失敗，請重新載入後再試。";}
        return RedirectToAction(nameof(Index));
    }
}
