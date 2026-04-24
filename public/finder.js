/* ─────────────────────────────────────────────────────────────────
   nrriandika — Song Finder
   Smart search via Spotify based on mood, genre, era, keyword.
───────────────────────────────────────────────────────────────── */

(function Finder() {
  // ─── DOM refs ────────────────────────────────────────────────
  const wrapper     = document.getElementById('finder-wrapper');
  const keywordIn   = document.getElementById('finder-keyword');
  const submitBtn   = document.getElementById('finder-submit');
  const clearBtn    = document.getElementById('finder-clear');
  const resultsEl   = document.getElementById('finder-results');

  if (!wrapper || !submitBtn) return;

  // ─── State ───────────────────────────────────────────────────
  const selected = { mood: null, genre: null, era: null };
  let currentAudio = null;
  let currentPlayingBtn = null;

  // ─── Chip toggle (mood / genre / era) ────────────────────────
  wrapper.querySelectorAll('.finder-chips').forEach(group => {
    const key = group.dataset.finder;
    group.addEventListener('click', (e) => {
      const chip = e.target.closest('.finder-chip');
      if (!chip) return;

      const isActive = chip.classList.contains('finder-chip--active');
      group.querySelectorAll('.finder-chip').forEach(c => c.classList.remove('finder-chip--active'));

      if (!isActive) {
        chip.classList.add('finder-chip--active');
        selected[key] = chip.dataset.value;
      } else {
        selected[key] = null;
      }
    });
  });

  // ─── Reset ───────────────────────────────────────────────────
  clearBtn?.addEventListener('click', () => {
    Object.keys(selected).forEach(k => selected[k] = null);
    wrapper.querySelectorAll('.finder-chip').forEach(c => c.classList.remove('finder-chip--active'));
    keywordIn.value = '';
    resultsEl.innerHTML = '';
    stopPreview();
  });

  // ─── Utilities ───────────────────────────────────────────────
  function esc(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function msToTime(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  }

  function stopPreview() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    if (currentPlayingBtn) {
      currentPlayingBtn.classList.remove('playing');
      currentPlayingBtn = null;
    }
  }

  // ─── Render ──────────────────────────────────────────────────
  function renderLoading() {
    resultsEl.innerHTML = `
      <div class="finder-loading">
        <div class="finder-spinner"></div>
        <span>Searching the cosmos...</span>
      </div>
    `;
  }

  function renderError(msg) {
    resultsEl.innerHTML = `<div class="finder-error">${esc(msg)}</div>`;
  }

  function renderResults(tracks, query) {
    if (!tracks || tracks.length === 0) {
      resultsEl.innerHTML = `
        <div class="finder-empty">
          <span class="finder-empty-icon">🔭</span>
          <p>No matches. Try different parameters.</p>
        </div>
      `;
      return;
    }

    resultsEl.innerHTML = `
      <div class="finder-results-header">
        <span class="finder-results-count">${tracks.length} tracks found</span>
        <span class="finder-results-query">${esc(query)}</span>
      </div>
      <div class="finder-grid">
        ${tracks.map((t, i) => `
          <article class="finder-card" style="animation-delay:${Math.min(i * 0.04, 0.4)}s">
            <div class="finder-card-art">
              ${t.image ? `<img src="${t.image}" alt="${esc(t.name)}" loading="lazy"/>` : ''}
              ${t.preview ? `
                <button class="finder-play" data-preview="${t.preview}" title="Preview 30s">
                  <svg class="finder-play-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M4 3l10 5-10 5z"/></svg>
                  <svg class="finder-pause-icon" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="3" height="10" rx="1"/><rect x="9" y="3" width="3" height="10" rx="1"/></svg>
                </button>
              ` : ''}
            </div>
            <div class="finder-card-body">
              <div class="finder-card-name" title="${esc(t.name)}">${esc(t.name)}</div>
              <div class="finder-card-artist" title="${esc(t.artist)}">${esc(t.artist)}</div>
              <div class="finder-card-footer">
                <span class="finder-card-duration">${msToTime(t.duration)}</span>
                ${t.url ? `<a href="${t.url}" target="_blank" rel="noopener" class="finder-open-link" title="Open in Spotify">
                  <svg viewBox="0 0 16 16" fill="none" width="12"><path d="M6 10L13 3M13 3H9M13 3v4M13 8v4a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </a>` : ''}
              </div>
            </div>
          </article>
        `).join('')}
      </div>
    `;

    bindPlayButtons();
  }

  // ─── Preview playback ────────────────────────────────────────
  function bindPlayButtons() {
    resultsEl.querySelectorAll('.finder-play').forEach(btn => {
      btn.addEventListener('click', () => {
        const previewUrl = btn.dataset.preview;
        if (!previewUrl) return;

        // Toggle if same button
        if (currentPlayingBtn === btn) {
          stopPreview();
          return;
        }

        stopPreview();

        currentAudio = new Audio(previewUrl);
        currentAudio.volume = 0.7;
        currentAudio.play().catch(() => { /* silent */ });
        currentAudio.addEventListener('ended', stopPreview);

        btn.classList.add('playing');
        currentPlayingBtn = btn;
      });
    });
  }

  // ─── Submit ──────────────────────────────────────────────────
  async function findSongs() {
    const keyword = keywordIn.value.trim();
    const params = new URLSearchParams();
    if (selected.mood)  params.set('mood', selected.mood);
    if (selected.genre) params.set('genre', selected.genre);
    if (selected.era)   params.set('era', selected.era);
    if (keyword)        params.set('keyword', keyword);

    if ([...params].length === 0) {
      renderError('Please pick at least one parameter (mood, genre, era, or keyword).');
      return;
    }

    stopPreview();
    renderLoading();
    submitBtn.disabled = true;

    try {
      const res = await fetch(`/api/find-songs?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.error === 'owner_not_connected') {
          renderError('Song finder is temporarily unavailable.');
        } else {
          renderError('Search failed. Please try again.');
        }
        return;
      }

      const data = await res.json();
      renderResults(data.tracks, data.query);
    } catch {
      renderError('Network error. Please try again.');
    } finally {
      submitBtn.disabled = false;
    }
  }

  submitBtn.addEventListener('click', findSongs);
  keywordIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') findSongs();
  });

})();
