using System.ComponentModel.DataAnnotations;

namespace ERPAPP.Dto
{
    public class NewsDto
    {
        public int Id { get; set; }

        [DataType(DataType.Date)]
        [Display(Name = "日期")]
        public DateTime Date { get; set; }

        [Display(Name = "類別")]
        [Required(ErrorMessage = "請選取類別")]
        public string? Category { get; set; }

        [Display(Name = "金額")]
        [Required(ErrorMessage = "請輸入金額")]
        [Range(0.01, double.MaxValue, ErrorMessage = "金額必須大於0")]
        public int Amount { get; set; } // 將 double 改為 decimal

        [Display(Name = "成員")]
        [Required(ErrorMessage = "請輸入成員")]
        public string? Member { get; set; }

        [Display(Name = "帳戶")]
        [Required(ErrorMessage = "請輸入帳戶")]
        public string? Account { get; set; }

        [Display(Name = "收支")]
        public string? TransactionType { get; set; }
    }
    // 這個類別用來裝載未匹配信用卡的錯誤紀錄 (如果有的話)
    public class UnmatchedRecord
    {
        public string ProblemType { get; set; } = string.Empty;
        public DateTime Date { get; set; }
        public int Amount { get; set; }
        public string Category { get; set; } = string.Empty;
    }

    // 2. 這是 SP 執行的最終結果
    public class FinanceSummaryResult
    {
        // SP 總是會回傳的第一個結果
        public int Already { get; set; } // 2正常輸入成功 1已輸入過 -1信用卡資料有誤 -2 重置輸入資料

        // 只有成功 (Already=2) 時才有的值
        public int? Phone { get; set; }
        public int? Gogoro { get; set; }
        public int? Electricity { get; set; }
        public int? Water { get; set; }
        public int? Gas { get; set; }
        public int? Negtive { get; set; }

        // 只有Already=-1時才有的列表
        public List<UnmatchedRecord> Errors { get; set; }

        public FinanceSummaryResult()
        {
            // 初始化列表，避免 null 參考錯誤
            Errors = new List<UnmatchedRecord>();
        }
    }
    public class SummaryInputModel
    {
        // 使用 Data Annotations 確保輸入資料符合預期
        [Required(ErrorMessage = "請輸入年份")]
        [Range(2000, 3000, ErrorMessage = "請輸入有效的年份")]
        [Display(Name = "年份")]
        public int Year { get; set; }

        [Required(ErrorMessage = "請輸入月份")]
        [Range(1, 12, ErrorMessage = "請輸入有效的月份 (1-12)")]
        [Display(Name = "月份")]
        public int Month { get; set; }

        // 這裡對應 SP 的 @own 參數，我們將其命名為 StartingAssets
        [Required(ErrorMessage = "請輸入收入")]
        [Display(Name = "收入")]
        public int Own { get; set; }
    }
}
