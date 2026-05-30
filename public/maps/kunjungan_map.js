(function () {
  'use strict';

  const ORIGIN = [-6.2088, 106.8456]; // Jakarta

  const TYPE_META = {
    'Kunjungan Kenegaraan': { color: '#3B82F6', short: 'Kenegaraan' },
    'Kunjungan Kerja':      { color: '#8B5CF6', short: 'Kerja' },
    'Kunjungan Pribadi':    { color: '#6B7280', short: 'Pribadi' },
    'KTT':                  { color: '#F59E0B', short: 'KTT' },
    'Forum':                { color: '#10B981', short: 'Forum' },
    'Forum Diplomatik':     { color: '#EF4444', short: 'Diplomatik' },
  };

  function getTypeMeta(jenis) {
    if (jenis.startsWith('KTT'))           return TYPE_META['KTT'];
    if (jenis === 'Forum Diplomatik')      return TYPE_META['Forum Diplomatik'];
    if (jenis.startsWith('Forum'))         return TYPE_META['Forum'];
    return TYPE_META[jenis] || TYPE_META['Kunjungan Kenegaraan'];
  }

  // ─── Visit data (loaded from API) ────────────────────────────────
  let VISITS = [];

  // ─── Date formatting ──────────────────────────────────────────────
  const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];

  function fmtDate(mulai, selesai) {
    const d1 = new Date(mulai + 'T00:00:00');
    const d2 = new Date(selesai + 'T00:00:00');
    const m1 = MONTHS[d1.getMonth()], m2 = MONTHS[d2.getMonth()];
    const y1 = d1.getFullYear(), y2 = d2.getFullYear();
    if (mulai === selesai)                                 return `${d1.getDate()} ${m1} ${y1}`;
    if (d1.getMonth() === d2.getMonth() && y1 === y2)     return `${d1.getDate()}–${d2.getDate()} ${m1} ${y1}`;
    if (y1 === y2)                                        return `${d1.getDate()} ${m1}–${d2.getDate()} ${m2} ${y1}`;
    return `${d1.getDate()} ${m1} ${y1}–${d2.getDate()} ${m2} ${y2}`;
  }

  // ─── Sinusoidal arc — always upward, western path for Americas ───
  function bezierArcPts(lat1, lng1, lat2, lng2, n, liftOffset) {
    n = n || 80;
    let dLng = lng2 - lng1;
    if (dLng > 180) dLng -= 360;
    // intentionally NOT normalizing dLng < -180: forces western path for Americas
    // so intermediate longitudes never exceed 180° and markers stay in place

    const dist = Math.sqrt(dLng * dLng + (lat2 - lat1) * (lat2 - lat1));
    const lift = Math.min(10 + dist * 0.20, 50) + (liftOffset || 0);

    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([
        lat1 + (lat2 - lat1) * t + Math.sin(Math.PI * t) * lift,
        lng1 + dLng * t,
      ]);
    }
    return pts;
  }

  // ─── Split arc where it crosses the antimeridian ──────────────────
  function splitAntimeridian(pts) {
    const segs = [];
    let cur = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      if (Math.abs(pts[i][1] - pts[i-1][1]) > 180) {
        segs.push(cur);
        cur = [pts[i]];
      } else {
        cur.push(pts[i]);
      }
    }
    segs.push(cur);
    return segs;
  }

  // ─── Map state ────────────────────────────────────────────────────
  let map, arcGroup, markerGroup;
  const markerMap    = {};  // no → marker
  const arcMap       = {};  // no → [polyline]
  const popupBuckets = {};  // coordKey → sorted bucket for nav
  let activeYear = 'all';
  let selectedNo = null;

  // ─── Draw all arcs + markers ──────────────────────────────────────
  function drawAll(visits) {
    arcGroup.clearLayers();
    markerGroup.clearLayers();
    Object.keys(markerMap).forEach(k => delete markerMap[k]);
    Object.keys(arcMap).forEach(k => delete arcMap[k]);

    // ── Dashed bezier arcs (one per visit, staggered lift) ────────
    visits.forEach((v, idx) => {
      const meta = getTypeMeta(v.jenis);
      const [lat, lon] = v.coords;       // always use original DB coords
      const liftOffset = (idx % 8) * 1.5;
      const pts  = bezierArcPts(ORIGIN[0], ORIGIN[1], lat, lon, 80, liftOffset);
      const segs = splitAntimeridian(pts);
      const pls  = [];
      segs.forEach(seg => {
        if (seg.length < 2) return;
        const pl = L.polyline(seg, { color: meta.color, weight: 1.8, opacity: 0.38, dashArray: '7 5' });
        pl.on('click', () => selectVisit(v.no));
        pl.on('mouseover', function () { this.setStyle({ weight: 2.5, opacity: 0.82 }); });
        pl.on('mouseout',  function () {
          this.setStyle({ weight: selectedNo === v.no ? 2.5 : 1.8, opacity: selectedNo === v.no ? 0.85 : 0.38 });
        });
        arcGroup.addLayer(pl);
        pls.push(pl);
      });
      arcMap[v.no] = pls;
    });

    // ── Markers — one per unique city, badge when count > 1 ───────
    const cityBuckets = {};
    visits.forEach(v => {
      const k = v.coords[0].toFixed(4) + ',' + v.coords[1].toFixed(4);
      if (!cityBuckets[k]) cityBuckets[k] = [];
      cityBuckets[k].push(v);
    });

    Object.values(cityBuckets).forEach(bucket => {
      const [lat, lon] = bucket[0].coords;
      const count = bucket.length;
      const meta  = getTypeMeta(bucket[bucket.length - 1].jenis);
      const c     = meta.color;

      const popup = L.popup({ maxWidth: 320, className: 'ku-popup-wrap' })
        .setContent(count > 1 ? buildMultiPopup(bucket) : buildPopup(bucket[0]));

      let marker;
      if (count > 1) {
        const icon = L.divIcon({
          className: '',
          html: `<div class="ku-cluster-dot" style="border-color:${c}"><span>${count}</span></div>`,
          iconSize:   [22, 22],
          iconAnchor: [11, 11],
        });
        marker = L.marker([lat, lon], { icon, zIndexOffset: 100 });
      } else {
        marker = L.circleMarker([lat, lon], {
          radius: 5, fillColor: c, color: '#fff', weight: 1.5, opacity: 1, fillOpacity: 0.85,
        });
        marker.on('mouseover', function () { this.setStyle({ radius: 7, fillOpacity: 1 }); });
        marker.on('mouseout',  function () {
          const sel = bucket.some(v => v.no === selectedNo);
          this.setStyle({ radius: sel ? 7 : 5, fillOpacity: 0.85 });
        });
      }

      marker.bindPopup(popup);
      marker.on('click', () => selectVisit(bucket[0].no));
      markerGroup.addLayer(marker);
      bucket.forEach(v => { markerMap[v.no] = marker; });
    });
  }

  // ─── Build multi-visit popup (navigable, most recent first) ──────
  function buildMultiPopup(bucket, idx) {
    const sorted = [...bucket].sort((a, b) => new Date(b.mulai) - new Date(a.mulai));
    const key    = sorted[0].coords[0].toFixed(4) + ',' + sorted[0].coords[1].toFixed(4);
    popupBuckets[key] = sorted;

    const i     = idx !== undefined ? idx : 0;
    const v     = sorted[i];
    const total = sorted.length;
    const meta  = getTypeMeta(v.jenis);
    const c     = meta.color;
    const prev  = (i - 1 + total) % total;
    const next  = (i + 1) % total;
    const sources = parseSumber(v.sumber_media, v.sumber_url);

    const srcHtml = sources.length ? `
      <div class="ku-pop-section">
        <div class="ku-pop-section-label">Sumber Berita</div>
        <div class="ku-pop-sources">
          ${sources.map(s => s.url
            ? `<a href="${s.url}" target="_blank" rel="noopener" class="ku-pop-src">${s.name}<svg viewBox="0 0 10 10" width="9" fill="none" style="flex-shrink:0"><path d="M2 8L8 2M4 2h4v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></a>`
            : `<span class="ku-pop-src ku-pop-src--plain">${s.name}</span>`
          ).join('')}
        </div>
      </div>` : '';

    return `
      <div class="ku-pop">
        <div class="ku-pop-nav">
          <button class="ku-pop-nav-btn" onclick="event.stopPropagation();kuPopupNav('${key}',${prev})">&#8249;</button>
          <span class="ku-pop-nav-label">${i + 1} / ${total}</span>
          <button class="ku-pop-nav-btn" onclick="event.stopPropagation();kuPopupNav('${key}',${next})">&#8250;</button>
        </div>
        <div class="ku-pop-title">${flagImg(v.flag, 22, 16)} ${v.negara}</div>
        <div class="ku-pop-loc">📍 ${v.kota} · ${v.kawasan}</div>
        <div class="ku-pop-tags">
          <span class="ku-pop-badge" style="background:${c}1a;color:${c};border-color:${c}50">${v.jenis}</span>
          <span class="ku-pop-tag-year">${v.tahun}</span>
        </div>
        <div class="ku-pop-section">
          <div class="ku-pop-section-label">Tanggal</div>
          <div class="ku-pop-section-val">${fmtDate(v.mulai, v.selesai)}</div>
        </div>
        <div class="ku-pop-section">
          <div class="ku-pop-section-label">Rincian</div>
          <div class="ku-pop-desc">${v.rincian}</div>
        </div>
        ${srcHtml}
      </div>`;
  }

  // ─── Popup navigation (called from onclick in popup HTML) ─────────
  window.kuPopupNav = function (key, idx) {
    const bucket = popupBuckets[key];
    if (!bucket) return;
    const marker = markerMap[bucket[0].no];
    if (!marker) return;
    const popup = marker.getPopup();
    if (popup) popup.setContent(buildMultiPopup(bucket, idx));
  };

  // ─── Build single-visit popup HTML ───────────────────────────────
  function buildPopup(v) {
    const meta = getTypeMeta(v.jenis);
    const c = meta.color;
    const sources = parseSumber(v.sumber_media, v.sumber_url);
    const srcHtml = sources.length ? `
      <div class="ku-pop-section">
        <div class="ku-pop-section-label">Sumber Berita</div>
        <div class="ku-pop-sources">
          ${sources.map(s => s.url
            ? `<a href="${s.url}" target="_blank" rel="noopener" class="ku-pop-src">${s.name}<svg viewBox="0 0 10 10" width="9" fill="none" style="flex-shrink:0"><path d="M2 8L8 2M4 2h4v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></a>`
            : `<span class="ku-pop-src ku-pop-src--plain">${s.name}</span>`
          ).join('')}
        </div>
      </div>` : '';
    return `
      <div class="ku-pop">
        <div class="ku-pop-title">${flagImg(v.flag, 22, 16)} ${v.negara}</div>
        <div class="ku-pop-loc">📍 ${v.kota} · ${v.kawasan}</div>
        <div class="ku-pop-tags">
          <span class="ku-pop-badge" style="background:${c}1a;color:${c};border-color:${c}50">${v.jenis}</span>
          <span class="ku-pop-tag-year">${v.tahun}</span>
        </div>
        <div class="ku-pop-section">
          <div class="ku-pop-section-label">Tanggal</div>
          <div class="ku-pop-section-val">${fmtDate(v.mulai, v.selesai)}</div>
        </div>
        <div class="ku-pop-section">
          <div class="ku-pop-section-label">Rincian</div>
          <div class="ku-pop-desc">${v.rincian}</div>
        </div>
        ${srcHtml}
      </div>`;
  }

  // ─── Select / highlight a visit ───────────────────────────────────
  function selectVisit(no) {
    selectedNo = no;
    const v = VISITS.find(x => x.no === no);
    if (!v) return;

    // Sidebar highlight
    document.querySelectorAll('.ku-item').forEach(el => el.classList.remove('ku-item--active'));
    const el = document.querySelector(`.ku-item[data-no="${no}"]`);
    if (el) {
      el.classList.add('ku-item--active');
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Fly to + popup
    map.flyTo(v.coords, Math.max(map.getZoom(), 5), { duration: 0.7 });
    const m = markerMap[no];
    if (m) setTimeout(() => m.openPopup(), 750);
  }

  // ─── Sidebar renderers ────────────────────────────────────────────
  function renderStats(visits) {
    const countries = new Set(visits.map(v => v.negara)).size;
    const regions   = new Set(visits.map(v => v.kawasan)).size;
    document.getElementById('ku-stats').innerHTML = `
      <div class="ku-stat"><div class="ku-stat-val">${visits.length}</div><div class="ku-stat-key">Kunjungan</div></div>
      <div class="ku-stat"><div class="ku-stat-val">${countries}</div><div class="ku-stat-key">Negara</div></div>
      <div class="ku-stat"><div class="ku-stat-val">${regions}</div><div class="ku-stat-key">Kawasan</div></div>`;
  }

  function renderLegend(visits) {
    const counts = {};
    visits.forEach(v => {
      const s = getTypeMeta(v.jenis).short;
      counts[s] = (counts[s] || 0) + 1;
    });
    const ORDER = ['Kenegaraan','KTT','Forum','Kerja','Pribadi','Diplomatik'];
    const COLOR = Object.fromEntries(Object.values(TYPE_META).map(m => [m.short, m.color]));
    document.getElementById('ku-legend').innerHTML = ORDER
      .filter(k => counts[k])
      .map(k => `
        <div class="ku-leg-row">
          <span class="ku-leg-dot" style="background:${COLOR[k]}"></span>
          <span class="ku-leg-name">${k}</span>
          <span class="ku-leg-n">${counts[k]}</span>
        </div>`).join('');
  }

  function renderList(visits) {
    const el = document.getElementById('ku-list');
    if (!visits.length) {
      el.innerHTML = '<p class="ku-empty">Tidak ada kunjungan pada tahun ini.</p>';
      return;
    }
    el.innerHTML = visits.map(v => {
      const meta = getTypeMeta(v.jenis);
      const c = meta.color;
      return `
        <div class="ku-item" data-no="${v.no}">
          <div class="ku-item-flag">${flagImg(v.flag, 20, 15)}</div>
          <div class="ku-item-body">
            <div class="ku-item-name">${v.negara} <span class="ku-item-city">· ${v.kota}</span></div>
            <div class="ku-item-meta">
              <span class="ku-item-badge" style="background:${c}1a;color:${c};border-color:${c}40">${meta.short}</span>
              <span class="ku-item-date">${fmtDate(v.mulai, v.selesai)}</span>
            </div>
          </div>
          <div class="ku-item-no">#${v.no}</div>
        </div>`;
    }).join('');
  }

  // ─── Apply active filter ──────────────────────────────────────────
  function applyFilter() {
    const filtered = activeYear === 'all'
      ? VISITS
      : VISITS.filter(v => v.tahun === activeYear);
    drawAll(filtered);
    renderStats(filtered);
    renderLegend(filtered);
    renderList(filtered);
  }

  // ─── Normalize API row → internal shape ──────────────────────────
  function normalizeRow(r) {
    return {
      no:           r.no,
      tahun:        r.tahun,
      negara:       r.negara,
      flag:         r.flag || '',
      kawasan:      r.kawasan || '',
      kota:         r.kota || '',
      coords:       [parseFloat(r.lat), parseFloat(r.lon)],
      mulai:        r.tanggal_mulai,
      selesai:      r.tanggal_selesai,
      jenis:        r.jenis_kunjungan,
      rincian:      r.rincian || '',
      sumber_media: r.sumber_media || '',
      sumber_url:   r.sumber_url   || '',
    };
  }

  // ─── Flag emoji → <img> from flagcdn.com ─────────────────────────
  function flagImg(emoji, w, h) {
    if (!emoji) return '';
    const pts = [...emoji].map(c => c.codePointAt(0));
    if (pts.length >= 2 && pts[0] >= 0x1F1E6 && pts[0] <= 0x1F1FF) {
      const code = (String.fromCharCode(pts[0] - 0x1F1E6 + 65) + String.fromCharCode(pts[1] - 0x1F1E6 + 65)).toLowerCase();
      return `<img src="https://flagcdn.com/w40/${code}.png" width="${w || 20}" height="${h || 15}" style="border-radius:2px;flex-shrink:0;vertical-align:middle" alt="${code.toUpperCase()}">`;
    }
    return emoji;
  }

  // ─── Parse semicolon-separated sumber into {name, url}[] ─────────
  function parseSumber(media, url) {
    const names = (media || '').split(';').map(s => s.trim()).filter(Boolean);
    const urls  = (url   || '').split(';').map(s => s.trim()).filter(Boolean);
    return names.map((name, i) => ({ name, url: urls[i] || null }));
  }

  // ─── Init ─────────────────────────────────────────────────────────
  async function init() {
    map = L.map('ku-map', {
      center:           [10, 100],
      zoom:             2,
      minZoom:          2,
      zoomControl:      false,
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

    // Layer groups (arcs below markers)
    arcGroup    = L.layerGroup().addTo(map);
    markerGroup = L.layerGroup().addTo(map);

    // Jakarta origin marker
    const originIcon = L.divIcon({
      className: '',
      html: '<div class="ku-origin"><div class="ku-origin-ring"></div><div class="ku-origin-dot"></div></div>',
      iconSize:   [24, 24],
      iconAnchor: [12, 12],
    });
    L.marker(ORIGIN, { icon: originIcon, zIndexOffset: 1000 })
      .bindTooltip('Jakarta', { permanent: true, direction: 'right', className: 'ku-origin-label' })
      .addTo(map);

    // Filter buttons
    document.getElementById('ku-filters').addEventListener('click', e => {
      const btn = e.target.closest('.ku-flt');
      if (!btn) return;
      document.querySelectorAll('.ku-flt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeYear = btn.dataset.year === 'all' ? 'all' : +btn.dataset.year;
      selectedNo = null;
      applyFilter();
    });

    // Visit list click (event delegation)
    document.getElementById('ku-list').addEventListener('click', e => {
      const item = e.target.closest('.ku-item');
      if (!item) return;
      selectVisit(+item.dataset.no);
    });

    // Mobile sidebar toggle
    document.getElementById('ku-menu-btn').addEventListener('click', () => {
      document.getElementById('ku-sidebar').classList.toggle('open');
    });
    map.on('click', () => {
      document.getElementById('ku-sidebar').classList.remove('open');
    });

    // Fetch visit data from API
    const loadingEl = document.getElementById('ku-loading');
    try {
      const raw = await fetch('/api/kunjungan/data').then(r => r.json());
      if (!Array.isArray(raw) || !raw.length) throw new Error('empty');
      VISITS = raw
        .filter(r => r.lat != null && r.lon != null)
        .map(normalizeRow);
      loadingEl.style.display = 'none';
      applyFilter();
    } catch {
      loadingEl.innerHTML = '<p style="color:#7A8BA0;font-size:13px">Gagal memuat data. Pastikan tabel Supabase sudah tersedia.</p>';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
