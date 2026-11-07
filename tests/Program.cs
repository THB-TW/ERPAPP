using ERPAPP.Services.Budgeting;
using ERPAPP.Models;
using Microsoft.EntityFrameworkCore;
using ERPAPP.Services.Import;
using System.Text;

static void Equal<T>(T expected, T actual) { if (!Equals(expected, actual)) throw new Exception($"Expected {expected}; got {actual}."); }
static void Reject<TException>(Action action) where TException:Exception
{
    try { action(); } catch(TException) { return; }
    throw new Exception("Expected operation to be refused.");
}
static BudgetState Example() => new()
{
    Categories = [new("study", "學習深造", "reserve"), new("ai", "AI", "reserve")],
    Revisions = [new() { Id="caps", Month="2026-10", Tuition=15000, Limits=[new("study",22983),new("ai",0)], Mapping=new() { ["AI"]="ai" } }],
    Months = [new() {Id="sep",Month="2026-09",RawSpare=49031,Tuition=60000,Balances=new() { ["study"]=145854 }},
        new() {Id="oct",Month="2026-10",Income=51058,Surplus=13075,RawSpare=62106,Tuition=75000,Balances=new() { ["study"]=149561 }}]
};
static BudgetState Run(BudgetState state, string action, string month, int amount=0) => BudgetEngine.Apply(state,
    new() {Action=action,Month=month,Amount=amount,Version=state.Version,OperationId=Guid.NewGuid(),Reason="已確認的測試依據"},"test",DateTimeOffset.Parse("2026-11-07T12:00:00+08:00"),
    action=="close"?[new("AI",month=="2026-09"?28419:19276)]:null);

var state=Example();
state=Run(state,"correct","2026-10",-700);
Equal(48331,BudgetEngine.Position(state,"2026-09").Spare);
Equal(61406,BudgetEngine.Position(state,"2026-10").Spare);
state=Run(state,"rollback","2026-10");
Equal(48331,BudgetEngine.Position(state,"2026-09").Spare);
state=Run(state,"close","2026-10",51058);
Equal(61406,BudgetEngine.Position(state,"2026-10").Spare);
Equal(285967,BudgetEngine.Position(state,"2026-10").Total);
Console.WriteLine("PASS: prior correction survives rollback and reclose exactly once.");

var transferState=Example();
var transfer=new BudgetCommand {Action="transfer",Month="2026-10",From="study",To="ai",Amount=6802,Reason="AI 超支由學習支應",OperationId=Guid.NewGuid(),Version=0};
transferState=BudgetEngine.Apply(transferState,transfer,"test",DateTimeOffset.UtcNow);
Equal(6802,BudgetEngine.Position(transferState,"2026-10").Balances["ai"]);
Equal(149561,BudgetEngine.Position(transferState,"2026-10").Reserve);
Equal(286667,BudgetEngine.Position(transferState,"2026-10").Total);
transferState=BudgetEngine.Apply(transferState,transfer,"test",DateTimeOffset.UtcNow);
Equal(1,transferState.Adjustments.Count);
Console.WriteLine("PASS: transfer conserves reserve and assets; retry is idempotent.");

var categoryState=Example();
categoryState=BudgetEngine.Apply(categoryState,new() {Action="add",Month="2026-11",Name="旅遊",Kind="reserve",Amount=2000,OperationId=Guid.NewGuid(),Version=0,Reason="單獨編列旅費"},"test",DateTimeOffset.UtcNow);
Equal(2,BudgetEngine.Effective(categoryState,"2026-10")!.Limits.Count);
Equal(3,BudgetEngine.Effective(categoryState,"2026-11")!.Limits.Count);
Equal(149561,BudgetEngine.Position(categoryState,"2026-10").Reserve);
Console.WriteLine("PASS: new category starts in open month without changing old snapshots or reserves.");

