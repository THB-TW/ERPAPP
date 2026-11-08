-- 每月預算上限快照 (Budget Cap Snapshot)——見 CONTEXT.md「## 預算上限」與 docs/adr/0002。
-- sp_FinanceSummary 從這張表讀上限，不再寫死。可重複執行（表已存在就略過）。
-- 一個月份一列；month 一律是該月 1 號。
--   * 已結月份（month <= Property 最新月）的列是快照：月結時凍結，網站不准再改。
--   * 開放月份（Property 最新月的次月）是唯一可在網站上調整的月份。
--   * 某月沒有自己的列 → 沿用最近一個較早月份的列；月結時 SP 會把沿用值寫成該月自己的快照。
-- 歷史月份的回填值放在 repo 之外（..\BudgetCap_backfill.sql），跟 SP 原始碼一樣不進 repo。

IF OBJECT_ID(N'dbo.BudgetCap', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.BudgetCap (
        month      DATE NOT NULL CONSTRAINT PK_BudgetCap PRIMARY KEY,
        -- 10 個儲備類別：結餘（上限－實支）進 budget 當月列與總儲備金
        food       INT NOT NULL,  -- 飲食
        car        INT NOT NULL,  -- 汽車
        fun        INT NOT NULL,  -- 娛樂
        study      INT NOT NULL,  -- 學習深造
        cloth      INT NOT NULL,  -- 服飾
        articles   INT NOT NULL,  -- 日常用品
        furniture  INT NOT NULL,  -- 大型器具
        hair       INT NOT NULL,  -- 美容美髮
        health     INT NOT NULL,  -- 醫療保健
        other      INT NOT NULL,  -- 其他（所有未對應類別合計）
        -- 2 個固定支出：結餘只回到當月盈餘，不進儲備
        phone      INT NOT NULL,  -- 電話網路
        gogoro     INT NOT NULL,  -- gogoro電費
        -- 學費儲備：每月從盈餘提撥、累加到 Property.tuitionfee
        tuition    INT NOT NULL,
        updatedAt  DATETIME2(0) NOT NULL CONSTRAINT DF_BudgetCap_updatedAt DEFAULT SYSDATETIME(),
        CONSTRAINT CK_BudgetCap_FirstOfMonth CHECK (DAY(month) = 1),
        CONSTRAINT CK_BudgetCap_NonNegative CHECK (
            food >= 0 AND car >= 0 AND fun >= 0 AND study >= 0 AND cloth >= 0 AND articles >= 0
            AND furniture >= 0 AND hair >= 0 AND health >= 0 AND other >= 0
            AND phone >= 0 AND gogoro >= 0 AND tuition >= 0)
    );
END
GO
