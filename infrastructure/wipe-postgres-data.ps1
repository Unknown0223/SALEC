# PostgreSQL Docker volume ni butunlay o'chirish (WINDOWS).
# Ogohlantirish: barcha ma'lumot yo'qoladi. Faqat o'z kompyuteringizda ishlating.
#
# Ketma-ketlik:
#   1) Docker Desktop ishlayotgan bo'lsin
#   2) PowerShell (Administrator shart emas):
#        cd E:\SALEC\infrastructure
#        .\wipe-postgres-data.ps1
#   3) Keyin migratsiya:
#        cd ..\backend
#        $env:DATABASE_URL="postgresql://postgres:0223@localhost:15432/savdo_db"
#        npx prisma migrate deploy
#        npx prisma db seed
#
# Yoki bitta: backend da npm run db:zero-reset (CONTAINER ishlamasa ham, agar DB ulanishi bo'lsa).

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path (Join-Path (Split-Path -Parent $here) "SALES") "postgres-data"

Write-Host "PostgreSQL data papkasi: $dataDir"
if (-not (Test-Path $dataDir)) {
  Write-Host "Papka topilmadi — ehtimol allaqachon o'chirilgan yoki yo'l boshqacha."
  exit 0
}

$confirm = Read-Host "BARCHA ma'lumot o'chadi. Davom etish uchun YES yozing"
if ($confirm -ne "YES") {
  Write-Host "Bekor qilindi."
  exit 1
}

Push-Location $here
try {
  docker compose down
} finally {
  Pop-Location
}

Remove-Item -LiteralPath $dataDir -Recurse -Force
Write-Host "O'chirildi: $dataDir"
Write-Host "Keyin: docker compose up -d (infrastructure papkasida), so'ng prisma migrate deploy + db seed yoki db:zero-reset"
