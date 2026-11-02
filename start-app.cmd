@echo off
if not exist "%~dp0dist\ChzzkViewer\ChzzkViewer.exe" (
  echo Desktop app has not been built. Run build-desktop.ps1 first.
  pause
  exit /b 1
)
start "" "%~dp0dist\ChzzkViewer\ChzzkViewer.exe"
