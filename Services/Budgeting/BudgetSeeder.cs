using ERPAPP.Models;
using Microsoft.EntityFrameworkCore;

namespace ERPAPP.Services.Budgeting;

// Import stored results, not recomputed current transactions: old manual adjustments remain intact.
public static class BudgetSeeder
{
    private static readonly (string Id,string Name,Func<Budget,int?> Balance)[] Reserves =
    [ ("food","飲食",b=>b.Food),("car","汽車",b=>b.Car),("fun","娛樂",b=>b.Fun),
      ("study","學習深造",b=>b.Study),("cloth","服飾",b=>b.Cloth),("articles","日常用品",b=>b.Articles),
      ("furniture","大型器具",b=>b.Furniture),("hair","美容美髮",b=>b.Hair),("health","醫療保健",b=>b.Health),("other","其他",b=>b.Other) ];

    public static BudgetState Import(ErpdbContext db)
    {
        var state=new BudgetState();
        state.Categories=Reserves.Select(r=>new BudgetCategoryDefinition(r.Id,r.Name,"reserve")).ToList();
        state.Categories.AddRange([new("phone","電話網路","fixed"),new("gogoro","gogoro電費","fixed"),
            new("electricity","電費","actual"),new("water","水費","actual"),new("gas","瓦斯","actual")]);
        foreach(var caps in db.BudgetCaps.AsNoTracking().OrderBy(c=>c.Month))
        {
            var revision=new BudgetRevision {Id="legacy-caps-"+caps.Month.ToString("yyyy-MM"),Month=caps.Month.ToString("yyyy-MM"),
                Tuition=caps.Tuition,Actor="歷史移轉",Reason="帶入既有上限；原始修改原因未留存",Time=new DateTimeOffset(caps.UpdatedAt)};
            var limits=new Dictionary<string,int> { ["food"]=caps.Food,["car"]=caps.Car,["fun"]=caps.Fun,["study"]=caps.Study,
                ["cloth"]=caps.Cloth,["articles"]=caps.Articles,["furniture"]=caps.Furniture,["hair"]=caps.Hair,
                ["health"]=caps.Health,["other"]=caps.Other,["phone"]=caps.Phone,["gogoro"]=caps.Gogoro };
            revision.Limits=limits.Select(p=>new BudgetLimit(p.Key,p.Value)).ToList();
            foreach(var cat in state.Categories)
            {
                revision.Mapping[cat.Name]=cat.Id;
                if(cat.Kind=="actual") revision.Limits.Add(new(cat.Id,0));
            }
            state.Revisions.Add(revision);
        }
        var budgets=db.Budgets.AsNoTracking().ToList();
        var cumulative=budgets.Single(b=>b.Date==new DateTime(1911,1,1));
        var balances=Reserves.ToDictionary(r=>r.Id,r=>r.Balance(cumulative)??0);
        foreach(var property in db.Properties.AsNoTracking().OrderByDescending(p=>p.Date))
        {
            var month=property.Date.ToString("yyyy-MM");
            int Required(int? value)=>value??throw new InvalidOperationException($"歷史月份 {month} 的資產資料缺漏，移轉已停止。");
            var storedSpare=Required(property.Sparemoney);var storedReserve=Required(property.Budget);
            var storedTuition=Required(property.Tuitionfee);var storedTotal=Required(property.Totalproperty);
            var anchor=checked(storedReserve-balances.Values.Sum());
            balances["other"]=checked(balances["other"]+anchor);
            var budget=budgets.SingleOrDefault(b=>b.Date.Year==property.Date.Year&&b.Date.Month==property.Date.Month);
            var changes=Reserves.ToDictionary(r=>r.Id,r=>budget==null?0:r.Balance(budget)??0);
            var close=new MonthClose {Id="legacy-close-"+month,Month=month,Income=property.Own??0,
                Surplus=budget?.Gete??0,RawSpare=storedSpare,Tuition=storedTuition,
                Balances=new(balances),Changes=changes,Revision=BudgetEngine.Effective(state,month),Migrated=true,
                LegacyBalanceAnchor=anchor,LegacyTotalDifference=checked(storedTotal-storedSpare-storedTuition-storedReserve),
                Actor="歷史移轉",Time=new DateTimeOffset(property.Inputdate)};
            if(BudgetEngine.Position(new BudgetState {Months=[close]},month).Total!=storedTotal)
                throw new InvalidOperationException($"歷史月份 {month} 的資產加總不一致，移轉已停止。");
            state.Months.Add(close); state.CloseHistory.Add(close);
            foreach(var change in changes) balances[change.Key]=checked(balances[change.Key]-change.Value);
        }
        state.Months=state.Months.OrderBy(m=>m.Month).ToList();
        return state;
    }

    // Projection for legacy reports: newly introduced reserve classes fold into legacy Other.
    public static Dictionary<string,int> LegacyBalances(MonthPosition position)
    {
        var result=Reserves.ToDictionary(r=>r.Id,r=>position.Balances.GetValueOrDefault(r.Id));
        result["other"]=checked(result["other"]+position.Balances.Where(p=>!result.ContainsKey(p.Key)).Sum(p=>p.Value));
        return result;
    }
}
