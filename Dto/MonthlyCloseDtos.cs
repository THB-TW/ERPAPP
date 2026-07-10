namespace ERPAPP.Dto
{
    // CSV 匯入結果摘要
    public class ImportResult
    {
        public int TotalRows { get; set; }   // 讀到的資料列數
        public int Inserted { get; set; }     // 實際新增筆數
        public int Skipped { get; set; }      // 因重複而略過的筆數
        public int ErrorRows { get; set; }    // 無法解析的列數

        // 信用卡專用：同步補寫 creditcard.csv 存檔的結果
        public int? ArchivedRows { get; set; }      // 補寫進存檔的筆數
        public string? ArchivePath { get; set; }    // 存檔路徑
        public string? ArchiveMessage { get; set; } // 存檔寫入失敗時的訊息
    }

    // 總資產核對請求
    public class AssetCheckRequest
    {
        public int Year { get; set; }
        public int Month { get; set; }
        public int Cash { get; set; }           // 現金
        public int Ipass { get; set; }          // 一卡通
        public int Bank { get; set; }           // 銀行
        public int UnbilledCredit { get; set; } // 未出帳信用卡
        public int Adjust { get; set; }         // 其他調整
        public bool AutoRollback { get; set; }  // 是否自動倒回次月交易
    }

    // 單一帳戶的次月倒回明細
    public class AccountRollback
    {
        public string Account { get; set; } = string.Empty;
        public int NextMonthExpense { get; set; } // 次月支出（月底後）
        public int NextMonthIncome { get; set; }  // 次月收入（月底後）
        public int Net { get; set; }              // 倒回調整 = 支 - 收（加回月底快照）
    }

    // 總資產核對結果
    public class AssetCheckResult
    {
        public int ActualRaw { get; set; }          // 現金+一卡通+銀行+未出帳+調整（未倒回）
        public int RollbackTotal { get; set; }      // 次月倒回總調整
        public int ActualAdjusted { get; set; }     // 倒回後實際總資產
        public bool HasBook { get; set; }           // 是否找得到當月帳面資料
        public int? BookTotalproperty { get; set; } // 帳面 Property.Totalproperty
        public int Diff { get; set; }               // 實際(倒回後) - 帳面
        public List<AccountRollback> Rollbacks { get; set; } = new();
    }
}
