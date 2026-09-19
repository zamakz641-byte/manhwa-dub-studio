@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Manhwa Dub Studio - Launcher

echo ============================================
echo       MANHWA DUB STUDIO - LANCEMENT
echo ============================================
echo.

set "APP=%~dp0launcher.py"

if not exist "%APP%" (
    echo [ERREUR] launcher.py est introuvable.
    echo.
    echo Le fichier attendu est :
    echo   %APP%
    echo.
    echo Mets LANCER_MANHWA_DUB_DEBUG.bat dans le MEME DOSSIER que launcher.py.
    echo.
    pause
    exit /b 1
)

rem 1) Python Launcher for Windows
where py >nul 2>nul
if not errorlevel 1 (
    echo [OK] Python detecte via "py".
    echo [INFO] Lancement de launcher.py...
    echo.
    py -3 "%APP%"
    set "RC=%ERRORLEVEL%"
    if "!RC!"=="0" exit /b 0
    echo.
    echo [ERREUR] launcher.py s'est ferme avec le code !RC!.
    echo.
    pause
    exit /b !RC!
)

rem 2) python.exe dans le PATH
where python >nul 2>nul
if not errorlevel 1 (
    echo [OK] Python detecte via "python".
    echo [INFO] Lancement de launcher.py...
    echo.
    python "%APP%"
    set "RC=%ERRORLEVEL%"
    if "!RC!"=="0" exit /b 0
    echo.
    echo [ERREUR] launcher.py s'est ferme avec le code !RC!.
    echo.
    pause
    exit /b !RC!
)

echo [ERREUR] Aucun Python utilisable n'a ete trouve dans le PATH.
echo.
echo Essaie dans PowerShell :
echo   py --version
echo   python --version
echo.
echo Si les deux commandes echouent, installe/repare Python puis coche "Add Python to PATH".
echo.
pause
exit /b 1
