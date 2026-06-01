@echo off
chcp 65001 >nul
:: 需右键「以管理员身份运行」——把 Python 3.11 写入系统 PATH（Machine）
set "PY=C:\Users\Administrator\AppData\Local\Programs\Python\Python311"
set "SCR=%PY%\Scripts"
if not exist "%PY%\python.exe" (
  echo 未找到 %PY%\python.exe
  pause
  exit /b 1
)
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "MP=%%B"
echo %MP% | find /i "%PY%" >nul && (
  echo 系统 PATH 已包含 Python311
) || (
  setx Path "%PY%;%SCR%;%MP%" /M
  echo 已写入系统 PATH
)
pause
