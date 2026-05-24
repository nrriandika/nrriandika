/* ─────────────────────────────────────────────────────────────────
   Pocong Map — Frontend Logic
   Leaflet map with real-time incidents, filtering, and submission.
───────────────────────────────────────────────────────────────── */

(function PocongMap() {
  // ── State ─────────────────────────────────────────────────────
  let map;
  let incidents    = [];
  let markers      = [];        // { incident, layer }
  let activeFilter = 'all';
  let pickingMode  = false;
  let tempMarker   = null;
  let selectedLoc  = null;      // { lat, lon, label }

  // ── DOM ───────────────────────────────────────────────────────
  const sidebar        = document.getElementById('sidebar');
  const sidebarCollapse= document.getElementById('sidebar-collapse');
  const mapMenuBtn     = document.getElementById('map-menu-btn');
  const filterGroup    = document.getElementById('filter-group');
  const incidentList   = document.getElementById('incident-list');
  const btnAdd         = document.getElementById('btn-add');
  const btnZoomExtent  = document.getElementById('btn-zoom-extent');
  const statTotal      = document.getElementById('stat-total');
  const statBenar      = document.getElementById('stat-benar');
  const statHoax       = document.getElementById('stat-hoax');
  const statUnverif    = document.getElementById('stat-unverif');

  const modalWrap      = document.getElementById('modal-wrap');
  const modalClose     = document.getElementById('modal-close');
  const modalBackdrop  = document.getElementById('modal-backdrop');

  const stepLocation   = document.getElementById('step-location');
  const stepDetail     = document.getElementById('step-detail');

  const locQ           = document.getElementById('loc-q');
  const locSearchBtn   = document.getElementById('loc-search-btn');
  const locResults     = document.getElementById('loc-results');
  const locPickBtn     = document.getElementById('loc-pick-btn');
  const locPreview     = document.getElementById('loc-preview');
  const locPreviewText = document.getElementById('loc-preview-text');
  const locResetBtn    = document.getElementById('loc-reset-btn');
  const btnNext        = document.getElementById('btn-next');

  const stepDetailEl   = document.getElementById('step-detail');
  const fLokasi        = document.getElementById('f-lokasi');
  const fKota          = document.getElementById('f-kota');
  const fProvinsi      = document.getElementById('f-provinsi');
  const fTgl           = document.getElementById('f-tgl');
  const fKet           = document.getElementById('f-ket');
  const fHp            = document.getElementById('f-hp');
  const fTs            = document.getElementById('f-ts');
  const ketCount       = document.getElementById('ket-count');
  const btnBackStep    = document.getElementById('btn-back-step');
  const btnSubmit      = document.getElementById('btn-submit');
  const submitMsg      = document.getElementById('submit-msg');
  const pickHint       = document.getElementById('pick-hint');
  const pickCancel     = document.getElementById('pick-cancel');

  // ── Init map ──────────────────────────────────────────────────
  function initMap() {
    map = L.map('map', {
      center: [-2.5, 118.0],
      zoom: 5,
      zoomControl: false,       // we place it manually at bottomright
      attributionControl: true,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // CartoDB Dark Matter tiles (free, no API key)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Disable map click propagation to modal
    map.on('click', onMapClick);
  }

  function onMapClick(e) {
    if (!pickingMode) return;
    const { lat, lng } = e.latlng;
    setSelectedLoc(lat, lng, `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    exitPickMode();
  }

  // ── Markers ───────────────────────────────────────────────────
  function statusClass(status) {
    if (status === 'Benar') return 'benar';
    if (status === 'Hoax')  return 'hoax';
    return 'unverif';
  }

  function statusIcon(status) {
    if (status === 'Benar') return '✓';
    if (status === 'Hoax')  return '✗';
    return '?';
  }

  function statusLabel(status) {
    if (status === 'Benar') return 'Benar';
    if (status === 'Hoax')  return 'Hoax';
    return 'Belum Diverifikasi';
  }

  function createMarker(inc) {
    const cls = statusClass(inc.status);
    const icon = L.divIcon({
      className: '',
      html: `<div class="pm pm--${cls}" title="${esc(inc.lokasi)}">${statusIcon(inc.status)}</div>`,
      iconSize:   [24, 24],
      iconAnchor: [12, 12],
      popupAnchor:[0, -16],
    });

    const layer = L.marker([inc.lat, inc.lon], { icon });
    layer.bindPopup(buildPopup(inc), { maxWidth: 300, className: 'pocong-popup' });

    return { incident: inc, layer };
  }

  function buildPopup(inc) {
    const cls   = statusClass(inc.status);
    const date  = inc.tgl ? new Date(inc.tgl).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
    const loc   = [inc.kecamatan, inc.kota, inc.provinsi].filter(Boolean).join(', ');

    return `
      <div class="pop">
        <span class="pop-status pop-status--${cls}">${statusLabel(inc.status)}</span>
        <p class="pop-name">${esc(inc.lokasi)}</p>
        ${loc  ? `<p class="pop-meta">📍 ${esc(loc)}</p>` : ''}
        ${date ? `<p class="pop-meta">📅 ${date}</p>` : ''}
        ${inc.ket ? `<p class="pop-ket">${esc(inc.ket)}</p>` : ''}
      </div>`;
  }

  function renderMarkers(data) {
    // Remove existing
    markers.forEach(m => map.removeLayer(m.layer));
    markers = [];

    data.forEach(inc => {
      if (!inc.lat || !inc.lon) return;
      const m = createMarker(inc);
      markers.push(m);
      m.layer.addTo(map);
    });
  }

  function applyFilter(status) {
    activeFilter = status;
    markers.forEach(({ incident, layer }) => {
      const visible = status === 'all' || incident.status === status;
      if (visible) {
        if (!map.hasLayer(layer)) layer.addTo(map);
      } else {
        if (map.hasLayer(layer)) map.removeLayer(layer);
      }
    });

    // Update filter buttons
    filterGroup.querySelectorAll('.flt-btn').forEach(btn => {
      btn.classList.toggle('flt-btn--active', btn.dataset.status === status);
    });
  }

  // ── Fetch incidents ───────────────────────────────────────────
  async function fetchIncidents() {
    try {
      const res  = await fetch('/api/pocong/incidents');
      const data = await res.json();
      const firstLoad = incidents.length === 0;
      incidents  = Array.isArray(data) ? data : [];
      renderMarkers(incidents);
      renderIncidentList(incidents);
      updateStats(incidents);
      if (firstLoad && incidents.length > 0) zoomToExtent();
    } catch (e) {
      incidentList.innerHTML = '<div class="incident-loading" style="color:#ef4444">Gagal memuat data.</div>';
    }
  }

  function updateStats(data) {
    const benar   = data.filter(d => d.status === 'Benar').length;
    const hoax    = data.filter(d => d.status === 'Hoax').length;
    const unverif = data.filter(d => d.status === 'Belum Diverifikasi').length;
    animCount(statTotal,   data.length);
    animCount(statBenar,   benar);
    animCount(statHoax,    hoax);
    animCount(statUnverif, unverif);
  }

  function animCount(el, target) {
    if (!el) return;
    const start = performance.now();
    const dur   = 600;
    (function tick(now) {
      const t = Math.min((now - start) / dur, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(tick);
    })(start);
  }

  function renderIncidentList(data) {
    const filtered = activeFilter === 'all' ? data : data.filter(d => d.status === activeFilter);

    if (filtered.length === 0) {
      incidentList.innerHTML = '<div class="incident-loading">Tidak ada data.</div>';
      return;
    }

    incidentList.innerHTML = filtered.slice(0, 50).map(inc => {
      const cls  = statusClass(inc.status);
      const date = inc.tgl ? new Date(inc.tgl).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
      return `
        <div class="inc-item" data-lat="${inc.lat}" data-lon="${inc.lon}">
          <span class="inc-dot inc-dot--${cls}"></span>
          <div class="inc-body">
            <p class="inc-name">${esc(inc.lokasi)}</p>
            <p class="inc-meta">${esc(inc.kota || inc.provinsi || '–')} · ${date}</p>
          </div>
        </div>`;
    }).join('');

    // Click to fly to marker
    incidentList.querySelectorAll('.inc-item').forEach(el => {
      el.addEventListener('click', () => {
        const lat = +el.dataset.lat;
        const lon = +el.dataset.lon;
        if (lat && lon) {
          map.flyTo([lat, lon], 14, { duration: 1 });
          // Open matching popup
          const m = markers.find(m => +m.incident.lat === lat && +m.incident.lon === lon);
          if (m) m.layer.openPopup();
          // On mobile, collapse sidebar
          if (window.innerWidth <= 700) sidebar.classList.remove('open');
        }
      });
    });
  }

  // ── Filter ────────────────────────────────────────────────────
  filterGroup?.addEventListener('click', e => {
    const btn = e.target.closest('.flt-btn');
    if (!btn) return;
    applyFilter(btn.dataset.status);
    renderIncidentList(incidents);
  });

  // ── Zoom to extent ────────────────────────────────────────────
  btnZoomExtent?.addEventListener('click', zoomToExtent);

  function zoomToExtent() {
    const visible = markers.filter(m => map.hasLayer(m.layer));
    if (visible.length === 0) return;
    const latlngs = visible.map(m => [m.incident.lat, m.incident.lon]);
    map.fitBounds(L.latLngBounds(latlngs), { padding: [60, 60], maxZoom: 13 });

    // Pulse the button briefly
    btnZoomExtent?.classList.add('active');
    setTimeout(() => btnZoomExtent?.classList.remove('active'), 600);
  }

  // ── Sidebar toggle ────────────────────────────────────────────
  sidebarCollapse?.addEventListener('click', () => {
    if (window.innerWidth <= 700) {
      sidebar.classList.remove('open');
    } else {
      sidebar.classList.add('collapsed');
    }
    // Let the map recalculate size after sidebar animates
    setTimeout(() => map.invalidateSize(), 300);
  });

  mapMenuBtn?.addEventListener('click', () => {
    if (window.innerWidth <= 700) {
      sidebar.classList.add('open');
    } else {
      sidebar.classList.remove('collapsed');
    }
    setTimeout(() => map.invalidateSize(), 300);
  });

  // ── Modal ─────────────────────────────────────────────────────
  btnAdd?.addEventListener('click', openModal);
  modalClose?.addEventListener('click', closeModal);
  modalBackdrop?.addEventListener('click', closeModal);

  function openModal() {
    modalWrap.style.display = 'flex';
    stepLocation.style.display = 'block';
    stepDetail.style.display = 'none';
    resetLocation();
    resetForm();
    fTs.value = Date.now();

    // On mobile, hide sidebar
    if (window.innerWidth <= 700) sidebar.classList.remove('open');
  }

  function closeModal() {
    modalWrap.style.display = 'none';
    exitPickMode();
    if (tempMarker) { map.removeLayer(tempMarker); tempMarker = null; }
    selectedLoc = null;
  }

  // ── Location step ─────────────────────────────────────────────
  locSearchBtn?.addEventListener('click', doGeocode);
  locQ?.addEventListener('keydown', e => { if (e.key === 'Enter') doGeocode(); });

  async function doGeocode() {
    const q = locQ.value.trim();
    if (!q) return;
    locSearchBtn.textContent = '…';
    locResults.style.display = 'none';
    try {
      const res  = await fetch(`/api/pocong/geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        locResults.innerHTML = '<div class="loc-result-item" style="color:var(--text-3)">Tidak ditemukan. Coba nama yang lebih spesifik.</div>';
      } else {
        locResults.innerHTML = data.slice(0, 5).map((r, i) => `
          <div class="loc-result-item" data-idx="${i}" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${esc(r.display_name)}">
            ${esc(r.display_name)}
          </div>`).join('');
        locResults.querySelectorAll('.loc-result-item').forEach(el => {
          el.addEventListener('click', () => {
            const lat = +el.dataset.lat;
            const lon = +el.dataset.lon;
            const name = el.dataset.name;
            setSelectedLoc(lat, lon, name);
            locResults.style.display = 'none';
            locQ.value = '';
            // Prefill lokasi field
            if (!fLokasi.value) fLokasi.value = name.split(',')[0].trim().slice(0, 200);
            map.flyTo([lat, lon], 13, { duration: 1 });
          });
        });
      }
      locResults.style.display = 'block';
    } catch (e) {
      locResults.innerHTML = '<div class="loc-result-item" style="color:var(--red)">Geocoding gagal. Coba lagi.</div>';
      locResults.style.display = 'block';
    } finally {
      locSearchBtn.textContent = 'Cari';
    }
  }

  locPickBtn?.addEventListener('click', () => {
    enterPickMode();
    // Collapse modal to let user see map
    modalWrap.style.display = 'none';
  });

  pickCancel?.addEventListener('click', () => {
    exitPickMode();
    modalWrap.style.display = 'flex';
  });

  locResetBtn?.addEventListener('click', resetLocation);

  btnNext?.addEventListener('click', () => {
    if (!selectedLoc) return;
    stepLocation.style.display = 'none';
    stepDetail.style.display = 'block';
    // Set today as default date
    if (!fTgl.value) fTgl.value = new Date().toISOString().slice(0, 10);
  });

  btnBackStep?.addEventListener('click', () => {
    stepDetail.style.display = 'none';
    stepLocation.style.display = 'block';
    submitMsg.style.display = 'none';
  });

  function setSelectedLoc(lat, lon, label) {
    selectedLoc = { lat, lon, label };
    locPreviewText.textContent = label.length > 60 ? label.slice(0, 60) + '…' : label;
    locPreview.style.display = 'flex';
    locPickBtn.style.display = 'none';
    btnNext.disabled = false;

    // Temp marker on map
    if (tempMarker) map.removeLayer(tempMarker);
    const icon = L.divIcon({
      className: '',
      html: '<div class="pm pm--unverif" style="animation:none">+</div>',
      iconSize: [24, 24], iconAnchor: [12, 12],
    });
    tempMarker = L.marker([lat, lon], { icon }).addTo(map);

    // If modal was hidden (pick mode), show it again
    modalWrap.style.display = 'flex';
  }

  function resetLocation() {
    selectedLoc = null;
    locPreview.style.display = 'none';
    locPickBtn.style.display = '';
    locResults.style.display = 'none';
    locQ.value = '';
    btnNext.disabled = true;
    if (tempMarker) { map.removeLayer(tempMarker); tempMarker = null; }
  }

  function enterPickMode() {
    pickingMode = true;
    document.getElementById('map').classList.add('pick-mode');
    pickHint.style.display = 'flex';
  }

  function exitPickMode() {
    pickingMode = false;
    document.getElementById('map').classList.remove('pick-mode');
    pickHint.style.display = 'none';
  }

  // ── Form ──────────────────────────────────────────────────────
  fKet?.addEventListener('input', () => {
    ketCount.textContent = fKet.value.length;
  });

  function resetForm() {
    [fLokasi, fKota, fProvinsi, fTgl, fKet].forEach(el => { if (el) el.value = ''; });
    const radios = document.querySelectorAll('input[name="f-status"]');
    radios.forEach(r => { r.checked = r.value === 'Belum Diverifikasi'; });
    fHp.value = '';
    submitMsg.style.display = 'none';
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Kirim Laporan';
    if (ketCount) ketCount.textContent = '0';
  }

  btnSubmit?.addEventListener('click', submitReport);

  async function submitReport() {
    // Honeypot check (client-side early exit)
    if (fHp.value) return;

    const lokasi = fLokasi.value.trim();
    const status = document.querySelector('input[name="f-status"]:checked')?.value;

    if (!lokasi) return showMsg('Nama lokasi wajib diisi.', 'err');
    if (!status) return showMsg('Pilih status kejadian.', 'err');
    if (!selectedLoc) return showMsg('Lokasi belum dipilih.', 'err');

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Mengirim…';
    submitMsg.style.display = 'none';

    try {
      const payload = {
        lokasi,
        kota:       fKota.value.trim(),
        provinsi:   fProvinsi.value.trim(),
        lat:        selectedLoc.lat,
        lon:        selectedLoc.lon,
        status,
        tgl:        fTgl.value || null,
        ket:        fKet.value.trim(),
        honeypot:   fHp.value,
        formLoadedAt: fTs.value,
      };

      const res  = await fetch('/api/pocong/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        showMsg(data.message || 'Gagal mengirim laporan.', 'err');
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Kirim Laporan';
        return;
      }

      showMsg('✓ Laporan berhasil dikirim! Terima kasih.', 'ok');
      btnSubmit.textContent = 'Terkirim ✓';

      // Refresh map after short delay
      setTimeout(() => {
        fetchIncidents();
        setTimeout(closeModal, 1500);
      }, 1000);

    } catch (e) {
      showMsg('Koneksi gagal. Coba lagi.', 'err');
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Kirim Laporan';
    }
  }

  function showMsg(text, type) {
    submitMsg.textContent = text;
    submitMsg.className   = `submit-msg submit-msg--${type}`;
    submitMsg.style.display = 'block';
  }

  // ── Utility ───────────────────────────────────────────────────
  function esc(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Init ──────────────────────────────────────────────────────
  initMap();
  fetchIncidents();

  // Auto-refresh every 60s
  setInterval(fetchIncidents, 60_000);

})();
