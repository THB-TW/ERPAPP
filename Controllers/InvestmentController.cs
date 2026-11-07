using ERPAPP.Models;
using ERPAPP.Services;
using ERPAPP.ViewModels;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ERPAPP.Controllers
{
    // 投資組合：持倉總覽／交易 CRUD／市值快照／標的維護。
    // 看要 Select、寫要 Edit，比照 TransactionsController。
    [Authorize(Roles = "Select")]
    public class InvestmentController : Controller
    {
        private readonly ErpdbContext _context;
        private readonly InvestmentService _service;

        public InvestmentController(ErpdbContext context, InvestmentService service)
        {
            _context = context;
            _service = service;
        }

        // 總覽：持倉表 + 財產分配 + 累計投入淨額
        public IActionResult Index()
        {
            var positions = _service.GetPositions();
            var netDeployed = _service.GetNetDeployedNow();

            var latestProperty = _context.Properties.AsNoTracking()
                .OrderByDescending(p => p.Date).FirstOrDefault();

            var vm = new InvestmentIndexViewModel
            {
                Positions = positions,
                NetDeployed = netDeployed,
                PropertyMonth = latestProperty?.Date.ToString("yyyy-MM") ?? "—",
                SpareAfterInvest = (latestProperty?.Sparemoney ?? 0) - netDeployed,
                Tuitionfee = latestProperty?.Tuitionfee ?? 0,
                BudgetReserve = latestProperty?.Budget ?? 0,
                StockMarketValue = positions.Where(p => p.Error == null && p.Holding.AssetClass == InvestmentTerms.StockClass).Sum(p => p.MarketValue),
                CryptoMarketValue = positions.Where(p => p.Error == null && p.Holding.AssetClass == InvestmentTerms.CryptoClass).Sum(p => p.MarketValue),
                TotalCost = positions.Where(p => p.Error == null).Sum(p => p.Cost),
                TotalMarketValue = positions.Where(p => p.Error == null).Sum(p => p.MarketValue),
                TotalUnrealized = positions.Where(p => p.Error == null).Sum(p => p.Unrealized),
            };
            return View(vm);
        }

        // 交易列表
        public async Task<IActionResult> Transactions(int? holdingId)
        {
            var query = _context.InvestmentTransactions.AsNoTracking().AsQueryable();
            if (holdingId.HasValue)
                query = query.Where(t => t.HoldingId == holdingId.Value);

            var holdings = await _context.InvestmentHoldings.AsNoTracking()
                .OrderBy(h => h.AssetClass).ThenBy(h => h.Symbol).ToListAsync();

            return View(new InvestmentTransactionsViewModel
            {
                Rows = await query.OrderByDescending(t => t.Date).ThenByDescending(t => t.Id).ToListAsync(),
                Holdings = holdings.Where(h => h.IsActive).ToList(),
                HoldingNames = holdings.ToDictionary(h => h.Id, h => h.Symbol == null ? h.Name : $"{h.Symbol} {h.Name}")
            });
        }

        // 新增交易。期初(TxType=期初)不開放 UI 建立——只由期初建置 SQL 寫入，
        // 亂加期初會直接汙染累計投入淨額。
        [HttpPost]
        [ValidateAntiForgeryToken]
        [Authorize(Roles = "Edit")]
        public async Task<IActionResult> CreateTransaction(InvestmentTransactionInput input)
        {
            var error = await ValidateInput(input, original: null);
            if (error != null)
            {
                TempData["AlertMessage"] = "❌ " + error;
                return RedirectToAction(nameof(Transactions));
            }

            _context.InvestmentTransactions.Add(new InvestmentTransaction
            {
                HoldingId = input.HoldingId,
                Date = input.Date,
                TxType = input.TxType,
                Quantity = input.Quantity,
                Amount = input.Amount,
                FundSource = input.FundSource,
                Note = input.Note
            });
            await _context.SaveChangesAsync();
            TempData["AlertMessage"] = "✅ 已新增交易。";
            return RedirectToAction(nameof(Transactions));
        }

        [Authorize(Roles = "Edit")]
        public async Task<IActionResult> EditTransaction(int id)
        {
            var tx = await _context.InvestmentTransactions.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id);
            if (tx == null) return NotFound();

            ViewBag.Holdings = await _context.InvestmentHoldings.AsNoTracking()
                .OrderBy(h => h.AssetClass).ThenBy(h => h.Symbol).ToListAsync();
            ViewBag.IsOpening = tx.TxType == InvestmentTerms.TxOpening;

            return View(new InvestmentTransactionInput
            {
                Id = tx.Id,
                HoldingId = tx.HoldingId,
                Date = tx.Date,
                TxType = tx.TxType,
                Quantity = tx.Quantity,
                Amount = tx.Amount,
                FundSource = tx.FundSource,
                Note = tx.Note
            });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [Authorize(Roles = "Edit")]
        public async Task<IActionResult> EditTransaction(int id, InvestmentTransactionInput input)
        {
            if (id != input.Id) return NotFound();
            var tx = await _context.InvestmentTransactions.FirstOrDefaultAsync(t => t.Id == id);
            if (tx == null) return NotFound();

            // 期初列只允許改金額/股數/備註，型別與標的鎖定
            if (tx.TxType == InvestmentTerms.TxOpening)
            {
                input.TxType = InvestmentTerms.TxOpening;
                input.HoldingId = tx.HoldingId;
            }

            var error = await ValidateInput(input, original: tx);
            if (error != null)
            {
                TempData["AlertMessage"] = "❌ " + error;
                return RedirectToAction(nameof(EditTransaction), new { id });
            }

            tx.HoldingId = input.HoldingId;
            tx.Date = input.Date;
            tx.TxType = input.TxType;
            tx.Quantity = input.Quantity;
            tx.Amount = input.Amount;
            tx.FundSource = input.FundSource;
            tx.Note = input.Note;
            await _context.SaveChangesAsync();
            TempData["AlertMessage"] = "✅ 已更新交易。";
            return RedirectToAction(nameof(Transactions));
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [Authorize(Roles = "Edit")]
        public async Task<IActionResult> DeleteTransaction(int id)
        {
            var tx = await _context.InvestmentTransactions.FirstOrDefaultAsync(t => t.Id == id);
            if (tx == null) return RedirectToAction(nameof(Transactions));

            // 期初列不可刪——期初調整依 ADR-0001 走 UPDATE InvestmentOpening／編輯期初列
            if (tx.TxType == InvestmentTerms.TxOpening)
            {
                TempData["AlertMessage"] = "❌ 期初列不可刪除。要調整期初部位請用「編輯」改股數/金額。";
                return RedirectToAction(nameof(Transactions));
            }

            // 刪除後剩餘時間軸必須仍然合法（例如不能刪掉後面賣出所依賴的買進）
            var holding = await _context.InvestmentHoldings.AsNoTracking()
                .FirstOrDefaultAsync(h => h.Id == tx.HoldingId);
            if (holding != null)
            {
                var remaining = await _context.InvestmentTransactions.AsNoTracking()
                    .Where(t => t.HoldingId == tx.HoldingId && t.Id != id).ToListAsync();
                var error = _service.ValidateTransactions(holding, remaining);
                if (error != null)
                {
                    TempData["AlertMessage"] = "❌ 刪除後資料會不一致，未刪除：" + error;
                    return RedirectToAction(nameof(Transactions));
                }
            }

            _context.InvestmentTransactions.Remove(tx);
            await _context.SaveChangesAsync();
            TempData["AlertMessage"] = "✅ 已刪除交易。";
            return RedirectToAction(nameof(Transactions));
        }

        // 表單驗證＋整條時間軸重算驗證（超賣/無持股賣出在這裡被擋下）。
        // original＝編輯前的那一列（新增時為 null）。
        private async Task<string?> ValidateInput(InvestmentTransactionInput input, InvestmentTransaction? original)
        {
            var holding = await _context.InvestmentHoldings.AsNoTracking()
                .FirstOrDefaultAsync(h => h.Id == input.HoldingId);
            if (holding == null) return "找不到標的。";

            // 「期初」只在原列本來就是期初時才允許——一般交易改成期初會讓它
            // 從累計投入淨額消失，正是要防的「亂鑄期初」
            var allowed = original?.TxType == InvestmentTerms.TxOpening
                ? new[] { InvestmentTerms.TxOpening }
                : new[] { InvestmentTerms.TxBuy, InvestmentTerms.TxSell, InvestmentTerms.TxDividend };
            if (!allowed.Contains(input.TxType)) return "交易類型不正確。";

            if (input.FundSource != InvestmentTerms.SourceInternal && input.FundSource != InvestmentTerms.SourceExternal)
                return "資金來源不正確。";
            if (input.Amount <= 0) return "金額需為正數（方向由「買/賣/配息」決定）。";

            if (holding.AssetClass == InvestmentTerms.StockClass
                && input.TxType != InvestmentTerms.TxDividend
                && input.Quantity is not > 0)
                return "台股的買/賣必須填股數。";

            // 把候選交易併進該標的的完整時間軸重算一次（編輯時先移除舊列）。
            // 新增時用 int.MaxValue 當哨兵 Id：新列存檔後拿到最大的 identity Id、
            // 排在同日既有交易之後，驗證順序必須與存檔後一致，否則同日先買後賣會被誤擋。
            var txs = await _context.InvestmentTransactions.AsNoTracking()
                .Where(t => t.HoldingId == input.HoldingId).ToListAsync();
            if (original != null) txs.RemoveAll(t => t.Id == input.Id);
            txs.Add(new InvestmentTransaction
            {
                Id = original != null ? input.Id : int.MaxValue,
                HoldingId = input.HoldingId,
                Date = input.Date,
                TxType = input.TxType,
                Quantity = input.Quantity,
                Amount = input.Amount,
                FundSource = input.FundSource
            });
            var error = _service.ValidateTransactions(holding, txs);
            if (error != null) return error;

            // 編輯時把交易搬到別的標的：原標的少了這一列，剩餘時間軸也要重新驗證，
            // 否則原標的可能被留下超賣的壞資料
            if (original != null && original.HoldingId != input.HoldingId)
            {
                var sourceHolding = await _context.InvestmentHoldings.AsNoTracking()
                    .FirstOrDefaultAsync(h => h.Id == original.HoldingId);
                if (sourceHolding != null)
                {
                    var sourceTxs = await _context.InvestmentTransactions.AsNoTracking()
                        .Where(t => t.HoldingId == original.HoldingId && t.Id != input.Id).ToListAsync();
                    var sourceError = _service.ValidateTransactions(sourceHolding, sourceTxs);
                    if (sourceError != null)
                        return $"搬移後原標的資料會不一致：{sourceError}";
                }
            }
            return null;
        }

        // 填市值：每個標的一列，只儲存有填值的列
        public IActionResult Valuation()
        {
            var vm = new ValuationInputModel();
            foreach (var p in _service.GetPositions())
            {
                var last = p.HasValuation
                    ? $"上次：{(p.Holding.AssetClass == InvestmentTerms.StockClass ? p.UnitPrice?.ToString("0.####") : p.MarketValue.ToString("N0"))}（{p.ValuationAsOf:yyyy-MM-dd HH:mm}）"
                    : "尚未估值";
                vm.Rows.Add(new ValuationRowInput
                {
                    HoldingId = p.Holding.Id,
                    AssetClass = p.Holding.AssetClass,
                    Name = p.Holding.Symbol == null ? p.Holding.Name : $"{p.Holding.Symbol} {p.Holding.Name}",
                    Quantity = p.Quantity,
                    LastInfo = last
                });
            }
            return View(vm);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [Authorize(Roles = "Edit")]
        public async Task<IActionResult> Valuation(ValuationInputModel input)
        {
            var now = DateTime.Now;
            var holdings = await _context.InvestmentHoldings.AsNoTracking().ToDictionaryAsync(h => h.Id);
            var saved = 0;

            foreach (var row in input.Rows)
            {
                if (!holdings.TryGetValue(row.HoldingId, out var holding)) continue;

                if (holding.AssetClass == InvestmentTerms.StockClass)
                {
                    if (row.UnitPrice is not > 0) continue; // 沒填就沿用上一次快照
                    _context.InvestmentValuations.Add(new InvestmentValuation
                    {
                        HoldingId = row.HoldingId,
                        AsOf = now,
                        UnitPrice = row.UnitPrice
                    });
                }
                else
                {
                    if (row.MarketValue is not >= 0) continue;
                    _context.InvestmentValuations.Add(new InvestmentValuation
                    {
                        HoldingId = row.HoldingId,
                        AsOf = now,
                        MarketValue = row.MarketValue
                    });
                }
                saved++;
            }

            if (saved > 0) await _context.SaveChangesAsync();
            TempData["AlertMessage"] = saved > 0 ? $"✅ 已記錄 {saved} 筆市值快照。" : "沒有填任何值，未儲存。";
            return RedirectToAction(nameof(Index));
        }

        // 標的維護
        public async Task<IActionResult> Holdings()
        {
            return View(new HoldingsViewModel
            {
                Holdings = await _context.InvestmentHoldings.AsNoTracking()
                    .OrderBy(h => h.AssetClass).ThenBy(h => h.Symbol).ToListAsync()
            });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [Authorize(Roles = "Edit")]
        public async Task<IActionResult> CreateHolding(string newSymbol, string newName)
        {
            if (string.IsNullOrWhiteSpace(newSymbol) || string.IsNullOrWhiteSpace(newName))
            {
                TempData["AlertMessage"] = "❌ 代號與名稱都要填。";
                return RedirectToAction(nameof(Holdings));
            }
            var symbol = newSymbol.Trim();
            if (await _context.InvestmentHoldings.AnyAsync(h => h.Symbol == symbol))
            {
                TempData["AlertMessage"] = $"❌ 代號 {symbol} 已存在。";
                return RedirectToAction(nameof(Holdings));
            }
            _context.InvestmentHoldings.Add(new InvestmentHolding
            {
                AssetClass = InvestmentTerms.StockClass, // 虛擬貨幣桶子只有一個（唯一索引），UI 只開放新增台股
                Symbol = symbol,
                Name = newName.Trim()
            });
            await _context.SaveChangesAsync();
            TempData["AlertMessage"] = "✅ 已新增標的。";
            return RedirectToAction(nameof(Holdings));
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [Authorize(Roles = "Edit")]
        public async Task<IActionResult> ToggleHolding(int id)
        {
            var h = await _context.InvestmentHoldings.FirstOrDefaultAsync(x => x.Id == id);
            if (h == null) return RedirectToAction(nameof(Holdings));

            // 停用前必須已出清：仍有部位就停用會讓總覽/配置圖漏掉這一塊，
            // 但累計投入淨額照算，兩邊不一致
            if (h.IsActive)
            {
                var txs = await _context.InvestmentTransactions.AsNoTracking()
                    .Where(t => t.HoldingId == h.Id).ToListAsync();
                try
                {
                    var pos = InvestmentCalculator.Compute(h, txs);
                    var cost = (int)Math.Round(pos.Cost, MidpointRounding.AwayFromZero);
                    if (pos.Quantity != 0 || cost != 0)
                    {
                        TempData["AlertMessage"] =
                            $"❌ 「{h.Name}」仍有部位（股數 {pos.Quantity:0.####}、成本 {cost:N0}），出清後才能停用。";
                        return RedirectToAction(nameof(Holdings));
                    }
                }
                catch (InvalidOperationException ex)
                {
                    TempData["AlertMessage"] = "❌ 交易資料有誤，修正後才能停用：" + ex.Message;
                    return RedirectToAction(nameof(Holdings));
                }
            }

            h.IsActive = !h.IsActive;
            await _context.SaveChangesAsync();
            return RedirectToAction(nameof(Holdings));
        }
    }
}
