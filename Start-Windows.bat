@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 22.13 or later first.
 pause
 exit /b 1
)
if not exist node_modules (
 call npm install
 if errorlevel 1 (
  echo Installation failed. Check the network and retry.
  pause
  exit /b 1
 )
)
echo Open http://localhost:5173 in your browser.
call npm run dev
pause
