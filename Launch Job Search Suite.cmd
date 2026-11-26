@echo off
setlocal EnableExtensions
cd /d "%~dp0"

node scripts\launch.js %*
if errorlevel 1 goto FAIL
exit /b 0

:FAIL
echo.
echo The launcher stopped because of an error. See the message above.
pause
exit /b 1
