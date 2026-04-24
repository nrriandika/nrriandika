/* ─────────────────────────────────────────────────────────────────
   nrriandika — AI Song Finder
   Single natural-language prompt → Claude Haiku → Spotify.
───────────────────────────────────────────────────────────────── */

(function Finder() {
  // ─── DOM refs ────────────────────────────────────────────────
  const wrapper     = document.getElementById('finder-wrapper');
  const promptIn    = document.getElementById('finder-prompt');
  const counterEl   = document.getElementById('finder-counter-num');
  const submitBtn   = document.getElementById('finder-submit');
  const clearBtn    = document.getElementById('finder-clear');
  const resultsEl   = document.getElementById('finder-results');
  const quickstart  = document.getElementById('finder-quickstart');
  const deepToggle  = document.getElementById('finder-deep');

  if (!wrapper || !promptIn || !submitBtn) return;

  // ─── State ───────────────────────────────────────────────────
  let currentAudio = null;
  let currentPlayingBtn = null;

  // ─── Rotating placeholder (typewriter) ───────────────────────
  const placeholders = [
    'lagu buat nangis di hujan...',
    'music for late night coding...',
    '80s synthwave for night drive...',
    'chill indie buat coffee shop...',
    'epic orchestral buat main genshin...',
    'sad k-pop ballads from 2010s...',
    'nostalgic Indonesian 2000s pop...',
    'ambient tracks for meditation...',
    'heartbreak anthems that hit hard...',
    'upbeat J-pop for morning run...',
  ];

  let phIndex = 0, charIdx = 0, isDeleting = false, phTimer = null;

  function typePlaceholder() {
    if (document.activeElement === promptIn || promptIn.value) {
      // User interacting → pause
      phTimer = setTimeout(typePlaceholder, 1500);
      return;
    }
    const full = placeholders[phIndex];
    const shown = isDeleting ? full.slice(0, charIdx--) : full.slice(0, charIdx++);
    promptIn.setAttribute('placeholder', shown);

    if (!isDeleting && charIdx === full.length + 1) {
      isDeleting = true;
      phTimer = setTimeout(typePlaceholder, 1800); // pause at end
    } else if (isDeleting && charIdx < 0) {
      isDeleting = false;
      charIdx = 0;
      phIndex = (phIndex + 1) % placeholders.length;
      phTimer = setTimeout(typePlaceholder, 400);
    } else {
      phTimer = setTimeout(typePlaceholder, isDeleting ? 25 : 55);
    }
  }
  typePlaceholder();

  // ─── Quick starter chips ─────────────────────────────────────
  quickstart?.addEventListener('click', (e) => {
    const chip = e.target.closest('.finder-qs-chip');
    if (!chip) return;
    promptIn.value = chip.dataset.prompt;
    updateCounter();
    promptIn.focus();
    // brief highlight
    chip.classList.add('finder-qs-chip--pulse');
    setTimeout(() => chip.classList.remove('finder-qs-chip--pulse'), 400);
  });

  // ─── Character counter ───────────────────────────────────────
  function updateCounter() {
    const len = promptIn.value.length;
    if (counterEl) counterEl.textContent = len;
    const wrap = counterEl?.parentElement;
    if (wrap) {
      wrap.classList.toggle('finder-counter--warn', len > 130);
      wrap.classList.toggle('finder-counter--max',  len >= 150);
    }
  }
  promptIn.addEventListener('input', updateCounter);
  updateCounter();

  // ─── Clear ───────────────────────────────────────────────────
  clearBtn?.addEventListener('click', () => {
    promptIn.value = '';
    resultsEl.innerHTML = '';
    stopPreview();
    updateCounter();
    promptIn.focus();
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
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    if (currentPlayingBtn) { currentPlayingBtn.classList.remove('playing'); currentPlayingBtn = null; }
  }

  // ─── Renderers ───────────────────────────────────────────────
  function renderLoading(userPrompt, deep) {
    const title = deep ? 'Deep curating with Sonnet...' : 'Curating tracks for you';
    resultsEl.innerHTML = `
      <div class="finder-loading">
        <div class="finder-spinner ${deep ? 'finder-spinner--deep' : ''}"></div>
        <div class="finder-loading-text">
          <span class="finder-loading-title">${deep ? '⚡ ' : ''}${title}</span>
          <span class="finder-loading-sub">"${esc(userPrompt)}"</span>
        </div>
      </div>
    `;
  }

  function renderError(msg) {
    resultsEl.innerHTML = `<div class="finder-error">${esc(msg)}</div>`;
  }

  function renderRateLimit(err) {
    resultsEl.innerHTML = `
      <div class="finder-ratelimit">
        <span class="finder-ratelimit-icon">⏳</span>
        <div>
          <div class="finder-ratelimit-title">Daily limit reached</div>
          <div class="finder-ratelimit-desc">You've used all ${err.limit || 10} searches today. Even our AI needs a coffee break ☕ — come back tomorrow!</div>
        </div>
      </div>
    `;
  }

  function renderResults(tracks, query, rateLimit, deep) {
    if (!tracks || tracks.length === 0) {
      resultsEl.innerHTML = `
        <div class="finder-empty">
          <span class="finder-empty-icon">🔭</span>
          <p>No matches. Try rephrasing or be more specific.</p>
        </div>
      `;
      return;
    }

    const rlBadge = rateLimit
      ? `<span class="finder-ratelimit-badge" title="Searches used today">${rateLimit.used}/${rateLimit.limit}</span>`
      : '';

    const deepBadge = deep
      ? `<span class="finder-deep-badge-result" title="Curated by Claude Sonnet">⚡ Deep</span>`
      : '';

    resultsEl.innerHTML = `
      <div class="finder-results-header">
        <span class="finder-results-count">${tracks.length} tracks ${deepBadge} ${rlBadge}</span>
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
        const url = btn.dataset.preview;
        if (!url) return;
        if (currentPlayingBtn === btn) { stopPreview(); return; }
        stopPreview();
        currentAudio = new Audio(url);
        currentAudio.volume = 0.7;
        currentAudio.play().catch(() => {});
        currentAudio.addEventListener('ended', stopPreview);
        btn.classList.add('playing');
        currentPlayingBtn = btn;
      });
    });
  }

  // ─── Submit ──────────────────────────────────────────────────
  async function findSongs() {
    const prompt = promptIn.value.trim();

    if (!prompt) {
      promptIn.focus();
      promptIn.classList.add('finder-prompt--shake');
      setTimeout(() => promptIn.classList.remove('finder-prompt--shake'), 500);
      return;
    }

    const deep = !!deepToggle?.checked;

    stopPreview();
    renderLoading(prompt, deep);
    submitBtn.disabled = true;
    submitBtn.classList.add('finder-submit--loading');

    try {
      const params = new URLSearchParams({ keyword: prompt });
      if (deep) params.set('deep', 'true');
      const res = await fetch(`/api/find-songs?${params.toString()}`);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.error === 'rate_limit_exceeded') renderRateLimit(err);
        else if (err.error === 'owner_not_connected') renderError('Song finder is temporarily unavailable.');
        else if (err.error === 'ai_failed') renderError(err.message || 'AI failed. Try rephrasing.');
        else renderError(err.message || 'Search failed. Please try again.');
        return;
      }

      const data = await res.json();
      renderResults(data.tracks, data.query, data.rateLimit, data.deep);
    } catch {
      renderError('Network error. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('finder-submit--loading');
    }
  }

  submitBtn.addEventListener('click', findSongs);

  promptIn.addEventListener('keydown', (e) => {
    // Enter submits, Shift+Enter allows newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      findSongs();
    }
  });

})();
