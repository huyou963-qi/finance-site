#Requires -RunAsAdministrator
<#
  1) 注册并启动 MariaDB Windows 服务（需管理员）
  2) 创建库 h 并导入桌面上的 MySQL dump
  3) 在项目目录执行: npm run db:import-mysql-h

  若 root 有密码，先执行: $env:MYSQL_ROOT_PASSWORD="密码"
#>
$ErrorActionPreference = "Stop"

$MariaBase = "C:\Program Files\MariaDB 12.2"
$Mysqld = Join-Path $MariaBase "bin\mysqld.exe"
$Mysql = Join-Path $MariaBase "bin\mysql.exe"
$MyIni = Join-Path $MariaBase "data\my.ini"
$Dump = Join-Path $env:USERPROFILE "Desktop\dump-h-202506101844.sql"

if (-not (Test-Path $Mysqld)) {
  Write-Error "未找到 MariaDB，请先 winget install MariaDB.Server"
}
if (-not (Test-Path $Dump)) {
  Write-Error "未找到 dump: $Dump"
}

Write-Host "Installing MariaDB service..."
& $Mysqld --install MariaDB --defaults-file="$MyIni"

Write-Host "Starting MariaDB..."
net start MariaDB

$p = $env:MYSQL_ROOT_PASSWORD
$dumpPath = (Resolve-Path $Dump).Path

if ($p) {
  cmd.exe /c "`"$Mysql`" -u root -p$p -e `"CREATE DATABASE IF NOT EXISTS h CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`""
  Write-Host "Importing dump (may take several minutes)..."
  cmd.exe /c "`"$Mysql`" -u root -p$p h < `"$dumpPath`""
} else {
  cmd.exe /c "`"$Mysql`" -u root -e `"CREATE DATABASE IF NOT EXISTS h CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`""
  Write-Host "Importing dump (may take several minutes)..."
  cmd.exe /c "`"$Mysql`" -u root h < `"$dumpPath`""
}

Write-Host "Done. Next: set MYSQL_* in .env.local and run npm run db:import-mysql-h"
