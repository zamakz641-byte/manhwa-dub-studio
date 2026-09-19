@echo off
setlocal
cd /d "%~dp0"
where pythonw >nul 2>nul
if errorlevel 1 goto console
start "Manhwa Dub Studio" pythonw "%~dp0launcher.py"
exit /b 0

:console
python "%~dp0launcher.py"
if errorlevel 1 pause
