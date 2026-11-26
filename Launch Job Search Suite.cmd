@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "APP_URL=http://localhost:3000"

if /I "%~1"=="check" goto CHECK_ONLY
if /I "%~1"=="reset" goto RESET_MODE

echo.
echo === Job Search Suite launcher ===
echo.

call :ENSURE_ENVIRONMENT
goto AFTER_ENV

:RESET_MODE
echo.
echo === Resetting Job Search Suite ===
call :STOP_PORT_3000
if errorlevel 1 goto PAUSE
call :ENSURE_ENVIRONMENT
goto AFTER_ENV

:CHECK_ONLY
call :ENSURE_ENVIRONMENT
if errorlevel 1 goto PAUSE
call :PORT_IN_USE
if errorlevel 1 (
  echo Port 3000 is free.
) else (
  echo Port 3000 is in use by PID %PORT_PID%.
)
echo Environment check passed.
exit /b 0

:AFTER_ENV
call :PORT_IN_USE
if errorlevel 1 goto CLEAR_AND_START

echo Port 3000 is already in use by PID %PORT_PID%.
choice /C OR /N /M "Press O to open the existing server, or R to stop it and start fresh: "
if errorlevel 2 goto RESET_AND_START
if errorlevel 1 goto OPEN_EXISTING

:OPEN_EXISTING
start "" "%APP_URL%"
echo Opened %APP_URL%.
exit /b 0

:RESET_AND_START
call :STOP_PORT_3000
if errorlevel 1 goto PAUSE

:CLEAR_AND_START
call :CLEAR_NEXT
echo Starting the local server...
echo Use %APP_URL% once the server says it is ready.
start "" /min powershell -NoProfile -Command "Start-Sleep -Seconds 6; Start-Process '%APP_URL%'"
call npm run dev
exit /b %ERRORLEVEL%

:ENSURE_ENVIRONMENT
where node >nul 2>nul
if errorlevel 1 goto NO_NODE
for /f "delims=" %%v in ('node -v') do set "NODE_VERSION=%%v"
echo Node.js: %NODE_VERSION%
node -e "const v=process.versions.node.split('.').map(Number); process.exit(v[0]>=22?0:1)"
if errorlevel 1 goto OLD_NODE
where npm >nul 2>nul
if errorlevel 1 goto NO_NPM
if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto INSTALL_FAILED
)
exit /b 0

:PORT_IN_USE
set "PORT_PID="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:"[:.]3000 " ^| findstr "LISTENING"') do set "PORT_PID=%%p"
if defined PORT_PID exit /b 0
exit /b 1

:STOP_PORT_3000
call :PORT_IN_USE
if errorlevel 1 (
  echo No server found on port 3000.
  exit /b 0
)
echo Stopping process %PORT_PID% on port 3000...
taskkill /PID %PORT_PID% /F /T >nul 2>nul
timeout /t 2 /nobreak >nul
exit /b 0

:CLEAR_NEXT
if exist ".next" (
  echo Clearing stale build cache (.next)...
  rmdir /S /Q ".next"
)
exit /b 0

:NO_NODE
echo.
echo ERROR: Node.js was not found on PATH.
echo Install Node.js 22 or newer from https://nodejs.org/ and reopen this launcher.
exit /b 1

:OLD_NODE
echo.
echo ERROR: Node.js 22 or newer is required. Found %NODE_VERSION%.
echo Update Node.js from https://nodejs.org/ and reopen this launcher.
exit /b 1

:NO_NPM
echo.
echo ERROR: npm was not found on PATH. Reinstall Node.js with npm included.
exit /b 1

:INSTALL_FAILED
echo.
echo ERROR: npm install failed. Check the terminal output above.
exit /b 1

:PAUSE
echo.
pause
exit /b 1
