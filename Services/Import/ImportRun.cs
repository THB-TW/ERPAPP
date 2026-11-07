using System.Text;
using ERPAPP.Dto;

namespace ERPAPP.Services.Import;

// 匯入 (Import) 流程，全專案唯一一份：
//   解析（計 TotalRows／ErrorRows）→ 依來源排序 → primary：數量式去重＋寫入
//   → archive：數量式去重＋寫入 → 回報筆數。
public static class ImportRun
{
    // 存檔失敗訊息前綴：字面沿用舊訊息（月結精靈原樣顯示）。目前唯一的存檔是 creditcard.csv；
    // 若日後有第二個存檔，具名槽 primary/archive 與 ImportResult 的一組 Archived* 欄位要一起擴。
    private const string ArchiveFailurePrefix = "creditcard.csv 存檔寫入失敗：";

    // 結果對應（精靈 JS 讀的 ImportResult 七個欄位）：
    //   TotalRows / ErrorRows ← 解析；Inserted / Skipped ← primary；
    //   ArchivedRows / ArchivePath / ArchiveMessage ← archive（未傳 archive、或解析後 0 列時三者維持 null）。
    // 順序保證：
    //   1. primary 先、archive 後；archive 拿到的是「全部解析成功的列」而非 primary 實際新增的那幾筆，
    //      各自去重——所以存檔可以落後於資料庫並自我補齊。
    //   2. 兩個目的地看到同一份、同順序的列（SortByDate 排序後或檔案順序）。
    //   3. [min,max] 視窗只算一次，兩個目的地共用。
    //   4. archive 工廠在 primary 寫完之後、try 之內才呼叫：路徑解析／編碼取得失敗也只是 ArchiveMessage。
    // 錯誤模式：
    //   - 解析失敗的列只計數；串流／解碼例外往外丟。
    //   - 來源（Parse）丟出的例外——例如信用卡三欄檔形狀不符的 InvalidDataException——原樣往外丟；此時尚未寫入任何目的地。
    //   - primary 的例外原樣往外丟（controller 回 500）；此時不會嘗試 archive。
    //   - archive 的建立、讀、寫任何一步失敗都收進 ArchiveMessage，ArchivedRows / ArchivePath 維持 null，
    //     Inserted / Skipped 不受影響。目的地之間不回滾。
    public static ImportResult Execute<TRow>(
        ImportSource<TRow> source, Stream stream, Encoding encoding,
        IImportDestination<TRow> primary,
        Func<IArchiveDestination<TRow>>? archive = null) where TRow : class
    {
        var result = new ImportResult();
        var parsed = new List<TRow>();

        using (var reader = new StreamReader(stream, encoding))
        {
            foreach (var row in source.Parse(reader))
            {
                result.TotalRows++;
                if (row == null) { result.ErrorRows++; continue; }
                parsed.Add(row);
            }
        }

        if (parsed.Count == 0) return result;

        if (source.SortByDate)
            parsed = parsed.OrderBy(source.Date).ToList(); // Enumerable.OrderBy 為穩定排序

        var min = parsed.Min(source.Date);
        var max = parsed.Max(source.Date);

        var (fresh, skipped) = QuantityDedup(parsed, primary.ReadExisting(min, max), source.Key);
        if(primary is IImportAcceptance<TRow> policy) fresh=policy.Accept(fresh,result);
        if (fresh.Count > 0) primary.Write(fresh);
        result.Inserted = fresh.Count;
        result.Skipped = skipped;

        if (archive == null) return result;

        try
        {
            var dest = archive();
            var (archiveFresh, _) = QuantityDedup(parsed, dest.ReadExisting(min, max), source.Key);
            if (archiveFresh.Count > 0) dest.Write(archiveFresh);
            result.ArchivedRows = archiveFresh.Count;
            result.ArchivePath = dest.FilePath;
        }
        catch (Exception ex)
        {
            result.ArchiveMessage = ArchiveFailurePrefix + ex.Message;
        }
        return result;
    }

    // 數量式去重 (Quantity-based Dedup)——見 CONTEXT.md。三份實作合併成這一份。
    // 同鍵目的地已有 E 筆 → incoming 中該鍵的前 E 筆視為已存在（Skipped），第 E+1 筆起為 Fresh。
    // 保序：Fresh 的相對順序 = incoming 的相對順序。保留合法的重複交易。純函式、不碰 I/O。
    // Execute 的實作細節，不對外；需要在 Execute 之外重用時再放寬。
    private static (List<TRow> Fresh, int Skipped) QuantityDedup<TRow>(
        IReadOnlyList<TRow> incoming, IEnumerable<TRow> existing, Func<TRow, string> key)
    {
        var existingCounts = new Dictionary<string, int>();
        foreach (var e in existing)
        {
            var k = key(e);
            existingCounts[k] = existingCounts.GetValueOrDefault(k, 0) + 1;
        }

        var encountered = new Dictionary<string, int>();
        var fresh = new List<TRow>();
        int skipped = 0;
        foreach (var row in incoming)
        {
            var k = key(row);
            int c = encountered.GetValueOrDefault(k, 0) + 1;
            encountered[k] = c;
            if (c > existingCounts.GetValueOrDefault(k, 0)) fresh.Add(row);
            else skipped++;
        }
        return (fresh, skipped);
    }
}
