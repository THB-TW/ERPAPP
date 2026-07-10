using System.Text;
using ERPAPP.Dto;
using ERPAPP.Models;
using ERPAPP.Services;
using ERPAPP.StoredProcedure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ERPAPP.Controllers
{
    // 一鍵月結精靈：CSV 匯入 → 信用卡核對+計算 → 總資產核對
    public class MonthlyCloseController : Controller
    {
        private readonly ErpdbContext _context;
        private readonly CsvImportService _importer;
        private readonly FinanceSpExecutor _spExecutor;

        public MonthlyCloseController(ErpdbContext context, CsvImportService importer, FinanceSpExecutor spExecutor)
        {
            _context = context;
            _importer = importer;
            _spExecutor = spExecutor;
        }

        [HttpGet]
        public IActionResult Index()
        {
            // 預設帶入上個月（月結多在下個月初進行）
            var prev = DateTime.Now.AddMonths(-1);
            return View(new SummaryInputModel { Year = prev.Year, Month = prev.Month });
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

        // 步驟 3：信用卡核對 + 計算彙總（沿用既有 sp_FinanceSummary）
        [HttpPost]
        [ValidateAntiForgeryToken]
        public IActionResult RunSummary([FromBody] SummaryInputModel input)
        {
            if (input == null || input.Month < 1 || input.Month > 12)
                return BadRequest(new { message = "月份不正確。" });
            try
            {
                var result = _spExecutor.ExecuteSummary(input.Year, input.Month, input.Own);
                return Json(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "執行彙總失敗：" + ex.Message });
            }
        }

        // 步驟 3（撤銷）：撤銷/重置當月彙總（觸發 sp_FinanceSummary 的 own=-1 重置分支）
        // 只允許撤銷「最近一次彙總的月份」——若不是最新月，SP 會略過重置往下重覆 INSERT，
        // 造成 budget/Property 重覆列，故在此先擋掉。
        [HttpPost]
        [ValidateAntiForgeryToken]
        public IActionResult RollbackSummary([FromBody] SummaryInputModel input)
        {
            if (input == null || input.Month < 1 || input.Month > 12)
                return BadRequest(new { message = "月份不正確。" });

            var start = new DateTime(input.Year, input.Month, 1);
            var latest = _context.Properties.AsNoTracking()
                .OrderByDescending(p => p.Date)
                .Select(p => p.Date)
                .FirstOrDefault();

            if (latest == default)
                return BadRequest(new { message = "目前沒有任何彙總紀錄可撤銷。" });
            if (latest != start)
                return BadRequest(new { message = $"只能撤銷最近一次彙總的月份（目前最近為 {latest:yyyy-MM}）。" });

            try
            {
                var result = _spExecutor.ExecuteSummary(input.Year, input.Month, -1);
                return Json(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "撤銷彙總失敗：" + ex.Message });
            }
        }

        // 步驟 4：總資產核對（加總實際餘額，與帳面 Totalproperty 比對；可自動倒回次月交易）
        [HttpPost]
        [ValidateAntiForgeryToken]
        public IActionResult AssetCheck([FromBody] AssetCheckRequest req)
        {
            if (req == null || req.Month < 1 || req.Month > 12)
                return BadRequest(new { message = "月份不正確。" });

            var start = new DateTime(req.Year, req.Month, 1);
            var end = start.AddMonths(1).AddDays(-1); // 當月月底

            var result = new AssetCheckResult
            {
                ActualRaw = req.Cash + req.Ipass + req.Bank + req.UnbilledCredit + req.Adjust
            };

            if (req.AutoRollback)
            {
                // 次月（月底之後）交易：加回月底當下快照
                // 月底餘額 = 目前餘額 + 次月支出 - 次月收入
                var next = _context.Transactions.AsNoTracking()
                    .Where(t => t.Date > end)
                    .ToList();

                foreach (var acc in new[] { "現金", "銀行" })
                {
                    var exp = next.Where(t => t.Account == acc && t.TransactionType == "支").Sum(t => t.Amount);
                    var inc = next.Where(t => t.Account == acc && t.TransactionType == "收").Sum(t => t.Amount);
                    if (exp == 0 && inc == 0) continue;

                    var net = exp - inc;
                    result.Rollbacks.Add(new AccountRollback
                    {
                        Account = acc,
                        NextMonthExpense = exp,
                        NextMonthIncome = inc,
                        Net = net
                    });
                    result.RollbackTotal += net;
                }
            }

            result.ActualAdjusted = result.ActualRaw + result.RollbackTotal;

            var book = _context.Properties.AsNoTracking().FirstOrDefault(p => p.Date == start);
            if (book != null && book.Totalproperty.HasValue)
            {
                result.HasBook = true;
                result.BookTotalproperty = book.Totalproperty;
                result.Diff = result.ActualAdjusted - book.Totalproperty.Value;
            }

            return Json(result);
        }
    }
}
