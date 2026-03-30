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
echo Portlarni bo'shatish, Next keshini tozalash, keyin API + web...
call npm run dev:clean
endlocal
