/* ─────────────────────────────────────────────────────────────────
   nrriandika — AI Book Recommender
   Natural-language prompt → Claude/Gemini → Google Books enrichment.
───────────────────────────────────────────────────────────────── */

(function BookRecommender() {
  // ─── DOM refs ────────────────────────────────────────────────
  const promptIn   = document.getElementById('br-prompt');
  const counterEl  = document.getElementById('br-counter-num');
  const submitBtn  = document.getElementById('br-submit');
  const clearBtn   = document.getElementById('br-clear');
  const resultsEl  = document.getElementById('br-results');
  const quickstart = document.getElementById('br-quickstart');
  const deepToggle = document.getElementById('br-deep');
  const yearEl     = document.getElementById('footer-year');
  const nav        = document.getElementById('nav');

  if (!promptIn || !submitBtn) return;
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Nav scroll
  window.addEventListener('scroll', () => {
    nav?.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });
  nav?.classList.toggle('scrolled', window.scrollY > 40);

  // ─── Typewriter placeholder ──────────────────────────────────
  const placeholders = [
    'novel sci-fi klasik buat pemula...',
    'buku habit yang berbasis sains...',
    'romance Indonesia 2020an...',
    'memoir yang mengubah cara pandang...',
    'thriller dengan plot twist...',
    'self-help non-toxic positivity...',
    'fiction historical 1900-an...',
    'short stories untuk weekend...',
  ];

  let phIndex = 0, charIdx = 0, isDeleting = false;

  function typePlaceholder() {
    if (document.activeElement === promptIn || promptIn.value) {
      setTimeout(typePlaceholder, 1500);
      return;
    }
    const full = placeholders[phIndex];
    const shown = isDeleting ? full.slice(0, charIdx--) : full.slice(0, charIdx++);
    promptIn.setAttribute('placeholder', shown);

    if (!isDeleting && charIdx === full.length + 1) {
      isDeleting = true;
      setTimeout(typePlaceholder, 1800);
    } else if (isDeleting && charIdx < 0) {
      isDeleting = false;
      charIdx = 0;
      phIndex = (phIndex + 1) % placeholders.length;
      setTimeout(typePlaceholder, 400);
    } else {
      setTimeout(typePlaceholder, isDeleting ? 25 : 55);
    }
  }
  typePlaceholder();

  // ─── Counter ─────────────────────────────────────────────────
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

  // ─── Quick starters ──────────────────────────────────────────
  quickstart?.addEventListener('click', (e) => {
    const chip = e.target.closest('.finder-qs-chip');
    if (!chip) return;
    promptIn.value = chip.dataset.prompt;
    updateCounter();
    promptIn.focus();
    chip.classList.add('finder-qs-chip--pulse');
    setTimeout(() => chip.classList.remove('finder-qs-chip--pulse'), 400);
  });

  // ─── Clear ───────────────────────────────────────────────────
  clearBtn?.addEventListener('click', () => {
    promptIn.value = '';
    resultsEl.innerHTML = '';
    updateCounter();
    promptIn.focus();
  });

  // ─── Utilities ───────────────────────────────────────────────
  function esc(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── Renderers ───────────────────────────────────────────────
  function renderLoading(userPrompt, deep) {
    const title = deep ? 'Deep researching with Gemini...' : 'Finding the perfect books...';
    resultsEl.innerHTML = `
      <div class="finder-loading">
        <div class="finder-spinner ${deep ? 'finder-spinner--deep' : ''}"></div>
        <div class="finder-loading-text">
          <span class="finder-loading-title">${deep ? '⚡ ' : ''}${esc(title)}</span>
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
        <span class="finder-ratelimit-icon">📚</span>
        <div>
          <div class="finder-ratelimit-title">Daily limit reached</div>
          <div class="finder-ratelimit-desc">You've used all ${err.limit || 10} searches today. Even AI bookworms need rest. Come back tomorrow!</div>
        </div>
      </div>
    `;
  }

  function renderResults(books, query, rateLimit, deep) {
    if (!books || books.length === 0) {
      resultsEl.innerHTML = `
        <div class="finder-empty">
          <span class="finder-empty-icon">📭</span>
          <p>No books matched. Try rephrasing or be more specific.</p>
        </div>
      `;
      return;
    }

    const rlBadge = rateLimit
      ? `<span class="finder-ratelimit-badge" title="Searches used today">${rateLimit.used}/${rateLimit.limit}</span>`
      : '';
    const deepBadge = deep
      ? `<span class="finder-deep-badge-result" title="Curated by Gemini with web grounding">⚡ Deep</span>`
      : '';

    resultsEl.innerHTML = `
      <div class="finder-results-header">
        <span class="finder-results-count">${books.length} books ${deepBadge} ${rlBadge}</span>
        <span class="finder-results-query">${esc(query)}</span>
      </div>
      <div class="br-grid">
        ${books.map((b, i) => {
          const authors = (b.authors || []).join(', ');
          const stars = b.rating ? '★'.repeat(Math.round(b.rating)) + '☆'.repeat(5 - Math.round(b.rating)) : '';
          return `
            <article class="br-card" style="animation-delay:${Math.min(i * 0.04, 0.4)}s">
              <a href="${esc(b.infoLink || '#')}" target="_blank" rel="noopener" class="br-card-cover">
                ${b.image
                  ? `<img src="${esc(b.image)}" alt="${esc(b.title)}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('br-card-cover--fallback')"/>`
                  : ''}
                <span class="br-card-cover-fallback-icon">📖</span>
                ${b.fallback ? '<span class="br-card-fallback-tag">No cover</span>' : ''}
              </a>
              <div class="br-card-body">
                <h4 class="br-card-title" title="${esc(b.title)}">${esc(b.title)}</h4>
                <div class="br-card-author">${esc(authors)}</div>
                ${b.description ? `<p class="br-card-desc">${esc(b.description)}…</p>` : ''}
                <div class="br-card-meta">
                  ${b.rating
                    ? `<span class="br-card-rating" title="${b.rating}/5 (${b.ratingsCount} ratings)">
                        <span class="br-stars">${stars}</span> ${b.rating.toFixed(1)}
                      </span>`
                    : '<span class="br-card-no-rating">No rating</span>'}
                  ${b.pageCount ? `<span class="br-card-pages">${b.pageCount}p</span>` : ''}
                </div>
                ${b.categories && b.categories.length > 0
                  ? `<div class="br-card-tags">${b.categories.slice(0, 2).map(c => `<span class="br-tag">${esc(c)}</span>`).join('')}</div>`
                  : ''}
                <a href="${esc(b.infoLink || '#')}" target="_blank" rel="noopener" class="br-card-link">
                  ${b.fallback ? 'Search on Google' : 'View on Google Books'}
                  <svg viewBox="0 0 16 16" fill="none" width="11"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                </a>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  // ─── Submit ──────────────────────────────────────────────────
  async function findBooks() {
    const prompt = promptIn.value.trim();

    if (!prompt) {
      promptIn.focus();
      promptIn.classList.add('finder-prompt--shake');
      setTimeout(() => promptIn.classList.remove('finder-prompt--shake'), 500);
      return;
    }

    const deep = !!deepToggle?.checked;

    renderLoading(prompt, deep);
    submitBtn.disabled = true;
    submitBtn.classList.add('finder-submit--loading');

    try {
      const params = new URLSearchParams({ keyword: prompt });
      if (deep) params.set('deep', 'true');
      const res = await fetch(`/api/recommend-books?${params.toString()}`);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.error === 'rate_limit_exceeded') renderRateLimit(err);
        else if (err.error === 'ai_failed') renderError(err.message || 'AI failed. Try rephrasing.');
        else renderError(err.message || 'Search failed. Please try again.');
        return;
      }

      const data = await res.json();
      renderResults(data.books, data.query, data.rateLimit, data.deep);
    } catch {
      renderError('Network error. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('finder-submit--loading');
    }
  }

  submitBtn.addEventListener('click', findBooks);
  promptIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      findBooks();
    }
  });
})();
