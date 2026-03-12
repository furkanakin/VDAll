// =============================================
//  Video Downloader - Frontend Application
// =============================================

const socket = io();

// State
const state = {
  downloads: new Map(),
  settings: {
    downloadPath: '',
    fragments: 8,
    maxConcurrent: 3,
  },
};

// ===== Load settings from localStorage =====
function loadSettings() {
  const saved = localStorage.getItem('vd-settings');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      Object.assign(state.settings, parsed);
    } catch {}
  }
}

function saveSettingsToStorage() {
  localStorage.setItem('vd-settings', JSON.stringify(state.settings));
}

// ===== Platform detection =====
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

const platformNames = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  twitter: 'Twitter/X',
  tiktok: 'TikTok',
  unknown: 'Diğer',
};

const platformIcons = {
  youtube: '▶️',
  instagram: '📷',
  twitter: '🐦',
  tiktok: '🎵',
  unknown: '🔗',
};

const statusLabels = {
  fetching_info: 'Bilgi Alınıyor',
  waiting: 'Bekliyor',
  downloading: 'İndiriliyor',
  merging: 'Birleştiriliyor',
  completed: 'Tamamlandı',
  error: 'Hata',
  paused: 'Duraklatıldı',
  cancelled: 'İptal Edildi',
};

// ===== Toast System =====
function showToast(type, message) {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-message">${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ===== URL Input Platform Detection =====
const urlInput = document.getElementById('url-input');
const detectedPlatforms = document.getElementById('detected-platforms');

urlInput.addEventListener('input', () => {
  const lines = urlInput.value.split('\n').filter(l => l.trim());
  const counts = {};

  for (const line of lines) {
    const platform = detectPlatform(line.trim());
    counts[platform] = (counts[platform] || 0) + 1;
  }

  detectedPlatforms.innerHTML = '';
  for (const [platform, count] of Object.entries(counts)) {
    if (platform === 'unknown' && !lines.some(l => {
      try { new URL(l.trim()); return true; } catch { return false; }
    })) continue;

    const badge = document.createElement('span');
    badge.className = `platform-badge ${platform}`;
    badge.textContent = `${platformIcons[platform]} ${platformNames[platform]} × ${count}`;
    detectedPlatforms.appendChild(badge);
  }
});

// ===== Start Downloads =====
function startDownloads() {
  const text = urlInput.value.trim();
  if (!text) {
    showToast('warning', 'Lütfen en az bir video linki girin');
    return;
  }

  const urls = text.split('\n')
    .map(l => l.trim())
    .filter(l => l && l.startsWith('http'));

  if (urls.length === 0) {
    showToast('warning', 'Geçerli URL bulunamadı. Linklerin http:// veya https:// ile başladığından emin olun.');
    return;
  }

  const formatId = document.getElementById('default-quality').value;

  socket.emit('add-downloads', {
    urls,
    outputDir: state.settings.downloadPath || undefined,
    fragments: state.settings.fragments,
    formatId,
  });

  urlInput.value = '';
  detectedPlatforms.innerHTML = '';
  showToast('info', `${urls.length} video indirme kuyruğuna eklendi`);
}

// Allow Ctrl+Enter to start downloads
urlInput.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Enter') {
    startDownloads();
  }
});

// ===== Thumbnail Proxy =====
function proxyThumb(url) {
  if (!url) return '';
  // YouTube thumbnails work fine without proxy
  if (url.includes('i.ytimg.com') || url.includes('youtube.com')) return url;
  // Proxy everything else through our server to bypass CORS
  return `/api/proxy-thumb?url=${encodeURIComponent(url)}`;
}

