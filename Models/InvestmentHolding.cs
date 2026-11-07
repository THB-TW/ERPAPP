using System;

namespace ERPAPP.Models;

// 投資標的：台股記到個股（代號＋名稱），虛擬貨幣整體視為單一標的。
// 資料表由 docs/sql/investment.sql 直接建立（本專案不跑 EF migration）。
public partial class InvestmentHolding
{
    public int Id { get; set; }

    public string AssetClass { get; set; } = string.Empty; // 台股 | 虛擬貨幣

    public string? Symbol { get; set; }                    // 股票代號；虛擬貨幣為 NULL

    public string Name { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;

    // EF 插入時會帶明確值，資料庫 DEFAULT 不會觸發，故在此給值
    public DateTime CreatedAt { get; set; } = DateTime.Now;
}
