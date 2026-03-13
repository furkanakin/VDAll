#!/bin/bash
cd "$(dirname "$0")"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js bulunamadı! Lütfen https://nodejs.org adresinden yükleyin."
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Bağımlılıklar yükleniyor..."
    npm install --production
fi

# Create bin directory
mkdir -p bin/mac

# Download yt-dlp if missing
if [ ! -f "bin/mac/yt-dlp" ]; then
    echo "yt-dlp indiriliyor..."
    curl -L "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp_macos" -o bin/mac/yt-dlp
    chmod +x bin/mac/yt-dlp
fi

# Download ffmpeg if missing
if [ ! -f "bin/mac/ffmpeg" ]; then
    echo "ffmpeg indiriliyor..."
    curl -L "https://evermeet.cx/ffmpeg/getrelease/zip" -o ffmpeg.zip
    unzip -o ffmpeg.zip -d bin/mac/
    rm ffmpeg.zip
    chmod +x bin/mac/ffmpeg
fi

echo ""
echo "Uygulama başlatılıyor..."
node server.js
