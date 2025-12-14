namespace ERPAPP.StoredProcedure;
using ERPAPP.Dto;
using ERPAPP.Models;
using ERPAPP.ViewModels;
//using Microsoft.Data.SqlClient;
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

        var sql = "SELECT * FROM public.\"finance_summary\"(@year, @month, @own)";

        //var yearParam = new SqlParameter("@year", year);
        //var monthParam = new SqlParameter("@month", month);
        //var ownParam = new SqlParameter("@own", own);

        // 2. 透過 DbContext 獲取連線，準備執行 ADO.NET
        var connection = _context.Database.GetDbConnection();
        var command = connection.CreateCommand();
        command.CommandText = sql;
        command.CommandType = CommandType.Text;

        var yearParam = command.CreateParameter();
        yearParam.ParameterName = "year"; // PostgreSQL 參數通常不需要 @
        yearParam.Value = year;

        var monthParam = command.CreateParameter();
        monthParam.ParameterName = "month"; // PostgreSQL 參數通常不需要 @
        monthParam.Value = month;

        var ownParam = command.CreateParameter();
        ownParam.ParameterName = "own"; // PostgreSQL 參數通常不需要 @
        ownParam.Value = own;

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
                        alreadyStatus = reader.GetInt32(0);
                        result.Already = alreadyStatus;

                        if (alreadyStatus == 2)
                        {
                            if (reader.FieldCount > 6)
                            {
                                result.Phone = reader.GetInt32(1);
                                result.Gogoro = reader.GetInt32(2);
                                result.Electricity = reader.GetInt32(3);
                                result.Water = reader.GetInt32(4);
                                result.Gas = reader.GetInt32(5);
                                result.Negtive = reader.GetInt32(6);
                            }
                        }
                        else if (alreadyStatus == -1)
                        {
                            // 錯誤 JSON 處理：如果 status_code 是 -1，則 JSON 資料在同一個 Row 的第 8 個欄位
                            // 由於您的 SQL 函式將 JSON 放在同一行，我們可以直接讀取欄位
                            var jsonText = reader.GetString(reader.GetOrdinal("json_result"));

                            // 您需要使用 Newtonsoft.Json 或 System.Text.Json 將 jsonText 反序列化為 List<UnmatchedRecord>
                            // (假設您已經引用 System.Text.Json)
                            try
                            {
                                var options = new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                                var errors = System.Text.Json.JsonSerializer.Deserialize<List<UnmatchedRecord>>(jsonText, options);
                                if (errors != null)
                                {
                                    result.Errors.AddRange(errors);
                                }
                            }
                            catch (Exception ex)
                            {
                                // 處理 JSON 反序列化錯誤
                                Console.WriteLine($"JSON Deserialize Error: {ex.Message}");
                            }
                        }
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
