@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 국악 대시보드 서버 (닫으면 서버가 꺼집니다)

echo ================================================
echo   국악 대시보드 서버를 시작합니다.
echo   브라우저가 자동으로 열립니다:  http://localhost:5173
echo.
echo   * 대시보드를 쓰는 동안 이 창은 그대로 두세요.
echo   * 끝낼 때는 이 창을 닫거나 Ctrl+C 를 누르세요.
echo ================================================
echo.

start "" http://localhost:5173

where python >nul 2>nul
if %errorlevel%==0 (
  python server.py
) else (
  py server.py
)

echo.
echo [서버가 종료되었습니다] 창을 닫아도 됩니다.
pause >nul
