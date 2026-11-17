@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Electron runtime is missing. Install project dependencies first.
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo Production build is missing. Run npm run build first.
  pause
  exit /b 1
)
set "ELECTRON_RUN_AS_NODE="
set "HIVE_DESKTOP_DEV="
set "HIVE_DESKTOP_USER_DATA=%~dp0performance\review-file-lifecycle-final"
start "" "node_modules\electron\dist\electron.exe" .
endlocal
