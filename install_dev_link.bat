@echo off
title TikTalk installer (dev link)
echo Linking this folder into CEP extensions (edits go live on AE restart)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\install.ps1" -Mode link
pause