var lifecycle=BudgetEngine.Apply(categoryState,new() {Action="caps",Month="2026-11",Limits=BudgetEngine.Effective(categoryState,"2026-11")!.Limits.Select(l=>new BudgetLimit(l.CategoryId, l.CategoryId=="ai"?3000:l.Amount)).ToList(),Tuition=15000,Version=categoryState.Version,OperationId=Guid.NewGuid(),Reason="調高 AI 上限"},"test",DateTimeOffset.UtcNow);
Equal(0,BudgetEngine.Effective(lifecycle,"2026-10")!.Limits.Single(l=>l.CategoryId=="ai").Amount);
Equal(3000,BudgetEngine.Effective(lifecycle,"2026-11")!.Limits.Single(l=>l.CategoryId=="ai").Amount);
Equal(3,lifecycle.Revisions.Count);
Console.WriteLine("PASS: saving caps retains each revision and preserves closed-month caps.");

var reversed=BudgetEngine.Apply(transferState,new() {Action="reverse",Month="2026-10",Reverses=transfer.OperationId.ToString(),Reason="撤回挪用",OperationId=Guid.NewGuid(),Version=transferState.Version},"test",DateTimeOffset.UtcNow);
Equal(0,BudgetEngine.Position(reversed,"2026-10").Balances["ai"]);
Equal(2,reversed.Adjustments.Count);
Console.WriteLine("PASS: reversal appends opposite transfer without deleting original.");

var mappingState=BudgetEngine.Apply(lifecycle,new() {Action="map",Month="2026-11",SourceCategory="AI 訂閱",To="ai",Reason="統一訂閱支出歸屬",OperationId=Guid.NewGuid(),Version=lifecycle.Version},"test",DateTimeOffset.UtcNow);
Equal(false,BudgetEngine.Effective(mappingState,"2026-10")!.Mapping.ContainsKey("AI 訂閱"));
Equal("ai",BudgetEngine.Effective(mappingState,"2026-11")!.Mapping["AI 訂閱"]);
var retired=BudgetEngine.Apply(mappingState,new() {Action="retire",Month="2026-11",From="study",To="ai",Reason="合併儲備用途",OperationId=Guid.NewGuid(),Version=mappingState.Version},"test",DateTimeOffset.UtcNow);
Equal(false,BudgetEngine.Effective(retired,"2026-11")!.Limits.Any(l=>l.CategoryId=="study"));
Equal(149561,BudgetEngine.Position(retired,"2026-10").Balances["ai"]);
Equal(2,BudgetEngine.Effective(retired,"2026-10")!.Limits.Count);
Console.WriteLine("PASS: mappings freeze by month; retiring category transfers reserve and preserves history.");

var pending=Example();
pending.Months.Insert(0,new() {Id="aug",Month="2026-08",RawSpare=38718,Tuition=45000,Balances=new() { ["study"]=151325 }});
pending.Revisions.Insert(0,new() {Id="sep-caps",Month="2026-09",Tuition=15000,Limits=[new("study",22948),new("ai",0)],Mapping=new() { ["AI"]="ai" }});
pending=Run(pending,"correct","2026-10",-700);
pending=Run(pending,"rollback","2026-10");pending=Run(pending,"rollback","2026-09");
Equal(38718,BudgetEngine.Position(pending,"2026-08").Spare);
Equal(1,pending.Adjustments.Count);
pending=Run(pending,"close","2026-09",48261);
Equal(48331,BudgetEngine.Position(pending,"2026-09").Spare);
pending.Revisions.RemoveAll(r=>r.Month=="2026-10");
pending=Run(pending,"close","2026-10",51058);
Equal("2026-10",pending.Months.Last().Revision!.Month);
Console.WriteLine("PASS: correction waits for its original month; carried caps freeze on reclose.");

