const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { checkBinaries, detectPlatform, isValidUrl } = require('./src/utils');
const DownloadQueue = require('./src/queue');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create downloads directory
const defaultDownloadDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(defaultDownloadDir)) {
  fs.mkdirSync(defaultDownloadDir, { recursive: true });
}

// Initialize download queue
const queue = new DownloadQueue();

// API: Check system readiness
app.get('/api/status', (req, res) => {
  const bins = checkBinaries();
  res.json({
    ready: bins.ytdlp && bins.ffmpeg,
    binaries: bins,
    platform: process.platform,
    defaultDownloadDir,
  });
});

// API: Get video info
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: 'Geçerli bir URL giriniz' });
  }

  try {
    const Downloader = require('./src/downloader');
    const dl = new Downloader();
    const info = await dl.getVideoInfo(url);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Select download folder (returns folder dialog support info)
app.get('/api/default-dir', (req, res) => {
  res.json({ path: defaultDownloadDir });
});

// API: Open folder in file explorer
app.post('/api/open-folder', (req, res) => {
  const { folderPath } = req.body;
  const targetPath = folderPath || defaultDownloadDir;

  if (fs.existsSync(targetPath)) {
    const { exec } = require('child_process');
    const cmd = process.platform === 'win32'
      ? `explorer "${targetPath}"`
      : process.platform === 'darwin'
        ? `open "${targetPath}"`
        : `xdg-open "${targetPath}"`;
    exec(cmd);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Klasör bulunamadı' });
  }
});

// API: Proxy thumbnails to avoid CORS issues
app.get('/api/proxy-thumb', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('URL gerekli');

  try {
    const https = require('https');
    const http_mod = require('http');
    const mod = url.startsWith('https') ? https : http_mod;

    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (proxyRes) => {
      res.set('Content-Type', proxyRes.headers['content-type'] || 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=86400');
      proxyRes.pipe(res);
    }).on('error', () => {
      res.status(502).send('Thumbnail yüklenemedi');
    });
  } catch {
    res.status(500).send('Proxy hatası');
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('İstemci bağlandı:', socket.id);

  // Send current downloads state
  socket.emit('init', {
    downloads: queue.getAllDownloads(),
    defaultDownloadDir,
  });

  // Add download(s)
  socket.on('add-downloads', async (data) => {
    const { urls, outputDir, fragments = 8, formatId = 'best' } = data;

    for (const url of urls) {
      if (!isValidUrl(url.trim())) {
        socket.emit('toast', {
          type: 'error',
          message: `Geçersiz URL atlandı: ${url.substring(0, 50)}...`,
        });
        continue;
      }

      try {
        const id = await queue.addDownload(url.trim(), {
          platform: detectPlatform(url.trim()),
          outputDir: outputDir || defaultDownloadDir,
          fragments,
          formatId,
        });
      } catch (err) {
        socket.emit('toast', {
          type: 'error',
          message: `Hata: ${err.message}`,
        });
      }
    }
  });

  // Pause download
  socket.on('pause', (id) => {
    queue.pauseDownload(id);
  });

  // Resume download
  socket.on('resume', (id) => {
    queue.resumeDownload(id);
  });

  // Cancel download
  socket.on('cancel', (id) => {
    queue.cancelDownload(id);
  });

  // Remove download from list
  socket.on('remove', (id) => {
    queue.removeDownload(id);
  });

  // Retry a failed download
  socket.on('retry', (id) => {
    queue.retryDownload(id);
  });

  // Update format
  socket.on('update-format', (data) => {
    queue.updateFormat(data.id, data.formatId);
  });

  // Update settings
  socket.on('update-settings', (data) => {
    if (data.maxConcurrent) {
      queue.setMaxConcurrent(data.maxConcurrent);
    }
  });

  socket.on('disconnect', () => {
    console.log('İstemci ayrıldı:', socket.id);
  });
});

// Forward queue events to all connected clients
queue.on('added', (id, dl) => io.emit('download-added', { id, download: dl }));
queue.on('info', (id, dl) => io.emit('download-info', { id, download: dl }));
queue.on('started', (id, dl) => io.emit('download-started', { id, download: dl }));
queue.on('progress', (id, dl) => io.emit('download-progress', { id, download: dl }));
queue.on('complete', (id, dl) => io.emit('download-complete', { id, download: dl }));
queue.on('error', (id, dl) => io.emit('download-error', { id, download: dl }));
queue.on('paused', (id, dl) => io.emit('download-paused', { id, download: dl }));
queue.on('resumed', (id, dl) => io.emit('download-resumed', { id, download: dl }));
queue.on('cancelled', (id, dl) => io.emit('download-cancelled', { id, download: dl }));
queue.on('removed', (id) => io.emit('download-removed', { id }));
queue.on('updated', (id, dl) => io.emit('download-updated', { id, download: dl }));

// Start server
server.listen(PORT, () => {
  const bins = checkBinaries();
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║          🎬 Video Downloader Başlatıldı         ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  🌐  http://localhost:${PORT}                     ║`);
  console.log(`║  📁  İndirme klasörü: downloads/                ║`);
  console.log(`║  🔧  yt-dlp: ${bins.ytdlp ? '✅' : '❌'}  ffmpeg: ${bins.ffmpeg ? '✅' : '❌'}               ║`);
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  // Auto-open browser
  const { exec } = require('child_process');
  const url = `http://localhost:${PORT}`;
  const cmd = process.platform === 'win32'
    ? `start ${url}`
    : process.platform === 'darwin'
      ? `open ${url}`
      : `xdg-open ${url}`;
  exec(cmd);
});
