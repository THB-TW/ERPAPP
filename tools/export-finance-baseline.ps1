[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$SnapshotDatabase,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [string]$Server = '.\SQLEXPRESS'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Only the separately restored, read-only baseline may be exported. Never point this at ERPDB.
if ($SnapshotDatabase -notmatch '^ERPDB_CloudflareBaseline_\d{8}_\d{6}$') {
    throw 'Expected a separately restored ERPDB_CloudflareBaseline_yyyyMMdd_HHmmss database.'
}
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$privateRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot '.private'))
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
if (-not $outputRoot.StartsWith($privateRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Exports must stay under this checkout .private directory.'
}
if (Test-Path -LiteralPath $outputRoot) { throw 'Output directory already exists; refusing to overwrite a baseline.' }

$builder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new()
$builder['Data Source'] = $Server
$builder['Initial Catalog'] = $SnapshotDatabase
$builder['Integrated Security'] = $true
$builder['Encrypt'] = $true
$builder['TrustServerCertificate'] = $true
$builder['Application Name'] = 'ERPAPP Read-only Baseline Export'
$connection = [System.Data.SqlClient.SqlConnection]::new($builder.ConnectionString)
$encoding = [Text.UTF8Encoding]::new($false)

function Read-JsonQuery([string]$Sql) {
    $command = $connection.CreateCommand()
    $command.CommandTimeout = 120
    $command.CommandText = $Sql
    $reader = $null
    try {
        $reader = $command.ExecuteReader()
        $textBuilder = [Text.StringBuilder]::new()
        while ($reader.Read()) { [void]$textBuilder.Append($reader.GetString(0)) }
        $result = $textBuilder.ToString()
        if ([string]::IsNullOrWhiteSpace($result)) { $result = '[]' }
        return $result
    }
    finally { if ($reader) { $reader.Dispose() }; $command.Dispose() }
}

function Write-Utf8([string]$Path, [string]$Text) {
    [IO.File]::WriteAllText($Path, $Text, $encoding)
}

try {
    $connection.Open()
    $command = $connection.CreateCommand()
    $command.CommandText = "SELECT CONVERT(nvarchar(20), DATABASEPROPERTYEX(DB_NAME(), 'Updateability'))"
    try { $mode = [string]$command.ExecuteScalar() } finally { $command.Dispose() }
    if ($mode -ne 'READ_ONLY') { throw 'Snapshot must be READ_ONLY before exporting.' }

    New-Item -ItemType Directory -Path $outputRoot | Out-Null
    Write-Utf8 (Join-Path $outputRoot 'INCOMPLETE') 'No valid manifest exists until export and invariants pass.'
    $schemaJson = Read-JsonQuery @'
SELECT s.name AS [schema],t.name AS [table],c.column_id AS ordinal,c.name AS [name],
       ty.name AS [type],c.max_length AS maxLength,c.precision,c.scale,c.is_nullable AS nullable,
       c.is_identity AS [identity]
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
WHERE t.is_ms_shipped=0 ORDER BY s.name,t.name,c.column_id FOR JSON PATH, INCLUDE_NULL_VALUES
'@
    Write-Utf8 (Join-Path $outputRoot 'schema.json') $schemaJson
    $columns = @($schemaJson | ConvertFrom-Json)
    $tables = @($columns | Group-Object { $_.schema + '.' + $_.table })
    $tableManifest = @()
    foreach ($table in $tables) {
        $schemaName = [string]$table.Group[0].schema
        $tableName = [string]$table.Group[0].table
        if ($schemaName -notmatch '^\w+$' -or $tableName -notmatch '^\w+$') {
            throw 'Unexpected table identifier; explicit mapping required.'
        }
        $selectColumns = @($table.Group | ForEach-Object {
            $quoted = '[' + ([string]$_.name).Replace(']', ']]') + ']'
            # JSON numbers are unsafe for future JS imports of exact decimal quantities and bigint.
            if ($_.type -in @('decimal','numeric','bigint')) { "CONVERT(varchar(100),$quoted) AS $quoted" }
            elseif ($_.type -in @('money','smallmoney')) { "CONVERT(varchar(100),$quoted,2) AS $quoted" }
            else { $quoted }
        }) -join ','
        $qualifiedName = "[$schemaName].[$tableName]"
        $json = Read-JsonQuery "SELECT $selectColumns FROM $qualifiedName FOR JSON PATH, INCLUDE_NULL_VALUES"
        $rows = @($json | ConvertFrom-Json -Depth 100)
        $rowCount = $rows.Count
        $command = $connection.CreateCommand()
        $command.CommandText = "SELECT COUNT_BIG(*) FROM $qualifiedName"
        try { $databaseCount = [long]$command.ExecuteScalar() } finally { $command.Dispose() }
        if ($rowCount -ne $databaseCount) { throw "Row count differs for $qualifiedName." }
        $fileName = "$schemaName.$tableName.json"
        $filePath = Join-Path $outputRoot $fileName
        Write-Utf8 $filePath $json
        $tableManifest += [ordered]@{
            table=$table.Name; file=$fileName; rows=$rowCount
            sha256=(Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
            containsCredentials=($tableName -eq 'Employee')
        }
    }

    # Keep definitions/constraints as archival evidence; never execute old SQL against D1.
    $objectsJson = Read-JsonQuery @'
SELECT s.name AS [schema],o.name,o.type_desc AS kind,m.definition
FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
JOIN sys.sql_modules m ON m.object_id=o.object_id WHERE o.is_ms_shipped=0
ORDER BY s.name,o.name FOR JSON PATH, INCLUDE_NULL_VALUES
'@
    Write-Utf8 (Join-Path $outputRoot 'sql-objects.json') $objectsJson
    $constraintsJson = Read-JsonQuery @'
SELECT s.name AS [schema],t.name AS [table],c.name,c.definition
FROM sys.check_constraints c JOIN sys.tables t ON t.object_id=c.parent_object_id
JOIN sys.schemas s ON s.schema_id=t.schema_id
ORDER BY s.name,t.name,c.name FOR JSON PATH, INCLUDE_NULL_VALUES
'@
    Write-Utf8 (Join-Path $outputRoot 'check-constraints.json') $constraintsJson

    $financePath = Join-Path $outputRoot 'dbo.FinanceWorkspace.json'
    $propertyPath = Join-Path $outputRoot 'dbo.Property.json'
    $financeRows = @(Get-Content -LiteralPath $financePath -Raw | ConvertFrom-Json -Depth 100)
    if ($financeRows.Count -ne 1) { throw 'Expected exactly one FinanceWorkspace document.' }
    $state = $financeRows[0].Document | ConvertFrom-Json -Depth 100
    $properties = @(Get-Content -LiteralPath $propertyPath -Raw | ConvertFrom-Json)
    if (@($state.Months).Count -ne $properties.Count) { throw 'Asset and workspace month counts differ.' }
    $monthSet = [Collections.Generic.HashSet[string]]::new()
    foreach ($month in $state.Months) {
        if (-not $monthSet.Add([string]$month.Month)) { throw 'Duplicate workspace month.' }
    }
    $mismatchCount = 0
    foreach ($month in $state.Months) {
        $property = @($properties | Where-Object { ([string]$_.date).StartsWith([string]$month.Month) })
        if ($property.Count -ne 1) { throw 'Missing or duplicate asset month.' }
        $corrections = 0L
        $funding = 0L
        foreach ($adjustment in $state.Adjustments) {
            if ($adjustment.Kind -eq 'correct' -and $adjustment.Month -le $month.Month -and $monthSet.Contains([string]$adjustment.Month)) {
                $corrections += [long]$adjustment.Amount
            }
            elseif ($adjustment.Kind -eq 'fund' -and $adjustment.Month -le $month.Month -and $monthSet.Contains([string]$adjustment.Month)) {
                $funding += [long]$adjustment.Amount
            }
            elseif ($adjustment.Kind -notin @('correct','fund','transfer')) { throw 'Unknown adjustment kind; explicit migration mapping required.' }
        }
        $reserve = 0L
        foreach ($balance in $month.Balances.PSObject.Properties) { $reserve += [long]$balance.Value }
        # Transfers preserve aggregate reserve; fund moves actual available money into reserve.
        $reserve += $funding
        $spare = [long]$month.RawSpare + $corrections - $funding
        $total = $spare + [long]$month.Tuition + $reserve + [long]$month.LegacyTotalDifference
        if ($spare -ne [long]$property[0].sparemoney -or [long]$month.Tuition -ne [long]$property[0].tuitionfee -or
            $reserve -ne [long]$property[0].budget -or $total -ne [long]$property[0].totalproperty) {
            $mismatchCount++
        }
    }
    if ($mismatchCount -gt 0) { throw "$mismatchCount historical asset months differ; baseline export stopped." }
    $sourceCommit = (& git -C $repositoryRoot rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Source commit unavailable.' }
    $fileManifest = @(Get-ChildItem -LiteralPath $outputRoot -File | Where-Object { $_.Name -ne 'INCOMPLETE' } | ForEach-Object {
        [ordered]@{file=$_.Name;bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
    })
    $manifest = [ordered]@{
        formatVersion=1;sourceCommit=$sourceCommit;sourceDatabase=$SnapshotDatabase
        generatedAt=[DateTimeOffset]::UtcNow.ToString('o');readOnlySource=$true
        decimalEncoding='Exact decimal, money and bigint values are strings; do not coerce to JS Number.'
        privateArchive=$true;notForUpload=$true;tables=$tableManifest;files=$fileManifest
        validation=[ordered]@{assetMonths=$properties.Count;workspaceMonths=@($state.Months).Count;historicalAssetMismatches=$mismatchCount}
    }
    Write-Utf8 (Join-Path $outputRoot 'manifest.json') ($manifest | ConvertTo-Json -Depth 20)
    Remove-Item -LiteralPath (Join-Path $outputRoot 'INCOMPLETE')
    [pscustomobject]@{ExportDirectory=$outputRoot;Tables=$tableManifest.Count;HistoricalAssetMonths=$properties.Count;HistoricalAssetMismatches=$mismatchCount} | ConvertTo-Json -Compress
}
finally { $connection.Dispose() }
