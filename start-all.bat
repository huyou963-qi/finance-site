@echo off
chcp 65001 >nul
echo ========================================
echo   正在启动三个 CMD 窗口...
echo ========================================

:: 窗口 1 - npm run start
start "Dev Server" cmd /k "npm run dev"

:: 窗口 2 - 进入 clientportal.gw 目录并执行 run.bat
#start "ClientPortal GW" cmd /k "cd /d clientportal.gw && bin\run.bat root\conf.yaml"

:: 窗口 3 - npm run db:studio
start "DB Studio" cmd /k "npm run db:studio"

echo.
echo 三个窗口已全部启动！
echo.
pause