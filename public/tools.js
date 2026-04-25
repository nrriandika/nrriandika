/* ─────────────────────────────────────────────────────────────────
   nrriandika — Tools page
   Catalog of tools/APIs with search + category filter.
───────────────────────────────────────────────────────────────── */

(function ToolsPage() {
  // ─── Tools Data — edit/add tools here ─────────────────────────
  const TOOLS = [
    {
      id: 'book-hunter',
      name: 'Book Hunter',
      desc: 'Auto-curated list of books on Shopee with 50%+ discount. Refreshes twice daily — never miss a great deal again.',
      category: 'utility',
      tags: ['Scraper', 'Cron', 'Books'],
      icon: '📚',
      color1: '#f97316',
      color2: '#fbbf24',
      url: '/tools/book-hunter',
      status: 'live',
    },
  ];

  // ─── DOM refs ─────────────────────────────────────────────────
  const grid       = document.getElementById('tools-grid');
  const empty      = document.getElementById('tools-empty');
  const searchIn   = document.getElementById('tools-search-input');
  const filterEl   = document.getElementById('tools-filter');
  const totalEl    = document.getElementById('tools-count');
  const publicEl   = document.getElementById('tools-public-count');
  const catEl      = document.getElementById('tools-cat-count');
  const yearEl     = document.getElementById('footer-year');

  // ─── Utilities ────────────────────────────────────────────────
  function esc(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── State ────────────────────────────────────────────────────
  let activeFilter = 'all';
  let searchQuery = '';

  // ─── Render ───────────────────────────────────────────────────
  function render() {
    const q = searchQuery.toLowerCase().trim();

    const visible = TOOLS.filter(t => {
      const matchCat = activeFilter === 'all' || t.category === activeFilter;
      const matchSearch = !q ||
        t.name.toLowerCase().includes(q) ||
        t.desc.toLowerCase().includes(q) ||
        t.tags.some(tag => tag.toLowerCase().includes(q));
      return matchCat && matchSearch;
    });

    if (visible.length === 0) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    grid.innerHTML = visible.map((t, i) => `
      <article class="tool-card ${t.status === 'internal' ? 'tool-card--internal' : ''}" style="animation-delay:${Math.min(i * 0.05, 0.4)}s">
        <div class="tool-card-glow" style="--c1:${t.color1};--c2:${t.color2}"></div>
        <div class="tool-card-icon" style="background: linear-gradient(135deg, ${t.color1}, ${t.color2})">
          <span>${t.icon}</span>
        </div>
        <div class="tool-card-body">
          <div class="tool-card-head">
            <h3 class="tool-card-name">${esc(t.name)}</h3>
            <span class="tool-status tool-status--${t.status}">
              ${t.status === 'live' ? '<span class="tool-status-dot"></span> Live' : '<svg viewBox="0 0 16 16" fill="none" width="10"><path d="M4 7V5a4 4 0 118 0v2M3 7h10v7H3V7z" stroke="currentColor" stroke-width="1.4"/></svg> Internal'}
            </span>
          </div>
          <p class="tool-card-desc">${esc(t.desc)}</p>
          <div class="tool-card-tags">
            ${t.tags.map(tag => `<span class="tool-tag">${esc(tag)}</span>`).join('')}
          </div>
        </div>
        <div class="tool-card-action">
          ${t.url
            ? `<a href="${t.url}" class="tool-open-btn">
                Open <svg viewBox="0 0 16 16" fill="none" width="12"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
               </a>`
            : `<span class="tool-restricted">Restricted access</span>`}
        </div>
      </article>
    `).join('');
  }

  // ─── Filter buttons ───────────────────────────────────────────
  filterEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tools-filter-btn');
    if (!btn) return;
    filterEl.querySelectorAll('.tools-filter-btn').forEach(b => b.classList.remove('tools-filter-btn--active'));
    btn.classList.add('tools-filter-btn--active');
    activeFilter = btn.dataset.filter;
    render();
  });

  // ─── Search ───────────────────────────────────────────────────
  searchIn?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    render();
  });

  // ─── Stats ────────────────────────────────────────────────────
  function updateStats() {
    if (totalEl)  totalEl.textContent  = TOOLS.length;
    if (publicEl) publicEl.textContent = TOOLS.filter(t => t.status === 'live').length;
    if (catEl)    catEl.textContent    = new Set(TOOLS.map(t => t.category)).size;
  }

  // ─── Animated counter ─────────────────────────────────────────
  function animateCount(el, target) {
    if (!el) return;
    const duration = 800;
    const start = performance.now();
    const startVal = 0;
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(startVal + (target - startVal) * eased);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ─── Footer year ──────────────────────────────────────────────
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ─── Nav scroll effect ────────────────────────────────────────
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    nav?.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });
  nav?.classList.toggle('scrolled', window.scrollY > 40);

  // ─── Init ─────────────────────────────────────────────────────
  render();
  animateCount(totalEl, TOOLS.length);
  animateCount(publicEl, TOOLS.filter(t => t.status === 'live').length);
  animateCount(catEl, new Set(TOOLS.map(t => t.category)).size);
  updateStats();

})();
