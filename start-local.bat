@echo off
REM Start backend server locally with SMTP_USER env var set to match EMAIL_USER from .env
REM This fixes the env var mismatch (code expects SMTP_USER, .env has EMAIL_USER)

cd /d "%~dp0"

echo.
echo ==========================================
echo Starting Octoink Backend Server
echo ==========================================
echo.
echo Setting SMTP_USER environment variable...
echo (This matches the EMAIL_USER from .env)
echo.

set SMTP_USER=hello.octoinkstudios@gmail.com
node server.js