// ===== Render Download Card =====
function renderDownloadCard(dl) {
  const card = document.createElement('div');
  card.className = 'download-card';
  card.id = `dl-${dl.id}`;
  card.dataset.id = dl.id;

  const progressClass = dl.status === 'completed' ? 'completed'
    : dl.status === 'error' ? 'error'
    : dl.status === 'paused' ? 'paused'
    : '';

  const thumbUrl = proxyThumb(dl.thumbnail);
  const thumbHtml = thumbUrl
    ? `<img src="${thumbUrl}" alt="Thumbnail" onerror="this.parentElement.innerHTML='<span class=\\'thumb-placeholder\\'>${platformIcons[dl.platform] || '🎬'}</span>'">`
    : `<span class="thumb-placeholder">${platformIcons[dl.platform] || '🎬'}</span>`;

  card.innerHTML = `
    <div class="download-card-top">
      <div class="download-thumb">${thumbHtml}</div>
      <div class="download-info">
        <div class="download-title" title="${escapeHtml(dl.title)}">${escapeHtml(dl.title)}</div>
        <div class="download-meta">
          <span class="platform-badge ${dl.platform}">${platformIcons[dl.platform]} ${platformNames[dl.platform]}</span>
          <span class="status-badge ${dl.status}">${statusLabels[dl.status] || dl.status}</span>
          ${dl.totalSize && dl.totalSize !== '-' ? `<span>📦 ${dl.totalSize}</span>` : ''}
        </div>
        ${dl.status === 'waiting' && dl.formats && dl.formats.length > 1 ? renderFormatSelector(dl) : ''}
      </div>
    </div>
    <div class="progress-container">
      <div class="progress-bar-wrapper">
        <div class="progress-bar ${progressClass}" style="width:${dl.progress || 0}%"></div>
      </div>
      <div class="progress-details">
        <span class="progress-percent">%${(dl.progress || 0).toFixed(1)}</span>
        <span class="progress-speed">${dl.speed || '-'}</span>
        <span class="progress-eta">${dl.eta && dl.eta !== '-' ? `⏱ ${dl.eta}` : ''}</span>
      </div>
    </div>
    <div class="download-actions">
      ${renderActions(dl)}
    </div>
  `;

  return card;
}

function renderFormatSelector(dl) {
  const options = dl.formats.map(f =>
    `<option value="${f.id}" ${f.id === dl.selectedFormat ? 'selected' : ''}>${f.label}${f.resolution && f.resolution !== 'auto' ? ` (${f.resolution})` : ''}</option>`
  ).join('');

  return `<div class="download-format-select">
    <select onchange="updateFormat('${dl.id}', this.value)">${options}</select>
  </div>`;
}

function renderActions(dl) {
  switch (dl.status) {
    case 'fetching_info':
      return `<span class="loading-dots"><span></span><span></span><span></span></span>`;
    case 'waiting':
      return `
        <button class="btn btn-sm btn-danger" onclick="cancelDownload('${dl.id}')">İptal</button>
      `;
    case 'downloading':
      return `
        <button class="btn btn-sm btn-warning" onclick="pauseDownload('${dl.id}')">⏸ Duraklat</button>
        <button class="btn btn-sm btn-danger" onclick="cancelDownload('${dl.id}')">İptal</button>
      `;
    case 'paused':
      return `
        <button class="btn btn-sm btn-success" onclick="resumeDownload('${dl.id}')">▶ Devam Et</button>
        <button class="btn btn-sm btn-danger" onclick="cancelDownload('${dl.id}')">İptal</button>
      `;
    case 'merging':
      return `<span style="font-size:0.8rem; color: var(--warning);">🔄 Ses ve video birleştiriliyor...</span>`;
    case 'completed':
      return `
        <button class="btn btn-sm btn-success" onclick="openDownloadsFolder()">📁 Klasörü Aç</button>
        <button class="btn btn-sm btn-secondary" onclick="removeDownload('${dl.id}')">✕ Kaldır</button>
      `;
    case 'error':
      return `
        <span style="font-size:0.75rem; color: var(--error); max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(dl.error || '')}">${escapeHtml(dl.error || 'Bilinmeyen hata')}</span>
        <button class="btn btn-sm btn-secondary" onclick="removeDownload('${dl.id}')">✕ Kaldır</button>
      `;
    case 'cancelled':
      return `
        <button class="btn btn-sm btn-secondary" onclick="removeDownload('${dl.id}')">✕ Kaldır</button>
      `;
    default:
      return '';
  }
}

