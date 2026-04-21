@echo off
setlocal
cd /d "%~dp0"
if not exist "package.json" (
  echo.
  echo [XATO] package.json topilmadi. Papka: %CD%
  echo Loyiha ildizi D:\SALESDOC bo'lishi kerak ^(ichida backend, frontend, package.json^).
  echo.
  pause
  exit /b 1
)
echo Portlarni bo'shatish, Next keshini tozalash, keyin API + worker + web...
echo Docker servislarini ishga tushirish ^(Postgres, Redis^)...
docker compose -f "infrastructure\docker-compose.yml" up -d
if errorlevel 1 (
  echo.
  echo [XATO] Docker servislarini ishga tushirib bo'lmadi.
  echo Docker Desktop ishlayotganini tekshiring va qayta urinib ko'ring.
  echo.
  pause
  exit /b 1
)
echo Servislar health holatini kutish...
set /a _tries=0
:wait_health
set /a _tries+=1
for /f %%h in ('docker inspect --format "{{.State.Health.Status}}" savdo_postgres 2^>nul') do set PGH=%%h
for /f %%h in ('docker inspect --format "{{.State.Health.Status}}" savdo_redis 2^>nul') do set RDSH=%%h
if "%PGH%"=="healthy" if "%RDSH%"=="healthy" goto health_ok
if %_tries% GEQ 30 (
  echo [XATO] Postgres/Redis health timeout. PG=%PGH% REDIS=%RDSH%
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto wait_health
:health_ok
echo DB migratsiyalarini tekshirish ^(db:deploy^)...
call npm run db:deploy
if errorlevel 1 (
  echo [XATO] db:deploy bajarilmadi.
  pause
  exit /b 1
)
echo Seed ma'lumotlarini tekshirish ^(db:seed^)...
call npm run db:seed
if errorlevel 1 (
  echo [XATO] db:seed bajarilmadi.
  pause
  exit /b 1
)
call npm run dev:clean
endlocal
