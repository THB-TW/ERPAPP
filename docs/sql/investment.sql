-- 投資組合資料表（直接在 SQL Server 執行；本專案不使用 EF migration，見 .scratch/investment/plan.md）
-- sqlcmd -S ".\SQLEXPRESS" -U handsome -P 123 -d ERPDB -i investment.sql -f 65001 -I
--（-I 必要：filtered index 需要 QUOTED_IDENTIFIER ON，sqlcmd 預設是 OFF）
USE [ERPDB];
GO
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- 標的：台股記到個股，虛擬貨幣整體為單一標的
IF OBJECT_ID('dbo.InvestmentHolding') IS NULL
BEGIN
    CREATE TABLE InvestmentHolding (
        Id          INT IDENTITY(1,1) PRIMARY KEY,
        AssetClass  NVARCHAR(20)  NOT NULL,   -- N'台股' | N'虛擬貨幣'
        Symbol      NVARCHAR(20)  NULL,       -- 股票代號；虛擬貨幣為 NULL
        Name        NVARCHAR(50)  NOT NULL,
        IsActive    BIT           NOT NULL DEFAULT 1,
        CreatedAt   DATETIME2     NOT NULL DEFAULT SYSDATETIME()
    );
    -- 台股代號不得重複；虛擬貨幣桶子只能有一個
    CREATE UNIQUE INDEX UX_Holding_Symbol ON InvestmentHolding(Symbol) WHERE Symbol IS NOT NULL;
    CREATE UNIQUE INDEX UX_Holding_CryptoBucket ON InvestmentHolding(AssetClass) WHERE AssetClass = N'虛擬貨幣';
END
GO

-- 投資交易（沒有 RealizedPnl 欄位——損益一律讀取時由計算服務導出，
-- 否則事後改/刪舊交易會讓存下來的損益過期）
IF OBJECT_ID('dbo.InvestmentTransaction') IS NULL
BEGIN
    CREATE TABLE InvestmentTransaction (
        Id          INT IDENTITY(1,1) PRIMARY KEY,
        HoldingId   INT           NOT NULL
                    REFERENCES InvestmentHolding(Id),
        Date        DATE          NOT NULL,
        TxType      NVARCHAR(10)  NOT NULL,   -- N'期初' | N'買' | N'賣' | N'配息'
        Quantity    DECIMAL(18,4) NULL,       -- 股數；虛擬貨幣為 NULL；台股買/賣必填（程式驗證）
        Amount      INT           NOT NULL,   -- 實際扣款／入帳金額，含手續費與證交稅
        FundSource  NVARCHAR(10)  NOT NULL,   -- N'帳內' | N'帳外'
        Note        NVARCHAR(200) NULL,
        CreatedAt   DATETIME2     NOT NULL DEFAULT SYSDATETIME()
    );
    CREATE INDEX IX_InvTx_Holding_Date ON InvestmentTransaction(HoldingId, Date);
END
GO

-- 市值快照：台股填 UnitPrice（市值由讀取端以 目前股數×股價 計算），虛擬貨幣填 MarketValue（總額）
IF OBJECT_ID('dbo.InvestmentValuation') IS NULL
BEGIN
    CREATE TABLE InvestmentValuation (
        Id          INT IDENTITY(1,1) PRIMARY KEY,
        HoldingId   INT           NOT NULL
                    REFERENCES InvestmentHolding(Id),
        AsOf        DATETIME2     NOT NULL,
        UnitPrice   DECIMAL(18,4) NULL,       -- 台股：每股股價
        MarketValue INT           NULL,       -- 虛擬貨幣：市值總額
        CreatedAt   DATETIME2     NOT NULL DEFAULT SYSDATETIME()
    );
    CREATE INDEX IX_InvVal_Holding_AsOf ON InvestmentValuation(HoldingId, AsOf DESC);
END
GO

-- 期初投入額：宣告值，不由交易推導（見 docs/adr/0001）。
-- 語意上只有一列；程式一律取第一列，調整就是 UPDATE 這一列，不要 INSERT 第二列。
IF OBJECT_ID('dbo.InvestmentOpening') IS NULL
BEGIN
    CREATE TABLE InvestmentOpening (
        Id          INT IDENTITY(1,1) PRIMARY KEY,
        AsOfMonth   DATE          NOT NULL,   -- 2026-07-01
        NetDeployed INT           NOT NULL,   -- 20006（原宣告 23736，2026-08 月結校準）
        Note        NVARCHAR(200) NULL
    );
END
GO
