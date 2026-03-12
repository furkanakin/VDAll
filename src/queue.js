const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const Downloader = require('./downloader');

class DownloadQueue extends EventEmitter {
  constructor() {
    super();
    this.downloads = new Map();
    this.downloader = new Downloader();
    this.maxConcurrent = 3;
    this.activeCount = 0;

    // Forward events from downloader
    this.downloader.on('progress', (id, data) => {
      const dl = this.downloads.get(id);
      if (dl) {
        dl.progress = data.percent || 0;
        dl.speed = data.speed || '-';
        dl.eta = data.eta || '-';
        dl.totalSize = data.totalSize || '-';
        dl.status = data.status || dl.status;
        dl.filePath = data.filePath || dl.filePath;
        this.emit('progress', id, dl);
      }
    });

    this.downloader.on('complete', (id, data) => {
      const dl = this.downloads.get(id);
      if (dl) {
        dl.status = 'completed';
        dl.progress = 100;
        dl.filePath = data.filePath;
        dl.completedAt = Date.now();
        this.activeCount--;
        this.emit('complete', id, dl);
        this._processQueue();
      }
    });

    this.downloader.on('error', (id, data) => {
      const dl = this.downloads.get(id);
      if (dl) {
        dl.status = 'error';
        dl.error = data.message;
        this.activeCount--;
        this.emit('error', id, dl);
        this._processQueue();
      }
    });
  }

  /**
   * Add a URL to the download queue
   */
  async addDownload(url, options = {}) {
    const id = uuidv4();
    const download = {
      id,
      url,
      title: 'Video bilgisi alınıyor...',
      thumbnail: '',
      platform: options.platform || 'unknown',
      status: 'fetching_info',
      progress: 0,
      speed: '-',
      eta: '-',
      totalSize: '-',
      formats: [],
      selectedFormat: options.formatId || 'best',
      outputDir: options.outputDir,
      fragments: options.fragments || 8,
      error: null,
      filePath: '',
      addedAt: Date.now(),
      completedAt: null,
    };

    this.downloads.set(id, download);
    this.emit('added', id, download);

    // Fetch video info
    try {
      const info = await this.downloader.getVideoInfo(url);
      download.title = info.title;
      download.thumbnail = info.thumbnail;
      download.platform = info.platform;
      download.formats = info.formats;
      download.uploader = info.uploader;
      download.duration = info.duration;
      download.status = 'waiting';
      this.emit('info', id, download);

      // Start if slots available
      this._processQueue();
    } catch (err) {
      download.status = 'error';
      download.error = err.message;
      this.emit('error', id, download);
    }

    return id;
  }

  /**
   * Process waiting downloads
   */
  _processQueue() {
    if (this.activeCount >= this.maxConcurrent) return;

    for (const [id, dl] of this.downloads) {
      if (dl.status === 'waiting' && this.activeCount < this.maxConcurrent) {
        this._startDownload(id);
      }
    }
  }

  /**
   * Start a specific download
   */
  _startDownload(id) {
    const dl = this.downloads.get(id);
    if (!dl) return;

    dl.status = 'downloading';
    this.activeCount++;
    this.emit('started', id, dl);

    this.downloader.startDownload(id, dl.url, {
      formatId: dl.selectedFormat,
      outputDir: dl.outputDir,
      fragments: dl.fragments,
    });
  }

  /**
   * Pause a download
   */
  pauseDownload(id) {
    const dl = this.downloads.get(id);
    if (dl && dl.status === 'downloading') {
      this.downloader.pauseDownload(id);
      dl.status = 'paused';
      this.activeCount--;
      this.emit('paused', id, dl);
      return true;
    }
    return false;
  }

  /**
   * Resume a paused download
   */
  resumeDownload(id) {
    const dl = this.downloads.get(id);
    if (dl && dl.status === 'paused') {
      dl.status = 'waiting';
      this.emit('resumed', id, dl);
      this._processQueue();
      return true;
    }
    return false;
  }

  /**
   * Cancel a download
   */
  cancelDownload(id) {
    const dl = this.downloads.get(id);
    if (dl) {
      if (dl.status === 'downloading') {
        this.downloader.cancelDownload(id);
        this.activeCount--;
      }
      dl.status = 'cancelled';
      this.emit('cancelled', id, dl);
      return true;
    }
    return false;
  }

  /**
   * Remove a download from the list
   */
  removeDownload(id) {
    const dl = this.downloads.get(id);
    if (dl) {
      if (dl.status === 'downloading') {
        this.downloader.cancelDownload(id);
        this.activeCount--;
      }
      this.downloads.delete(id);
      this.emit('removed', id);
      return true;
    }
    return false;
  }

  /**
   * Update format for a waiting download
   */
  updateFormat(id, formatId) {
    const dl = this.downloads.get(id);
    if (dl && (dl.status === 'waiting' || dl.status === 'paused')) {
      dl.selectedFormat = formatId;
      this.emit('updated', id, dl);
      return true;
    }
    return false;
  }

  /**
   * Get all downloads as array
   */
  getAllDownloads() {
    return Array.from(this.downloads.values());
  }

  /**
   * Set max concurrent downloads
   */
  setMaxConcurrent(n) {
    this.maxConcurrent = n;
    this._processQueue();
  }
}

module.exports = DownloadQueue;
