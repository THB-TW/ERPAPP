using System;

namespace ERPAPP.Models;


// 每月預算上限快照：一個月份一列，Month 一律是該月 1 號。
// 資料表見 docs/sql/budget-cap.sql（不跑 EF migration）。
public partial class BudgetCap
{
    public DateTime Month { get; set; }

    // 10 個儲備類別：結餘進總儲備金
    public int Food { get; set; }
    public int Car { get; set; }
    public int Fun { get; set; }
    public int Study { get; set; }
    public int Cloth { get; set; }
    public int Articles { get; set; }
    public int Furniture { get; set; }
    public int Hair { get; set; }
    public int Health { get; set; }
    public int Other { get; set; }

    // 固定支出：結餘只回當月盈餘
    public int Phone { get; set; }
    public int Gogoro { get; set; }

    // 學費儲備（每月提撥）
    public int Tuition { get; set; }

    public DateTime UpdatedAt { get; set; }
}
