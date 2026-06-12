(function () {
  'use strict';

  // ─── Layer config ────────────────────────────────────────────────
  const LAYERS = {
    pembangunan: { field: 'pct_pembangunan_now', label: '% Pembangunan' },
    pemetaan:    { field: 'pct_pemetaan_now',    label: '% Pemetaan' },
  };

  // Klasifikasi (urut tinggi → rendah)
  const CLASSES = [
    { key: 'tinggi', label: '≥ 75%',  lo: 75,        hi: Infinity, color: '#1A7F3C' },
    { key: 'sedang', label: '50–75%', lo: 50,        hi: 75,       color: '#F5A623' },
    { key: 'rendah', label: '25–50%', lo: 25,        hi: 50,       color: '#E05C1A' },
    { key: 'minim',  label: '< 25%',  lo: -Infinity, hi: 25,       color: '#C0142A' },
  ];

  const STATUS_CLS = { 'BERGERAK': 'bergerak', 'PERLAHAN': 'perlahan', 'STAGNAN': 'stagnan' };

  let map, geojsonLayer;
  let db = {};                       // canonical name → row
  let activeLayer = 'pembangunan';
  let enabled = new Set(CLASSES.map(c => c.key));   // kelas yang aktif (filter)

  // ─── Helpers ──────────────────────────────────────────────────────
  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }

  // Normalisasi nama provinsi → kunci kanonik (tahan variasi ejaan)
  function canon(raw) {
    let s = (raw || '').toUpperCase().trim().replace(/\./g, '').replace(/\s+/g, ' ');
    const A = {
      'DAERAH ISTIMEWA YOGYAKARTA': 'YOGYAKARTA', 'DI YOGYAKARTA': 'YOGYAKARTA', 'DIY': 'YOGYAKARTA',
      'DKI JAKARTA': 'JAKARTA', 'DAERAH KHUSUS IBUKOTA JAKARTA': 'JAKARTA', 'DKI': 'JAKARTA',
      'KEPULAUAN RIAU': 'KEP RIAU', 'KEP RIAU': 'KEP RIAU',
      'KEPULAUAN BANGKA BELITUNG': 'KEP BANGKA BELITUNG', 'KEP BANGKA BELITUNG': 'KEP BANGKA BELITUNG', 'BANGKA BELITUNG': 'KEP BANGKA BELITUNG',
    };
    return A[s] || s;
  }

  function classOf(value) {
    return CLASSES.find(c => value >= c.lo && value < c.hi) || CLASSES[CLASSES.length - 1];
  }

  function rowValue(row) { return num(row[LAYERS[activeLayer].field]); }

  // ─── GeoJSON style ────────────────────────────────────────────────
  function featureStyle(feature) {
    const row = db[canon(feature.properties.PROVINSI || '')];
    if (!row) {
      return { fillColor: '#1C2438', weight: 0.8, color: 'rgba(255,255,255,0.08)', fillOpacity: 0.6 };
    }
    const cls = classOf(rowValue(row));
    const on = enabled.has(cls.key);
    return {
      fillColor:   on ? cls.color : '#222B3D',
      weight:      0.8,
      color:       'rgba(255,255,255,0.12)',
      fillOpacity: on ? 0.85 : 0.12,
    };
  }

  // ─── Tooltip ──────────────────────────────────────────────────────
  const ttEl = document.getElementById('kd-tooltip');

  function deltaCell(v, unit) {
    const n = num(v);
    if (n > 0) return `<span class="kd-tt-delta-up">+${n}${unit}</span>`;
    if (n === 0) return `<span class="kd-tt-delta-flat">0${unit}</span>`;
    return `${n}${unit}`;
  }

  function buildTooltip(row) {
    const st  = (row.status_since_start || '').toUpperCase();
    const cls = STATUS_CLS[st] || 'perlahan';
    return `
      <div class="kd-tt-name">${row.province}</div>
      <div class="kd-tt-badge kd-tt-badge--${cls}">${st || 'TANPA STATUS'}</div>
      <table class="kd-tt-table">
        <tr><td>% Pembangunan</td><td>${num(row.pct_pembangunan_now).toFixed(2)}%</td></tr>
        <tr><td>% Pemetaan</td><td>${num(row.pct_pemetaan_now).toFixed(2)}%</td></tr>
        <tr><td>Δ Pembangunan</td><td>${deltaCell(num(row.delta_pp_pembangunan_total).toFixed(2), ' pp')}</td></tr>
        <tr><td>Lahan masuk</td><td>${num(row.lahan_now).toLocaleString('id-ID')} ${deltaCell(row.delta_lahan_total, '')}</td></tr>
        <tr><td>Laju pembangunan</td><td>${num(row.pp_pembangunan_per_day).toFixed(3)} pp/hari</td></tr>
      </table>
      <div class="kd-tt-foot">Dipantau ${num(row.days_tracked)} hari · update ${row.latest_date || '—'}</div>
    `;
  }

  function positionTooltip(e) {
    const mapEl = document.getElementById('kd-map');
    const w = mapEl.clientWidth, h = mapEl.clientHeight;
    const pt = e.containerPoint;
    let x = pt.x + 14, y = pt.y - 14;
    if (x + 270 > w) x = pt.x - 270 - 8;
    if (y + 210 > h) y = pt.y - 210;
    if (y < 8) y = 8;
    ttEl.style.left = x + 'px';
    ttEl.style.top  = y + 'px';
  }

  function onEachFeature(feature, layer) {
    const row = db[canon(feature.properties.PROVINSI || '')];
    layer.on({
      mousemove(e) {
        if (!row) return;
        ttEl.innerHTML = buildTooltip(row);
        ttEl.style.display = 'block';
        positionTooltip(e);
        layer.setStyle({ weight: 2, color: 'rgba(255,255,255,0.5)', fillOpacity: 0.95 });
        layer.bringToFront();
      },
      mouseout() {
        ttEl.style.display = 'none';
        geojsonLayer.resetStyle(layer);
      },
    });
  }

  // ─── Classification list (legend + filter) ────────────────────────
  function renderDist(rows) {
    const counts = {};
    CLASSES.forEach(c => { counts[c.key] = 0; });
    rows.forEach(r => { counts[classOf(num(r[LAYERS[activeLayer].field])).key]++; });
    const total = rows.length || 1;

    document.getElementById('kd-dist').innerHTML = CLASSES.map(c => {
      const n   = counts[c.key];
      const pct = Math.round(n / total * 100);
      const off = enabled.has(c.key) ? '' : ' off';
      return `
        <div class="kd-dist-row${off}" data-key="${c.key}">
          <div class="kd-dist-dot" style="background:${c.color}"></div>
          <div class="kd-dist-cat">${c.label}</div>
          <div class="kd-dist-bar-bg">
            <div class="kd-dist-bar-fill" style="width:${pct}%;background:${c.color}"></div>
          </div>
          <div class="kd-dist-n">${n}</div>
        </div>
      `;
    }).join('');
  }

  function renderStats(rows) {
    const avg = (f) => rows.reduce((s, r) => s + num(r[f]), 0) / rows.length;
    const sum = (f) => rows.reduce((s, r) => s + num(r[f]), 0);
    document.getElementById('kd-stats').innerHTML = `
      <div class="kd-stat">
        <div class="kd-stat-val">${avg('pct_pembangunan_now').toFixed(1)}%</div>
        <div class="kd-stat-key">Pembangunan</div>
      </div>
      <div class="kd-stat">
        <div class="kd-stat-val">${avg('pct_pemetaan_now').toFixed(1)}%</div>
        <div class="kd-stat-key">Pemetaan</div>
      </div>
      <div class="kd-stat">
        <div class="kd-stat-val">+${sum('delta_lahan_total').toLocaleString('id-ID')}</div>
        <div class="kd-stat-key">Δ Lahan</div>
      </div>
    `;
  }

  // ─── Events ───────────────────────────────────────────────────────
  function initLayerToggle(rows) {
    document.getElementById('kd-layers').addEventListener('change', (e) => {
      if (e.target.name !== 'kd-layer') return;
      activeLayer = e.target.value;
      document.querySelectorAll('.kd-layer').forEach(el => {
        el.classList.toggle('active', el.dataset.val === activeLayer);
      });
      renderDist(rows);
      geojsonLayer.setStyle(featureStyle);
    });
  }

  function initDistFilter(rows) {
    document.getElementById('kd-dist').addEventListener('click', (e) => {
      const rowEl = e.target.closest('.kd-dist-row');
      if (!rowEl) return;
      const key = rowEl.dataset.key;
      if (enabled.has(key)) {
        if (enabled.size > 1) enabled.delete(key);   // jangan biarkan kosong semua
      } else {
        enabled.add(key);
      }
      renderDist(rows);
      geojsonLayer.setStyle(featureStyle);
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────
  async function init() {
    map = L.map('kd-map', { center: [-2.5, 118], zoom: 5, zoomControl: false, attributionControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.attribution({ position: 'bottomleft', prefix: '<a href="https://leafletjs.com" target="_blank">Leaflet</a>' })
      .addAttribution('© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>')
      .addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19 }).addTo(map);

    const [rawRows, geojson] = await Promise.all([
      fetch('/api/automation/progress').then(r => r.json()).catch(() => []),
      fetch('/maps/indonesia-38prov.geojson').then(r => r.json()),
    ]);

    const rows = Array.isArray(rawRows) ? rawRows : [];
    if (!rows.length) {
      document.getElementById('kd-loading').innerHTML =
        '<p style="color:#7A8BA0;font-size:13px;max-width:240px;text-align:center;line-height:1.6">Gagal memuat data. Pastikan view <b>v_progress_since_start</b> sudah dibuat & env <b>SUPABASE_AUTOMATION_*</b> terisi.</p>';
      return;
    }

    rows.forEach(r => { db[canon(r.province)] = r; });

    // Footer window info dari baris pertama
    const f = rows[0];
    if (f) {
      document.getElementById('kd-foot-window').textContent =
        `Sejak ${f.start_date || '—'} → ${f.latest_date || '—'} · ${num(f.days_tracked)} hari`;
      document.getElementById('kd-subtitle').textContent =
        `Progres per provinsi · update ${f.latest_date || '—'}`;
    }

    renderStats(rows);
    renderDist(rows);
    document.getElementById('kd-loading').style.display = 'none';

    geojsonLayer = L.geoJSON(geojson, { style: featureStyle, onEachFeature }).addTo(map);
    map.fitBounds(geojsonLayer.getBounds(), { padding: [20, 20] });

    initLayerToggle(rows);
    initDistFilter(rows);

    document.getElementById('kd-menu-btn').addEventListener('click', () => {
      document.getElementById('kd-sidebar').classList.toggle('open');
    });
    map.on('click', () => document.getElementById('kd-sidebar').classList.remove('open'));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
