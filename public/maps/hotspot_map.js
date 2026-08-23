(function () {
  'use strict';

  // ─── Meta konfigurasi ─────────────────────────────────────────────
  const CONF_META = {
    high:   { label: 'High',    color: '#DC2626', cls: 'high'   },
    medium: { label: 'Medium',  color: '#F59E0B', cls: 'medium' },
    low:    { label: 'Low',     color: '#FACC15', cls: 'low'    },
    other:  { label: 'Lainnya', color: '#7A8BA0', cls: 'other'  },
  };
  const CONF_ORDER = ['high', 'medium', 'low', 'other'];

  const DN_META = {
    D:   { label: 'Siang', color: '#FBBF24' },
    N:   { label: 'Malam', color: '#818CF8' },
    '?': { label: 'Tidak tercatat', color: '#7A8BA0' },
  };
  const DN_ORDER = ['D', 'N', '?'];

  const PALETTE = ['#38BDF8', '#A78BFA', '#34D399', '#FB7185', '#FBBF24', '#60A5FA', '#F472B6'];

  // Periode dihitung relatif terhadap tanggal terbaru di dataset, bukan hari ini,
  // supaya dataset historis tetap tampil.
  const PERIODS = [
    { key: 'all', label: 'Semua', days: null },
    { key: '1',   label: '1 hari', days: 1 },
    { key: '7',   label: '7 hari', days: 7 },
    { key: '30',  label: '30 hari', days: 30 },
  ];

  const FRP_LEGEND = [10, 50, 150];   // MW, untuk legenda ukuran titik
  const WIB_OFFSET = 7 * 3600 * 1000;

  let map, geojsonLayer, pointsLayer;
  let rows = [];
  let markerById = new Map();
  let activePeriod = 'all';
  let maxDateMs = null;

  // Model filter generik — satu definisi dipakai untuk render, hitung, dan toggle.
  const GROUPS = [
    { id: 'src',  el: 'hs-src',  field: '_src',  values: [], on: new Set(),
      color: (v, i) => PALETTE[i % PALETTE.length],      label: v => v },
    { id: 'conf', el: 'hs-conf', field: '_conf', values: [], on: new Set(),
      color: v => CONF_META[v].color,                    label: v => CONF_META[v].label },
    { id: 'sat',  el: 'hs-sat',  field: '_sat',  values: [], on: new Set(),
      color: (v, i) => PALETTE[(i + 3) % PALETTE.length], label: v => v },
    { id: 'dn',   el: 'hs-dn',   field: '_dn',   values: [], on: new Set(),
      color: v => DN_META[v].color,                      label: v => DN_META[v].label },
  ];

  // ─── Helper ───────────────────────────────────────────────────────
  function num(v) { const n = Number(v); return isFinite(n) ? n : null; }
  function nf(n)  { return Number(n).toLocaleString('id-ID'); }

  function fmt(n, d) {
    const v = num(n);
    return v === null ? '—' : v.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function titleCase(s) {
    return String(s).replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
  }

  // "2026-08-21 18:21:00" / "2026-08-21" → ms, diperlakukan sebagai jam dinding WIB
  function parseNaive(s) {
    if (!s) return null;
    const m = String(s).trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }

  // "2026-08-21 13:58:35+00" → ms epoch sebenarnya
  function parseUtc(s) {
    if (!s) return null;
    let t = String(s).trim().replace(' ', 'T');
    if (/[+-]\d{2}$/.test(t))                 t += ':00';
    else if (!/(Z|[+-]\d{2}:\d{2})$/.test(t)) t += 'Z';
    const ms = Date.parse(t);
    return isNaN(ms) ? null : ms;
  }

  function fmtDate(ms) {
    if (ms === null) return '—';
    return new Date(ms).toLocaleDateString('id-ID',
      { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  function fmtDateTime(ms) {
    if (ms === null) return '—';
    return new Date(ms).toLocaleString('id-ID',
      { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  }

  function relTime(diffMs) {
    const m = Math.round(diffMs / 60000);
    if (m < 1)  return 'baru saja';
    if (m < 60) return m + ' menit lalu';
    const h = Math.round(m / 60);
    if (h < 48) return h + ' jam lalu';
    return Math.round(h / 24) + ' hari lalu';
  }

  function confKey(raw) {
    if (raw === null || raw === undefined || raw === '') return 'other';
    const s = String(raw).trim().toLowerCase();
    if (CONF_META[s] && s !== 'other') return s;
    if (s === 'h' || s === 'tinggi')                    return 'high';
    if (s === 'n' || s === 'nominal' || s === 'sedang') return 'medium';
    if (s === 'l' || s === 'rendah')                    return 'low';
    const n = Number(s);
    if (isFinite(n)) return n >= 80 ? 'high' : n >= 30 ? 'medium' : 'low';
    return 'other';
  }

  function placeOf(row) {
    return [row.regency, row.province].filter(Boolean).map(titleCase).join(', ');
  }

  // ─── Filter ───────────────────────────────────────────────────────
  function periodCutoff() {
    const p = PERIODS.find(x => x.key === activePeriod);
    if (!p || p.days === null || maxDateMs === null) return null;
    return maxDateMs - (p.days - 1) * 86400000;
  }

  // exceptId = abaikan grup itu; dipakai untuk menghitung angka di tiap chip
  function rowsFiltered(exceptId) {
    const cut = periodCutoff();
    return rows.filter(r => {
      if (cut !== null && !(r._ms !== null && r._ms >= cut)) return false;
      for (const g of GROUPS) {
        if (g.id !== exceptId && !g.on.has(r[g.field])) return false;
      }
      return true;
    });
  }

  const visibleRows = () => rowsFiltered(null);

  // ─── Titik peta ───────────────────────────────────────────────────
  function zoomBase() {
    const z = map.getZoom();
    return z <= 4 ? 3 : z <= 6 ? 3.6 : z <= 8 ? 4.6 : 5.6;
  }

  // Ukuran titik sebanding akar FRP: beda intensitas terlihat tanpa
  // titik besar menelan peta.
  function radiusFor(row, base) {
    const frp = Math.max(num(row.frp_mw) || 0, 0);
    return (base || zoomBase()) * (0.75 + Math.min(1.75, Math.sqrt(frp) / 7));
  }

  function baseStyle(row) {
    return {
      color:       'rgba(0,0,0,0.55)',
      weight:      0.8,
      fillColor:   CONF_META[row._conf].color,
      fillOpacity: 0.85,
    };
  }

  function drawPoints() {
    const shown = visibleRows();
    const base  = zoomBase();

    pointsLayer.clearLayers();
    markerById = new Map();

    shown.forEach(row => {
      const m = L.circleMarker([row.latitude, row.longitude],
        Object.assign({ renderer: pointsLayer._canvas, radius: radiusFor(row, base) }, baseStyle(row)));
      m._row = row;
      pointsLayer.addLayer(m);
      if (row.id !== null && row.id !== undefined) markerById.set(String(row.id), m);
    });

    renderCount(shown.length);
    renderHot(shown);
    renderDist(shown);
    renderStats(shown);
    updateCounts();
  }

  function resizePoints() {
    const base = zoomBase();
    pointsLayer.eachLayer(l => l.setRadius(radiusFor(l._row, base)));
  }

  // ─── Tooltip ──────────────────────────────────────────────────────
  const ttEl = document.getElementById('hs-tooltip');

  function buildTooltip(row) {
    const meta = CONF_META[row._conf];
    // raw hanya ditampilkan kalau menambah informasi — VIIRS mengisi
    // confidence_raw dengan kata yang sama ('high'), MODIS dengan angka (0-100).
    const rawVal = row.confidence_raw;
    const raw = (rawVal !== null && rawVal !== undefined && String(rawVal).trim() !== ''
      && String(rawVal).trim().toLowerCase() !== String(row.confidence_level || '').trim().toLowerCase())
      ? rawVal : null;
    const sat  = [row.satellite, row.instrument].filter(Boolean).join(' · ') || '—';
    const px   = (num(row.scan_km) !== null && num(row.track_km) !== null)
      ? fmt(row.scan_km, 2) + ' × ' + fmt(row.track_km, 2) + ' km'
      : '—';

    return '<div class="hs-tt-name">' + esc(placeOf(row) || 'Lokasi tidak tercatat') + '</div>'
      + '<div class="hs-tt-badge hs-tt-badge--' + meta.cls + '">Confidence '
      + esc(row.confidence_level || meta.label)
      + (raw ? ' · raw ' + esc(raw) : '') + '</div>'
      + '<table class="hs-tt-table">'
      + '<tr><td>FRP</td><td>' + fmt(row.frp_mw, 1) + ' MW</td></tr>'
      + '<tr><td>Brightness</td><td>' + fmt(row.brightness_k, 1) + ' K</td></tr>'
      + '<tr><td>Waktu WIB</td><td>' + esc(fmtDateTime(row._tms)) + '</td></tr>'
      + '<tr><td>Satelit</td><td>' + esc(sat) + '</td></tr>'
      + '<tr><td>Piksel</td><td>' + esc(px) + '</td></tr>'
      + '</table>'
      + '<div class="hs-tt-coord">' + DN_META[row._dn].label + ' · '
      + row.latitude.toFixed(5) + ', ' + row.longitude.toFixed(5) + '</div>';
  }

  function positionTooltip(e) {
    const mapEl = document.getElementById('hs-map');
    const w = mapEl.clientWidth, h = mapEl.clientHeight;
    const pt = e.containerPoint;
    let x = pt.x + 14, y = pt.y - 14;
    if (x + 265 > w) x = pt.x - 265 - 8;
    if (y + 215 > h) y = pt.y - 215;
    if (y < 8) y = 8;
    if (x < 8) x = 8;
    ttEl.style.left = x + 'px';
    ttEl.style.top  = y + 'px';
  }

  // ─── Panel: filter ────────────────────────────────────────────────
  function renderGroup(g) {
    const box = document.getElementById(g.el);
    if (!g.values.length) {
      box.innerHTML = '<div class="hs-dist-empty">Tidak ada data.</div>';
      return;
    }
    box.innerHTML = g.values.map((v, i) => {
      const on = g.on.has(v);
      return '<div class="hs-filter' + (on ? ' active' : '') + '" role="checkbox" aria-checked="'
        + on + '" tabindex="0" data-val="' + esc(v) + '">'
        + '<span class="hs-filter-dot" style="background:' + g.color(v, i) + '"></span>'
        + '<span class="hs-filter-name">' + esc(g.label(v)) + '</span>'
        + '<span class="hs-filter-n">0</span>'
        + '</div>';
    }).join('');
  }

  // Angka di tiap chip menghormati filter lain tapi mengabaikan dirinya sendiri,
  // jadi angkanya = jumlah yang akan muncul kalau chip itu diaktifkan.
  function updateCounts() {
    GROUPS.forEach(g => {
      const tally = {};
      rowsFiltered(g.id).forEach(r => { tally[r[g.field]] = (tally[r[g.field]] || 0) + 1; });
      document.querySelectorAll('#' + g.el + ' .hs-filter').forEach(el => {
        el.querySelector('.hs-filter-n').textContent = nf(tally[el.dataset.val] || 0);
      });
    });
  }

  function renderPeriodFilter() {
    document.getElementById('hs-period').innerHTML = PERIODS.map(p =>
      '<button class="hs-period' + (p.key === activePeriod ? ' active' : '')
      + '" data-period="' + p.key + '">' + p.label + '</button>').join('');
  }

  function renderFrpLegend() {
    const base = 4.6;
    document.getElementById('hs-frp-legend').innerHTML = FRP_LEGEND.map((v, i) => {
      const d   = Math.round(radiusFor({ frp_mw: v }, base) * 2);
      const cap = i === 0 ? '≤ ' + v : i === FRP_LEGEND.length - 1 ? '≥ ' + v : String(v);
      return '<div class="hs-frp-item">'
        + '<div class="hs-frp-circle" style="width:' + d + 'px;height:' + d + 'px"></div>'
        + '<div class="hs-frp-cap">' + cap + ' MW</div></div>';
    }).join('');
  }

  // ─── Panel: ringkasan ─────────────────────────────────────────────
  function renderHot(shown) {
    const top = shown
      .filter(r => num(r.frp_mw) !== null)
      .sort((a, b) => num(b.frp_mw) - num(a.frp_mw))
      .slice(0, 5);

    document.getElementById('hs-hot').innerHTML = top.length
      ? top.map((r, i) =>
          '<button class="hs-hot-row" data-id="' + esc(r.id) + '" data-lat="' + r.latitude
          + '" data-lon="' + r.longitude + '">'
          + '<span class="hs-hot-rank">' + (i + 1) + '</span>'
          + '<span class="hs-hot-place">' + esc(placeOf(r) || 'Tanpa nama wilayah') + '</span>'
          + '<span class="hs-hot-frp">' + fmt(r.frp_mw, 1) + '</span></button>').join('')
      : '<div class="hs-dist-empty">Tidak ada titik pada filter ini.</div>';
  }

  function renderDist(shown) {
    const counts = {};
    shown.forEach(r => {
      const key = r.province ? titleCase(r.province) : 'Tidak diketahui';
      counts[key] = (counts[key] || 0) + 1;
    });
    const list = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max  = list.length ? list[0][1] : 1;

    document.getElementById('hs-dist').innerHTML = list.length
      ? list.map(entry =>
          '<div class="hs-dist-row">'
          + '<div class="hs-dist-cat">' + esc(entry[0]) + '</div>'
          + '<div class="hs-dist-bar-bg"><div class="hs-dist-bar-fill" style="width:'
          + Math.round(entry[1] / max * 100) + '%"></div></div>'
          + '<div class="hs-dist-n">' + nf(entry[1]) + '</div></div>').join('')
      : '<div class="hs-dist-empty">Tidak ada titik pada filter ini.</div>';
  }

  function renderStats(shown) {
    const high  = shown.filter(r => r._conf === 'high').length;
    const provs = new Set(shown.filter(r => r.province).map(r => titleCase(r.province))).size;
    const frps  = shown.map(r => num(r.frp_mw)).filter(v => v !== null);
    const maxF  = frps.length ? Math.max.apply(null, frps) : null;

    const tile = (val, key) =>
      '<div class="hs-stat"><div class="hs-stat-val">' + val
      + '</div><div class="hs-stat-key">' + key + '</div></div>';

    document.getElementById('hs-stats').innerHTML =
      tile(nf(shown.length), 'Titik')
      + tile(nf(high), 'High')
      + tile(nf(provs), 'Provinsi')
      + tile(maxF === null ? '—' : fmt(maxF, 1), 'FRP maks (MW)');
  }

  function renderCount(n) {
    document.getElementById('hs-count-badge').innerHTML = '<b>' + nf(n) + '</b> titik panas';
  }

  // ─── Event ────────────────────────────────────────────────────────
  function bindGroup(g) {
    const box = document.getElementById(g.el);
    const toggle = (e) => {
      const el = e.target.closest('.hs-filter');
      if (!el || !box.contains(el)) return;
      const v = el.dataset.val;
      if (g.on.has(v)) g.on.delete(v); else g.on.add(v);
      const on = g.on.has(v);
      el.classList.toggle('active', on);
      el.setAttribute('aria-checked', on ? 'true' : 'false');
      drawPoints();
    };
    box.addEventListener('click', toggle);
    box.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      toggle(e);
    });
  }

  function initEvents() {
    GROUPS.forEach(bindGroup);

    document.getElementById('hs-period').addEventListener('click', (e) => {
      const btn = e.target.closest('.hs-period');
      if (!btn) return;
      activePeriod = btn.dataset.period;
      document.querySelectorAll('.hs-period').forEach(b =>
        b.classList.toggle('active', b.dataset.period === activePeriod));
      drawPoints();
    });

    // Klik "titik terpanas" → terbang ke lokasinya lalu tandai sebentar
    document.getElementById('hs-hot').addEventListener('click', (e) => {
      const btn = e.target.closest('.hs-hot-row');
      if (!btn) return;
      map.flyTo([Number(btn.dataset.lat), Number(btn.dataset.lon)],
        Math.max(map.getZoom(), 9), { duration: 0.8 });

      const m = markerById.get(btn.dataset.id);
      if (m) {
        m.setStyle({ weight: 2.4, color: '#FFFFFF', fillOpacity: 1 });
        m.bringToFront();
        setTimeout(() => { if (m._row) m.setStyle(baseStyle(m._row)); }, 2400);
      }
      document.getElementById('hs-sidebar').classList.remove('open');
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
      .addAttribution('© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> · NASA FIRMS')
      .addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    const [rawRows, geojson] = await Promise.all([
      fetch('/api/hotspot/data').then(r => r.json()).catch(() => []),
      fetch('/maps/indonesia-38prov.geojson').then(r => r.json()),
    ]);

    // Batas wilayah non-interaktif agar hover titik tetap presisi
    geojsonLayer = L.geoJSON(geojson, {
      interactive: false,
      style: { fillColor: '#1C2438', weight: 0.8, color: 'rgba(255,255,255,0.10)', fillOpacity: 0.6 },
    }).addTo(map);

    map.fitBounds(geojsonLayer.getBounds(), { padding: [20, 20] });

    pointsLayer = L.featureGroup().addTo(map);
    pointsLayer._canvas = L.canvas({ padding: 0.3 });
    map.addLayer(pointsLayer._canvas);

    // Event didelegasikan ke FeatureGroup — satu handler untuk semua titik
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
      if (e.propagatedFrom && e.propagatedFrom._row) {
        e.propagatedFrom.setStyle(baseStyle(e.propagatedFrom._row));
      }
    });

    map.on('zoomend', resizePoints);

    rows = (Array.isArray(rawRows) ? rawRows : []).map(r => {
      const lat = num(r.latitude), lon = num(r.longitude);
      if (lat === null || lon === null) return null;
      const dn   = String(r.daynight || '').trim().toUpperCase();
      const dMs  = parseNaive(r.acq_date_wib);
      const tMs  = parseNaive(r.acq_datetime_wib);
      return Object.assign({}, r, {
        latitude:  lat,
        longitude: lon,
        _src:  (r.source    || 'Tidak diketahui').toString().trim() || 'Tidak diketahui',
        _sat:  (r.satellite || 'Tidak diketahui').toString().trim() || 'Tidak diketahui',
        _conf: confKey(r.confidence_level),
        _dn:   DN_META[dn] ? dn : '?',
        _ms:   dMs !== null ? dMs : tMs,
        _tms:  tMs,
      });
    }).filter(Boolean);

    if (!rows.length) {
      const err = rawRows && rawRows.error;
      document.getElementById('hs-loading').innerHTML =
        '<p style="color:#7A8BA0;font-size:13px;max-width:300px;line-height:1.6">'
        + 'Belum ada data hotspot yang bisa dibaca dari <code>firms_hotspot_wib</code>.'
        + (err ? '<br><br>' + esc(err)
               : '<br><br>Tabel dasarnya (<code>firms_hotspot</code>) perlu policy SELECT untuk role anon.')
        + '</p>';
      GROUPS.forEach(renderGroup);
      renderPeriodFilter();
      renderFrpLegend();
      renderCount(0);
      renderHot([]);
      renderDist([]);
      renderStats([]);
      return;
    }

    // Nilai tiap grup filter diturunkan dari data yang benar-benar ada
    GROUPS.forEach(g => {
      if (g.id === 'conf')    g.values = CONF_ORDER.filter(k => rows.some(r => r._conf === k));
      else if (g.id === 'dn') g.values = DN_ORDER.filter(k => rows.some(r => r._dn === k));
      else                    g.values = Array.from(new Set(rows.map(r => r[g.field]))).sort();

      // Default: hanya confidence High. Kalau data tidak punya High sama sekali,
      // tampilkan semua agar peta tidak terbuka kosong.
      g.on = (g.id === 'conf' && g.values.includes('high'))
        ? new Set(['high'])
        : new Set(g.values);
    });

    const dates = rows.map(r => r._ms).filter(v => v !== null);
    maxDateMs = dates.length ? Math.max.apply(null, dates) : null;
    const minDateMs = dates.length ? Math.min.apply(null, dates) : null;

    document.getElementById('hs-subtitle').textContent = minDateMs !== null
      ? nf(rows.length) + ' titik · ' + fmtDate(minDateMs) + ' – ' + fmtDate(maxDateMs) + ' WIB'
      : nf(rows.length) + ' titik panas';

    // Kesegaran data dari fetched_at_utc (UTC → WIB saat ditampilkan)
    const fetched = rows.map(r => parseUtc(r.fetched_at_utc)).filter(v => v !== null);
    if (fetched.length) {
      const last  = Math.max.apply(null, fetched);
      const stale = Date.now() - last > 6 * 3600 * 1000;
      document.getElementById('hs-fresh').innerHTML =
        '<span class="hs-fresh-dot' + (stale ? ' hs-fresh-dot--stale' : '') + '"></span>'
        + 'Data diambil ' + esc(fmtDateTime(last + WIB_OFFSET)) + ' WIB · '
        + esc(relTime(Date.now() - last));
    }

    GROUPS.forEach(renderGroup);
    renderPeriodFilter();
    renderFrpLegend();
    initEvents();
    drawPoints();

    document.getElementById('hs-loading').style.display = 'none';

    document.getElementById('hs-menu-btn').addEventListener('click', () => {
      document.getElementById('hs-sidebar').classList.toggle('open');
    });
    map.on('click', () => {
      document.getElementById('hs-sidebar').classList.remove('open');
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
