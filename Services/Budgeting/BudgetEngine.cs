using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ERPAPP.Services.Budgeting;

public static class BudgetEngine
{
    public static DateTime MonthDate(string month) => DateTime.ParseExact(month, "yyyy-MM", CultureInfo.InvariantCulture);
    public static string Latest(BudgetState state) => state.Months.MaxBy(m => m.Month)?.Month ?? "";
    public static string OpenMonth(BudgetState state) => Latest(state) is { Length: > 0 } last
        ? MonthDate(last).AddMonths(1).ToString("yyyy-MM") : DateTime.Today.ToString("yyyy-MM");
    public static BudgetRevision? Effective(BudgetState state, string month) => state.Revisions
        .Where(r => string.CompareOrdinal(r.Month, month) <= 0).OrderBy(r => r.Month).LastOrDefault();
    public static string Fingerprint(BudgetCommand command) => Convert.ToHexString(SHA256.HashData(
        Encoding.UTF8.GetBytes(JsonSerializer.Serialize(command))));

    public static BudgetState Apply(BudgetState state, BudgetCommand command, string actor,
        DateTimeOffset time, IReadOnlyList<BudgetExpense>? expenses = null)
    {
        if (command.OperationId == Guid.Empty) throw new ArgumentException("缺少操作識別碼，請重新載入頁面。");
        var fingerprint = Fingerprint(command);
        var receipt = state.Receipts.SingleOrDefault(r => r.Id == command.OperationId.ToString());
        if (receipt != null)
        {
            if (receipt.Fingerprint != fingerprint) throw new InvalidOperationException("操作識別碼已用於其他內容，請重新載入。");
            return state;
        }
        if (state.Version != command.Version) throw new InvalidOperationException("資料已被其他操作更新，請重新載入後再試。");
        if (string.IsNullOrWhiteSpace(command.Reason) || command.Reason.Trim().Length > 300)
            throw new ArgumentException("請填寫 1～300 字的原因。");
        var date = MonthDate(command.Month);
        if (date.Year < 1900 || date.Year > 9998) throw new ArgumentException("月份超出範圍。");
        var next = JsonSerializer.Deserialize<BudgetState>(JsonSerializer.Serialize(state))!;
        switch (command.Action)
        {
            case "map":
                var mappingDraft=NewRevision(next,command,actor,time);
                var sourceCategory=command.SourceCategory?.Trim()??"";
                if (sourceCategory.Length is <1 or >50 || !mappingDraft.Limits.Any(l=>l.CategoryId==command.To))
                    throw new ArgumentException("請選擇有效的交易分類與使用中的預算類別。");
                mappingDraft.Mapping[sourceCategory]=command.To!;
                next.Revisions.Add(mappingDraft);
                break;
            case "retire":
                var retireDraft=NewRevision(next,command,actor,time);
                if (!retireDraft.Limits.Any(l=>l.CategoryId==command.From)) throw new ArgumentException("類別已停用或不存在。");
                var remaining=Position(next,Latest(next)).Balances.GetValueOrDefault(command.From!);
                if (remaining<0) throw new InvalidOperationException("請先補足負儲備，再移除類別。");
                if (remaining>0) Transfer(next,new() {OperationId=command.OperationId,Month=Latest(next),From=command.From,To=command.To,Amount=remaining,Reason=command.Reason},actor,time);
                retireDraft.Limits.RemoveAll(l=>l.CategoryId==command.From);
                foreach (var key in retireDraft.Mapping.Where(p=>p.Value==command.From).Select(p=>p.Key).ToArray()) retireDraft.Mapping.Remove(key);
                next.Revisions.Add(retireDraft);
                break;
            case "reverse":
                if(command.Month!=Latest(next)) throw new InvalidOperationException("請從最近已結月份沖銷調整。");
                var original=next.Adjustments.SingleOrDefault(a=>a.Id==command.Reverses)
                    ?? throw new InvalidOperationException("找不到原調整紀錄。");
                if (original.Reverses!=null || next.Adjustments.Any(a=>a.Reverses==original.Id))
                    throw new InvalidOperationException("原調整已沖銷，或本身為沖銷紀錄。");
                if (!next.Months.Any(m=>m.Month==original.Month)) throw new InvalidOperationException("原月份待重結，請先重結再沖銷。");
                if (original.Kind=="transfer")
                {
                    var reverseCommand=new BudgetCommand {OperationId=command.OperationId,Month=Latest(next),From=original.To,To=original.From,Amount=original.Amount,Reason=command.Reason};
                    Transfer(next,reverseCommand,actor,time);
                    next.Adjustments[^1]=next.Adjustments[^1] with {Reverses=original.Id};
                }
                else if(original.Kind=="fund")
                {
                    FundReserve(next,new() {OperationId=command.OperationId,Month=Latest(next),To=original.To,Amount=checked(-original.Amount),Reason=command.Reason},actor,time);
                    next.Adjustments[^1]=next.Adjustments[^1] with {Reverses=original.Id};
                }
                else next.Adjustments.Add(new(command.OperationId.ToString(),original.Month,"correct",checked(-original.Amount),null,null,command.Reason.Trim(),actor,time,original.Id));
                break;
            case "caps":
                var capDraft = NewRevision(next,command,actor,time);
                if (!command.Limits.Select(l=>l.CategoryId).Order().SequenceEqual(capDraft.Limits.Select(l=>l.CategoryId).Order()))
                    throw new ArgumentException("上限欄位與目前使用中的類別不符，請重新載入。");
                foreach (var limit in command.Limits)
                {
                    Cap(limit.Amount);
                    if (next.Categories.Single(c=>c.Id==limit.CategoryId).Kind=="actual" && limit.Amount!=0)
                        throw new ArgumentException("照實支類別不設定上限。");
                }
                Cap(command.Tuition);
                capDraft.Limits=command.Limits.ToList();
                capDraft.Tuition=command.Tuition;
                next.Revisions.Add(capDraft);
                break;
            case "add":
                var draft = NewRevision(next,command,actor,time);
                var name = command.Name?.Trim() ?? "";
                if (name.Length is < 1 or > 30 || next.Categories.Any(c=>string.Equals(c.Name,name,StringComparison.OrdinalIgnoreCase)))
                    throw new ArgumentException("請填寫不重複的類別名稱（1～30 字，含已停用名稱）。");
                if (command.Kind is not ("reserve" or "fixed" or "actual")) throw new ArgumentException("類別用途不正確。");
                Cap(command.Amount);
                var id = command.OperationId.ToString();
                next.Categories.Add(new(id,name,command.Kind));
                draft.Limits.Add(new(id,command.Kind=="actual"?0:command.Amount));
                draft.Mapping[name]=id;
                next.Revisions.Add(draft);
                break;
            case "transfer":
                Transfer(next,command,actor,time);
                break;
            case "fund":
                if(command.Amount<=0) throw new ArgumentException("補入金額須為正整數。");
                FundReserve(next,command,actor,time);
                break;
            case "correct":
                if (command.Month != OpenMonth(next) && !next.Months.Any(m=>m.Month==command.Month))
                    throw new InvalidOperationException("請選擇已結月份或開放月份來更正前期。");
                var target = date.AddMonths(-1).ToString("yyyy-MM");
                if (!next.Months.Any(m => m.Month == target)) throw new InvalidOperationException("前一個月尚無已結資料。");
                if(next.Months.Any(m=>string.CompareOrdinal(m.Month,target)>=0&&m.LegacyTotalDifference!=0))
                    throw new InvalidOperationException("影響範圍含有既有資產加總差異，請先核對；本次尚未更正。");
                if (command.Amount == 0 || Math.Abs((long)command.Amount) > 1_000_000_000) throw new ArgumentException("請填寫非零且範圍內的調整數。");
                next.Adjustments.Add(new(command.OperationId.ToString(),target,"correct",command.Amount,null,null,command.Reason.Trim(),actor,time));
                break;
            case "rollback":
                if (command.Month != Latest(next) || next.Months.Count < 2) throw new InvalidOperationException("只能撤銷最近月份，且須保留期初基準。");
                var rollbackMonth=next.Months.Single(m=>m.Month==command.Month);
                var priorMonth=next.Months.Where(m=>m.Month!=command.Month).MaxBy(m=>m.Month)!;
                if(rollbackMonth.Migrated && (rollbackMonth.Revision==null || rollbackMonth.LegacyTotalDifference!=0 || priorMonth.LegacyTotalDifference!=0))
                    throw new InvalidOperationException("這個歷史月份缺少上限或留有資產加總差異，請先核對；原始月結已保留，尚未撤銷。");
                next.Months.RemoveAll(m => m.Month == command.Month);
                break;
            case "close":
                if(command.Amount<0) throw new ArgumentException("當月收入不能為負數。");
                if (command.Month != OpenMonth(next)) throw new InvalidOperationException("只能依月份順序進行月結。");
                var revision = Effective(next,command.Month) ?? throw new InvalidOperationException("請先設定本月預算上限。");
                if(revision.Month!=command.Month)
                {
                    revision=JsonSerializer.Deserialize<BudgetRevision>(JsonSerializer.Serialize(revision))!;
                    revision.Id=command.OperationId+"-caps";revision.Month=command.Month;
                    revision.Reason="月結沿用上期設定";revision.Actor=actor;revision.Time=time;
                    next.Revisions.Add(revision);
                }
                var previous = next.Months.MaxBy(m => m.Month) ?? throw new InvalidOperationException("缺少期初基準。");
                if(previous.LegacyTotalDifference!=0) throw new InvalidOperationException("前月留有歷史資產加總差異，請先核對後再月結。");
                var balances = new Dictionary<string,int>(previous.Balances);
                var actual = new Dictionary<string,int>();
                foreach (var expense in expenses ?? [])
                {
                    if(expense.Amount<=0) throw new InvalidOperationException("支出含有非正整數金額，請先核對交易。");
                    if (!revision.Mapping.TryGetValue(expense.Category,out var category) || !revision.Limits.Any(l => l.CategoryId == category))
                        throw new InvalidOperationException($"分類「{expense.Category}」尚未設定有效的預算歸屬。");
                    actual[category] = checked(actual.GetValueOrDefault(category) + expense.Amount);
                }
                var changes = new Dictionary<string,int>();
                var outlay = revision.Tuition;
                foreach (var limit in revision.Limits)
                {
                    var definition = next.Categories.Single(c => c.Id == limit.CategoryId);
                    var cost = actual.GetValueOrDefault(definition.Id);
                    if (definition.Kind == "reserve")
                    {
                        changes[definition.Id] = checked(limit.Amount-cost);
                        balances[definition.Id] = checked(balances.GetValueOrDefault(definition.Id)+changes[definition.Id]);
                        outlay = checked(outlay+limit.Amount);
                    }
                    else outlay = checked(outlay+cost);
                }
                var surplus = checked(command.Amount-outlay);
                var close = new MonthClose {Id=command.OperationId.ToString(),Month=command.Month,Income=command.Amount,Surplus=surplus,
                    RawSpare=checked(previous.RawSpare+surplus),Tuition=checked(previous.Tuition+revision.Tuition),Balances=balances,
                    Changes=changes,Expenses=actual,Revision=revision,Actor=actor,Time=time};
                next.Months.Add(close);
                next.CloseHistory.Add(close);
                break;
            default: throw new ArgumentException("不支援的操作。");
        }
        foreach(var revision in next.Revisions.Skip(state.Revisions.Count)) _=checked(revision.Limits.Sum(l=>l.Amount)+revision.Tuition);
        next.Version = checked(next.Version+1);
        var adjustmentIndex=next.Adjustments.FindIndex(a=>a.Id==command.OperationId.ToString());
        if(adjustmentIndex>=0)
        {
            var changes=new List<BudgetAmountChange>();
            foreach(var raw in state.Months)
            {
                var old=Position(state,raw.Month);var updated=Position(next,raw.Month);
                if(old.Spare!=updated.Spare) changes.Add(new(raw.Month,"spare",null,old.Spare,updated.Spare));
                if(old.Total!=updated.Total) changes.Add(new(raw.Month,"total",null,old.Total,updated.Total));
                foreach(var id in old.Balances.Keys.Union(updated.Balances.Keys))
                    if(old.Balances.GetValueOrDefault(id)!=updated.Balances.GetValueOrDefault(id))
                        changes.Add(new(raw.Month,"reserve",id,old.Balances.GetValueOrDefault(id),updated.Balances.GetValueOrDefault(id)));
            }
            next.Adjustments[adjustmentIndex]=next.Adjustments[adjustmentIndex] with {Changes=changes};
        }
        next.Receipts.Add(new(command.OperationId.ToString(),fingerprint,command.Action,command.Month,command.Reason.Trim(),actor,time));
        foreach (var month in next.Months) _ = Position(next,month.Month).Total;
        return next;
    }

