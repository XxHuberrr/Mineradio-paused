@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo [1/2] Installing dependencies (node-hid is required for the speaker HID driver)...
call npm install
if errorlevel 1 (
  echo npm install failed. Check network and node version.
  pause
  exit /b 1
)

echo [2/2] Launching Mineradio as Administrator (HID writes need admin)...
powershell -NoProfile -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c npm start' -Verb RunAs -WorkingDirectory '%~dp0'"
echo Requested admin launch. In the new window, open Mineradio.
echo After launch, click the speaker button (top-right) to open the Halo sync panel and confirm "device connected".
pause
