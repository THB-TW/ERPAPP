using ERPAPP.Dto;
using ERPAPP.StoredProcedure;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace ERPAPP.Controllers
{
    public class FinanceController : Controller
    {
        private readonly FinanceSpExecutor _spExecutor;

        public FinanceController(FinanceSpExecutor spExecutor)
        {
            _spExecutor = spExecutor;
        }
        // 1. 顯示輸入表單 (GET)
        [HttpGet]
        public IActionResult SummaryInput()
        {
            // 可以給予預設值，例如當月日期
            var model = new SummaryInputModel
            {
                Year = DateTime.Now.Year,
                Month = DateTime.Now.Month
            };
            return View(model);
        }

        // 2. 接收表單並執行 SP (POST)
        [HttpPost]
        [ValidateAntiForgeryToken] // 防止跨站請求偽造CSRF 攻擊
        public IActionResult RunSummary(SummaryInputModel inputModel)
        {
            if (!ModelState.IsValid)
            {
                return View("SummaryInput", inputModel);
            }

            try
            {
                FinanceSummaryResult result = _spExecutor.ExecuteSummary(
                    inputModel.Year,
                    inputModel.Month,
                    inputModel.Own
                );
                // 🚨 修正：將完整的 C# 結果物件序列化為 JSON 字串
                TempData["SpResultJson"] = JsonSerializer.Serialize(result);
            }
            catch (Exception ex)
            {
                TempData["AlertMessage"] = "❌ 致命錯誤！執行 Stored Procedure 失敗: " + ex.Message;
            }
            return View("SummaryInput", inputModel);
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
