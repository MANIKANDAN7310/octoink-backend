@echo off
REM Run the custom-design endpoint test against localhost:4999

cd /d "%~dp0"

echo.
echo ==========================================
echo Running Custom Design Local Test
echo ==========================================
echo.

node test_custom_design_local.mjs

if errorlevel 1 (
    echo.
    echo Test FAILED with exit code %errorlevel%
    pause
    exit /b %errorlevel%
) else (
    echo.
    echo Test PASSED
    pause
)
