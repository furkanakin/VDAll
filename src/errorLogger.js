const fs = require('fs');
const path = require('path');

class ErrorLogger {
  constructor() {
    // Use real filesystem path (not pkg snapshot)
    const isPkg = typeof process.pkg !== 'undefined';
    const appRoot = isPkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
    this.logDir = path.join(appRoot, 'logs');
    this.logFile = path.join(this.logDir, 'errors.json');
    this._ensureLogDir();
    this.errors = this._loadErrors();
  }

  _ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  _loadErrors() {
    try {
      if (fs.existsSync(this.logFile)) {
        return JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
      }
    } catch {}
    return [];
  }

  _save() {
    try {
      fs.writeFileSync(this.logFile, JSON.stringify(this.errors, null, 2), 'utf8');
    } catch (err) {
      console.error('Hata kaydı yazılamadı:', err.message);
    }
  }

  /**
   * Log an error
   */
  log(entry) {
    const record = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
      timestamp: new Date().toISOString(),
      url: entry.url || '',
      platform: entry.platform || 'unknown',
      title: entry.title || '',
      error: entry.error || 'Bilinmeyen hata',
      downloadId: entry.downloadId || '',
      phase: entry.phase || 'unknown', // 'info', 'download', 'merge'
    };

    this.errors.unshift(record); // newest first

    // Keep max 500 errors
    if (this.errors.length > 500) {
      this.errors = this.errors.slice(0, 500);
    }

    this._save();
    return record;
  }

  /**
   * Get all errors
   */
  getAll() {
    return this.errors;
  }

  /**
   * Clear all errors
   */
  clear() {
    this.errors = [];
    this._save();
  }

  /**
   * Delete a specific error
   */
  delete(id) {
    this.errors = this.errors.filter(e => e.id !== id);
    this._save();
  }
}

module.exports = ErrorLogger;
