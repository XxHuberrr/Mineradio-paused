@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo [1/2] Ensuring node-hid is installed (required for the speaker HID driver)...
call npm install
if errorlevel 1 (
  echo npm install failed. Check network and node version.
  pause
  exit /b 1
)

echo [2/2] Running the standalone Halo PixelBar self-test as Administrator...
powershell -NoProfile -Command "Start-Process -FilePath 'node' -ArgumentList 'scripts/test-halo.js' -Verb RunAs -WorkingDirectory '%~dp0'"
pause
