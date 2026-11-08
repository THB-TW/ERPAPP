using System;

namespace ERPAPP.Models;

// 市值快照：台股只存 UnitPrice（市值由讀取端以「目前股數 × 股價」重算，
// 不存算好的市值——否則買賣後股數變了、市值卻凍在舊股數），
// 虛擬貨幣直接存 MarketValue 總額。
public partial class InvestmentValuation
{
    public int Id { get; set; }

    public int HoldingId { get; set; }

    public DateTime AsOf { get; set; }

    public decimal? UnitPrice { get; set; }   // 台股：每股股價

    public int? MarketValue { get; set; }     // 虛擬貨幣：市值總額

    public DateTime CreatedAt { get; set; } = DateTime.Now;
}