var unsafeLegacy=Example();unsafeLegacy.Months.Last().Migrated=true;unsafeLegacy.Months.Last().LegacyTotalDifference=10;
Reject<InvalidOperationException>(()=>Run(unsafeLegacy,"rollback","2026-10"));
Reject<InvalidOperationException>(()=>Run(unsafeLegacy,"correct","2026-10",-700));
Console.WriteLine("PASS: incomplete legacy accounting requires reconciliation before rollback or correction.");

Reject<InvalidOperationException>(()=>BudgetEngine.Apply(transferState,new() {Action="transfer",Month="2026-10",From="study",To="ai",Amount=1,Reason="過期頁面",Version=0,OperationId=Guid.NewGuid()},"test",DateTimeOffset.UtcNow));
Reject<InvalidOperationException>(()=>BudgetEngine.Apply(Example(),new() {Action="transfer",Month="2026-10",From="study",To="ai",Amount=150000,Reason="不能透支",Version=0,OperationId=Guid.NewGuid()},"test",DateTimeOffset.UtcNow));
Reject<ArgumentException>(()=>Run(Example(),"correct","2026-10",0));
var unknown=Run(Example(),"rollback","2026-10");
Reject<InvalidOperationException>(()=>BudgetEngine.Apply(unknown,new() {Action="close",Month="2026-10",Amount=51058,Reason="未知分類必須先指定",Version=unknown.Version,OperationId=Guid.NewGuid()},"test",DateTimeOffset.UtcNow,[new("未指定支出",100)]));
Console.WriteLine("PASS: stale writes, overdrafts, zero corrections and unmapped expenses are refused.");

var fundBase=Example();
var funding=new BudgetCommand {Action="fund",Month="2026-10",To="ai",Amount=2000,Reason="以可用餘額補預備金",Version=0,OperationId=Guid.NewGuid()};
var funded=BudgetEngine.Apply(fundBase,funding,"test",DateTimeOffset.UtcNow);
Equal(BudgetEngine.Position(fundBase,"2026-10").Spare-2000,BudgetEngine.Position(funded,"2026-10").Spare);
Equal(2000,BudgetEngine.Position(funded,"2026-10").Balances["ai"]);
Equal(BudgetEngine.Position(fundBase,"2026-10").Total,BudgetEngine.Position(funded,"2026-10").Total);
Equal(BudgetEngine.Position(fundBase,"2026-10").Tuition,BudgetEngine.Position(funded,"2026-10").Tuition);
Equal(1,BudgetEngine.Apply(funded,funding,"test",DateTimeOffset.UtcNow).Adjustments.Count);
var unfunded=BudgetEngine.Apply(funded,new() {Action="reverse",Month="2026-10",Reverses=funding.OperationId.ToString(),Version=funded.Version,OperationId=Guid.NewGuid(),Reason="取消補入"},"test",DateTimeOffset.UtcNow);
Equal(BudgetEngine.Position(fundBase,"2026-10").Spare,BudgetEngine.Position(unfunded,"2026-10").Spare);
var waiting=Run(funded,"rollback","2026-10");
Equal(BudgetEngine.Position(fundBase,"2026-09").Spare,BudgetEngine.Position(waiting,"2026-09").Spare);
waiting=Run(waiting,"close","2026-10",51058);
Equal(BudgetEngine.Position(funded,"2026-10").Spare,BudgetEngine.Position(waiting,"2026-10").Spare);
var unadjustedReclose=Run(Run(fundBase,"rollback","2026-10"),"close","2026-10",51058);
Equal(BudgetEngine.Position(unadjustedReclose,"2026-10").Balances["ai"]+2000,BudgetEngine.Position(waiting,"2026-10").Balances["ai"]);
Reject<InvalidOperationException>(()=>BudgetEngine.Apply(fundBase,new() {Action="fund",Month="2026-10",To="ai",Amount=1000000,Reason="不足",Version=0,OperationId=Guid.NewGuid()},"test",DateTimeOffset.UtcNow));
Reject<ArgumentException>(()=>BudgetEngine.Apply(fundBase,new() {Action="fund",Month="2026-10",To="ai",Amount=-1,Reason="負額",Version=0,OperationId=Guid.NewGuid()},"test",DateTimeOffset.UtcNow));
Console.WriteLine("PASS: spare funds reserve without changing assets; reversal, retry and reclose preserve one effect.");

