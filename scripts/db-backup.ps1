param(
  [string]$Host = "127.0.0.1",
  [int]$Port = 5432,
  [string]$Database = "savdo_db",
  [string]$User = "postgres",
  [string]$Password = "",
  [string]$OutDir = "backups"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $OutDir)) {
  New-Item -Path $OutDir -ItemType Directory | Out-Null
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $OutDir "savdo_db-$stamp.dump"

if ($Password) {
  $env:PGPASSWORD = $Password
}

try {
  pg_dump -h $Host -p $Port -U $User -d $Database -F c -f $target
  Write-Host "Backup created: $target"
} finally {
  if ($Password) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
}