    public static MonthPosition Position(BudgetState state, string month)
    {
        var raw = state.Months.Single(m => m.Month == month);
        var balances = new Dictionary<string,int>(raw.Balances);
        var spare = raw.RawSpare;
        foreach (var adjustment in state.Adjustments.Where(a => string.CompareOrdinal(a.Month,month)<=0 && state.Months.Any(m=>m.Month==a.Month)))
        {
            if (adjustment.Kind == "correct") spare = checked(spare+adjustment.Amount);
            else if(adjustment.Kind=="fund")
            {
                spare=checked(spare-adjustment.Amount);
                balances[adjustment.To!]=checked(balances.GetValueOrDefault(adjustment.To!)+adjustment.Amount);
            }
            else
            {
                balances[adjustment.From!] = checked(balances.GetValueOrDefault(adjustment.From!)-adjustment.Amount);
                balances[adjustment.To!] = checked(balances.GetValueOrDefault(adjustment.To!)+adjustment.Amount);
            }
        }
        return new(month,raw.Income,spare,raw.Tuition,balances,raw.LegacyTotalDifference);
    }

    private static void Transfer(BudgetState state, BudgetCommand command, string actor, DateTimeOffset time)
    {
        if (command.Month != Latest(state)) throw new InvalidOperationException("只能挪用最近已結月份的累計儲備。");
        if (command.Amount <= 0 || command.From == command.To) throw new ArgumentException("請選擇不同的儲備類別與正整數金額。");
        var active = Effective(state,OpenMonth(state))?.Limits ?? [];
        foreach (var id in new[] {command.From,command.To})
            if (!state.Categories.Any(c => c.Id==id && c.Kind=="reserve") || !active.Any(l=>l.CategoryId==id))
                throw new InvalidOperationException("只能在使用中的儲備類別之間挪用。");
        if (Position(state,command.Month).Balances.GetValueOrDefault(command.From!) < command.Amount)
            throw new InvalidOperationException("轉出類別的可用儲備不足。");
        state.Adjustments.Add(new(command.OperationId.ToString(),command.Month,"transfer",command.Amount,command.From,command.To,command.Reason.Trim(),actor,time));
    }

