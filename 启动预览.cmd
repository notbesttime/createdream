@echo off
setlocal
cd /d "%~dp0"
set "PORT=8080"
set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY ( where py >nul 2>nul && set "PY=py" )
if not defined PY ( if exist "%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe" set "PY=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe" )
if not defined PY (
  echo Python was not found.
  echo Start any static file server in this folder instead, then open http://127.0.0.1:8080/
  pause
  exit /b 1
)
echo Serving this folder at http://127.0.0.1:%PORT%/  (close this window to stop)
start "" "http://127.0.0.1:%PORT%/"
"%PY%" -m http.server %PORT% --bind 127.0.0.1
