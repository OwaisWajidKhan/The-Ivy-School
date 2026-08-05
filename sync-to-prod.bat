@echo off
REM The Ivy School - One-click sync: local DB -> production
REM Usage:  sync-to-prod.bat   (full run, upserts local data into prod)

cd /d "%~dp0backend"
npm.cmd run sync:to-prod

echo.
echo Sync complete. Check output above for errors.
pause