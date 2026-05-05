@echo off
REM Bypasses PowerShell execution policy for this run only (needs Administrator).
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-mariadb-service-and-import.ps1"
