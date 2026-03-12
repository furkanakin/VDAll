const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');

/**
 * Detect platform from URL
 */
function detectPlatform(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
    if (host.includes('instagram.com')) return 'instagram';
    if (host.includes('twitter.com') || host.includes('x.com')) return 'twitter';
    if (host.includes('tiktok.com')) return 'tiktok';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Get bundled binary paths based on OS
 * Supports both normal Node.js and pkg-packaged execution
 */
function getBinaryPaths() {
  // When running as a pkg binary, process.pkg exists
  // External files (binaries) should be next to the executable
  const isPkg = typeof process.pkg !== 'undefined';
  const baseDir = isPkg
    ? path.join(path.dirname(process.execPath), 'bin')
    : path.join(__dirname, '..', 'bin');

  const platform = os.platform();

  if (platform === 'win32') {
    return {
      ytdlp: path.join(baseDir, 'win', 'yt-dlp.exe'),
      ffmpeg: path.join(baseDir, 'win', 'ffmpeg.exe'),
      ffprobe: path.join(baseDir, 'win', 'ffprobe.exe'),
    };
  } else if (platform === 'darwin') {
    return {
      ytdlp: path.join(baseDir, 'mac', 'yt-dlp'),
      ffmpeg: path.join(baseDir, 'mac', 'ffmpeg'),
      ffprobe: path.join(baseDir, 'mac', 'ffprobe'),
    };
  } else {
    // Linux fallback - try system binaries
    return {
      ytdlp: 'yt-dlp',
      ffmpeg: 'ffmpeg',
      ffprobe: 'ffprobe',
    };
  }
}

/**
 * Check if bundled binaries exist
 */
function checkBinaries() {
  const bins = getBinaryPaths();
  const results = {};
  for (const [name, binPath] of Object.entries(bins)) {
    results[name] = fs.existsSync(binPath);
  }
  return results;
}

/**
 * Sanitize filename
 */
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200);
}

/**
 * Format bytes to human-readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Parse yt-dlp progress output
 */
function parseProgress(line) {
  // [download]  45.2% of 150.00MiB at 5.20MiB/s ETA 00:15
  const progressMatch = line.match(/\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/);
  if (progressMatch) {
    return {
      percent: parseFloat(progressMatch[1]),
      totalSize: progressMatch[2],
      speed: progressMatch[3],
      eta: progressMatch[4],
    };
  }

  // [download]  45.2% of 150.00MiB at 5.20MiB/s ETA Unknown
  const progressMatch2 = line.match(/\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)/);
  if (progressMatch2) {
    return {
      percent: parseFloat(progressMatch2[1]),
      totalSize: progressMatch2[2],
      speed: progressMatch2[3],
      eta: 'Hesaplanıyor...',
    };
  }

  // [download] 100% of 150.00MiB
  const completeMatch = line.match(/\[download\]\s+100%\s+of\s+([\d.]+\w+)/);
  if (completeMatch) {
    return {
      percent: 100,
      totalSize: completeMatch[1],
      speed: '-',
      eta: '00:00',
    };
  }

  // Fragment downloading: [download] Downloading fragment 5 of 20
  const fragMatch = line.match(/Downloading fragment (\d+) of (\d+)/i);
  if (fragMatch) {
    const current = parseInt(fragMatch[1]);
    const total = parseInt(fragMatch[2]);
    return {
      percent: Math.round((current / total) * 100),
      totalSize: `Parça ${current}/${total}`,
      speed: '-',
      eta: 'Hesaplanıyor...',
      isFragment: true,
    };
  }

  return null;
}

/**
 * Validate URL
 */
function isValidUrl(str) {
  try {
    const url = new URL(str);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

module.exports = {
  detectPlatform,
  getBinaryPaths,
  checkBinaries,
  sanitizeFilename,
  formatBytes,
  parseProgress,
  isValidUrl,
};
