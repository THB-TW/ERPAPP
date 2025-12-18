
using ERPAPP.Dto;
using ERPAPP.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.EntityFrameworkCore;

namespace ERPAPP.Controllers
{
    [Authorize(Roles = "Select")]
    public class TransactionsController : Controller
    {
        private readonly ErpdbContext _context;

        public TransactionsController(ErpdbContext context)
        {
            _context = context;
        }

        // GET: Transactions
        public async Task<IActionResult> Index(DateTime? startDate,
                                            DateTime? endDate,
                                            string searchCategory,
                                            string searchMember,
                                            string searchAccount,
                                            string searchType)
        {
            var transactions = _context.Transactions.AsQueryable();

            if (startDate.HasValue && endDate.HasValue)
            {
                transactions = transactions.Where(t => t.Date >= startDate && t.Date < endDate);
            }else if (startDate.HasValue && !endDate.HasValue)
            {
                transactions = transactions.Where(t => t.Date >= startDate);
            }
            else
            {
                // 邏輯 2 (Goal 1): 如果使用者「沒有」選取日期 (預設狀態)
                var today = DateTime.Today;
                var saerchstartDate = today.AddDays(1); // 包含今天
                var halfYearAgo = today.AddMonths(-3);

                transactions = transactions.Where(t => t.Date >= halfYearAgo && t.Date < saerchstartDate);
            }

            if (!string.IsNullOrEmpty(searchCategory))
                transactions = transactions.Where(t => t.Category == searchCategory);

            if (!string.IsNullOrEmpty(searchMember))
                transactions = transactions.Where(t => t.Member == searchMember);

            if (!string.IsNullOrEmpty(searchAccount))
                transactions = transactions.Where(t => t.Account == searchAccount);

            if (!string.IsNullOrEmpty(searchType))
                transactions = transactions.Where(t => t.TransactionType == searchType);

            var categories = await _context.Categories.ToListAsync();
            ViewBag.Categories = new SelectList(categories, "CategoryName", "CategoryName", searchCategory);

            var members = await _context.Members.ToListAsync();
            ViewBag.Members = new SelectList(members, "MemberName", "MemberName", searchMember);

            var accounts = await _context.Accounts.ToListAsync();
            ViewBag.Accounts = new SelectList(accounts, "AccountName", "AccountName", searchAccount);

            var types = new List<string> { "支", "收" };
            ViewBag.Types = new SelectList(types, searchType);

            //var transactions = from a in _context.Transactions
            //                   select new Transaction
            //                    {
            //                       Id = a.Id,
            //                       Date = a.Date,
            //                        Category = a.Category,
            //                        Amount = a.Amount,
            //                        Member = a.Member,
            //                        Account = a.Account,
            //                        TransactionType = a.TransactionType,
            //                   };
            return View(await transactions.OrderByDescending(t => t.Date).ToListAsync());
        }

        // GET: Transactions/Details/5
        public async Task<IActionResult> Details(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

            var transaction = await _context.Transactions
                .FirstOrDefaultAsync(m => m.Id == id);
            if (transaction == null)
            {
                return NotFound();
            }

            return View(transaction);
        }
        [Authorize(Roles = "Edit")]
        // GET: Transactions/Create
        public IActionResult Create()
        {
            // 取得所有類別
            var categories = _context.Categories
                .Select(c => new SelectListItem
                {
                    Value = c.CategoryName,
                    Text = c.CategoryName
                }).ToList();

            var members = _context.Members
                .Select(c => new SelectListItem
                {
                    Value = c.MemberName,
                    Text = c.MemberName
                }).ToList();

            // 取得所有帳戶
            var accounts = _context.Accounts
                .Select(a => new SelectListItem
                {
                    Value = a.AccountName,
                    Text = a.AccountName
                }).ToList();

            ViewBag.Categories = categories;
            ViewBag.Members = members;
            ViewBag.Accounts = accounts;

            return View();
        }

        // POST: Transactions/Create
        // To protect from overposting attacks, enable the specific properties you want to bind to.
        // For more details, see http://go.microsoft.com/fwlink/?LinkId=317598.
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create(NewsDto transaction)
        {
            if (ModelState.IsValid)
            {
                Transaction insert = new Transaction()
                {
                    Date = transaction.Date,
                    Category = transaction.Category,
                    Amount = transaction.Amount,
                    Member = transaction.Member,
                    Account = transaction.Account,
                };
                var category = await _context.Categories.FirstOrDefaultAsync(c => c.CategoryName == transaction.Category);
                if (category != null)
                {
                    insert.TransactionType = category.Type;
                }
                _context.Transactions.Add(insert);
                await _context.SaveChangesAsync();
                return RedirectToAction(nameof(Index));
            }
            return View(transaction);
        }

        // GET: Transactions/Edit/5
        public async Task<IActionResult> Edit(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }
            // 取得所有類別
            var categories = _context.Categories
                .Select(c => new SelectListItem
                {
                    Value = c.CategoryName,
                    Text = c.CategoryName
                }).ToList();

            var members = _context.Members
                .Select(c => new SelectListItem
                {
                    Value = c.MemberName,
                    Text = c.MemberName
                }).ToList();

            // 取得所有帳戶
            var accounts = _context.Accounts
                .Select(a => new SelectListItem
                {
                    Value = a.AccountName,
                    Text = a.AccountName
                }).ToList();

