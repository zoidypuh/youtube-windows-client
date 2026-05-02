@echo off
setlocal

cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required but was not found in PATH.
  exit /b 1
)

if not exist "node_modules" (
  echo node_modules is missing. Installing dependencies...
  call npm install
  if errorlevel 1 exit /b %errorlevel%
)

echo Building app...
call npm run build
if errorlevel 1 exit /b %errorlevel%

echo Starting app...
set "YTMUSICCLIENT_DIR=%CD%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'cmd.exe' -WorkingDirectory $env:YTMUSICCLIENT_DIR -WindowStyle Hidden -ArgumentList '/d','/s','/c','npm start'"
exit /b 0
