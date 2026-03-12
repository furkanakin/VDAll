#!/bin/bash
# Video Downloader - macOS Tek Komut Kurulum
# Kullanım: bash install-mac.sh

echo ""
echo "🎬 Video Downloader - macOS Kurulum"
echo "===================================="
echo ""

# Find the script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"

# Check if dist folder exists
if [ ! -d "$DIST_DIR" ]; then
    echo "❌ dist/ klasörü bulunamadı."
    echo "   Bu scripti VDAll klasörünün içinden çalıştırın."
    exit 1
fi

# Set executable permissions
echo "📦 Dosya izinleri ayarlanıyor..."
chmod +x "$DIST_DIR/VideoDownloader-macos" 2>/dev/null
chmod +x "$DIST_DIR/VideoDownloader.command" 2>/dev/null

# Remove macOS quarantine flag (Gatekeeper bypass)
echo "🔓 Gatekeeper izni veriliyor..."
xattr -dr com.apple.quarantine "$DIST_DIR/VideoDownloader-macos" 2>/dev/null
xattr -dr com.apple.quarantine "$DIST_DIR/VideoDownloader.command" 2>/dev/null

echo ""
echo "✅ Kurulum tamamlandı!"
echo ""
echo "Şimdi şunlardan birini yapabilirsiniz:"
echo "  1) dist/VideoDownloader.command dosyasına çift tıklayın"
echo "  2) Terminal'de: ./dist/VideoDownloader-macos"
echo ""

# Ask to run now
read -p "Şimdi başlatmak ister misiniz? (e/h): " answer
if [ "$answer" = "e" ] || [ "$answer" = "E" ]; then
    cd "$DIST_DIR"
    ./VideoDownloader-macos
fi
