(function () {
  'use strict';

  // GeoJSON province name → DB province name
  const NAME_MAP = {
    'KEPULAUAN RIAU':             'KEP. RIAU',
    'DAERAH ISTIMEWA YOGYAKARTA': 'DI YOGYAKARTA',
    'KEPULAUAN BANGKA BELITUNG':  'KEP. BANGKA BELITUNG',
  };

  const LAYERS = {
    composite:  { field: 'skor_masalah', min: 0,   max: 100,  colors: ['#1A7F3C','#F5A623','#E05C1A','#C0142A'], ticks: ['0','50','100'], gradient: '#1A7F3C, #F5A623, #E05C1A, #C0142A' },
    kemiskinan: { field: 'kemiskinan',   min: 0,   max: 30,   colors: ['#1A7F3C','#EF4444'],                     ticks: ['0%','15%','30%'], gradient: '#1A7F3C, #EF4444' },
    gini:       { field: 'gini',         min: 0.2, max: 0.45, colors: ['#1A7F3C','#EF4444'],                     ticks: ['0.20','0.33','0.45'], gradient: '#1A7F3C, #EF4444' },
    tpt:        { field: 'tpt',          min: 1,   max: 8,    colors: ['#1A7F3C','#EF4444'],                     ticks: ['1%','4.5%','8%'], gradient: '#1A7F3C, #EF4444' },
  };

  const CAT_META = {
    'Kritis':          { color: '#C0142A', cls: 'kritis' },
    'Mengkhawatirkan': { color: '#E05C1A', cls: 'khawatir' },
    'Perlu Perhatian': { color: '#F5A623', cls: 'perlu' },
    'Relatif Baik':    { color: '#22C55E', cls: 'baik' },
  };

  const CAT_ORDER = ['Kritis', 'Mengkhawatirkan', 'Perlu Perhatian', 'Relatif Baik'];

  let map, geojsonLayer;
  let db = {};          // normalized name → row
  let activeLayer = 'composite';

  // ─── Color helpers ──────────────────────────────────────────────
  function hexToRgb(hex) {
    return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
  }

  function lerpColor(a, b, t) {
    const [r1,g1,b1] = hexToRgb(a);
    const [r2,g2,b2] = hexToRgb(b);
    const r = Math.round(r1 + (r2-r1)*t);
    const g = Math.round(g1 + (g2-g1)*t);
    const bl = Math.round(b1 + (b2-b1)*t);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${bl.toString(16).padStart(2,'0')}`;
  }

  function getColor(value, layerKey) {
    const cfg = LAYERS[layerKey];
    const t = Math.max(0, Math.min(1, (value - cfg.min) / (cfg.max - cfg.min)));
    const colors = cfg.colors;
    const segs = colors.length - 1;
    const si = Math.min(Math.floor(t * segs), segs - 1);
    return lerpColor(colors[si], colors[si + 1], t * segs - si);
  }

  // ─── Name normalization ──────────────────────────────────────────
  function normalize(raw) {
    const upper = (raw || '').toUpperCase().trim();
    return NAME_MAP[upper] || upper;
  }

  // ─── GeoJSON style ──────────────────────────────────────────────
  function featureStyle(feature) {
    const name = normalize(feature.properties.PROVINSI || '');
    const row  = db[name];
    if (!row) return { fillColor: '#1C2438', weight: 0.8, color: 'rgba(255,255,255,0.08)', fillOpacity: 0.85 };
    return {
      fillColor:   getColor(row[LAYERS[activeLayer].field], activeLayer),
      weight:      0.8,
      color:       'rgba(255,255,255,0.12)',
      fillOpacity: 0.82,
    };
  }

  // ─── Tooltip ────────────────────────────────────────────────────
  const ttEl = document.getElementById('ke-tooltip');

  function buildTooltip(row) {
    const cat = CAT_META[row.kategori] || CAT_META['Perlu Perhatian'];
    return `
      <div class="ke-tt-name">${row.provinsi}</div>
      <div class="ke-tt-badge ke-tt-badge--${cat.cls}">${row.kategori} · ${row.narasi_kategori}</div>
      <table class="ke-tt-table">
        <tr><td>Kemiskinan</td><td>${row.kemiskinan.toFixed(2)}%</td></tr>
        <tr><td>Gini Ratio</td><td>${row.gini.toFixed(3)}</td></tr>
        <tr><td>TPT</td><td>${row.tpt.toFixed(2)}%</td></tr>
      </table>
      <div class="ke-tt-skor">Skor komposit: ${row.skor_masalah.toFixed(1)} / 100</div>
      <div class="ke-tt-driver">Dipicu oleh: ${row.driver_utama}</div>
    `;
  }

  function positionTooltip(e) {
    const mapEl = document.getElementById('ke-map');
    const w = mapEl.clientWidth;
    const h = mapEl.clientHeight;
    const pt = e.containerPoint;
    let x = pt.x + 14;
    let y = pt.y - 14;
    if (x + 260 > w) x = pt.x - 260 - 8;
    if (y + 200 > h) y = pt.y - 200;
    ttEl.style.left = x + 'px';
    ttEl.style.top  = y + 'px';
  }

  // ─── Feature events ──────────────────────────────────────────────
  function onEachFeature(feature, layer) {
    const name = normalize(feature.properties.PROVINSI || '');
    const row  = db[name];

    layer.on({
      mousemove(e) {
        if (!row) return;
        ttEl.innerHTML = buildTooltip(row);
        ttEl.style.display = 'block';
        positionTooltip(e);
        layer.setStyle({ weight: 2, color: 'rgba(255,255,255,0.5)', fillOpacity: 0.95 });
      },
      mouseout() {
        ttEl.style.display = 'none';
        geojsonLayer.resetStyle(layer);
      },
    });
  }

  // ─── Legend ──────────────────────────────────────────────────────
  function updateLegend() {
    const cfg = LAYERS[activeLayer];
    document.getElementById('ke-legend-bar').style.background =
      `linear-gradient(to right, ${cfg.gradient})`;
    const [min, mid, max] = cfg.ticks;
    document.getElementById('ke-leg-min').textContent = min;
    document.getElementById('ke-leg-mid').textContent = mid;
    document.getElementById('ke-leg-max').textContent = max;
  }

  // ─── Sidebar stats ────────────────────────────────────────────────
  function renderStats(rows) {
    const avg = (field) => rows.reduce((s, r) => s + r[field], 0) / rows.length;
    document.getElementById('ke-stats').innerHTML = `
      <div class="ke-stat">
        <div class="ke-stat-val">${avg('kemiskinan').toFixed(2)}%</div>
        <div class="ke-stat-key">Kemiskinan</div>
      </div>
      <div class="ke-stat">
        <div class="ke-stat-val">${avg('gini').toFixed(3)}</div>
        <div class="ke-stat-key">Gini</div>
      </div>
      <div class="ke-stat">
        <div class="ke-stat-val">${avg('tpt').toFixed(2)}%</div>
        <div class="ke-stat-key">TPT</div>
      </div>
    `;
  }

  function renderDist(rows) {
    const counts = {};
    rows.forEach(r => { counts[r.kategori] = (counts[r.kategori] || 0) + 1; });
    const total = rows.length;
    document.getElementById('ke-dist').innerHTML = CAT_ORDER.map(cat => {
      const n     = counts[cat] || 0;
      const pct   = Math.round(n / total * 100);
      const color = (CAT_META[cat] || {}).color || '#888';
      return `
        <div class="ke-dist-row">
          <div class="ke-dist-dot" style="background:${color}"></div>
          <div class="ke-dist-cat">${cat}</div>
          <div class="ke-dist-bar-bg">
            <div class="ke-dist-bar-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <div class="ke-dist-n">${n}</div>
        </div>
      `;
    }).join('');
  }

  // ─── Layer toggle ────────────────────────────────────────────────
  function initLayerToggle() {
    document.getElementById('ke-layers').addEventListener('change', (e) => {
      if (e.target.name !== 'ke-layer') return;
      activeLayer = e.target.value;
      document.querySelectorAll('.ke-layer').forEach(el => {
        el.classList.toggle('active', el.dataset.val === activeLayer);
      });
      geojsonLayer.setStyle(featureStyle);
      updateLegend();
    });
  }

  // ─── Init ────────────────────────────────────────────────────────
  async function init() {
    map = L.map('ke-map', {
      center: [-2.5, 118],
      zoom: 5,
      zoomControl: false,
      attributionControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.attribution({ position: 'bottomleft', prefix: '<a href="https://leafletjs.com" target="_blank">Leaflet</a>' })
      .addAttribution('© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>')
      .addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Fetch data + GeoJSON in parallel
    const [rawRows, geojson] = await Promise.all([
      fetch('/api/kerentanan/data').then(r => r.json()),
      fetch('/maps/indonesia-38prov.geojson').then(r => r.json()),
    ]);

    const rows = Array.isArray(rawRows) ? rawRows : [];
    if (!rows.length) {
      document.getElementById('ke-loading').innerHTML = '<p style="color:#7A8BA0;font-size:13px">Gagal memuat data. Pastikan tabel Supabase sudah tersedia.</p>';
      return;
    }

    // Build lookup
    rows.forEach(r => { db[r.provinsi] = r; });

    renderStats(rows);
    renderDist(rows);
    updateLegend();

    document.getElementById('ke-loading').style.display = 'none';

    geojsonLayer = L.geoJSON(geojson, {
      style:          featureStyle,
      onEachFeature,
    }).addTo(map);

    map.fitBounds(geojsonLayer.getBounds(), { padding: [20, 20] });

    initLayerToggle();

    // Mobile sidebar toggle
    document.getElementById('ke-menu-btn').addEventListener('click', () => {
      document.getElementById('ke-sidebar').classList.toggle('open');
    });

    // Close sidebar on map click (mobile)
    map.on('click', () => {
      document.getElementById('ke-sidebar').classList.remove('open');
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
