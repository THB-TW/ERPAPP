-- 期初建置（2026-07，只跑一次；重跑會因唯一索引/防重檢查而略過）
-- 數字來源：券商庫存截圖 2026-08-13（總成本 79,985；手記 79,951 差 34，應為手續費零頭，以券商為準）
-- 與交易所/幣安資產截圖（虛擬貨幣期初成本 92,918 為使用者宣告值）。
-- sqlcmd -S ".\SQLEXPRESS" -U handsome -P 123 -d ERPDB -i investment-seed.sql -f 65001 -I
USE [ERPDB];
GO
SET QUOTED_IDENTIFIER ON;
GO

-- 標的
IF NOT EXISTS (SELECT 1 FROM InvestmentHolding WHERE Symbol = N'2330')
    INSERT INTO InvestmentHolding (AssetClass, Symbol, Name) VALUES (N'台股', N'2330', N'台積電');
IF NOT EXISTS (SELECT 1 FROM InvestmentHolding WHERE Symbol = N'009816')
    INSERT INTO InvestmentHolding (AssetClass, Symbol, Name) VALUES (N'台股', N'009816', N'凱基台灣TOP50');
IF NOT EXISTS (SELECT 1 FROM InvestmentHolding WHERE AssetClass = N'虛擬貨幣')
    INSERT INTO InvestmentHolding (AssetClass, Symbol, Name) VALUES (N'虛擬貨幣', NULL, N'虛擬貨幣');
GO

-- 期初部位（TxType=期初 不計入累計投入淨額；日期＝期初時點 2026-07）
IF NOT EXISTS (SELECT 1 FROM InvestmentTransaction WHERE TxType = N'期初')
BEGIN
    INSERT INTO InvestmentTransaction (HoldingId, Date, TxType, Quantity, Amount, FundSource, Note)
    SELECT Id, '2026-07-01', N'期初', 27, 65115, N'帳內', N'期初建置：2026-06 買 41,345＋2026-07 買 23,736（券商成本 65,115）'
    FROM InvestmentHolding WHERE Symbol = N'2330';

    INSERT INTO InvestmentTransaction (HoldingId, Date, TxType, Quantity, Amount, FundSource, Note)
    SELECT Id, '2026-07-01', N'期初', 1000, 14870, N'帳內', N'期初建置：2026-06 買入'
    FROM InvestmentHolding WHERE Symbol = N'009816';

    INSERT INTO InvestmentTransaction (HoldingId, Date, TxType, Quantity, Amount, FundSource, Note)
    SELECT Id, '2026-07-01', N'期初', NULL, 92918, N'帳外', N'期初建置：宣告值 140,000−賣出 47,082（成本收回法）'
    FROM InvestmentHolding WHERE AssetClass = N'虛擬貨幣';
END
GO

-- 期初投入額（唯一一列；之後調整一律 UPDATE 這一列）
-- 原宣告 23,736；2026-09-08 以 2026-08 月結實體對帳校準為 20,006（差額 +3,730 → 0）。
-- 既有資料庫已用 UPDATE 改過；此處只影響全新資料庫的種子值。
IF NOT EXISTS (SELECT 1 FROM InvestmentOpening)
    INSERT INTO InvestmentOpening (AsOfMonth, NetDeployed, Note)
    VALUES ('2026-07-01', 20006, N'期初宣告（2026-07）：20,006。原宣告 23,736，2026-08 月結核對校準；2026-08 無買賣');
GO

-- 第一筆市值快照（2026-08-13 券商/交易所畫面）
IF NOT EXISTS (SELECT 1 FROM InvestmentValuation)
BEGIN
    INSERT INTO InvestmentValuation (HoldingId, AsOf, UnitPrice, MarketValue)
    SELECT Id, '2026-08-13T19:40:00', 2435.00, NULL FROM InvestmentHolding WHERE Symbol = N'2330';

    INSERT INTO InvestmentValuation (HoldingId, AsOf, UnitPrice, MarketValue)
    SELECT Id, '2026-08-13T19:40:00', 15.52, NULL FROM InvestmentHolding WHERE Symbol = N'009816';

    -- 幣安 39,825 ＋ MAX 14,531 ＝ 54,356
    INSERT INTO InvestmentValuation (HoldingId, AsOf, UnitPrice, MarketValue)
    SELECT Id, '2026-08-13T19:42:00', NULL, 54356 FROM InvestmentHolding WHERE AssetClass = N'虛擬貨幣';
END
GO
