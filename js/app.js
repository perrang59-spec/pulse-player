(() => {
  'use strict';

  const DB_NAME = 'pulse-player';
  const DB_VERSION = 1;
  const STORE = 'tracks';

  const $ = (id) => document.getElementById(id);

  const fileInput = $('fileInput');
  const dropZone = $('dropZone');
  const clearBtn = $('clearBtn');
  const trackCount = $('trackCount');
  const emptyState = $('emptyState');
  const playlistEl = $('playlist');
  const urlForm = $('urlForm');
  const urlInput = $('urlInput');
  const downloadBtn = $('downloadBtn');

  const audio = $('audio');
  const trackTitle = $('trackTitle');
  const trackSubtitle = $('trackSubtitle');
  const currentTimeEl = $('currentTime');
  const durationEl = $('duration');
  const seek = $('seek');
  const playBtn = $('playBtn');
  const playIcon = $('playIcon');
  const prevBtn = $('prevBtn');
  const nextBtn = $('nextBtn');
  const shuffleBtn = $('shuffleBtn');
  const repeatBtn = $('repeatBtn');
  const repeatBadge = $('repeatBadge');
  const volume = $('volume');
  const installBtn = $('installBtn');
  const toastEl = $('toast');
  const updateBanner = $('updateBanner');
  const updateTitle = $('updateTitle');
  const updateNotes = $('updateNotes');
  const updateRelease = $('updateRelease');
  const updateDownload = $('updateDownload');
  const updateReload = $('updateReload');
  const updateDismiss = $('updateDismiss');

  let db = null;
  let tracks = [];
  let currentIndex = -1;
  let shuffle = false;
  let repeat = 'off';
  let isSeeking = false;
  let deferredPrompt = null;
  let toastTimer = null;
  let mediaHandlersSet = false;
  let latestReleaseTag = null;

  const REPEAT_MODES = ['off', 'all', 'one'];
  const MAX_DOWNLOAD_BYTES = 150 * 1024 * 1024;
  const APP_VERSION = '1.1.0';
  const RELEASES_API = 'https://api.github.com/repos/perrang59-spec/pulse-player/releases/latest';

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open storage'));
    });
  }

  function getAllTracks() {
    if (!db) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  function putTrack(track) {
    if (!db) return Promise.resolve();
    const { url, ...record } = track;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function deleteTrack(id) {
    if (!db) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function clearTracks() {
    if (!db) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function makeId() {
    if (window.crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function cleanName(name) {
    return name
      .replace(/\.[^/.]+$/, '')
      .replace(/[_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function formatTime(value) {
    if (!Number.isFinite(value) || value < 0) return '0:00';
    const total = Math.floor(value);
    const mins = Math.floor(total / 60);
    const secs = String(total % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown size';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
  }

  function trackSubtitleFor(track) {
    const kind = (track.type || '').split('/')[1] || 'audio';
    return `${formatBytes(track.size)} · ${kind.toUpperCase()}`;
  }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  function withUrl(record) {
    return { ...record, url: URL.createObjectURL(record.blob) };
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => (
      (file.type && file.type.startsWith('audio/')) ||
      /\.(mp3|m4a|aac|ogg|oga|wav|flac|opus|webm)$/i.test(file.name)
    ));

    if (!files.length) {
      toast('No audio files found');
      return;
    }

    const newTracks = files.map((file) => ({
      id: makeId(),
      name: cleanName(file.name),
      type: file.type || 'audio/*',
      size: file.size,
      blob: file,
      url: URL.createObjectURL(file)
    }));

    tracks = tracks.concat(newTracks);
    renderPlaylist();

    if (currentIndex === -1) {
      loadTrack(0, false);
    }

    try {
      await Promise.all(newTracks.map(putTrack));
      toast(`${newTracks.length} ${newTracks.length === 1 ? 'track' : 'tracks'} added`);
    } catch (error) {
      console.warn(error);
      toast('Added for this session. Device storage is full or unavailable.');
    }
  }

  function renderPlaylist() {
    playlistEl.textContent = '';
    trackCount.textContent = tracks.length === 1 ? '1 track' : `${tracks.length} tracks`;
    emptyState.hidden = tracks.length > 0;
    clearBtn.disabled = tracks.length === 0;

    tracks.forEach((track, index) => {
      const li = document.createElement('li');

      const row = document.createElement('div');
      row.className = `track-row${index === currentIndex ? ' active' : ''}`;
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', `Play ${track.name}`);

      const number = document.createElement('span');
      number.className = 'track-number';
      number.textContent = index === currentIndex ? '▶' : String(index + 1).padStart(2, '0');

      const nameWrap = document.createElement('span');
      nameWrap.style.minWidth = '0';

      const name = document.createElement('span');
      name.className = 'track-name';
      name.textContent = track.name;

      const info = document.createElement('span');
      info.className = 'track-info';
      info.textContent = trackSubtitleFor(track);

      nameWrap.append(name, info);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-btn';
      remove.setAttribute('aria-label', `Remove ${track.name}`);
      remove.textContent = '✕';

      row.addEventListener('click', () => loadTrack(index, true));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          loadTrack(index, true);
        }
      });
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        removeTrack(index);
      });

      row.append(number, nameWrap, remove);
      li.append(row);
      playlistEl.append(li);
    });
  }

  function clearNowPlaying() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    currentIndex = -1;
    trackTitle.textContent = 'No track selected';
    trackSubtitle.textContent = 'Add music to begin';
    currentTimeEl.textContent = '0:00';
    durationEl.textContent = '0:00';
    seek.value = '0';
    seek.max = '0';
    updatePlayIcon();
  }

  function loadTrack(index, autoplay = true) {
    if (!tracks.length) {
      clearNowPlaying();
      return;
    }

    currentIndex = ((index % tracks.length) + tracks.length) % tracks.length;
    const track = tracks[currentIndex];

    audio.src = track.url;
    audio.load();
    trackTitle.textContent = track.name;
    trackSubtitle.textContent = trackSubtitleFor(track);
    currentTimeEl.textContent = '0:00';
    durationEl.textContent = '0:00';
    seek.value = '0';
    seek.max = '0';
    updateMediaSession(track);
    renderPlaylist();

    if (autoplay) {
      playAudio();
    } else {
      updatePlayIcon();
    }
  }

  function playAudio() {
    if (!tracks.length) {
      toast('Add music first');
      return;
    }
    if (!audio.src && currentIndex >= 0) {
      audio.src = tracks[currentIndex].url;
    }
    audio.play()
      .then(updatePlayIcon)
      .catch(() => {
        updatePlayIcon();
        toast('Tap play to start audio');
      });
  }

  function togglePlay() {
    if (!tracks.length) {
      toast('Add music first');
      return;
    }
    if (audio.paused) {
      playAudio();
    } else {
      audio.pause();
    }
  }

  function updatePlayIcon() {
    const paused = audio.paused;
    playIcon.textContent = paused ? '▶' : '❚❚';
    playBtn.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = paused ? 'paused' : 'playing';
      } catch (error) {
        /* ignore */
      }
    }
  }

  function nextTrack(autoplay = true, allowWrap = true) {
    if (!tracks.length) return;

    if (shuffle && tracks.length > 1) {
      let next = currentIndex;
      while (next === currentIndex) {
        next = Math.floor(Math.random() * tracks.length);
      }
      loadTrack(next, autoplay);
      return;
    }

    if (currentIndex + 1 < tracks.length) {
      loadTrack(currentIndex + 1, autoplay);
    } else if (allowWrap && repeat === 'all') {
      loadTrack(0, autoplay);
    } else {
      audio.pause();
      updatePlayIcon();
    }
  }

  function prevTrack() {
    if (!tracks.length) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (currentIndex > 0) {
      loadTrack(currentIndex - 1, true);
    } else {
      loadTrack(tracks.length - 1, true);
    }
  }

  async function removeTrack(index) {
    const track = tracks[index];
    if (!track) return;

    tracks.splice(index, 1);
    URL.revokeObjectURL(track.url);
    await deleteTrack(track.id);

    if (index === currentIndex) {
      audio.pause();
      currentIndex = -1;
      if (tracks.length) {
        loadTrack(Math.min(index, tracks.length - 1), false);
      } else {
        clearNowPlaying();
      }
    }

    renderPlaylist();
    toast(`${track.name} removed`);
  }

  function updateShuffleUI() {
    shuffleBtn.setAttribute('aria-pressed', String(shuffle));
    shuffleBtn.classList.toggle('active', shuffle);
    shuffleBtn.setAttribute('aria-label', shuffle ? 'Shuffle on' : 'Shuffle off');
  }

  function updateRepeatUI() {
    repeatBtn.dataset.mode = repeat;
    repeatBtn.classList.toggle('active', repeat !== 'off');
    repeatBtn.setAttribute('aria-label', `Repeat ${repeat}`);
    repeatBadge.textContent = repeat === 'one' ? '1' : '';
  }

  function updateMediaSession(track) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.name,
        artist: 'Pulse Player',
        album: 'Your library'
      });
      navigator.mediaSession.playbackState = 'paused';

      if (!mediaHandlersSet) {
        navigator.mediaSession.setActionHandler('play', () => playAudio());
        navigator.mediaSession.setActionHandler('pause', () => {
          audio.pause();
          updatePlayIcon();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
        navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack(true, true));
        mediaHandlersSet = true;
      }
    } catch (error) {
      /* ignore unsupported action handlers */
    }
  }

  function fileNameFromResponse(response, url) {
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    if (match) {
      const raw = (match[1] || match[2] || '').trim();
      try {
        return decodeURIComponent(raw);
      } catch (error) {
        return raw;
      }
    }

    const pathname = new URL(url).pathname;
    const last = pathname.split('/').filter(Boolean).pop() || 'downloaded-track';
    try {
      return decodeURIComponent(last);
    } catch (error) {
      return last;
    }
  }

  async function downloadFromUrl(rawUrl) {
    let parsed;
    try {
      parsed = new URL(rawUrl.trim(), location.href);
    } catch (error) {
      toast('Enter a valid direct link');
      return;
    }

    const localTest = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    if (parsed.protocol !== 'https:' && !(localTest && parsed.protocol === 'http:')) {
      toast('Use an https link');
      return;
    }

    const originalLabel = downloadBtn.textContent;
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Downloading…';

    try {
      const response = await fetch(parsed.href, { mode: 'cors' });
      if (!response.ok) throw new Error(`Download failed (HTTP ${response.status})`);

      const declaredSize = Number(response.headers.get('content-length') || 0);
      if (declaredSize && declaredSize > MAX_DOWNLOAD_BYTES) {
        throw new Error('That file is larger than 150 MB');
      }

      const blob = await response.blob();
      if (blob.size > MAX_DOWNLOAD_BYTES) {
        throw new Error('That file is larger than 150 MB');
      }

      const type = (response.headers.get('content-type') || blob.type || '').toLowerCase();
      const name = cleanName(fileNameFromResponse(response, parsed.href));
      const isAudio = type.startsWith('audio/') ||
        /\.(mp3|m4a|aac|ogg|oga|wav|flac|opus|webm)$/i.test(name);

      if (!isAudio) {
        throw new Error('That link is not an audio file');
      }

      const track = {
        id: makeId(),
        name,
        type: type || 'audio/*',
        size: blob.size,
        blob,
        url: URL.createObjectURL(blob)
      };

      tracks.push(track);
      renderPlaylist();
      if (currentIndex === -1) loadTrack(0, false);

      try {
        await putTrack(track);
        toast(`${name} saved to your library`);
      } catch (error) {
        console.warn(error);
        toast('Saved for this session. Device storage is full or unavailable.');
      }

      urlInput.value = '';
    } catch (error) {
      console.warn(error);
      const message = /Failed to fetch|NetworkError|Load failed/i.test(String(error))
        ? 'Download blocked. The site may not allow direct downloads.'
        : (error.message || 'Download failed');
      toast(message);
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = originalLabel;
    }
  }

  function parseVersion(value) {
    const match = String(value || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  }

  function isNewer(remote, current) {
    if (!remote || !current) return false;
    for (let i = 0; i < 3; i++) {
      if (remote[i] > current[i]) return true;
      if (remote[i] < current[i]) return false;
    }
    return false;
  }

  function isApkClient() {
    const ua = navigator.userAgent || '';
    return /PulsePlayerAPK\//i.test(ua) || /Version\/4\.0/i.test(ua);
  }

  function currentVersion() {
    const ua = navigator.userAgent || '';
    const apkMatch = ua.match(/PulsePlayerAPK\/(\d+\.\d+\.\d+)/i);
    if (apkMatch) return parseVersion(apkMatch[1]);
    if (/Version\/4\.0/i.test(ua)) return [1, 0, 0];
    return parseVersion(APP_VERSION);
  }

  function updateNoticeKey(tag) {
    return `pulse-update-dismissed-${tag}`;
  }

  function wasDismissed(tag) {
    try {
      return localStorage.getItem(updateNoticeKey(tag)) === '1';
    } catch (error) {
      return false;
    }
  }

  function rememberDismissal(tag) {
    try {
      localStorage.setItem(updateNoticeKey(tag), '1');
    } catch (error) {
      // Storage may be unavailable; the notice can simply appear again.
    }
  }

  async function reloadToLatest() {
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.update()));
      } catch (error) {
        console.warn(error);
      }
    }
    const separator = location.href.includes('?') ? '&' : '?';
    location.href = `${location.href}${separator}u=${Date.now()}`;
  }

  function showUpdateBanner(release, tag) {
    latestReleaseTag = tag;
    updateTitle.textContent = `Update available — ${tag}`;
    updateNotes.textContent = String(release.body || 'A new version of Pulse Player has been published.')
      .trim()
      .slice(0, 220);

    if (release.html_url) {
      updateRelease.href = release.html_url;
      updateRelease.hidden = false;
    } else {
      updateRelease.hidden = true;
    }

    const apkAsset = (release.assets || []).find((asset) => /\.apk$/i.test(asset.name || ''));
    if (isApkClient() && apkAsset) {
      updateDownload.href = apkAsset.browser_download_url;
      updateDownload.hidden = false;
      updateReload.hidden = true;
    } else {
      updateDownload.hidden = true;
      updateReload.hidden = false;
    }

    updateBanner.hidden = false;
  }

  async function checkForUpdates() {
    try {
      const response = await fetch(RELEASES_API, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json' }
      });
      if (!response.ok) return;

      const release = await response.json();
      const tag = String(release.tag_name || '');
      if (!isNewer(parseVersion(tag), currentVersion())) return;
      if (wasDismissed(tag)) return;

      showUpdateBanner(release, tag);
    } catch (error) {
      console.warn('Update check failed', error);
    }
  }

  function bindEvents() {
    urlForm.addEventListener('submit', (event) => {
      event.preventDefault();
      downloadFromUrl(urlInput.value);
    });

    fileInput.addEventListener('change', (event) => {
      addFiles(event.target.files);
      event.target.value = '';
    });

    clearBtn.addEventListener('click', async () => {
      if (!tracks.length) return;
      if (!window.confirm('Remove all songs from Pulse Player?')) return;
      tracks.forEach((track) => URL.revokeObjectURL(track.url));
      tracks = [];
      await clearTracks();
      clearNowPlaying();
      renderPlaylist();
      toast('Library cleared');
    });

    playBtn.addEventListener('click', togglePlay);
    prevBtn.addEventListener('click', prevTrack);
    nextBtn.addEventListener('click', () => nextTrack(true, true));

    shuffleBtn.addEventListener('click', () => {
      shuffle = !shuffle;
      updateShuffleUI();
      toast(shuffle ? 'Shuffle on' : 'Shuffle off');
    });

    repeatBtn.addEventListener('click', () => {
      repeat = REPEAT_MODES[(REPEAT_MODES.indexOf(repeat) + 1) % REPEAT_MODES.length];
      updateRepeatUI();
      toast(`Repeat ${repeat}`);
    });

    seek.addEventListener('input', () => {
      isSeeking = true;
      currentTimeEl.textContent = formatTime(Number(seek.value));
    });
    seek.addEventListener('change', () => {
      if (Number.isFinite(audio.duration)) {
        audio.currentTime = Number(seek.value);
      }
      isSeeking = false;
    });

    volume.addEventListener('input', () => {
      audio.volume = Number(volume.value);
      try {
        localStorage.setItem('pulse-volume', volume.value);
      } catch (error) {
        /* ignore */
      }
    });

    audio.addEventListener('loadedmetadata', () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      seek.max = String(duration);
      durationEl.textContent = formatTime(duration);
    });

    audio.addEventListener('timeupdate', () => {
      if (!isSeeking) {
        seek.value = String(audio.currentTime || 0);
        currentTimeEl.textContent = formatTime(audio.currentTime);
      }
    });

    audio.addEventListener('play', updatePlayIcon);
    audio.addEventListener('pause', updatePlayIcon);
    audio.addEventListener('ended', () => {
      if (repeat === 'one') {
        audio.currentTime = 0;
        playAudio();
      } else {
        nextTrack(true, repeat === 'all' || shuffle);
      }
    });
    audio.addEventListener('error', () => {
      if (audio.src) toast('This file could not be played');
    });

    ['dragenter', 'dragover'].forEach((type) => {
      dropZone.addEventListener(type, (event) => {
        event.preventDefault();
        dropZone.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach((type) => {
      dropZone.addEventListener(type, (event) => {
        event.preventDefault();
        dropZone.classList.remove('drag-over');
      });
    });
    dropZone.addEventListener('drop', (event) => {
      event.stopPropagation();
      addFiles(event.dataTransfer.files);
    });
    document.addEventListener('dragover', (event) => event.preventDefault());
    document.addEventListener('drop', (event) => event.preventDefault());

    window.addEventListener('keydown', (event) => {
      const tag = (event.target && event.target.tagName) || '';
      if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A'].includes(tag)) return;

      if (event.code === 'Space') {
        event.preventDefault();
        togglePlay();
      } else if (event.code === 'ArrowRight') {
        audio.currentTime = Math.min(audio.duration || 0, (audio.currentTime || 0) + 5);
      } else if (event.code === 'ArrowLeft') {
        audio.currentTime = Math.max(0, (audio.currentTime || 0) - 5);
      }
    });

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      installBtn.hidden = false;
    });

    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        toast('Pulse Player installed');
      }
      deferredPrompt = null;
      installBtn.hidden = true;
    });

    updateReload.addEventListener('click', reloadToLatest);
    updateDismiss.addEventListener('click', () => {
      updateBanner.hidden = true;
      if (latestReleaseTag) rememberDismissal(latestReleaseTag);
    });
  }

  function restoreVolume() {
    try {
      const saved = localStorage.getItem('pulse-volume');
      if (saved !== null) volume.value = saved;
    } catch (error) {
      /* ignore */
    }
    audio.volume = Number(volume.value);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('./sw.js').catch((error) => {
        console.warn('Service worker registration failed', error);
      });
    };
    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }
  }

  async function init() {
    bindEvents();
    restoreVolume();
    updateShuffleUI();
    updateRepeatUI();

    try {
      db = await openDB();
      const saved = await getAllTracks();
      tracks = saved.map(withUrl);
      renderPlaylist();
      if (tracks.length) loadTrack(0, false);
    } catch (error) {
      console.warn(error);
      renderPlaylist();
      toast('Device storage unavailable; playlist lasts until you close this tab.');
    }

    registerServiceWorker();
    checkForUpdates();
  }

  init();
})();
