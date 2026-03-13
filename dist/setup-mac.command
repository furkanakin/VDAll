#!/bin/bash
# Video Downloader - macOS İlk Kurulum
# Bu dosyaya sağ tıklayıp "Birlikte Aç > Terminal" ile açın

cd "$(dirname "$0")"

echo ""
echo "🎬 Video Downloader - macOS İlk Kurulum"
echo "========================================="
echo ""

# Fix permissions
echo "📦 Dosya izinleri ayarlanıyor..."
chmod +x VideoDownloader-macos 2>/dev/null
chmod +x VideoDownloader.command 2>/dev/null
chmod +x setup-mac.command 2>/dev/null

# Remove quarantine
echo "🔓 Gatekeeper izni veriliyor..."
xattr -cr VideoDownloader-macos 2>/dev/null
xattr -cr VideoDownloader.command 2>/dev/null

echo ""
echo "✅ Kurulum tamamlandı!"
echo ""
echo "Artık VideoDownloader.command dosyasına çift tıklayarak başlatabilirsiniz."
echo ""
echo "Şimdi uygulamayı başlatıyorum..."
echo ""

./VideoDownloader-macos
