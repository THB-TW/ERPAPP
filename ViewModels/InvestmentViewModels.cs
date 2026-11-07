using ERPAPP.Models;
using ERPAPP.Services;

namespace ERPAPP.ViewModels
{
    // 投資總覽（Index）
    public class InvestmentIndexViewModel
    {
        public List<PositionRow> Positions { get; set; } = new();
        public int NetDeployed { get; set; }              // 累計投入淨額（當下）

        // 財產分配（堆疊長條的五段）：非投資三段來自最新一列 Property，
        // 可用餘額已扣掉累計投入淨額（那部分錢已變成投資，不能兩邊都算）
        public string PropertyMonth { get; set; } = "—";
        public int SpareAfterInvest { get; set; }         // sparemoney − NetDeployed，可為負
        public int Tuitionfee { get; set; }
        public int BudgetReserve { get; set; }
        public int StockMarketValue { get; set; }
        public int CryptoMarketValue { get; set; }

        public int TotalCost { get; set; }
        public int TotalMarketValue { get; set; }
        public int TotalUnrealized { get; set; }
    }

    // 交易列表＋新增表單
    public class InvestmentTransactionsViewModel
    {
        public List<InvestmentTransaction> Rows { get; set; } = new();
        public List<InvestmentHolding> Holdings { get; set; } = new();
        public Dictionary<int, string> HoldingNames { get; set; } = new();
    }

    // 新增／編輯交易的表單資料
    public class InvestmentTransactionInput
    {
        public int Id { get; set; }
        public int HoldingId { get; set; }
        public DateTime Date { get; set; } = DateTime.Today;
        public string TxType { get; set; } = InvestmentTerms.TxBuy;
        public decimal? Quantity { get; set; }
        public int Amount { get; set; }
        public string FundSource { get; set; } = InvestmentTerms.SourceInternal;
        public string? Note { get; set; }
    }

    // 填市值：每個標的一列
    public class ValuationRowInput
    {
        public int HoldingId { get; set; }
        public string AssetClass { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public decimal Quantity { get; set; }             // 顯示用（台股）
        public decimal? UnitPrice { get; set; }           // 台股輸入：每股股價
        public int? MarketValue { get; set; }             // 虛擬貨幣輸入：市值總額
        public string LastInfo { get; set; } = string.Empty; // 上次快照的摘要文字
    }

    public class ValuationInputModel
    {
        public List<ValuationRowInput> Rows { get; set; } = new();
    }

    // 標的維護
    public class HoldingsViewModel
    {
        public List<InvestmentHolding> Holdings { get; set; } = new();
        public string NewSymbol { get; set; } = string.Empty;
        public string NewName { get; set; } = string.Empty;
    }
}
