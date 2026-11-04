@echo off
setlocal
chcp 65001 >nul
if "%~1"=="" goto :usage

cd /d "%~dp0"
if not exist node_modules call npm install --no-fund --no-audit

node src\cli\main.ts "%~f1" -o "%~dpn1.html"
if errorlevel 1 goto :end
node src\cli\main.ts "%~f1" -o "%~dpn1-fassung-b.html" --fassung b >nul 2>nul
if errorlevel 1 goto :end
start "" "%~dpn1-fassung-b.html"
goto :end

:usage
echo Ziehe eine BPMN-Datei auf bpmn-testen.cmd.
echo Neben dem Modell entstehen Fassung A und Fassung B, Fassung B oeffnet sich im Browser.

:end
echo.
pause
