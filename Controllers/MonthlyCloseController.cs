using System.Text;
using ERPAPP.Dto;
using ERPAPP.Models;
using ERPAPP.Services;
using ERPAPP.Services.Budgeting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ERPAPP.Controllers
{
    // 一鍵月結精靈：CSV 匯入 → 信用卡核對+計算 → 總資產核對
    public class MonthlyCloseController : Controller
    {
        private readonly ErpdbContext _context;
        private readonly CsvImportService _importer;
        private readonly BudgetWorkspace _workspace;
        private readonly InvestmentService _investment;

        public MonthlyCloseController(ErpdbContext context, CsvImportService importer, BudgetWorkspace workspace, InvestmentService investment)
        {
            _context = context;
            _importer = importer;
            _workspace = workspace;
            _investment = investment;
        }

        [HttpGet]
        public IActionResult Index()
        {
            // 預設帶入上個月（月結多在下個月初進行）
            var prev = DateTime.Now.AddMonths(-1);
            var state=_workspace.Read();
            ViewData["BudgetWorkspace"]=new ERPAPP.ViewModels.BudgetWorkspacePage {State=state};
            ViewData["SelectedCloseMonth"]=prev.ToString("yyyy-MM");
            return View(new SummaryInputModel { Year = prev.Year, Month = prev.Month, Version=state.Version,
                Own=state.Months.SingleOrDefault(m=>m.Month==prev.ToString("yyyy-MM"))?.Income??0 });
        }

        private static Encoding ResolveEncoding(string? name) =>
            (name?.Trim().ToLowerInvariant()) switch
            {
                "big5" or "cp950" or "950" => Encoding.GetEncoding(950),
                _ => new UTF8Encoding(false)
            };

        // 步驟 2a：匯入記帳 CSV → Transactions
        [HttpPost]
        [ValidateAntiForgeryToken]
        [Authorize(Roles="Edit")]
        public IActionResult ImportTransactions(IFormFile? file, string? encoding)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { message = "請選擇記帳 CSV 檔。" });
            try
            {
                using var s = file.OpenReadStream();
                var r = _importer.ImportTransactions(s, ResolveEncoding(encoding ?? "utf-8"));
                return Json(r);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "匯入記帳資料失敗：" + ex.Message });
            }
        }

        // 步驟 2b：匯入信用卡 CSV → creditcard
        [HttpPost]
        [ValidateAntiForgeryToken]
        [Authorize(Roles="Edit")]
        public IActionResult ImportCreditcard(IFormFile? file, string? encoding)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { message = "請選擇信用卡 CSV 檔。" });
            try
            {
                using var s = file.OpenReadStream();
                var r = _importer.ImportCreditcard(s, ResolveEncoding(encoding ?? "big5"));
                return Json(r);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "匯入信用卡資料失敗：" + ex.Message });
            }
        }

        // 原始月結快照與更正分開保存；由同一個財務寫入鎖保護交易及月結。
        [HttpPost, ValidateAntiForgeryToken, Authorize(Roles = "Edit")]
        public IActionResult RunSummary([FromBody] SummaryInputModel input)
        {
            if (!ModelState.IsValid || input.Year is < 1900 or > 9998 || input.Month is < 1 or > 12)
                return BadRequest(new { message = "年月或收入格式不正確。" });
            var month=$"{input.Year:0000}-{input.Month:00}";
            try
            {
                var before=_workspace.Read();
                if(before.Months.Any(m=>m.Month==month))
                    return Json(new FinanceSummaryResult {Already=1,Version=before.Version});
                var state=_workspace.Execute(new BudgetCommand {Action="close",Month=month,Amount=input.Own,
                    OperationId=input.OperationId,Version=input.Version,Reason=input.Reason??"月結"},User.Identity!.Name!);
                var position=BudgetEngine.Position(state,month);
                return Json(new FinanceSummaryResult {Already=2,Version=state.Version,Spare=position.Spare,Totalproperty=position.Total});
            }
            catch(CreditcardMismatchException ex)
            {
                return Json(new FinanceSummaryResult {Already=-1,Errors=ex.Errors});
            }
            catch(Exception ex) when(ex is ArgumentException or InvalidOperationException or FormatException or OverflowException)
            {
                return BadRequest(new {message=ex.Message});
            }
        }

        [HttpPost, ValidateAntiForgeryToken, Authorize(Roles = "Edit")]
        public IActionResult RollbackSummary([FromBody] SummaryInputModel input)
        {
            if (!ModelState.IsValid || input.Year is < 1900 or > 9998 || input.Month is < 1 or > 12)
                return BadRequest(new { message = "年月格式不正確。" });
            try
            {
                var state=_workspace.Execute(new BudgetCommand {Action="rollback",Month=$"{input.Year:0000}-{input.Month:00}",
                    OperationId=input.OperationId,Version=input.Version,Reason=input.Reason??""},User.Identity!.Name!);
                return Json(new FinanceSummaryResult {Already=-2,Version=state.Version});
            }
            catch(Exception ex) when(ex is ArgumentException or InvalidOperationException or FormatException or OverflowException)
            {
                return BadRequest(new {message=ex.Message});
            }
        }

        // 步驟 4（輔助）：自動帶入「未出帳信用卡」
        // ＝ creditcard 中「結帳月的次月整月」金額合計。
        // 語意：這一期帳單的結帳日之後才刷、尚未出帳的部分。刻意只取次月整月（不取「月底之後全部」），
        // 否則補結舊月份時會把早已出帳付掉的金額重複算進來。
        [HttpPost]
        [ValidateAntiForgeryToken]
        public IActionResult UnbilledCredit([FromBody] SummaryInputModel input)
        {
            if (input == null || input.Month < 1 || input.Month > 12)
                return BadRequest(new { message = "月份不正確。" });
            if (input.Year < 1900 || input.Year > 9998) // 9998：AddMonths 在 9999-12 會溢位
                return BadRequest(new { message = "年份不正確。" });

            var nextStart = new DateTime(input.Year, input.Month, 1).AddMonths(1);
            var nextEnd = nextStart.AddMonths(1); // 次月整月 [nextStart, nextEnd)

            var rows = _context.Creditcards.AsNoTracking()
                .Where(c => c.Date >= nextStart && c.Date < nextEnd)
                .ToList();

            return Json(new UnbilledCreditResult
            {
                Month = nextStart.ToString("yyyy-MM"),
                Count = rows.Count,
                Amount = rows.Sum(c => c.Amount)
            });
        }

        // 步驟 4（輔助）：自動帶入「已投入投資」＝累計投入淨額。
        // 上界取「結算月月底」——補結舊月份時，不能把之後才發生的買賣算進去。
        // 投資數字比照 InvestmentController 要 Select 角色。
        [HttpPost]
        [ValidateAntiForgeryToken]
        [Authorize(Roles = "Select")]
        public IActionResult NetDeployed([FromBody] SummaryInputModel input)
        {
            if (input == null || input.Month < 1 || input.Month > 12)
                return BadRequest(new { message = "月份不正確。" });
            if (input.Year < 1900 || input.Year > 9998) // 9998：AddMonths(1) 在 9999-12 會溢位
                return BadRequest(new { message = "年份不正確。" });

            return Json(new NetDeployedResult
            {
                Amount = _investment.GetNetDeployedForClose(input.Year, input.Month),
                AsOfMonth = $"{input.Year}-{input.Month:00}"
            });
        }

        // 保存每次核對的輸入、當時帳面、倒回明細與結果。
        [HttpPost, ValidateAntiForgeryToken, Authorize(Roles="Edit")]
        public IActionResult AssetCheck([FromBody] AssetCheckRequest req)
        {
            if(req==null || !ModelState.IsValid) return BadRequest(new {message="核對欄位格式不正確。"});
            try { return Json(_workspace.Check(req,User.Identity!.Name!)); }
            catch(Exception ex) when(ex is ArgumentException or InvalidOperationException or FormatException or OverflowException)
            {
                return BadRequest(new {message=ex.Message});
            }
        }
    }
}
