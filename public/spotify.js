/* ─────────────────────────────────────────────────────────────────
   nrriandika — Spotify Frontend Module
   Communicates with the Express backend to display music data.
───────────────────────────────────────────────────────────────── */

(function SpotifyUI() {
  // ─── DOM refs ────────────────────────────────────────────────
  const authSection   = document.getElementById('spotify-auth');
  const playerSection = document.getElementById('spotify-player');

  // Now Playing
  const npStatusText  = document.getElementById('np-status-text');
  const npArtwork     = document.getElementById('np-artwork');
  const npTrack       = document.getElementById('np-track');
  const npArtist      = document.getElementById('np-artist');
  const npAlbum       = document.getElementById('np-album');
  const npEq          = document.getElementById('np-eq');
  const npProgressBar = document.getElementById('np-progress-bar');
  const npElapsed     = document.getElementById('np-elapsed');
  const npDuration    = document.getElementById('np-duration');
  const npRefreshBtn  = document.getElementById('np-refresh');

  // Track lists
  const topTracksList    = document.getElementById('top-tracks-list');
  const recentTracksList = document.getElementById('recent-tracks-list');
  const topTracksFilter  = document.getElementById('top-tracks-filter');

  // ─── State ───────────────────────────────────────────────────
  let currentRange    = 'short_term';
  let nowPlayingData  = null;
  let progressInterval = null;

  // ─── Utilities ───────────────────────────────────────────────
  function msToTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = String(totalSec % 60).padStart(2, '0');
    return `${min}:${sec}`;
  }

  async function apiFetch(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (res.status === 401) throw { code: 'unauthenticated' };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // ─── Show/hide states ─────────────────────────────────────────
  function showPlayer() {
    authSection.style.display = 'none';
    playerSection.style.display = 'flex';
  }

  function showAuth() {
    authSection.style.display = 'flex';
    playerSection.style.display = 'none';
  }

  // ─── Check auth status ────────────────────────────────────────
  async function checkAuthStatus() {
    try {
      const data = await apiFetch('/auth/status');
      if (data.connected) {
        showPlayer();
        initPlayer();
      } else {
        showAuth();
      }
    } catch {
      showAuth();
    }
  }

  // ─── Track list renderer ──────────────────────────────────────
  function renderTrackList(container, tracks) {
    if (!container) return;
    container.innerHTML = '';

    if (!tracks || tracks.length === 0) {
      container.innerHTML = '<li class="track-item" style="justify-content:center;color:var(--text-3);font-size:13px">Nothing here yet</li>';
      return;
    }

    tracks.forEach(track => {
      const li = document.createElement('li');
      li.className = 'track-item';
      li.innerHTML = `
        <span class="track-num">${track.rank}</span>
        <div class="track-art">
          ${track.image ? `<img src="${track.image}" alt="${escHtml(track.name)}" loading="lazy"/>` : ''}
        </div>
        <div class="track-info">
          <div class="track-name">${track.url
            ? `<a href="${track.url}" target="_blank" rel="noopener" style="color:inherit">${escHtml(track.name)}</a>`
            : escHtml(track.name)}</div>
          <div class="track-artist">${escHtml(track.artist)}</div>
        </div>
      `;
      container.appendChild(li);
    });
  }

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── Now Playing ─────────────────────────────────────────────
  function updateNowPlaying(data) {
    nowPlayingData = data;
    clearInterval(progressInterval);

    if (!data || !data.playing) {
      npStatusText.textContent   = data?.playing === false && data?.name ? 'Paused' : 'Not Playing';
      npEq?.classList.add('paused');
    } else {
      npStatusText.textContent = 'Now Playing';
      npEq?.classList.remove('paused');
    }

    if (data && data.name) {
      npTrack.textContent  = data.name;
      npArtist.textContent = data.artist;
      npAlbum.textContent  = data.album;
      npDuration.textContent = msToTime(data.duration);

      // Artwork
      const artEl = npArtwork.querySelector('img, .np-artwork-placeholder');
      if (data.image) {
        if (artEl && artEl.tagName === 'IMG') {
          artEl.src = data.image;
        } else {
          if (artEl) artEl.remove();
          const img = document.createElement('img');
          img.src = data.image;
          img.alt = data.name;
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;position:absolute;inset:0;';
          npArtwork.insertBefore(img, npArtwork.firstChild);
        }
      }

      // Progress
      let elapsed = data.progress || 0;
      const duration = data.duration || 1;

      function tick() {
        const pct = Math.min((elapsed / duration) * 100, 100);
        npProgressBar.style.width = pct + '%';
        npElapsed.textContent = msToTime(elapsed);
        if (data.playing) elapsed = Math.min(elapsed + 1000, duration);
      }

      tick();
      if (data.playing) progressInterval = setInterval(tick, 1000);
    }
  }

  async function fetchNowPlaying() {
    try {
      const data = await apiFetch('/api/now-playing');
      updateNowPlaying(data);
    } catch (err) {
      if (err.code === 'unauthenticated') showAuth();
    }
  }

  // ─── Top Tracks ─────────────────────────────────────────────
  async function fetchTopTracks(range) {
    if (!topTracksList) return;
    topTracksList.innerHTML = renderSkeletons(5);
    try {
      const tracks = await apiFetch(`/api/top-tracks?range=${range}`);
      renderTrackList(topTracksList, tracks);
    } catch (err) {
      if (err.code === 'unauthenticated') showAuth();
      else topTracksList.innerHTML = '<li class="track-item" style="color:var(--text-3);font-size:13px">Could not load tracks.</li>';
    }
  }

  // ─── Recent Tracks ───────────────────────────────────────────
  async function fetchRecentTracks() {
    if (!recentTracksList) return;
    recentTracksList.innerHTML = renderSkeletons(5);
    try {
      const tracks = await apiFetch('/api/recent-tracks');
      renderTrackList(recentTracksList, tracks);
    } catch (err) {
      if (err.code === 'unauthenticated') showAuth();
      else recentTracksList.innerHTML = '<li class="track-item" style="color:var(--text-3);font-size:13px">Could not load tracks.</li>';
    }
  }

  function renderSkeletons(n) {
    return Array.from({ length: n }, () => `
      <li class="track-item skeleton">
        <div class="track-num"></div>
        <div class="track-art"></div>
        <div class="track-info">
          <div class="track-name"></div>
          <div class="track-artist"></div>
        </div>
      </li>
    `).join('');
  }

  // ─── Initialise player ────────────────────────────────────────
  function initPlayer() {
    fetchNowPlaying();
    fetchTopTracks(currentRange);
    fetchRecentTracks();

    // Poll now-playing every 30 s
    setInterval(fetchNowPlaying, 30_000);

    // Refresh button
    npRefreshBtn?.addEventListener('click', () => {
      npRefreshBtn.style.transform = 'rotate(-360deg)';
      fetchNowPlaying();
      setTimeout(() => { npRefreshBtn.style.transform = ''; }, 500);
    });

    // Time-range filter
    topTracksFilter?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tf-btn');
      if (!btn) return;
      topTracksFilter.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('tf-btn--active'));
      btn.classList.add('tf-btn--active');
      currentRange = btn.dataset.range;
      fetchTopTracks(currentRange);
    });
  }

  // ─── Handle callback redirect (#music?error=…) ────────────────
  function handleHashParams() {
    const hash = window.location.hash;
    if (hash.includes('?error=')) {
      const error = new URLSearchParams(hash.split('?')[1]).get('error');
      if (error) {
        const msg = {
          access_denied: 'Spotify access was denied.',
          state_mismatch: 'Security check failed. Please try again.',
          token_exchange_failed: 'Could not get Spotify token. Check server config.',
        }[error] || `Spotify error: ${error}`;
        const notice = document.createElement('p');
        notice.style.cssText = 'color:#f87171;font-size:13px;margin-top:8px;';
        notice.textContent = msg;
        document.getElementById('spotify-auth')?.appendChild(notice);
      }
      // Clean up URL
      history.replaceState(null, '', window.location.pathname + '#music');
    }
  }

  // ─── Boot ────────────────────────────────────────────────────
  handleHashParams();
  checkAuthStatus();

})();
