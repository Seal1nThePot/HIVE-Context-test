@echo off
setlocal
cd /d "%~dp0"
set "HIVE_DESKTOP_USER_DATA=%~dp0.runtime\user-data"
if not exist "%~dp0release\win-unpacked\HIVE markdown editor.exe" (
  echo HIVE 0.1.6 application was not found. Run npm run desktop:folder first.
  exit /b 1
)
start "" "%~dp0release\win-unpacked\HIVE markdown editor.exe"
