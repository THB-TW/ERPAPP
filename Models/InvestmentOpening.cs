using System;

namespace ERPAPP.Models;

// 期初投入額：宣告值，不由交易推導（見 docs/adr/0001-two-cost-numbers-for-investments.md）。
// 語意上只有一列；程式一律取第一列，調整就是 UPDATE 這一列。
public partial class InvestmentOpening
{
    public int Id { get; set; }

    public DateTime AsOfMonth { get; set; }   // 期初時點（該月月底前的投入都已被歷次月結消化）

    public int NetDeployed { get; set; }      // 期初累計投入淨額

    public string? Note { get; set; }
}
