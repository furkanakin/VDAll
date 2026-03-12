const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

/**
 * Auto-setup: downloads yt-dlp and ffmpeg if they're missing
 * Makes the app truly single-file: just run the exe and everything installs
 */
class AutoSetup {
  constructor(appRoot) {
    this.appRoot = appRoot;
    this.platform = os.platform();
    this.binDir = path.join(appRoot, 'bin', this.platform === 'win32' ? 'win' : 'mac');
  }

  get ytdlpPath() {
    return path.join(this.binDir, this.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  }

  get ffmpegPath() {
    return path.join(this.binDir, this.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  }

  get ffprobePath() {
    return path.join(this.binDir, this.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  }

  /**
   * Check and install missing binaries
   */
  async ensureBinaries(onProgress) {
    // Create bin directory
    if (!fs.existsSync(this.binDir)) {
      fs.mkdirSync(this.binDir, { recursive: true });
    }

    const tasks = [];

    if (!fs.existsSync(this.ytdlpPath)) {
      tasks.push({ name: 'yt-dlp', fn: () => this._downloadYtdlp(onProgress) });
    }

    if (!fs.existsSync(this.ffmpegPath)) {
      tasks.push({ name: 'ffmpeg', fn: () => this._downloadFfmpeg(onProgress) });
    }

    if (tasks.length === 0) {
      return { needed: false };
    }

    const results = [];
    for (const task of tasks) {
      if (onProgress) onProgress(`${task.name} indiriliyor...`);
      console.log(`[AutoSetup] ${task.name} indiriliyor...`);
      try {
        await task.fn();
        results.push({ name: task.name, success: true });
        console.log(`[AutoSetup] ${task.name} başarıyla indirildi.`);
      } catch (err) {
        results.push({ name: task.name, success: false, error: err.message });
        console.error(`[AutoSetup] ${task.name} indirilemedi:`, err.message);
      }
    }

    return { needed: true, results };
  }

  /**
   * Download yt-dlp binary
   */
  async _downloadYtdlp(onProgress) {
    const url = this.platform === 'win32'
      ? 'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe'
      : 'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp_macos';

    await this._downloadFile(url, this.ytdlpPath, onProgress);

    // Make executable on macOS
    if (this.platform !== 'win32') {
      fs.chmodSync(this.ytdlpPath, 0o755);
    }
  }

  /**
   * Download ffmpeg binary
   */
  async _downloadFfmpeg(onProgress) {
    if (this.platform === 'win32') {
      await this._downloadFfmpegWindows(onProgress);
    } else {
      await this._downloadFfmpegMac(onProgress);
    }
  }

  async _downloadFfmpegWindows(onProgress) {
    const zipUrl = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
    const zipPath = path.join(this.appRoot, '_ffmpeg_temp.zip');
    const extractDir = path.join(this.appRoot, '_ffmpeg_temp');

    try {
      if (onProgress) onProgress('ffmpeg indiriliyor (büyük dosya, biraz bekleyin)...');
      await this._downloadFile(zipUrl, zipPath, onProgress);

      if (onProgress) onProgress('ffmpeg çıkartılıyor...');
      // Use PowerShell to extract
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, { timeout: 120000 });

      // Find and copy binaries
      const innerDir = fs.readdirSync(extractDir).find(d => d.startsWith('ffmpeg'));
      if (innerDir) {
        const binSrc = path.join(extractDir, innerDir, 'bin');
        const files = ['ffmpeg.exe', 'ffprobe.exe'];
        for (const file of files) {
          const src = path.join(binSrc, file);
          const dest = path.join(this.binDir, file);
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
          }
        }
      }
    } finally {
      // Cleanup temp files
      try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath); } catch {}
      try { if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true }); } catch {}
    }
  }

  async _downloadFfmpegMac(onProgress) {
    const url = 'https://evermeet.cx/ffmpeg/getrelease/zip';
    const zipPath = path.join(this.appRoot, '_ffmpeg_temp.zip');

    try {
      if (onProgress) onProgress('ffmpeg indiriliyor...');
      await this._downloadFile(url, zipPath, onProgress);

      execSync(`unzip -o "${zipPath}" -d "${this.binDir}"`, { timeout: 60000 });
      fs.chmodSync(this.ffmpegPath, 0o755);
    } finally {
      try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath); } catch {}
    }
  }

  /**
   * Download a file with redirect following
   */
  _downloadFile(url, dest, onProgress) {
    return new Promise((resolve, reject) => {
      const doRequest = (requestUrl, redirectCount = 0) => {
        if (redirectCount > 10) return reject(new Error('Çok fazla yönlendirme'));

        const mod = requestUrl.startsWith('https') ? https : http;
        mod.get(requestUrl, { headers: { 'User-Agent': 'VideoDownloader/1.0' } }, (res) => {
          // Handle redirects
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            return doRequest(res.headers.location, redirectCount + 1);
          }

          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode}`));
          }

          const totalSize = parseInt(res.headers['content-length'] || '0');
          let downloaded = 0;

          const file = fs.createWriteStream(dest);
          res.on('data', (chunk) => {
            downloaded += chunk.length;
            if (totalSize > 0 && onProgress) {
              const pct = Math.round((downloaded / totalSize) * 100);
              onProgress(`İndiriliyor... %${pct}`);
            }
          });
          res.pipe(file);
          file.on('finish', () => { file.close(resolve); });
          file.on('error', (err) => {
            fs.unlinkSync(dest);
            reject(err);
          });
        }).on('error', reject);
      };

      doRequest(url);
    });
  }
}

module.exports = AutoSetup;
