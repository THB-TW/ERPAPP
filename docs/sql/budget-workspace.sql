-- Run against the intended ERPDB (or its verification copy). Do not run EF migrations.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.Property') AND name=N'UX_Property_Date')
    CREATE UNIQUE INDEX UX_Property_Date ON dbo.Property(date);
IF OBJECT_ID(N'dbo.FinanceWorkspace', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FinanceWorkspace (
        Id int NOT NULL CONSTRAINT PK_FinanceWorkspace PRIMARY KEY,
        Version bigint NOT NULL,
        Document nvarchar(max) NOT NULL,
        CONSTRAINT CK_FinanceWorkspace_Singleton CHECK (Id=1),
        CONSTRAINT CK_FinanceWorkspace_Json CHECK (ISJSON(Document)=1),
        CONSTRAINT CK_FinanceWorkspace_Version CHECK (Version>=0 AND JSON_VALUE(Document,'$.Version') IS NOT NULL
            AND TRY_CONVERT(bigint,JSON_VALUE(Document,'$.Version')) IS NOT NULL
            AND Version=TRY_CONVERT(bigint,JSON_VALUE(Document,'$.Version')))
    );
END;
COMMIT;
