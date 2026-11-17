@echo off
cd /d "%~dp0"
if exist "%~dp0release\win-unpacked\HIVE markdown editor.exe" (
  start "" "%~dp0release\win-unpacked\HIVE markdown editor.exe"
) else (
  echo Please run npm run desktop:portable first.
  pause
)
