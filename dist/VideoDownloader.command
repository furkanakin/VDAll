#!/bin/bash
# Video Downloader - macOS Başlatıcı
# Bu dosyaya çift tıklayarak uygulamayı başlatın

cd "$(dirname "$0")"

# Çalıştırma izni ver
chmod +x VideoDownloader-macos 2>/dev/null

echo ""
echo "🎬 Video Downloader başlatılıyor..."
echo ""

# Çalıştır
./VideoDownloader-macos
