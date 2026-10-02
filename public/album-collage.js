/* ─────────────────────────────────────────────────────────────────
   nrriandika — Album Collage
   Grid up to 5×5, click a tile to search (iTunes via /api/album-search),
   drag to reorder, export as PNG via canvas. State kept in localStorage.
───────────────────────────────────────────────────────────────── */

(function AlbumCollage() {
  const MAX = 5;
  const STORAGE_KEY = 'album-collage:v1';

  // ─── DOM refs ─────────────────────────────────────────────────
  const gridEl     = document.getElementById('ac-grid');
  const titleEl    = document.getElementById('ac-title');
  const presetsEl  = document.getElementById('ac-presets');
  const colsSel    = document.getElementById('ac-cols');
  const rowsSel    = document.getElementById('ac-rows');
  const showCapsEl = document.getElementById('ac-show-captions');
  const nameEl     = document.getElementById('ac-name');
  const subtitleEl = document.getElementById('ac-subtitle');
  const clearBtn   = document.getElementById('ac-clear');
  const dlBtn      = document.getElementById('ac-download');
  const modal      = document.getElementById('ac-modal');
  const modalSlot  = document.getElementById('ac-modal-slot');
  const searchIn   = document.getElementById('ac-search-input');
  const resultsEl  = document.getElementById('ac-results');
  const modalFoot  = document.getElementById('ac-modal-foot');
  const removeBtn  = document.getElementById('ac-remove');
  const yearEl     = document.getElementById('footer-year');

  // ─── Utilities ────────────────────────────────────────────────
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  const total = () => state.cols * state.rows;
  const defaultTitle = () => `My Top ${total()} Albums`;
  // "NAMA · 2026" kalau nama diisi, "2026" saja kalau kosong
  const subtitle = () => [state.name.trim(), new Date().getFullYear()].filter(Boolean).join('  ·  ');

  // ─── State ────────────────────────────────────────────────────
  const state = {
    cols: 3,
    rows: 3,
    title: '',            // empty = use default title
    name: '',             // optional, shown in subtitle
    showCaptions: true,
    albums: Array(MAX * MAX).fill(null),
  };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved) return;
      state.cols = clampSize(saved.cols);
      state.rows = clampSize(saved.rows);
      state.title = typeof saved.title === 'string' ? saved.title : '';
      state.name = typeof saved.name === 'string' ? saved.name : '';
      state.showCaptions = saved.showCaptions !== false;
      if (Array.isArray(saved.albums)) {
        state.albums = Array.from({ length: MAX * MAX }, (_, i) => saved.albums[i] || null);
      }
    } catch (_) { /* storage unavailable — start fresh */ }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function clampSize(n) {
    n = parseInt(n, 10);
    return Number.isFinite(n) ? Math.min(MAX, Math.max(1, n)) : 3;
  }

  // ─── Render ───────────────────────────────────────────────────
  function render() {
    const n = total();
    gridEl.style.setProperty('--cols', state.cols);

    gridEl.classList.toggle('ac-grid--captions', state.showCaptions);
    gridEl.innerHTML = Array.from({ length: n }, (_, i) => {
      const a = state.albums[i];
      const label = a ? `${i + 1}. ${a.artist} — ${a.title}` : `Kotak ${i + 1}: pilih album`;
      return `
        <div class="ac-item">
          <button type="button" class="ac-cell ${a ? 'ac-cell--filled' : ''}" data-i="${i}"
                  draggable="${a ? 'true' : 'false'}" title="${esc(label)}" aria-label="${esc(label)}">
            ${a ? `<img src="${esc(a.cover)}" alt="" crossorigin="anonymous" loading="lazy" />`
                : '<span class="ac-cell-plus">+</span>'}
            <span class="ac-cell-num">${i + 1}</span>
          </button>
          <div class="ac-caption" aria-hidden="true">
            <span class="ac-caption-artist">${a ? esc(a.artist) : '&nbsp;'}</span>
            <span class="ac-caption-title">${a ? esc(a.title) : '&nbsp;'}</span>
          </div>
        </div>`;
    }).join('');

    if (document.activeElement !== titleEl) titleEl.value = state.title || defaultTitle();
    titleEl.placeholder = defaultTitle();

    colsSel.value = state.cols;
    rowsSel.value = state.rows;
    presetsEl.querySelectorAll('.ac-preset').forEach(b => {
      const s = +b.dataset.size;
      b.classList.toggle('ac-preset--active', s === state.cols && s === state.rows);
    });
    showCapsEl.checked = state.showCaptions;
    if (document.activeElement !== nameEl) nameEl.value = state.name;
    subtitleEl.textContent = subtitle();
  }

  function setSize(cols, rows) {
    state.cols = clampSize(cols);
    state.rows = clampSize(rows);
    save();
    render();
  }

  // ─── Controls ─────────────────────────────────────────────────
  for (let i = 1; i <= MAX; i++) {
    colsSel.insertAdjacentHTML('beforeend', `<option value="${i}">${i} kolom</option>`);
    rowsSel.insertAdjacentHTML('beforeend', `<option value="${i}">${i} baris</option>`);
  }

  presetsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.ac-preset');
    if (btn) setSize(btn.dataset.size, btn.dataset.size);
  });
  colsSel.addEventListener('change', () => setSize(colsSel.value, state.rows));
  rowsSel.addEventListener('change', () => setSize(state.cols, rowsSel.value));

  showCapsEl.addEventListener('change', () => {
    state.showCaptions = showCapsEl.checked;
    save();
    render();
  });

  nameEl.addEventListener('input', () => {
    state.name = nameEl.value;
    subtitleEl.textContent = subtitle();
    save();
  });

  titleEl.addEventListener('input', () => {
    const v = titleEl.value.trim();
    state.title = v === defaultTitle() ? '' : v;
    save();
  });
  titleEl.addEventListener('blur', render);
  titleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') titleEl.blur(); });

  clearBtn.addEventListener('click', () => {
    if (!state.albums.slice(0, total()).some(Boolean)) return;
    if (!confirm('Kosongkan semua kotak di grid ini?')) return;
    for (let i = 0; i < total(); i++) state.albums[i] = null;
    save();
    render();
  });

  // ─── Drag & drop reorder (swap) ───────────────────────────────
  let dragFrom = null;

  gridEl.addEventListener('dragstart', (e) => {
    const cell = e.target.closest('.ac-cell');
    if (!cell) return;
    dragFrom = +cell.dataset.i;
    cell.classList.add('ac-cell--dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(dragFrom));
  });
  gridEl.addEventListener('dragover', (e) => {
    const cell = e.target.closest('.ac-cell');
    if (!cell || dragFrom === null) return;
    e.preventDefault();
    gridEl.querySelectorAll('.ac-cell--over').forEach(c => c !== cell && c.classList.remove('ac-cell--over'));
    if (+cell.dataset.i !== dragFrom) cell.classList.add('ac-cell--over');
  });
  gridEl.addEventListener('dragleave', (e) => {
    const cell = e.target.closest('.ac-cell');
    if (cell && !cell.contains(e.relatedTarget)) cell.classList.remove('ac-cell--over');
  });
  gridEl.addEventListener('drop', (e) => {
    const cell = e.target.closest('.ac-cell');
    if (!cell || dragFrom === null) return;
    e.preventDefault();
    const to = +cell.dataset.i;
    if (to !== dragFrom) {
      [state.albums[dragFrom], state.albums[to]] = [state.albums[to], state.albums[dragFrom]];
      save();
    }
    dragFrom = null;
    render();
  });
  gridEl.addEventListener('dragend', () => {
    dragFrom = null;
    gridEl.querySelectorAll('.ac-cell--dragging, .ac-cell--over')
      .forEach(c => c.classList.remove('ac-cell--dragging', 'ac-cell--over'));
  });

  // ─── Search modal ─────────────────────────────────────────────
  let activeSlot = null;
  let lastResults = [];
  let searchTimer = null;
  let searchCtrl = null;
  const cache = new Map();

  gridEl.addEventListener('click', (e) => {
    const cell = e.target.closest('.ac-cell');
    if (cell) openModal(+cell.dataset.i);
  });

  function openModal(i) {
    activeSlot = i;
    const current = state.albums[i];
    modalSlot.textContent = `#${i + 1}`;
    modalFoot.hidden = !current;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    searchIn.value = current ? `${current.artist} ${current.title}` : '';
    searchIn.select();
    searchIn.focus();
    if (searchIn.value) runSearch(searchIn.value);
    else showMsg('Ketik judul album atau nama artis.');
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    activeSlot = null;
    searchCtrl?.abort();
    clearTimeout(searchTimer);
  }

  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  removeBtn.addEventListener('click', () => {
    if (activeSlot === null) return;
    state.albums[activeSlot] = null;
    save();
    render();
    closeModal();
  });

  function showMsg(msg) {
    lastResults = [];
    resultsEl.innerHTML = `<p class="ac-results-msg">${esc(msg)}</p>`;
  }

  searchIn.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchIn.value.trim();
    if (q.length < 2) { showMsg('Ketik judul album atau nama artis.'); return; }
    searchTimer = setTimeout(() => runSearch(q), 350);
  });
  searchIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (lastResults.length) pick(0);
      else { clearTimeout(searchTimer); runSearch(searchIn.value.trim()); }
    }
  });

  async function runSearch(q) {
    q = q.trim();
    if (q.length < 2) return;
    const key = q.toLowerCase();
    if (cache.has(key)) return showResults(cache.get(key));

    searchCtrl?.abort();
    searchCtrl = new AbortController();
    resultsEl.innerHTML = '<p class="ac-results-msg">Mencari…</p>';
    try {
      // `v` membedakan URL dari respons lama (iTunes-only) yang masih ter-cache di browser
      const res = await fetch(`/api/album-search?v=2&q=${encodeURIComponent(q)}`, { signal: searchCtrl.signal });
      if (!res.ok) throw new Error(res.status);
      const albums = await res.json();
      cache.set(key, albums);
      if (searchIn.value.trim().toLowerCase() === key) showResults(albums);
    } catch (err) {
      if (err.name !== 'AbortError') showMsg('Pencarian gagal. Coba lagi sebentar.');
    }
  }

  function showResults(albums) {
    lastResults = albums;
    if (!albums.length) return showMsg('Album tidak ditemukan. Coba kata kunci lain.');
    resultsEl.innerHTML = albums.map((a, i) => `
      <button type="button" class="ac-result" data-r="${i}">
        <img src="${esc(a.thumb)}" alt="" loading="lazy" />
        <span class="ac-result-title">${esc(a.title)}</span>
        <span class="ac-result-meta">${esc(a.artist)}${a.year ? ' · ' + esc(a.year) : ''}</span>
      </button>`).join('');
  }

  resultsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.ac-result');
    if (btn) pick(+btn.dataset.r);
  });

  function pick(r) {
    const a = lastResults[r];
    if (!a || activeSlot === null) return;
    state.albums[activeSlot] = { id: a.id, title: a.title, artist: a.artist, year: a.year, cover: a.cover };
    save();
    render();
    closeModal();
  }

  // ─── Export PNG ───────────────────────────────────────────────
  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function fitText(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
    return text + '…';
  }

  async function download() {
    const n = total();
    const albums = state.albums.slice(0, n);
    dlBtn.disabled = true;
    const label = dlBtn.innerHTML;
    dlBtn.textContent = 'Menyiapkan…';

    try {
      await document.fonts?.ready;
      const images = await Promise.all(albums.map(a => (a ? loadImage(a.cover) : null)));

      const CELL = 300, GAP = 6, PAD = 56, HEADER_H = 190;
      const CAP_H = state.showCaptions ? 58 : 0;
      const gridW = state.cols * CELL + (state.cols - 1) * GAP;
      const gridH = state.rows * (CELL + CAP_H) + (state.rows - 1) * GAP;
      const W = Math.max(PAD * 2 + gridW, 760);
      const H = PAD + HEADER_H + gridH + 64;
      const gridX = (W - gridW) / 2;

      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');

      // Background + soft glow behind the title
      ctx.fillStyle = '#0b0b14';
      ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W / 2, PAD + 40, 0, W / 2, PAD + 40, W * 0.6);
      glow.addColorStop(0, 'rgba(124,99,255,0.28)');
      glow.addColorStop(0.5, 'rgba(34,211,238,0.06)');
      glow.addColorStop(1, 'rgba(11,11,20,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, PAD + HEADER_H + 120);

      // Title — centered, gradient fill, auto-shrinks to fit
      const title = titleEl.value.trim() || defaultTitle();
      let size = 72;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      do {
        ctx.font = `700 ${size}px "Space Grotesk", system-ui, sans-serif`;
      } while (ctx.measureText(title).width > W - PAD * 2 && --size > 32);
      const tw = Math.min(ctx.measureText(title).width, W - PAD * 2);
      const ty = PAD + 50;
      const tGrad = ctx.createLinearGradient(W / 2 - tw / 2, 0, W / 2 + tw / 2, 0);
      tGrad.addColorStop(0, '#a78bfa');
      tGrad.addColorStop(0.5, '#ffffff');
      tGrad.addColorStop(1, '#22d3ee');
      ctx.save();
      ctx.shadowColor = 'rgba(124,99,255,0.55)';
      ctx.shadowBlur = 28;
      ctx.fillStyle = tGrad;
      ctx.fillText(fitText(ctx, title, W - PAD * 2), W / 2, ty);
      ctx.restore();

      // Accent rule + subtitle
      const rGrad = ctx.createLinearGradient(W / 2 - 60, 0, W / 2 + 60, 0);
      rGrad.addColorStop(0, '#7c63ff');
      rGrad.addColorStop(1, '#22d3ee');
      ctx.fillStyle = rGrad;
      ctx.fillRect(W / 2 - 60, ty + size / 2 + 22, 120, 4);

      ctx.fillStyle = '#9292a8';
      ctx.font = '500 16px "Space Grotesk", system-ui, sans-serif';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
      ctx.fillText(fitText(ctx, subtitle().toUpperCase(), W - PAD * 2), W / 2, ty + size / 2 + 56);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

      // Covers + captions
      const top = PAD + HEADER_H;
      albums.forEach((a, i) => {
        const x = gridX + (i % state.cols) * (CELL + GAP);
        const y = top + Math.floor(i / state.cols) * (CELL + CAP_H + GAP);
        const img = images[i];
        if (img) {
          ctx.drawImage(img, x, y, CELL, CELL);
        } else {
          ctx.fillStyle = '#14141f';
          ctx.fillRect(x, y, CELL, CELL);
          if (a && !state.showCaptions) { // cover failed to load — show text instead
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#9292a8';
            ctx.font = '500 18px Inter, system-ui, sans-serif';
            ctx.fillText(fitText(ctx, a.artist, CELL - 24), x + 12, y + 12);
            ctx.fillText(fitText(ctx, a.title, CELL - 24), x + 12, y + 38);
          }
        }

        if (state.showCaptions && a) {
          const cx = x + CELL / 2;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = '#e8e8f4';
          ctx.font = '600 18px Inter, system-ui, sans-serif';
          ctx.fillText(fitText(ctx, a.artist, CELL - 12), cx, y + CELL + 9);
          ctx.fillStyle = '#9292a8';
          ctx.font = '400 16px Inter, system-ui, sans-serif';
          ctx.fillText(fitText(ctx, a.title, CELL - 12), cx, y + CELL + 32);
        }
      });

      ctx.fillStyle = '#5a5a70';
      ctx.font = '400 14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('nrriandika · album collage', W - PAD, H - 14);

      const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('export_failed');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `album-collage-${state.cols}x${state.rows}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error(err);
      alert('Gagal membuat gambar. Coba lagi.');
    } finally {
      dlBtn.disabled = false;
      dlBtn.innerHTML = label;
    }
  }

  dlBtn.addEventListener('click', download);

  // ─── Init ─────────────────────────────────────────────────────
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  load();
  render();
})();
