@echo off
title FAHRENHEIT // local server
cd /d "%~dp0"
echo.
echo   FAHRENHEIT // local server starting...
echo   Your site will open in the browser.
echo   Keep this black window OPEN while viewing.
echo   Close it when you're done to stop the server.
echo.
start "" "http://127.0.0.1:8777/index.html"
set PY="C:\Users\HSGol\AppData\Local\Python\pythoncore-3.14-64\python.exe"
if exist %PY% (
  %PY% -m http.server 8777 --bind 127.0.0.1
) else (
  py -m http.server 8777 --bind 127.0.0.1
)
pause
