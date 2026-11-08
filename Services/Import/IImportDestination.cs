namespace ERPAPP.Services.Import;

public interface IImportAcceptance<TRow> where TRow : class
{
    List<TRow> Accept(IReadOnlyList<TRow> fresh, ERPAPP.Dto.ImportResult result);
}

// 匯入目的地 (Import Destination)——見 CONTEXT.md「## 匯入」。
// 這裡是 seam：三個 adapter（TransactionTable 交易資料表、CreditcardTable 信用卡資料表、
// CreditcardCsvArchive 信用卡存檔）只在「我已有哪些列」與「把這些寫進去」兩件事上不同。
// 數量式去重與重複判定鍵都不在這裡：去重在 ImportRun.QuantityDedup，鍵在 ImportSource.Key。
public interface IImportDestination<TRow> where TRow : class
{
    // 回傳目的地「目前已有」的列，供 ImportRun 依重複判定鍵計數。
    // 契約：
    //  - 必須涵蓋所有 Date ∈ [min,max]（含）的列；可以多給（例如整檔）——鍵含日期，視窗外的列不會同鍵。
    //  - 順序無關（只計數）。無法解析的列略過，不算錯。
    //  - 回傳前請 materialize，避免 Write 時還有 reader 開著。
    //  - 每次 ImportRun.Execute 至多呼叫一次，且必在 Write 之前；解析後 0 列時不會呼叫。
    //  - 例外直接往外丟；由 ImportRun 依角色處理（primary → 傳播；archive → 收進 ArchiveMessage）。
    IEnumerable<TRow> ReadExisting(DateTime min, DateTime max);

    // 寫入去重後「目的地還沒有」的列。
    // 契約：
    //  - rows 非空（0 列時不會呼叫）。
    //  - 順序即 ImportRun 決定的順序（交易：依日期穩定排序；信用卡：檔案順序），adapter 必須保序寫入。
    //  - 整批原子與否由 adapter 自己決定；目的地之間沒有回滾。
    //  - 例外處理同 ReadExisting。
    void Write(IReadOnlyList<TRow> rows);
}

// 存檔型目的地：多一個檔案路徑，ImportRun 用它填 ImportResult.ArchivePath。資料表 adapter 不需要。
public interface IArchiveDestination<TRow> : IImportDestination<TRow> where TRow : class
{
    string FilePath { get; }
}
