namespace ERPAPP.StoredProcedure;
using ERPAPP.Dto;
using ERPAPP.Models;
using ERPAPP.ViewModels;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using System.Data;
public class FinanceSpExecutor
{
    private readonly ErpdbContext _context;
    public FinanceSpExecutor(ErpdbContext context)
    {
        _context = context;
    }
    public FinanceSummaryResult ExecuteSummary(int year, int month, int own)
    {
        var result = new FinanceSummaryResult();
        int alreadyStatus = 0;

        var sql = "EXEC [dbo].[sp_FinanceSummary] @year, @month, @own";

        var yearParam = new SqlParameter("@year", year);
        var monthParam = new SqlParameter("@month", month);
        var ownParam = new SqlParameter("@own", own);

        // 2. 透過 DbContext 獲取連線，準備執行 ADO.NET
        var connection = _context.Database.GetDbConnection();
        var command = connection.CreateCommand();
        command.CommandText = sql;
        command.CommandType = CommandType.Text;

        command.Parameters.Add(yearParam);
        command.Parameters.Add(monthParam);
        command.Parameters.Add(ownParam);

        try
        {
            connection.Open();
            // 3. 執行指令並讀取結果集
            using (var reader = command.ExecuteReader())
            {
                if (reader.HasRows)
                {
                    if (reader.Read())
                    {
                        alreadyStatus = reader.GetInt32("already");
                        result.Already = alreadyStatus;

                        if (alreadyStatus == 2)
                        {
                            if (reader.FieldCount > 7)
                            {
                                result.Phone = reader.GetInt32("phone");
                                result.Gogoro = reader.GetInt32("gogoro");
                                result.Electricity = reader.GetInt32("electricity");
                                result.Water = reader.GetInt32("water");
                                result.Gas = reader.GetInt32("gas");
                                result.Negtive = reader.GetInt32("negtive");
                            }
                        }
                    }
                }
                if (alreadyStatus == -1 && reader.NextResult())
                {
                    while (reader.Read())
                    {
                        result.Errors.Add(new UnmatchedRecord
                        {
                            ProblemType = reader.GetString(reader.GetOrdinal("ProblemType")),
                            Date = reader.GetDateTime(reader.GetOrdinal("Date")),
                            Amount = reader.GetInt32(reader.GetOrdinal("Amount")),
                            Category = reader.GetString(reader.GetOrdinal("Category"))
                        });
                    }
                }
            }
        }
        finally
        {
            connection.Close();
        }

        return result;
    }

    public async Task<BudgetReportViewModel> GetBudgetReportDataAsync()
    {
        var initialDate = new DateTime(1911, 1, 1);

        var initialBudget = await _context.Budgets
            .AsNoTracking()
            .FirstOrDefaultAsync(b => b.Date == initialDate);

        var allMonthlyBudgets = await _context.Budgets
            .AsNoTracking()
            .Where(b => b.Date != initialDate)
            .OrderBy(b => b.Date) // 確保按日期排序
            .ToListAsync()
            .ConfigureAwait(false);

        var latestBudget = allMonthlyBudgets.LastOrDefault();

        var allPropertyData = await _context.Properties
            .AsNoTracking()
            .OrderBy(p => p.Date)
            .ToListAsync();

        if (initialBudget == null || latestBudget == null)
        {
            return null;
        }

        return new BudgetReportViewModel
        {
            InitialBudget = initialBudget,
            LatestBudget = latestBudget,
            AllMonthlyBudgets = allMonthlyBudgets,
            AllPropertyData = allPropertyData,
            LatestMonthDisplay = latestBudget.Date.ToString("yyyy-MM")
        };
    }
}
