@echo off
title The Ivy School - Attendance Management System
cd /d "%~dp0"

tasklist /fi "imagename eq TheIvySchool.exe" 2>nul | find /i "TheIvySchool.exe" >nul
if not errorlevel 1 (
    echo The Ivy School server is already running.
    start "" "http://localhost:5000"
    exit /b
)

start "" "%~dp0TheIvySchool.exe"
echo Starting The Ivy School server... (this window stays open while the server runs)
timeout /t 4 /nobreak >nul
start "" "http://localhost:5000"
exit /b
