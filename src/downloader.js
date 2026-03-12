const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const { getBinaryPaths, parseProgress, detectPlatform } = require('./utils');

class Downloader extends EventEmitter {
  constructor() {
    super();
    this.bins = getBinaryPaths();
    this.activeProcesses = new Map();
  }

  /**
   * Get video info and available formats (with retry for TikTok)
   */
  async getVideoInfo(url, retryCount = 0) {
    const MAX_RETRIES = 3;
    const platform = detectPlatform(url);

    try {
      return await this._fetchVideoInfo(url, platform, retryCount);
    } catch (err) {
      if (retryCount < MAX_RETRIES && platform === 'tiktok') {
        const delay = (retryCount + 1) * 2000; // 2s, 4s, 6s
        console.log(`[TikTok] Deneme ${retryCount + 1} başarısız, ${delay/1000}s sonra tekrar denenecek...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.getVideoInfo(url, retryCount + 1);
      }
      throw err;
    }
  }

  /**
   * Internal: fetch video info from yt-dlp
   */
  _fetchVideoInfo(url, platform, attempt = 0) {
    return new Promise((resolve, reject) => {
      const args = [
        '--dump-json',
        '--no-download',
        '--no-warnings',
        '--no-check-certificates',
        '--socket-timeout', '15',
        '--ffmpeg-location', path.dirname(this.bins.ffmpeg),
        ...this._getPlatformArgs(platform, attempt),
        url,
      ];

      const proc = spawn(this.bins.ytdlp, args, { windowsHide: true });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0 && stdout) {
          try {
            const info = JSON.parse(stdout);
            const formats = this._extractFormats(info);
            resolve({
              title: info.title || 'Bilinmeyen Video',
              thumbnail: info.thumbnail || '',
              duration: info.duration || 0,
              platform: detectPlatform(url),
              formats,
              uploader: info.uploader || info.channel || '',
              rawInfo: info,
            });
          } catch (e) {
            reject(new Error(`Video bilgisi ayrıştırılamadı: ${e.message}`));
          }
        } else {
          reject(new Error(`Video bilgisi alınamadı: ${stderr || 'Bilinmeyen hata'}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`yt-dlp bulunamadı: ${err.message}`));
      });
    });
  }

  /**
   * Extract available quality formats
   */
  _extractFormats(info) {
    if (!info.formats) return [{ id: 'best', label: 'En İyi Kalite', resolution: 'auto' }];

    const seen = new Set();
    const formats = [];

    // Sort by height descending
    const videoFormats = info.formats
      .filter(f => f.height && f.vcodec && f.vcodec !== 'none')
      .sort((a, b) => (b.height || 0) - (a.height || 0));

    for (const f of videoFormats) {
      const key = `${f.height}p`;
      if (!seen.has(key)) {
        seen.add(key);
        formats.push({
          id: f.format_id,
          label: `${f.height}p${f.fps > 30 ? f.fps : ''}`,
          resolution: `${f.width || '?'}x${f.height}`,
          height: f.height,
          fps: f.fps,
          filesize: f.filesize || f.filesize_approx || 0,
        });
      }
    }

    // Always add best option at top
    formats.unshift({ id: 'best', label: 'En İyi Kalite (Önerilen)', resolution: 'auto', height: 99999 });

    return formats;
  }

  /**
   * Start a download
   */
  startDownload(downloadId, url, options = {}) {
    const {
      formatId = 'best',
      outputDir = path.join(__dirname, '..', 'downloads'),
      fragments = 8,
      filename = null,
    } = options;

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputTemplate = filename
      ? path.join(outputDir, filename + '.%(ext)s')
      : path.join(outputDir, '%(title)s.%(ext)s');

    const formatArg = formatId === 'best'
      ? 'bestvideo+bestaudio/best'
      : `${formatId}+bestaudio/best`;

    const platform = detectPlatform(url);

    const args = [
      '-f', formatArg,
      '--merge-output-format', 'mp4',
      '--concurrent-fragments', String(fragments),
      '--newline',
      '--no-warnings',
      '--no-check-certificates',
      '--ffmpeg-location', path.dirname(this.bins.ffmpeg),
      '-o', outputTemplate,
      '--no-part',
      ...this._getPlatformArgs(platform),
      url,
    ];

    const proc = spawn(this.bins.ytdlp, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.activeProcesses.set(downloadId, {
      process: proc,
      url,
      options,
      startTime: Date.now(),
    });

    let lastFilePath = '';

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;

        // Check for destination file
        const destMatch = line.match(/\[(?:download|Merger)\]\s+(?:Destination:\s+)?(.+\.(?:mp4|mkv|webm|m4a|mp3))/i);
        if (destMatch) {
          lastFilePath = destMatch[1].trim();
        }

        // Check for "already downloaded" message
        if (line.includes('has already been downloaded')) {
          const alreadyMatch = line.match(/\[download\]\s+(.+?)\s+has already been downloaded/);
          if (alreadyMatch) lastFilePath = alreadyMatch[1].trim();
          this.emit('progress', downloadId, {
            percent: 100,
            totalSize: '-',
            speed: '-',
            eta: '00:00',
            status: 'completed',
            filePath: lastFilePath,
          });
          return;
        }

        // Parse progress
        const progress = parseProgress(line);
        if (progress) {
          this.emit('progress', downloadId, {
            ...progress,
            status: 'downloading',
            filePath: lastFilePath,
          });
        }

        // Check for merge
        if (line.includes('[Merger]') || line.includes('Merging')) {
          this.emit('progress', downloadId, {
            percent: 99,
            totalSize: '-',
            speed: '-',
            eta: 'Birleştiriliyor...',
            status: 'merging',
            filePath: lastFilePath,
          });
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      // Sometimes yt-dlp writes progress to stderr too
      const lines = text.split('\n');
      for (const line of lines) {
        const progress = parseProgress(line);
        if (progress) {
          this.emit('progress', downloadId, {
            ...progress,
            status: 'downloading',
            filePath: lastFilePath,
          });
        }
      }
    });

    proc.on('close', (code) => {
      this.activeProcesses.delete(downloadId);
      if (code === 0) {
        // Find the actual downloaded file
        this.emit('complete', downloadId, { filePath: lastFilePath });
      } else {
        this.emit('error', downloadId, { message: `İndirme başarısız (kod: ${code})` });
      }
    });

    proc.on('error', (err) => {
      this.activeProcesses.delete(downloadId);
      this.emit('error', downloadId, { message: `İşlem hatası: ${err.message}` });
    });

    return downloadId;
  }

  /**
   * Pause a download by killing the process
   */
  pauseDownload(downloadId) {
    const entry = this.activeProcesses.get(downloadId);
    if (entry) {
      entry.process.kill('SIGTERM');
      this.activeProcesses.delete(downloadId);
      return true;
    }
    return false;
  }

  /**
   * Cancel a download
   */
  cancelDownload(downloadId) {
    const entry = this.activeProcesses.get(downloadId);
    if (entry) {
      entry.process.kill('SIGKILL');
      this.activeProcesses.delete(downloadId);
      return true;
    }
    return false;
  }
  /**
   * Get platform-specific yt-dlp arguments
   */
  _getPlatformArgs(platform, attempt = 0) {
    const args = [];
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

    if (platform === 'tiktok') {
      // Cycle through different API hostnames on retry
      const tiktokHosts = [
        'api22-normal-c-useast2a.tiktokv.com',
        'api16-normal-c-useast1a.tiktokv.com',
        'api19-normal-c-useast1a.tiktokv.com',
        'api22-normal-c-useast1a.tiktokv.com',
      ];
      const host = tiktokHosts[attempt % tiktokHosts.length];
      args.push(
        '--user-agent', ua,
        '--extractor-args', `tiktok:api_hostname=${host}`,
      );
    } else if (platform === 'instagram') {
      args.push('--user-agent', ua);
    } else if (platform === 'twitter') {
      args.push('--user-agent', ua);
    }
    return args;
  }
}

module.exports = Downloader;
