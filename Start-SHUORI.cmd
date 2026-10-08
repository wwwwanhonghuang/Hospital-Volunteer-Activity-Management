@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.13 or newer, then open this launcher again.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm.cmd ci
  if errorlevel 1 goto failed
)
if not exist dist\index.html (
  call npm.cmd run build
  if errorlevel 1 goto failed
)
echo.
echo SHUORI is available at http://127.0.0.1:3001
echo Keep this window open while using the application. Press Ctrl+C to stop.
echo.
call npm.cmd start
exit /b %errorlevel%
:failed
echo Setup could not finish. Review the error above and docs\DEPLOYMENT.md.
pause
exit /b 1
