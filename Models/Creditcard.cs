using System;

namespace ERPAPP.Models;

// 對應資料庫的 creditcard 表（信用卡帳單）。
// 欄位對齊 sp_FinanceSummary 內的用法：Date / Item / Amount。
// 此表無主鍵，於 ErpdbContext 以 HasNoKey 設定，僅供讀取/去重/核對顯示；
// 新增資料改由 CsvImportService 以參數化 raw SQL 寫入。
public partial class Creditcard
{
    public DateTime Date { get; set; }

    public string? Item { get; set; }

    public int Amount { get; set; }
}
