using ERPAPP.Models;

namespace ERPAPP.Services
{
    // 領域字串常數：與資料庫存的值一致（見 docs/sql/investment.sql）
    public static class InvestmentTerms
    {
        public const string StockClass = "台股";
        public const string CryptoClass = "虛擬貨幣";

        public const string TxOpening = "期初";
        public const string TxBuy = "買";
        public const string TxSell = "賣";
        public const string TxDividend = "配息";

        public const string SourceInternal = "帳內";
        public const string SourceExternal = "帳外";
    }

    // 一個標的算完之後的部位
    public class InvestmentPosition
    {
        public InvestmentHolding Holding { get; set; } = null!;
        public decimal Quantity { get; set; }     // 目前股數（虛擬貨幣恆為 0，無單位概念）
        public decimal Cost { get; set; }         // 持有成本：台股移動平均、虛擬貨幣成本收回（可為負）
        public int TotalBuy { get; set; }         // 累計買入金額（含期初），報酬率分母
        public int RealizedPnl { get; set; }      // 已實現損益合計（僅台股；虛擬貨幣不認列）
        public int Dividends { get; set; }        // 配息合計
    }

    // 純計算，不碰資料庫——輸入交易清單、輸出部位。壞資料丟 InvalidOperationException，
    // 由呼叫端決定呈現方式（表單擋下 / 頁面警示列），不要讓它冒成 500。
    public static class InvestmentCalculator
    {
        public static InvestmentPosition Compute(InvestmentHolding holding, IEnumerable<InvestmentTransaction> transactions)
        {
            var pos = new InvestmentPosition { Holding = holding };
            var isStock = holding.AssetClass == InvestmentTerms.StockClass;

            foreach (var tx in transactions.OrderBy(t => t.Date).ThenBy(t => t.Id))
            {
                switch (tx.TxType)
                {
                    case InvestmentTerms.TxOpening:
                    case InvestmentTerms.TxBuy:
                        if (isStock)
                        {
                            if (tx.Quantity is not > 0)
                                throw new InvalidOperationException(
                                    $"「{holding.Name}」{tx.Date:yyyy-MM-dd} 的「{tx.TxType}」缺少股數（交易 #{tx.Id}）。");
                            pos.Quantity += tx.Quantity.Value;
                        }
                        pos.Cost += tx.Amount;
                        pos.TotalBuy += tx.Amount;
                        break;

                    case InvestmentTerms.TxSell:
                        if (isStock)
                        {
                            if (tx.Quantity is not > 0)
                                throw new InvalidOperationException(
                                    $"「{holding.Name}」{tx.Date:yyyy-MM-dd} 的「賣」缺少股數（交易 #{tx.Id}）。");
                            if (pos.Quantity <= 0 || tx.Quantity.Value > pos.Quantity)
                                throw new InvalidOperationException(
                                    $"「{holding.Name}」{tx.Date:yyyy-MM-dd} 賣出 {tx.Quantity:0.####} 股，但當時僅持有 {pos.Quantity:0.####} 股（交易 #{tx.Id}）。");

                            // 移動平均：按平均單價結轉成本，差額即該筆已實現損益
                            var avg = pos.Cost / pos.Quantity;
                            var costOut = avg * tx.Quantity.Value;
                            pos.RealizedPnl += (int)Math.Round(tx.Amount - costOut, MidpointRounding.AwayFromZero);
                            pos.Quantity -= tx.Quantity.Value;
                            pos.Cost -= costOut;
                            if (pos.Quantity == 0) pos.Cost = 0; // 賣光時清掉移動平均殘餘的小數
                        }
                        else
                        {
                            // 成本收回法：賣出金額直接沖減成本，不認列損益；收回超過投入時成本為負
                            pos.Cost -= tx.Amount;
                        }
                        break;

                    case InvestmentTerms.TxDividend:
                        pos.Dividends += tx.Amount;
                        break;

                    default:
                        throw new InvalidOperationException(
                            $"「{holding.Name}」有未知的交易類型「{tx.TxType}」（交易 #{tx.Id}）。");
                }
            }
            return pos;
        }
    }
}
