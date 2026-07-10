using ERPAPP.Models;

namespace ERPAPP.ViewModels
{
    // 信用卡帳單查詢（唯讀）。creditcard 表無主鍵，僅供核對檢視，
    // 不提供新增/修改/刪除——資料一律由月結精靈的帳單匯入寫入。
    public class CreditcardQueryViewModel
    {
        public List<Creditcard> Rows { get; set; } = new();

        // 查詢條件（回填到表單）
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
        public string? Keyword { get; set; }

        // 合計：月結核對時要看的就是這個數字
        public int Count { get; set; }
        public int Total { get; set; }
    }
}
