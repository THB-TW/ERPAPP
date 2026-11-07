# 撤銷月結用「現在的交易」重算結餘，總儲備金會漂移

Status: needs-triage

## 現象

`sp_FinanceSummary` 的撤銷分支（@own = -1）重新跑一次類別彙總，用「當下 Transactions 算出的結餘」去扣
budget 累計列（date = 1911-01-01），再刪掉該月的 budget／Property 列。
如果該月月結後交易被改過（2026-10-09 的分析找到 5 個月：2024-10、2025-05、2025-11、2026-04、2026-06），
撤銷時扣掉的值 ≠ 月結時加上的值，累計列就留下差額；撤銷再重結也不會回到原點。
2024-11 起累計列與「各月結餘累加」的差額漂移了 −45,803，其中部分非整數的偏離（+3,230、+3,322、+880）符合這個機制。

上限的部分已由 BudgetCap 快照解決（撤銷用同一份上限）；這張 issue 是「實支」那一半。

## 建議修法

撤銷分支改成直接扣 budget 當月列存下的值：

```sql
UPDATE acc SET
    food = acc.food - m.food, car = acc.car - m.car, fun = acc.fun - m.fun, study = acc.study - m.study,
    cloth = acc.cloth - m.cloth, articles = acc.articles - m.articles, furniture = acc.furniture - m.furniture,
    hair = acc.hair - m.hair, health = acc.health - m.health, other = acc.other - m.other
FROM budget acc CROSS JOIN budget m
WHERE acc.expenditure = 0 AND m.date = @start;
-- total 依各欄重算（與月結時第 8 步一致）
```

驗證方式比照 `.scratch/budget-cap/spec.md`：兩份 ERPDB 複本，「月結 → 改一筆該月交易類別 → 撤銷」後，
新版累計列應精確回到月結前；交易沒被改過時，新舊版輸出一字不差。

改 SP 要動真實資料庫，需使用者套用。

## 2026-11-07 後續

新網站改走 `BudgetEngine`／`BudgetWorkspace`，撤銷依保存的原始月結與基準回沖，手動調整獨立保留；舊 SP 不再由網站呼叫，因此不直接修改這個舊分支。原有累計漂移不因升級而自動修補，仍須另外查核。新流程決定見 ADR 0003／0004，測試包含實際 SQL 撤銷與重結。