function updateDownloadCard(dl) {
  const existing = document.getElementById(`dl-${dl.id}`);
  if (existing) {
    const newCard = renderDownloadCard(dl);
    existing.replaceWith(newCard);
  } else {
    addDownloadCard(dl);
  }
}

function addDownloadCard(dl) {
  const list = document.getElementById('downloads-list');
  const emptyState = document.getElementById('empty-state');
  if (emptyState) emptyState.style.display = 'none';

  const card = renderDownloadCard(dl);
  list.prepend(card);
}

function removeDownloadCardFromDOM(id) {
  const card = document.getElementById(`dl-${id}`);
  if (card) {
    card.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => card.remove(), 300);
  }

  // Show empty state if no cards left
  setTimeout(() => {
    const list = document.getElementById('downloads-list');
    if (list.querySelectorAll('.download-card').length === 0) {
      const emptyState = document.getElementById('empty-state');
      if (emptyState) emptyState.style.display = '';
    }
  }, 350);
}

// ===== Download Controls =====
function pauseDownload(id) {
  socket.emit('pause', id);
}

function resumeDownload(id) {
  socket.emit('resume', id);
}

function cancelDownload(id) {
  socket.emit('cancel', id);
}

function removeDownload(id) {
  socket.emit('remove', id);
  removeDownloadCardFromDOM(id);
  state.downloads.delete(id);
  updateStats();
}

function updateFormat(id, formatId) {
  socket.emit('update-format', { id, formatId });
}

// ===== Stats =====
function updateStats() {
  const stats = document.getElementById('download-stats');
  let active = 0, completed = 0, errors = 0;

  for (const dl of state.downloads.values()) {
    if (dl.status === 'downloading' || dl.status === 'merging') active++;
    else if (dl.status === 'completed') completed++;
    else if (dl.status === 'error') errors++;
  }

  stats.innerHTML = '';
  if (active > 0) stats.innerHTML += `<span class="stat-item"><span class="stat-dot active"></span>${active} aktif</span>`;
  if (completed > 0) stats.innerHTML += `<span class="stat-item"><span class="stat-dot complete"></span>${completed} tamamlandı</span>`;
  if (errors > 0) stats.innerHTML += `<span class="stat-item"><span class="stat-dot error"></span>${errors} hata</span>`;
}

// ===== Settings =====
function openSettings() {
  const modal = document.getElementById('settings-modal');
  modal.style.display = 'flex';

  document.getElementById('settings-download-path').value = state.settings.downloadPath;
  document.getElementById('settings-fragments').value = state.settings.fragments;
  document.getElementById('settings-fragments-value').textContent = state.settings.fragments;
  document.getElementById('settings-max-concurrent').value = state.settings.maxConcurrent;
  document.getElementById('settings-max-concurrent-value').textContent = state.settings.maxConcurrent;
}

function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}

function saveSettings() {
  state.settings.downloadPath = document.getElementById('settings-download-path').value.trim();
  state.settings.fragments = parseInt(document.getElementById('settings-fragments').value);
  state.settings.maxConcurrent = parseInt(document.getElementById('settings-max-concurrent').value);

  saveSettingsToStorage();

  socket.emit('update-settings', {
    maxConcurrent: state.settings.maxConcurrent,
  });

  closeSettings();
  showToast('success', 'Ayarlar kaydedildi');
}

function browseFolder() {
  // Since we can't open a native folder picker from browser,
  // prompt user to type/paste path
  const currentPath = document.getElementById('settings-download-path').value;
  showToast('info', 'İndirme klasörü yolunu metin kutusuna yapıştırın (örn: C:\\Users\\Kullanıcı\\Downloads)');
}

// Range slider live value update
document.getElementById('settings-fragments').addEventListener('input', (e) => {
  document.getElementById('settings-fragments-value').textContent = e.target.value;
});

document.getElementById('settings-max-concurrent').addEventListener('input', (e) => {
  document.getElementById('settings-max-concurrent-value').textContent = e.target.value;
});

// Close modal on overlay click
document.getElementById('settings-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeSettings();
});

