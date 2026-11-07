using ERPAPP.Models;
using Microsoft.EntityFrameworkCore;

namespace ERPAPP.Services
{
    // 持倉表的一列：部位＋最新市值。Error 非空代表該標的交易資料有誤（例如超賣），
    // 其餘欄位不可信，頁面應顯示警示列。
    public class PositionRow
    {
        public InvestmentHolding Holding { get; set; } = null!;
        public string? Error { get; set; }
        public decimal Quantity { get; set; }
        public int Cost { get; set; }
        public int TotalBuy { get; set; }
        public int RealizedPnl { get; set; }
        public int Dividends { get; set; }
        public bool HasValuation { get; set; }
        public DateTime? ValuationAsOf { get; set; }
        public decimal? UnitPrice { get; set; }   // 台股：最新股價
        public int MarketValue { get; set; }      // 台股＝股數×最新股價；虛擬貨幣＝最新總額；未估值時回退成本

        public int Unrealized => MarketValue - Cost;
        public int TotalReturn => Unrealized + RealizedPnl + Dividends;
        // 報酬率分母 = 累計買入金額（含期初）；<=0 時無意義，頁面顯示「—」
        public decimal? ReturnRate => TotalBuy > 0 ? Math.Round((decimal)TotalReturn / TotalBuy * 100, 2) : null;
    }

    // 資料存取＋組裝：載入交易算部位、配最新快照、算累計投入淨額。
    // 兩個 controller（Investment、MonthlyClose）共用，累計投入淨額只有這一份實作。
    public class InvestmentService
    {
        private readonly ErpdbContext _context;

        public InvestmentService(ErpdbContext context)
        {
            _context = context;
        }

        public List<PositionRow> GetPositions(bool includeInactive = false)
        {
            var holdings = _context.InvestmentHoldings.AsNoTracking()
                .Where(h => includeInactive || h.IsActive)
                .OrderBy(h => h.AssetClass).ThenBy(h => h.Symbol)
                .ToList();
            var txs = _context.InvestmentTransactions.AsNoTracking().ToList();
            var vals = _context.InvestmentValuations.AsNoTracking().ToList();

            var rows = new List<PositionRow>();
            foreach (var h in holdings)
            {
                var row = new PositionRow { Holding = h };
                try
                {
                    var pos = InvestmentCalculator.Compute(h, txs.Where(t => t.HoldingId == h.Id));
                    row.Quantity = pos.Quantity;
                    row.Cost = (int)Math.Round(pos.Cost, MidpointRounding.AwayFromZero);
                    row.TotalBuy = pos.TotalBuy;
                    row.RealizedPnl = pos.RealizedPnl;
                    row.Dividends = pos.Dividends;
                }
                catch (InvalidOperationException ex)
                {
                    row.Error = ex.Message;
                    rows.Add(row);
                    continue;
                }

                // 最新快照：AsOf 相同時取 Id 較大者，結果才決定
                var latest = vals.Where(v => v.HoldingId == h.Id)
                    .OrderByDescending(v => v.AsOf).ThenByDescending(v => v.Id)
                    .FirstOrDefault();

                if (h.AssetClass == InvestmentTerms.StockClass)
                {
                    if (latest?.UnitPrice is decimal price)
                    {
                        row.HasValuation = true;
                        row.ValuationAsOf = latest.AsOf;
                        row.UnitPrice = price;
                        row.MarketValue = (int)Math.Round(row.Quantity * price, MidpointRounding.AwayFromZero);
                    }
                    else
                    {
                        row.MarketValue = row.Cost; // 未估值：回退成本，頁面標記
                    }
                }
                else
                {
                    if (latest?.MarketValue is int mv)
                    {
                        row.HasValuation = true;
                        row.ValuationAsOf = latest.AsOf;
                        row.MarketValue = mv;
                    }
                    else
                    {
                        row.MarketValue = row.Cost;
                    }
                }
                rows.Add(row);
            }
            return rows;
        }

        // 累計投入淨額 = 期初宣告值 + 期初次月起的帳內買 − 帳內賣（見 docs/adr/0001）。
        // upperExclusive 必須帶：補結舊月份時不能把之後才發生的買賣算進去。
        public int GetNetDeployed(DateTime upperExclusive)
        {
            var opening = _context.InvestmentOpenings.AsNoTracking().OrderBy(o => o.Id).FirstOrDefault();
            var baseValue = opening?.NetDeployed ?? 0;
            var lower = opening?.AsOfMonth.AddMonths(1) ?? DateTime.MinValue;

            var window = _context.InvestmentTransactions.AsNoTracking()
                .Where(t => t.FundSource == InvestmentTerms.SourceInternal
                         && t.Date >= lower && t.Date < upperExclusive);

            var buys = window.Where(t => t.TxType == InvestmentTerms.TxBuy).Sum(t => (int?)t.Amount) ?? 0;
            var sells = window.Where(t => t.TxType == InvestmentTerms.TxSell).Sum(t => (int?)t.Amount) ?? 0;
            return baseValue + buys - sells;
        }

        public int GetNetDeployedNow() => GetNetDeployed(DateTime.Today.AddDays(1));

        // 月結用：以「結算月月底」為上界
        public int GetNetDeployedForClose(int year, int month) =>
            GetNetDeployed(new DateTime(year, month, 1).AddMonths(1));

        // 交易存檔前的驗證：把候選清單丟給計算器跑一遍，壞資料回錯誤訊息（null = 通過）
        public string? ValidateTransactions(InvestmentHolding holding, IEnumerable<InvestmentTransaction> transactions)
        {
            try
            {
                InvestmentCalculator.Compute(holding, transactions);
                return null;
            }
            catch (InvalidOperationException ex)
            {
                return ex.Message;
            }
        }
    }
}
