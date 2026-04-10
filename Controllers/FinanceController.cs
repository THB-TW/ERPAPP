using ERPAPP.Dto;
using ERPAPP.StoredProcedure;
using ERPAPP.Models;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ERPAPP.Controllers
{
    public class FinanceController : Controller
    {
        private readonly FinanceSpExecutor _spExecutor;
        private readonly ErpdbContext _context;

        public FinanceController(FinanceSpExecutor spExecutor, ErpdbContext context)
        {
            _spExecutor = spExecutor;
            _context = context;
        }
        // 1. 顯示輸入表單 (GET)
        [HttpGet]
        public async Task<IActionResult> SummaryInput()
        {
            // 可以給予預設值，例如當月日期
            var previousMonth = DateTime.Now.AddMonths(-1);
            var model = new SummaryInputModel
            {
                Year = previousMonth.Year,
                Month = previousMonth.Month
            };

            await FillLatestSummaryAsync(model);
            return View(model);
        }

        // 2. 接收表單並執行 SP (POST)
        [HttpPost]
        [ValidateAntiForgeryToken] // 防止跨站請求偽造CSRF 攻擊
        public async Task<IActionResult> RunSummary(SummaryInputModel inputModel)
        {
            if (!ModelState.IsValid)
            {
                await FillLatestSummaryAsync(inputModel);
                return View("SummaryInput", inputModel);
            }

            try
            {
                FinanceSummaryResult result = _spExecutor.ExecuteSummary(
                    inputModel.Year,
                    inputModel.Month,
                    inputModel.Own
                );
                // 將完整的 C# 結果物件序列化為 JSON 字串
                TempData["SpResultJson"] = JsonSerializer.Serialize(result);
            }
            catch (Exception ex)
            {
                TempData["AlertMessage"] = "❌ 致命錯誤！執行 Stored Procedure 失敗: " + ex.Message;
            }

            // ✅ 重新填入財務摘要，確保表格不消失
            await FillLatestSummaryAsync(inputModel);
            return View("SummaryInput", inputModel);
        }

        // ── 私有輔助方法：查詢最新月份財務摘要 + 當月信用卡明細，填入 model ──
        private async Task FillLatestSummaryAsync(SummaryInputModel model)
        {
            var initialDate = new DateTime(1911, 1, 1);

            var latestProperty = await _context.Properties
                .AsNoTracking()
                .Where(p => p.Date != initialDate)
                .OrderByDescending(p => p.Date)
                .FirstOrDefaultAsync();

            var latestBudget = await _context.Budgets
                .AsNoTracking()
                .Where(b => b.Date != initialDate)
                .OrderByDescending(b => b.Date)
                .FirstOrDefaultAsync();

            if (latestProperty != null)
            {
                model.LatestMonthDisplay  = latestProperty.Date.ToString("yyyy-MM");
                model.LatestOwn           = latestProperty.Own;
                model.LatestSparemoney    = latestProperty.Sparemoney;
                model.LatestTuitionfee    = latestProperty.Tuitionfee;
                model.LatestBudget        = latestProperty.Budget;
                model.LatestTotalproperty = latestProperty.Totalproperty;
            }

            if (latestBudget != null)
            {
                model.LatestGete = latestBudget.Gete;
                model.LatestMonthDisplay ??= latestBudget.Date.ToString("yyyy-MM");
            }

            // ── 查詢當月份（以現在時間為主）信用卡明細 ──
            var now = DateTime.Now;
            var startDate = new DateTime(now.Year, now.Month, 1);
            var endDate   = startDate.AddMonths(1);

            var cards = await _context.Creditcards
                .AsNoTracking()
                .Where(c => c.Date >= startDate && c.Date < endDate)
                .OrderBy(c => c.Date)
                .ToListAsync();

            model.CreditcardItems = cards.Select(c => new CreditcardItem
            {
                DateDisplay = c.Date.ToString("yyyy-MM-dd"),
                Item        = c.Item ?? string.Empty,
                Amount      = c.Amount ?? 0
            }).ToList();

            model.CreditcardTotal = model.CreditcardItems.Sum(c => c.Amount);
        }

        [HttpGet]
        public async Task<IActionResult> BudgetReport()
        {
            try
            {
                var viewModel = await _spExecutor.GetBudgetReportDataAsync();

                if (viewModel == null)
                {
                    TempData["AlertMessage"] = "❌ 錯誤：找不到預算報表資料。";
                    return RedirectToAction("SummaryInput");
                }
                return View(viewModel);
            }
            catch (Exception ex)
            {
                TempData["AlertMessage"] = "❌ 致命錯誤！載入報表失敗: " + ex.Message;
                return RedirectToAction("SummaryInput");
            }
        }
    }
}
