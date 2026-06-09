@echo off
title TikTalk installer
echo.
echo   ============================================
echo    TikTalk for After Effects
echo    keeping up with the kids, one caption at a time
echo   ============================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\install.ps1" -Mode copy
if errorlevel 1 (
    echo.
    echo   Something went wrong. Try right-clicking install.bat ^> Run as administrator,
    echo   or run setup\install.ps1 from PowerShell to see the error.
)
echo.
pause
