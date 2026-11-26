@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "NODE_EXE="

rem First use whatever Node.js is already on PATH.
for /f "delims=" %%P in ('where node 2^>nul') do (
  if not defined NODE_EXE set "NODE_EXE=%%P"
)

rem Windows often installs Node.js without refreshing PATH until sign-out.
if not defined NODE_EXE (
  for %%P in (
    "%ProgramFiles%\nodejs\node.exe"
    "%ProgramFiles(x86)%\nodejs\node.exe"
    "%LOCALAPPDATA%\Programs\nodejs\node.exe"
    "%ProgramData%\chocolatey\bin\node.exe"
    "%USERPROFILE%\scoop\apps\nodejs\current\bin\node.exe"
    "%USERPROFILE%\.volta\bin\node.exe"
  ) do (
    if not defined NODE_EXE if exist "%%~P" set "NODE_EXE=%%~P"
  )
)

rem WinGet installs use a versioned package folder under LocalAppData.
if not defined NODE_EXE (
  for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS*") do (
    for /f "delims=" %%P in ('dir /b /s "%%~D\node.exe" 2^>nul') do (
      if not defined NODE_EXE set "NODE_EXE=%%P"
    )
  )
)

if not defined NODE_EXE goto NODE_MISSING

"%NODE_EXE%" --version >nul 2>nul
if errorlevel 1 goto NODE_MISSING

for %%D in ("%NODE_EXE%") do set "NODE_DIR=%%~dpD"
set "PATH=%NODE_DIR%;%PATH%"
echo Using Node.js: %NODE_EXE%

"%NODE_EXE%" scripts\launch.js %*
if errorlevel 1 goto FAIL
exit /b 0

:NODE_MISSING
echo.
echo Node.js 18 or newer was not found on this computer.
echo Download and install the LTS version from:
echo   https://nodejs.org/
echo After installing, sign out or restart the computer, then run this launcher again.
echo.
pause
exit /b 1

:FAIL
echo.
echo The launcher stopped because of an error. See the message above.
pause
exit /b 1
