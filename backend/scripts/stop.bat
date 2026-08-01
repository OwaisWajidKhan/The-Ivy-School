@echo off
title Stop The Ivy School
cd /d "%~dp0"

for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":5000 .*LISTENING"') do (
    echo Stopping The Ivy School server (PID %%p)...
    taskkill /pid %%p /f
)
taskkill /fi "imagename eq TheIvySchool.exe" /f >nul 2>&1
echo Done.
timeout /t 2 /nobreak >nul
exit /b