if(args.Contains("--integration"))
{
    using var db=new ErpdbContext(new DbContextOptionsBuilder<ErpdbContext>().UseSqlServer(@"Server=.\SQLEXPRESS;Database=ERPDB_BudgetVerify_20261107;Integrated Security=true;TrustServerCertificate=true").Options);
    var before=db.Properties.AsNoTracking().OrderBy(p=>p.Date).ToArray();
    var workspace=new BudgetWorkspace(db);
    var baseline=workspace.Read();
    if(baseline.Version!=0 || baseline.Adjustments.Count!=0 || baseline.Receipts.Count!=0 || baseline.Checks.Count!=0)
        throw new Exception("Verification copy is not a pristine test fixture; restore its backup before running tests.");
    db.Database.ExecuteSqlRaw("DELETE dbo.FinanceWorkspace WHERE Id=1 AND Version=0");
    var imported=workspace.Read();
    foreach(var p in before)
    {
        var position=BudgetEngine.Position(imported,p.Date.ToString("yyyy-MM"));
        Equal(p.Sparemoney,position.Spare); Equal(p.Budget,position.Reserve); Equal(p.Tuitionfee,position.Tuition); Equal(p.Totalproperty,position.Total);
    }
    Equal(before.Length,imported.Months.Count);
    Console.WriteLine($"PASS: SQL migration preserves all four amounts for {before.Length} historical months.");
    using var testTransaction=db.Database.BeginTransaction();
    var latest=BudgetEngine.Latest(imported);
    var previous=BudgetEngine.MonthDate(latest).AddMonths(-1).ToString("yyyy-MM");
    var command=new BudgetCommand {Action="correct",Month=latest,Amount=-700,OperationId=Guid.NewGuid(),Version=imported.Version,Reason="副本驗證：前期更正"};
    var persisted=workspace.Execute(command,"integration");
    Equal(BudgetEngine.Position(imported,latest).Spare-700,BudgetEngine.Position(workspace.Read(),latest).Spare);
    Equal(BudgetEngine.Position(imported,previous).Total-700,BudgetEngine.Position(persisted,previous).Total);
    Equal(persisted.Version,workspace.Execute(command,"integration").Version);
    var rolled=workspace.Execute(new() {Action="rollback",Month=latest,Version=persisted.Version,OperationId=Guid.NewGuid(),Reason="副本驗證撤銷"},"integration");
    var recapped=workspace.Execute(new() {Action="map",Month=latest,SourceCategory="AI",To="other",Version=rolled.Version,OperationId=Guid.NewGuid(),Reason="副本明確沿用既有 AI 歸屬"},"integration");
    var recloseCommand=new BudgetCommand {Action="close",Month=latest,Amount=imported.Months.Single(m=>m.Month==latest).Income,Version=recapped.Version,OperationId=Guid.NewGuid(),Reason="副本驗證重結"};
    db.Database.ExecuteSqlRaw("INSERT dbo.creditcard(Date,Item,Amount) VALUES('20261003',N'budget-verification-duplicate',700)");
    Reject<CreditcardMismatchException>(()=>workspace.Execute(recloseCommand,"integration"));
    db.Database.ExecuteSqlRaw("DELETE dbo.creditcard WHERE Item=N'budget-verification-duplicate'");
    var reclosed=workspace.Execute(recloseCommand,"integration");
    Equal(BudgetEngine.Position(imported,latest).Spare-700,BudgetEngine.Position(reclosed,latest).Spare);
    Equal(BudgetEngine.Position(imported,latest).Reserve,BudgetEngine.Position(reclosed,latest).Reserve);
    Equal(BudgetEngine.Position(imported,latest).Total-700,BudgetEngine.Position(reclosed,latest).Total);
    Equal(before.Single(p=>p.Date==new DateTime(2026,10,1)).Totalproperty-700,db.Properties.AsNoTracking().Single(p=>p.Date==new DateTime(2026,10,1)).Totalproperty);
    Console.WriteLine("PASS: actual SQL close path preserves -700 and reserve through rollback/map/reclose.");
    var fundedSql=workspace.Execute(new() {Action="fund",Month=latest,To="study",Amount=100,Version=reclosed.Version,OperationId=Guid.NewGuid(),Reason="副本驗證餘額補入"},"integration");
    var fundedPosition=BudgetEngine.Position(fundedSql,latest);
    Equal(BudgetEngine.Position(reclosed,latest).Spare-100,fundedPosition.Spare);
    Equal(BudgetEngine.Position(reclosed,latest).Total,fundedPosition.Total);
    Equal(fundedPosition.Spare,db.Properties.AsNoTracking().Single(p=>p.Date==new DateTime(2026,10,1)).Sparemoney);
    workspace.Execute(new() {Action="reverse",Month=latest,Reverses=fundedSql.Adjustments.Last().Id,Version=fundedSql.Version,OperationId=Guid.NewGuid(),Reason="副本驗證補入沖銷"},"integration");
    db.Transactions.Add(new() {Date=BudgetEngine.MonthDate(latest).AddDays(1),Category="其他",Amount=99997,Member="自己",Account="現金",TransactionType="支"});
    Reject<ClosedPeriodException>(()=>db.SaveChanges());
    db.ChangeTracker.Clear();
    db.Transactions.Add(new() {Date=BudgetEngine.MonthDate(latest).AddMonths(1).AddDays(1),Category="其他",Amount=-1,Member="自己",Account="現金",TransactionType="支"});
    Reject<InvalidTransactionException>(()=>db.SaveChanges());
    db.ChangeTracker.Clear();
    var existing=db.Transactions.AsNoTracking().First(t=>t.Date>=BudgetEngine.MonthDate(latest)&&t.Date<BudgetEngine.MonthDate(latest).AddMonths(1));
    var csv=$"{existing.Date:yyyy-MM-dd},{existing.Category},{existing.Amount},{existing.Member},{existing.Account},{existing.TransactionType}\n{latest}-02,其他,99997,自己,現金,支\n{BudgetEngine.MonthDate(latest).AddMonths(1):yyyy-MM}-07,其他,99996,自己,現金,支";
    using var stream=new MemoryStream(Encoding.UTF8.GetBytes(csv));
    var importedCsv=ImportRun.Execute(ImportSources.TransactionCsv,stream,Encoding.UTF8,new TransactionTable(db));
    Equal(1,importedCsv.Inserted);Equal(1,importedCsv.Skipped);Equal(1,importedCsv.RejectedRows);
    Equal("已結月份，須先撤銷月結",importedCsv.Rejections.Single().Reason);
    var checkRequest=new ERPAPP.Dto.AssetCheckRequest {Year=2026,Month=10,Cash=2556,Ipass=115,Bank=277935,UnbilledCredit=5027,AutoRollback=true,AsOfDate=new(2026,11,6),Reason="核對原始畫面"};
    var result=workspace.Check(checkRequest,"integration");
    Equal(285967,result.ActualAdjusted);
    Equal(1,workspace.Read().Checks.Count);
    Equal(result.RecordId,workspace.Check(checkRequest,"integration").RecordId);
    Equal(1,workspace.Read().Checks.Count);
    testTransaction.Rollback();
    Console.WriteLine("PASS: persisted correction is atomic and idempotent (verification copy only).");
    Console.WriteLine("PASS: CSV keeps dedup, rejects locked rows explicitly, and imports open-month rows.");
}
