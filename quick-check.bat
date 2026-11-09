@echo off
setlocal
chcp 65001 >nul
title Mineradio Quick Check

set "APP_DIR=%~dp0"
cd /d "%APP_DIR%" || goto :fail

where node >nul 2>nul
if errorlevel 1 (
  echo [FAIL] Node.js was not found in PATH.
  goto :fail
)

set "CHECK_ARGS="
if /I "%~1"=="full" set "CHECK_ARGS=--electron"
if /I "%~1"=="--full" set "CHECK_ARGS=--electron"
if /I "%~1"=="electron" set "CHECK_ARGS=--electron"
if /I "%~1"=="--electron" set "CHECK_ARGS=--electron"

echo.
echo Mineradio quick check
echo App: %APP_DIR%
echo Default mode is fast/static and does not load the player UI.
echo Use quick-check.bat full for the hidden Electron runtime smoke check.
echo Use start-mineradio.bat to launch the player.
echo.
node "%APP_DIR%scripts\quick-check.js" %CHECK_ARGS%
set "CHECK_EXIT=%ERRORLEVEL%"

echo.
if "%CHECK_EXIT%"=="0" (
  echo [PASS] Quick check finished.
) else (
  echo [FAIL] Quick check failed. Exit code: %CHECK_EXIT%
)

if not "%MINERADIO_QUICK_CHECK_NO_PAUSE%"=="1" pause
exit /b %CHECK_EXIT%

:fail
if not "%MINERADIO_QUICK_CHECK_NO_PAUSE%"=="1" pause
exit /b 1
