@echo off
title Video Downloader
cd /d "%~dp0"

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js bulunamadi! Yukleyici baslatiiliyor...
    echo Lutfen https://nodejs.org adresinden Node.js yukleyin.
    pause
    exit /b 1
)

:: Install dependencies if needed
if not exist "node_modules" (
    echo Bagimlilikllar yukleniyor...
    call npm install --production
)

:: Create bin directory
if not exist "bin\win" mkdir "bin\win"

:: Download yt-dlp if missing
if not exist "bin\win\yt-dlp.exe" (
    echo yt-dlp indiriliyor...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe' -OutFile 'bin\win\yt-dlp.exe'"
)

:: Download ffmpeg if missing
if not exist "bin\win\ffmpeg.exe" (
    echo ffmpeg indiriliyor...
    powershell -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip' -OutFile 'ffmpeg.zip'; Expand-Archive -Path 'ffmpeg.zip' -DestinationPath 'ffmpeg_temp' -Force; Copy-Item 'ffmpeg_temp\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe' 'bin\win\ffmpeg.exe'; Copy-Item 'ffmpeg_temp\ffmpeg-master-latest-win64-gpl\bin\ffprobe.exe' 'bin\win\ffprobe.exe'; Remove-Item 'ffmpeg.zip' -Force; Remove-Item 'ffmpeg_temp' -Recurse -Force"
)

echo.
echo Uygulama baslatiliyor...
node server.js
pause