            ViewBag.Categories = categories;
            ViewBag.Members = members;
            ViewBag.Accounts = accounts;
            var transactionEdit = await _context.Transactions
                .Where(t => t.Id == id)
                .Select( a => new NewsDto
                               {
                                   Id = a.Id,
                                   Date = a.Date,
                                   Category = a.Category,
                                   Amount = a.Amount,
                                   Member = a.Member,
                                   Account = a.Account,
                               })
                                .FirstOrDefaultAsync();
            //var insert = new NewsEditViewModel();
            //insert.EditSpec = await (from a in _context.Transactions
            //                         where a.Id == id
            //                         select new NewsDto
            //                         {
            //                             Id = a.Id,
            //                             Date = a.Date,
            //                             Category = a.Category,
            //                             Amount = a.Amount,
            //                             Member = a.Member,
            //                             Account = a.Account,
            //                             TransactionType = a.TransactionType,
            //                         }
            //                        ).SingleOrDefaultAsync();
            //insert.CategoryName = await _context.Categories
            //                            .Select(c => c.CategoryName)
            //                            .FirstOrDefaultAsync() ?? string.Empty;

            //await _context.Transactions.FindAsync(id);
            if (transactionEdit == null)
            {
                return NotFound();
            }
            return View(transactionEdit);
        }

        // POST: Transactions/Edit/5
        // To protect from overposting attacks, enable the specific properties you want to bind to.
        // For more details, see http://go.microsoft.com/fwlink/?LinkId=317598.
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(int id, NewsDto transactionDto)
        {
            if (id != transactionDto.Id)
            {
                return NotFound();
            }

            if (ModelState.IsValid)
            {
                try
                {
                    var transactionUpdate = await _context.Transactions.FindAsync(id);
                    if (transactionUpdate == null)
                    {
                        return NotFound();
                    }
                    transactionUpdate.Date = transactionDto.Date;
                    transactionUpdate.Category = transactionDto.Category;
                    transactionUpdate.Amount = transactionDto.Amount;
                    transactionUpdate.Member = transactionDto.Member;
                    transactionUpdate.Account = transactionDto.Account;
                    var category = await _context.Categories.FirstOrDefaultAsync(c => c.CategoryName == transactionDto.Category);
                    if (category != null)
                    {
                        transactionUpdate.TransactionType = category.Type;
                    }
                    _context.Update(transactionUpdate);
                    await _context.SaveChangesAsync();
                }
                catch (DbUpdateConcurrencyException)
                {
                    if (!TransactionExists(transactionDto.Id))
                    {
                        return NotFound();
                    }
                    else
                    {
                        throw;
                    }
                }
                return RedirectToAction(nameof(Index));
            }
            return View(transactionDto);
        }


        // GET: Transactions/Delete/5
        public async Task<IActionResult> Delete(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

            var transaction = await _context.Transactions
                .FirstOrDefaultAsync(m => m.Id == id);
            if (transaction == null)
            {
                return NotFound();
            }

            return View(transaction);
        }

        // POST: Transactions/Delete/5
        [HttpPost, ActionName("Delete")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteConfirmed(int id)
        {
            var transaction = await _context.Transactions.FindAsync(id);
            if (transaction != null)
            {
                _context.Transactions.Remove(transaction);
            }

            await _context.SaveChangesAsync();
            return RedirectToAction(nameof(Index));
        }

        private bool TransactionExists(int id)
        {
            return _context.Transactions.Any(e => e.Id == id);
        }
        // Action：分析頁面
        public async Task<IActionResult> Analysis()
        {
            // 取得篩選用的基礎資料
            ViewBag.Categories = await _context.Categories.ToListAsync();
            ViewBag.Members = await _context.Members.ToListAsync();
            ViewBag.Accounts = await _context.Accounts.ToListAsync();

            return View();
        }

        // --- 新增 Action：即時數據 API ---
        [HttpGet]
        public async Task<IActionResult> GetAnalysisData(
            DateTime startDate,
            DateTime endDate,
            string[] categories,
            string[] members,
            string[] accounts)
        {
            // 1. 基本查詢：鎖定「支出」
            var query = _context.Transactions.Where(t => t.TransactionType == "支" && t.Date >= startDate && t.Date <= endDate);

            // 2. 動態篩選
            if (categories != null && categories.Length > 0)
                query = query.Where(t => categories.Contains(t.Category));

            if (members != null && members.Length > 0)
                query = query.Where(t => members.Contains(t.Member));

            if (accounts != null && accounts.Length > 0)
                query = query.Where(t => accounts.Contains(t.Account));

            // 3. 聚合數據
            var groupedData = await query
                .GroupBy(t => t.Category)
                .Select(g => new
                {
                    Category = g.Key,
                    TotalAmount = g.Sum(t => t.Amount)
                })
                .ToListAsync();

            // 4. 計算月數差（用於平均值）
            // 計算邏輯：總天數 / 30
            double totalDays = (endDate - startDate).TotalDays;
            double months = totalDays / 30.0;
            if (months < 1) months = 1; // 至少為一個月以免除以零

            var finalData = groupedData.Select(d => new
            {
                d.Category,
                d.TotalAmount,
                AverageAmount = Math.Round(d.TotalAmount / months, 2)
            }).OrderByDescending(d => d.TotalAmount);

            return Json(finalData);
        }
    }
}
