/* ─────────────────────────────────────────────────────────────────
   nrriandika — Book Hunter
   Display Shopee book deals (50%+ discount) from cached scrape.
───────────────────────────────────────────────────────────────── */

(function BookHunter() {
  const grid       = document.getElementById('bh-grid');
  const emptyEl    = document.getElementById('bh-empty');
  const emptyMsg   = document.getElementById('bh-empty-msg');
  const totalEl    = document.getElementById('bh-total');
  const lastRefEl  = document.getElementById('bh-last-refresh');
  const searchIn   = document.getElementById('bh-search-input');
  const sortEl     = document.getElementById('bh-sort');
  const yearEl     = document.getElementById('footer-year');
  const nav        = document.getElementById('nav');

  let allBooks = [];
  let sortBy = 'discount';
  let searchQuery = '';

  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Nav scroll effect
  window.addEventListener('scroll', () => {
    nav?.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });
  nav?.classList.toggle('scrolled', window.scrollY > 40);

  // ─── Utilities ────────────────────────────────────────────────
  function esc(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function formatRupiah(n) {
    if (!n && n !== 0) return '-';
    return 'Rp' + Math.round(n).toLocaleString('id-ID');
  }

  function formatSold(n) {
    if (!n) return '0';
    if (n < 1000) return String(n);
    if (n < 1_000_000) return (n / 1000).toFixed(n < 10000 ? 1 : 0).replace('.0', '') + 'rb';
    return (n / 1_000_000).toFixed(1).replace('.0', '') + 'jt';
  }

  function timeAgo(dateStr) {
    if (!dateStr) return 'never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1) return 'baru saja';
    if (m < 60) return `${m} menit lalu`;
    if (h < 24) return `${h} jam lalu`;
    if (d < 30) return `${d} hari lalu`;
    return new Date(dateStr).toLocaleDateString('id-ID');
  }

  // ─── Render ───────────────────────────────────────────────────
  function render() {
    const q = searchQuery.toLowerCase().trim();

    let visible = allBooks.filter(b => !q || (b.name || '').toLowerCase().includes(q));

    if (sortBy === 'discount') {
      visible.sort((a, b) => (b.discount_percent || 0) - (a.discount_percent || 0));
    } else if (sortBy === 'sold') {
      visible.sort((a, b) => (b.sold || 0) - (a.sold || 0));
    } else if (sortBy === 'price-asc') {
      visible.sort((a, b) => (a.price || 0) - (b.price || 0));
    }

    if (visible.length === 0) {
      grid.innerHTML = '';
      emptyEl.style.display = 'block';
      emptyMsg.textContent = q
        ? `Tidak ada hasil untuk "${q}".`
        : (allBooks.length === 0 ? 'Belum ada data. Tunggu cron pertama jalan.' : '');
      return;
    }

    emptyEl.style.display = 'none';

    grid.innerHTML = visible.map((b, i) => `
      <a href="${esc(b.product_url)}" target="_blank" rel="noopener" class="bh-card" style="animation-delay:${Math.min(i * 0.02, 0.3)}s">
        <div class="bh-card-image">
          ${b.image_url ? `<img src="${esc(b.image_url)}" alt="${esc(b.name)}" loading="lazy" onerror="this.style.display='none'"/>` : '<span class="bh-card-image-fallback">📚</span>'}
          <div class="bh-card-discount">-${b.discount_percent}%</div>
        </div>
        <div class="bh-card-body">
          <h4 class="bh-card-name" title="${esc(b.name)}">${esc(b.name)}</h4>
          <div class="bh-card-prices">
            <span class="bh-card-price">${formatRupiah(b.price)}</span>
            ${b.original_price && b.original_price > b.price
              ? `<span class="bh-card-original">${formatRupiah(b.original_price)}</span>`
              : ''}
          </div>
          <div class="bh-card-meta">
            ${b.rating ? `<span class="bh-card-rating">⭐ ${b.rating.toFixed(1)}</span>` : ''}
            <span class="bh-card-sold">${formatSold(b.sold)} terjual</span>
          </div>
          ${b.shop_location ? `<div class="bh-card-shop">📍 ${esc(b.shop_location)}</div>` : ''}
        </div>
      </a>
    `).join('');
  }

  // ─── Sort buttons ─────────────────────────────────────────────
  sortEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('.bh-sort-btn');
    if (!btn) return;
    sortEl.querySelectorAll('.bh-sort-btn').forEach(b => b.classList.remove('bh-sort-btn--active'));
    btn.classList.add('bh-sort-btn--active');
    sortBy = btn.dataset.sort;
    render();
  });

  // ─── Search ───────────────────────────────────────────────────
  searchIn?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    render();
  });

  // ─── Fetch data ───────────────────────────────────────────────
  async function loadBooks() {
    try {
      const res = await fetch('/api/book-hunter');
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();

      allBooks = data.books || [];
      totalEl.textContent = allBooks.length;
      lastRefEl.textContent = data.lastRun?.ran_at ? timeAgo(data.lastRun.ran_at) : 'never';

      render();
    } catch (err) {
      grid.innerHTML = '';
      emptyEl.style.display = 'block';
      emptyMsg.textContent = 'Gagal memuat data. Coba refresh.';
    }
  }

  loadBooks();
})();