    private static void FundReserve(BudgetState state,BudgetCommand command,string actor,DateTimeOffset time)
    {
        if(command.Month!=Latest(state)) throw new InvalidOperationException("只能調整最近已結月份的目前餘額。");
        var active=Effective(state,OpenMonth(state))?.Limits??[];
        if(!state.Categories.Any(c=>c.Id==command.To&&c.Kind=="reserve")||!active.Any(l=>l.CategoryId==command.To))
            throw new InvalidOperationException("請選擇使用中的儲備類別。");
        var current=Position(state,command.Month);
        if(command.Amount>0 && current.Spare<command.Amount) throw new InvalidOperationException("可用餘額不足，無法補入預備金。");
        if(command.Amount<0 && current.Balances.GetValueOrDefault(command.To!)<-(long)command.Amount)
            throw new InvalidOperationException("該類別儲備不足，無法沖銷補入金額。");
        state.Adjustments.Add(new(command.OperationId.ToString(),command.Month,"fund",command.Amount,null,command.To,command.Reason.Trim(),actor,time));
    }

    private static void Cap(int amount)
    {
        if (amount < 0 || amount > 1_000_000) throw new ArgumentException("每項上限須為 0～1,000,000 的整數。");
    }

    private static BudgetRevision NewRevision(BudgetState state, BudgetCommand command, string actor, DateTimeOffset time)
    {
        if (command.Month != OpenMonth(state)) throw new InvalidOperationException("只能設定開放月份的類別與上限。");
        var source = Effective(state,command.Month);
        return new() {Id=command.OperationId.ToString(),Month=command.Month,Limits=source?.Limits.ToList() ?? [],
            Mapping=source==null?[]:new(source.Mapping),Tuition=source?.Tuition??0,Actor=actor,Time=time,Reason=command.Reason.Trim()};
    }
}
