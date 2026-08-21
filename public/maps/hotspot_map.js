(function () {
  'use strict';

  // ─── Confidence config ───────────────────────────────────────────
  const CONF_META = {
    high:   { label: 'High',   color: '#DC2626', cls: 'high'   },
    medium: { label: 'Medium', color: '#F59E0B', cls: 'medium' },
    low:    { label: 'Low',    color: '#FACC15', cls: 'low'    },
    other:  { label: 'Lainnya',color: '#7A8BA0', cls: 'other'  },
  };
  const CONF_ORDER = ['high', 'medium', 'low', 'other'];

  // Periode relatif terhadap tanggal data terbaru (bukan hari ini)
  const PERIODS = [
    { key: 'all', label: 'Semua', days: null },
    { key: '1',   label: '1 hari', days: 1 },
    { key: '7',   label: '7 hari', days: 7 },
    { key: '30',  label: '30 hari', days: 30 },
  ];

  const SRC_COLORS = ['#38BDF8', '#A78BFA', '#34D399', '#FB7185', '#FBBF24', '#60A5FA'];

  let map, geojsonLayer, pointsLayer;
  let rows = [];                 // seluruh baris (sudah dinormalisasi)
  let sources = [];              // daftar source unik
  let confKeysPresent = [];      // daftar confidence key yang ada di data
  let onSources = new Set();
  let onConf    = new Set();
  let activePeriod = 'all';
  let maxDateMs = null;          // tanggal terbaru di dataset

  // ─── Helpers ──────────────────────────────────────────────────────
  function num(v) { const n = Number(v); return isFinite(n) ? n : null; }

  function confKey(raw) {
    if (raw === null || raw === undefined || raw === '') return 'other';
    const s = String(raw).trim().toLowerCase();
    if (CONF_META[s] && s !== 'other') return s;
    if (s === 'h' || s === 'tinggi') return 'high';
    if (s === 'n' || s === 'nominal' || s === 'sedang') return 'medium';
    if (s === 'l' || s === 'rendah') return 'low';
    const n = Number(s);
    if (isFinite(n)) return n >= 80 ? 'high' : n >= 30 ? 'medium' : 'low';
    return 'other';
  }

  // Terima 'YYYY-MM-DD', ISO timestamp, atau 'M/D/YYYY'
  function parseDate(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return Date.UTC(+m[3], +m[1] - 1, +m[2]);
    const t = Date.parse(s);
    return isNaN(t) ? null : t;
  }

  function fmtDate(ms) {
    if (ms === null) return '—';
    return new Date(ms).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  function titleCase(s) {
    return String(s).replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function nf(n) { return Number(n).toLocaleString('id-ID'); }

  // ─── Filtering ────────────────────────────────────────────────────
  function periodCutoff() {
    const p = PERIODS.find(x => x.key === activePeriod);
    if (!p || p.days === null || maxDateMs === null) return null;
    return maxDateMs - (p.days - 1) * 86400000;
  }

  function visibleRows() {
    const cut = periodCutoff();
    return rows.filter(r =>
      onSources.has(r._src) &&
      onConf.has(r._conf) &&
      (cut === null || (r._ms !== null && r._ms >= cut))
    );
  }

  // ─── Markers ──────────────────────────────────────────────────────
  function radiusForZoom(z) {
    if (z <= 4) return 3;
    if (z <= 6) return 4;
    if (z <= 8) return 5;
    return 6;
  }

  function drawPoints() {
    const shown = visibleRows();
    const r = radiusForZoom(map.getZoom());

    pointsLayer.clearLayers();
    shown.forEach(row => {
      const marker = L.circleMarker([row.latitude, row.longitude], {
        renderer:    pointsLayer._canvas,
        radius:      r,
        color:       'rgba(0,0,0,0.55)',
        weight:      0.8,
        fillColor:   CONF_META[row._conf].color,
        fillOpacity: 0.85,
      });
      marker._row = row;
      pointsLayer.addLayer(marker);
    });

    renderCount(shown.length);
    renderDist(shown);
    renderStats(shown);
    renderFilterCounts();
  }

  function resizePoints() {
    const r = radiusForZoom(map.getZoom());
    pointsLayer.eachLayer(l => l.setRadius(r));
  }

  // ─── Tooltip ──────────────────────────────────────────────────────
  const ttEl = document.getElementById('hs-tooltip');

  function buildTooltip(row) {
    const meta = CONF_META[row._conf];
    const place = [row.regency, row.province].filter(Boolean).map(titleCase).join(', ');
    return `
      <div class="hs-tt-name">${esc(place || 'Lokasi tidak tercatat')}</div>
      <div class="hs-tt-badge hs-tt-badge--${meta.cls}">Confidence ${esc(row.confidence_level || meta.label)}</div>
      <table class="hs-tt-table">
        <tr><td>Tanggal</td><td>${esc(fmtDate(row._ms))}</td></tr>
        <tr><td>Sumber</td><td>${esc(row.source || '—')}</td></tr>
        <tr><td>Satelit</td><td>${esc(row.satellite || '—')}</td></tr>
      </table>
      <div class="hs-tt-coord">${row.latitude.toFixed(5)}, ${row.longitude.toFixed(5)}</div>
    `;
  }

  function positionTooltip(e) {
    const mapEl = document.getElementById('hs-map');
    const w = mapEl.clientWidth, h = mapEl.clientHeight;
    const pt = e.containerPoint;
    let x = pt.x + 14, y = pt.y - 14;
    if (x + 265 > w) x = pt.x - 265 - 8;
    if (y + 185 > h) y = pt.y - 185;
    if (y < 8) y = 8;
    if (x < 8) x = 8;
    ttEl.style.left = x + 'px';
    ttEl.style.top  = y + 'px';
  }

  // ─── Sidebar: filters ─────────────────────────────────────────────
  function renderSourceFilter() {
    document.getElementById('hs-src').innerHTML = sources.map((s, i) => `
      <div class="hs-filter${onSources.has(s) ? ' active' : ''}" role="checkbox" aria-checked="${onSources.has(s)}" tabindex="0" data-src="${esc(s)}">
        <span class="hs-filter-dot" style="background:${SRC_COLORS[i % SRC_COLORS.length]}"></span>
        <span class="hs-filter-name">${esc(s)}</span>
        <span class="hs-filter-n" data-count-src="${esc(s)}">0</span>
      </div>
    `).join('') || '<div class="hs-dist-empty">Tidak ada sumber data.</div>';
  }

  function renderConfFilter() {
    document.getElementById('hs-conf').innerHTML = confKeysPresent.map(k => `
      <div class="hs-filter${onConf.has(k) ? ' active' : ''}" role="checkbox" aria-checked="${onConf.has(k)}" tabindex="0" data-conf="${k}">
        <span class="hs-filter-dot" style="background:${CONF_META[k].color}"></span>
        <span class="hs-filter-name">${CONF_META[k].label}</span>
        <span class="hs-filter-n" data-count-conf="${k}">0</span>
      </div>
    `).join('') || '<div class="hs-dist-empty">Tidak ada level confidence.</div>';
  }

  function renderPeriodFilter() {
    document.getElementById('hs-period').innerHTML = PERIODS.map(p => `
      <button class="hs-period${p.key === activePeriod ? ' active' : ''}" data-period="${p.key}">${p.label}</button>
    `).join('');
  }

  // Hitungan pada tiap chip filter: ikut filter lain, abaikan dirinya sendiri
  function renderFilterCounts() {
    const cut = periodCutoff();
    const inPeriod = r => cut === null || (r._ms !== null && r._ms >= cut);

    sources.forEach(s => {
      const n = rows.filter(r => r._src === s && onConf.has(r._conf) && inPeriod(r)).length;
      const el = document.querySelector(`[data-count-src="${CSS.escape(s)}"]`);
      if (el) el.textContent = nf(n);
    });

    confKeysPresent.forEach(k => {
      const n = rows.filter(r => r._conf === k && onSources.has(r._src) && inPeriod(r)).length;
      const el = document.querySelector(`[data-count-conf="${k}"]`);
      if (el) el.textContent = nf(n);
    });
  }

  // ─── Sidebar: distribution + stats ────────────────────────────────
  function renderDist(shown) {
    const counts = {};
    shown.forEach(r => {
      const key = r.province ? titleCase(r.province) : 'Tidak diketahui';
      counts[key] = (counts[key] || 0) + 1;
    });
    const list = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max  = list.length ? list[0][1] : 1;

    document.getElementById('hs-dist').innerHTML = list.length
      ? list.map(([name, n]) => `
          <div class="hs-dist-row">
            <div class="hs-dist-cat">${esc(name)}</div>
            <div class="hs-dist-bar-bg">
              <div class="hs-dist-bar-fill" style="width:${Math.round(n / max * 100)}%"></div>
            </div>
            <div class="hs-dist-n">${nf(n)}</div>
          </div>`).join('')
      : '<div class="hs-dist-empty">Tidak ada titik pada filter ini.</div>';
  }

  function renderStats(shown) {
    const high  = shown.filter(r => r._conf === 'high').length;
    const provs = new Set(shown.filter(r => r.province).map(r => titleCase(r.province))).size;
    document.getElementById('hs-stats').innerHTML = `
      <div class="hs-stat">
        <div class="hs-stat-val">${nf(shown.length)}</div>
        <div class="hs-stat-key">Titik</div>
      </div>
      <div class="hs-stat">
        <div class="hs-stat-val">${nf(high)}</div>
        <div class="hs-stat-key">High</div>
      </div>
      <div class="hs-stat">
        <div class="hs-stat-val">${nf(provs)}</div>
        <div class="hs-stat-key">Provinsi</div>
      </div>
    `;
  }

  function renderCount(n) {
    document.getElementById('hs-count-badge').innerHTML =
      `<b>${nf(n)}</b> titik panas`;
  }

  // ─── Events ───────────────────────────────────────────────────────
  function toggleSet(set, key, el) {
    if (set.has(key)) set.delete(key); else set.add(key);
    const on = set.has(key);
    el.classList.toggle('active', on);
    el.setAttribute('aria-checked', on ? 'true' : 'false');
    drawPoints();
  }

  function bindFilterGroup(containerId, attr, set) {
    const container = document.getElementById(containerId);
    const handler = (e) => {
      const el = e.target.closest('.hs-filter');
      if (!el || !container.contains(el)) return;
      toggleSet(set, el.dataset[attr], el);
    };
    container.addEventListener('click', handler);
    container.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      handler(e);
    });
  }

  function initFilterEvents() {
    bindFilterGroup('hs-src',  'src',  onSources);
    bindFilterGroup('hs-conf', 'conf', onConf);

    document.getElementById('hs-period').addEventListener('click', (e) => {
      const btn = e.target.closest('.hs-period');
      if (!btn) return;
      activePeriod = btn.dataset.period;
      document.querySelectorAll('.hs-period').forEach(b =>
        b.classList.toggle('active', b.dataset.period === activePeriod));
      drawPoints();
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────
  async function init() {
    map = L.map('hs-map', {
      center: [-2.5, 118],
      zoom: 5,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.attribution({ position: 'bottomleft', prefix: '<a href="https://leafletjs.com" target="_blank">Leaflet</a>' })
      .addAttribution('© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>')
      .addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    const [rawRows, geojson] = await Promise.all([
      fetch('/api/hotspot/data').then(r => r.json()).catch(() => []),
      fetch('/maps/indonesia-38prov.geojson').then(r => r.json()),
    ]);

    // Batas wilayah Indonesia (non-interaktif agar hover titik tetap presisi)
    geojsonLayer = L.geoJSON(geojson, {
      interactive: false,
      style: { fillColor: '#1C2438', weight: 0.8, color: 'rgba(255,255,255,0.10)', fillOpacity: 0.6 },
    }).addTo(map);

    map.fitBounds(geojsonLayer.getBounds(), { padding: [20, 20] });

    // Layer titik: canvas renderer + delegasi event lewat FeatureGroup
    pointsLayer = L.featureGroup().addTo(map);
    pointsLayer._canvas = L.canvas({ padding: 0.3 });
    map.addLayer(pointsLayer._canvas);

    pointsLayer.on('mouseover mousemove', (e) => {
      const row = e.propagatedFrom && e.propagatedFrom._row;
      if (!row) return;
      ttEl.innerHTML = buildTooltip(row);
      ttEl.style.display = 'block';
      positionTooltip(e);
      e.propagatedFrom.setStyle({ weight: 1.8, color: 'rgba(255,255,255,0.85)', fillOpacity: 1 });
      e.propagatedFrom.bringToFront();
    });

    pointsLayer.on('mouseout', (e) => {
      ttEl.style.display = 'none';
      if (e.propagatedFrom) {
        e.propagatedFrom.setStyle({ weight: 0.8, color: 'rgba(0,0,0,0.55)', fillOpacity: 0.85 });
      }
    });

    map.on('zoomend', resizePoints);

    // Normalisasi baris
    rows = (Array.isArray(rawRows) ? rawRows : []).map(r => {
      const lat = num(r.latitude), lon = num(r.longitude);
      if (lat === null || lon === null) return null;
      return Object.assign({}, r, {
        latitude:  lat,
        longitude: lon,
        _src:  (r.source || 'Tidak diketahui').toString().trim() || 'Tidak diketahui',
        _conf: confKey(r.confidence_level),
        _ms:   parseDate(r.date),
      });
    }).filter(Boolean);

    if (!rows.length) {
      const err = rawRows && rawRows.error;
      document.getElementById('hs-loading').innerHTML =
        `<p style="color:#7A8BA0;font-size:13px;max-width:280px;line-height:1.6">
           Belum ada data hotspot yang bisa dibaca dari tabel <code>hotspot_point</code>.
           ${err ? '<br><br>' + esc(err) : '<br><br>Pastikan tabel sudah terisi dan punya policy SELECT untuk role anon.'}
         </p>`;
      renderSourceFilter();
      renderConfFilter();
      renderPeriodFilter();
      renderCount(0);
      renderDist([]);
      renderStats([]);
      return;
    }

    const dates = rows.map(r => r._ms).filter(v => v !== null);
    maxDateMs = dates.length ? Math.max.apply(null, dates) : null;
    const minDateMs = dates.length ? Math.min.apply(null, dates) : null;

    sources = Array.from(new Set(rows.map(r => r._src))).sort();
    confKeysPresent = CONF_ORDER.filter(k => rows.some(r => r._conf === k));
    onSources = new Set(sources);
    // Default: hanya confidence High yang tampil; level lain diaktifkan lewat filter.
    // Kalau data tidak punya High sama sekali, tampilkan semua agar peta tidak kosong.
    onConf = confKeysPresent.includes('high')
      ? new Set(['high'])
      : new Set(confKeysPresent);

    document.getElementById('hs-subtitle').textContent =
      minDateMs !== null
        ? `${nf(rows.length)} titik · ${fmtDate(minDateMs)} – ${fmtDate(maxDateMs)}`
        : `${nf(rows.length)} titik panas`;

    document.getElementById('hs-foot-meta').innerHTML =
      `Sumber: tabel <code>hotspot_point</code> · periode dihitung relatif terhadap data terbaru (${esc(fmtDate(maxDateMs))}).`;

    renderSourceFilter();
    renderConfFilter();
    renderPeriodFilter();
    initFilterEvents();
    drawPoints();

    document.getElementById('hs-loading').style.display = 'none';

    // Mobile sidebar toggle
    document.getElementById('hs-menu-btn').addEventListener('click', () => {
      document.getElementById('hs-sidebar').classList.toggle('open');
    });
    map.on('click', () => {
      document.getElementById('hs-sidebar').classList.remove('open');
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
