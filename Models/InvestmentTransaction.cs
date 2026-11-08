using System;

namespace ERPAPP.Models;

// 投資交易。Amount 一律為「實際扣款／入帳金額」（含手續費與證交稅）。
// 已實現損益不落地——由 InvestmentCalculator 讀取時導出，事後改/刪交易才不會留下過期數字。
public partial class InvestmentTransaction
{
    public int Id { get; set; }

    public int HoldingId { get; set; }

    public DateTime Date { get; set; }

    public string TxType { get; set; } = string.Empty;     // 期初 | 買 | 賣 | 配息

    public decimal? Quantity { get; set; }                 // 股數；虛擬貨幣為 NULL；台股買/賣必填（程式驗證）

    public int Amount { get; set; }

    public string FundSource { get; set; } = string.Empty; // 帳內 | 帳外

    public string? Note { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.Now;
}
