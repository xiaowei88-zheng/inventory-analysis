@echo off
setlocal

cd /d "%~dp0"

set "LOCAL_URL=http://127.0.0.1:5173"

echo Starting inventory analysis local dev server...
echo Default local address: %LOCAL_URL%
echo The browser will open after the local page is ready.
echo If port 5173 is already in use, check the Vite output below for the actual local address.
echo.

start "" powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='%LOCAL_URL%'; for ($i = 0; $i -lt 90; $i++) { try { $response = Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 1; if ($response.StatusCode -ge 200) { Start-Process $url; exit } } catch {} Start-Sleep -Seconds 1 }; Start-Process $url"

npm run dev

echo.
echo Local dev server has stopped. Press any key to close this window.
pause >nul
