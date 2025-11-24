
using ERPAPP.Dto;
using ERPAPP.Models;
namespace ERPAPP.ViewModels
{
    public class NewsEditViewModel
    {
        public NewsDto EditSpec { get; set; }

        public string CategoryName { get; set; } = null!;

        public string Type { get; set; } = null!;
    }
    public class BudgetReportViewModel
    {
        // 1911-01-01 的那筆資料 (初始預算)
        public Budget InitialBudget { get; set; }

        // 資料庫中最新的那筆月結資料
        public Budget LatestBudget { get; set; }

        // 用於圖表：所有 1911 以外的月結資料
        public List<Budget> AllMonthlyBudgets { get; set; }

        // 🌟 新增：用於 Property 圖表的資料
        public List<Property> AllPropertyData { get; set; }

        // 輔助屬性：顯示最新月份
        public string LatestMonthDisplay { get; set; }

        public BudgetReportViewModel()
        {
            AllMonthlyBudgets = new List<Budget>();
            AllPropertyData = new List<Property>();
        }
    }
}