// ===== Open Downloads Folder =====
function openDownloadsFolder() {
  fetch('/api/open-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderPath: state.settings.downloadPath || undefined }),
  }).catch(() => {
    showToast('error', 'Klasör açılamadı');
  });
}

// ===== Socket.IO Event Handlers =====
socket.on('connect', () => {
  console.log('Sunucuya bağlanıldı');
});

socket.on('init', (data) => {
  if (data.defaultDownloadDir && !state.settings.downloadPath) {
    state.settings.downloadPath = data.defaultDownloadDir;
  }
  for (const dl of data.downloads) {
    state.downloads.set(dl.id, dl);
    addDownloadCard(dl);
  }
  updateStats();
});

socket.on('download-added', (data) => {
  state.downloads.set(data.id, data.download);
  addDownloadCard(data.download);
  updateStats();
});

socket.on('download-info', (data) => {
  state.downloads.set(data.id, data.download);
  updateDownloadCard(data.download);
  updateStats();
});

socket.on('download-started', (data) => {
  state.downloads.set(data.id, data.download);
  updateDownloadCard(data.download);
  updateStats();
});

socket.on('download-progress', (data) => {
  state.downloads.set(data.id, data.download);
  // Throttle DOM updates
  const card = document.getElementById(`dl-${data.id}`);
  if (card) {
    const progressBar = card.querySelector('.progress-bar');
    const percentEl = card.querySelector('.progress-percent');
    const speedEl = card.querySelector('.progress-speed');
    const etaEl = card.querySelector('.progress-eta');
    const statusBadge = card.querySelector('.status-badge');

    if (progressBar) progressBar.style.width = `${data.download.progress}%`;
    if (percentEl) percentEl.textContent = `%${data.download.progress.toFixed(1)}`;
    if (speedEl) speedEl.textContent = data.download.speed || '-';
    if (etaEl) etaEl.textContent = data.download.eta && data.download.eta !== '-' ? `⏱ ${data.download.eta}` : '';
    if (statusBadge && data.download.status === 'merging') {
      statusBadge.className = 'status-badge merging';
      statusBadge.textContent = statusLabels.merging;
    }
  }
});

socket.on('download-complete', (data) => {
  state.downloads.set(data.id, data.download);
  updateDownloadCard(data.download);
  updateStats();
  showToast('success', `"${data.download.title}" indirildi! ✅`);
});

socket.on('download-error', (data) => {
  state.downloads.set(data.id, data.download);
  updateDownloadCard(data.download);
  updateStats();
  showToast('error', `Hata: ${data.download.error || 'Bilinmeyen hata'}`);
});

socket.on('download-paused', (data) => {
  state.downloads.set(data.id, data.download);
  updateDownloadCard(data.download);
  updateStats();
  showToast('info', `"${data.download.title}" duraklatıldı`);
});

socket.on('download-resumed', (data) => {
  state.downloads.set(data.id, data.download);
  updateDownloadCard(data.download);
  updateStats();
});

socket.on('download-cancelled', (data) => {
  state.downloads.set(data.id, data.download);
  updateDownloadCard(data.download);
  updateStats();
  showToast('warning', `İndirme iptal edildi`);
});

socket.on('download-removed', (data) => {
  state.downloads.delete(data.id);
  removeDownloadCardFromDOM(data.id);
  updateStats();
});

socket.on('download-updated', (data) => {
  state.downloads.set(data.id, data.download);
  updateDownloadCard(data.download);
});

socket.on('toast', (data) => {
  showToast(data.type || 'info', data.message);
});

socket.on('disconnect', () => {
  showToast('warning', 'Sunucu bağlantısı kesildi. Yeniden bağlanılıyor...');
});

// ===== Helpers =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Initialize =====
loadSettings();

// Add CSS for slideOut animation dynamically
const style = document.createElement('style');
style.textContent = `
  @keyframes slideOut {
    from { opacity: 1; transform: translateY(0) scale(1); }
    to { opacity: 0; transform: translateY(-10px) scale(0.98); }
  }
`;
document.head.appendChild(style);
