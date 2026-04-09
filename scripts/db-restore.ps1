param(
  [Parameter(Mandatory = $true)]
  [string]$DumpFile,
  [string]$Host = "127.0.0.1",
  [int]$Port = 5432,
  [string]$Database = "savdo_db",
  [string]$User = "postgres",
  [string]$Password = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $DumpFile)) {
  throw "Dump file not found: $DumpFile"
}

if ($Password) {
  $env:PGPASSWORD = $Password
}

try {
  pg_restore -h $Host -p $Port -U $User -d $Database --clean --if-exists $DumpFile
  Write-Host "Restore completed from: $DumpFile"
} finally {
  if ($Password) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
}
