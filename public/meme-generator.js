/* ─────────────────────────────────────────────────────────────────
   nrriandika — Meme Generator
   Fetches templates from imgflip, canvas-based editor with draggable text.
───────────────────────────────────────────────────────────────── */

(function MemeGenerator() {
  const IMGFLIP_API = 'https://api.imgflip.com/get_memes';

  // ─── State ────────────────────────────────────────────────────
  let templates = [];
  let filtered = [];
  let selected = null;
  let boxes = [];
  let drag = null;

  // ─── DOM ──────────────────────────────────────────────────────
  const gallerySection   = document.getElementById('mg-gallery-section');
  const galleryEl        = document.getElementById('mg-gallery');
  const loadingEl        = document.getElementById('mg-loading');
  const searchEl         = document.getElementById('mg-search');
  const countEl          = document.getElementById('mg-count');
  const editorEl         = document.getElementById('mg-editor');
  const backBtn          = document.getElementById('mg-back');
  const downloadBtn      = document.getElementById('mg-download');
  const previewEl        = document.getElementById('mg-preview');
  const previewImgEl     = document.getElementById('mg-preview-img');
  const overlayEl        = document.getElementById('mg-overlay');
  const textInputsEl     = document.getElementById('mg-text-inputs');
  const titleEl          = document.getElementById('mg-template-name');
  const dragHintEl       = document.getElementById('mg-drag-hint');
  const footerYear       = document.getElementById('footer-year');
  const navEl            = document.getElementById('nav');
  const fileInputEl      = document.getElementById('mg-file-input');
  const uploadBtnEl      = document.getElementById('mg-upload-btn');
  const uploadDropEl     = document.getElementById('mg-upload-drop');
  const uploadProgressEl = document.getElementById('mg-upload-progress');
  const uploadFillEl     = document.getElementById('mg-upload-fill');
  const uploadStatusEl   = document.getElementById('mg-upload-status');

  if (footerYear) footerYear.textContent = new Date().getFullYear();

  // ─── Nav scroll ───────────────────────────────────────────────
  window.addEventListener('scroll', () => {
    navEl?.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });

  // ─── Upload custom template ───────────────────────────────────
  uploadBtnEl?.addEventListener('click', () => fileInputEl?.click());

  // Drag-and-drop onto the upload area
  uploadDropEl?.addEventListener('dragover', e => { e.preventDefault(); uploadDropEl.classList.add('drag-over'); });
  uploadDropEl?.addEventListener('dragleave', () => uploadDropEl.classList.remove('drag-over'));
  uploadDropEl?.addEventListener('drop', e => {
    e.preventDefault();
    uploadDropEl.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleUpload(file);
  });

  fileInputEl?.addEventListener('change', () => {
    const file = fileInputEl.files?.[0];
    if (file) handleUpload(file);
    fileInputEl.value = '';
  });

  async function handleUpload(file) {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      showUploadError('Only JPG, PNG, GIF, and WebP are supported.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showUploadError('File too large — max 8 MB.');
      return;
    }

    uploadDropEl.style.display = 'none';
    uploadProgressEl.style.display = 'flex';
    uploadStatusEl.textContent = 'Uploading…';
    animateUploadBar();

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res  = await fetch('/api/upload-meme', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Upload failed');

      uploadStatusEl.textContent = 'Done!';
      uploadFillEl.style.width = '100%';

      // Small pause so user sees "Done!" before editor opens
      setTimeout(() => {
        resetUploadArea();
        openEditor({
          id:        data.public_id,
          name:      file.name.replace(/\.[^.]+$/, ''),
          url:       data.url,
          box_count: 2,
          custom:    true,
        });
      }, 500);
    } catch (err) {
      showUploadError(err.message || 'Upload failed. Try again.');
    }
  }

  function animateUploadBar() {
    uploadFillEl.style.transition = 'none';
    uploadFillEl.style.width = '0%';
    requestAnimationFrame(() => {
      uploadFillEl.style.transition = 'width 2s ease';
      uploadFillEl.style.width = '85%';
    });
  }

  function showUploadError(msg) {
    resetUploadArea();
    uploadStatusEl.textContent = msg;
    uploadProgressEl.style.display = 'flex';
    uploadProgressEl.style.color = '#f87171';
    uploadFillEl.style.background = '#f87171';
    uploadFillEl.style.width = '100%';
    setTimeout(resetUploadArea, 3000);
  }

  function resetUploadArea() {
    uploadDropEl.style.display = '';
    uploadProgressEl.style.display = 'none';
    uploadProgressEl.style.color = '';
    uploadFillEl.style.background = '';
    uploadFillEl.style.width = '0%';
  }

  // ─── Utility ──────────────────────────────────────────────────
  function esc(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── Load templates ───────────────────────────────────────────
  async function loadTemplates() {
    try {
      const res = await fetch(IMGFLIP_API);
      const data = await res.json();
      if (data.success) {
        templates = data.data.memes;
        filtered = templates;
        loadingEl.style.display = 'none';
        renderGallery(templates);
      } else {
        showGalleryError('Failed to load templates.');
      }
    } catch (e) {
      showGalleryError('Could not connect to imgflip. Try refreshing.');
    }
  }

  function showGalleryError(msg) {
    loadingEl.innerHTML = `<p style="color:var(--text-2)">${msg}</p>`;
  }

  // ─── Gallery render ───────────────────────────────────────────
  function renderGallery(list) {
    filtered = list;
    countEl.textContent = list.length + ' templates';

    if (list.length === 0) {
      galleryEl.innerHTML = '<p class="mg-empty">No templates match your search.</p>';
      return;
    }

    galleryEl.innerHTML = list.map(t => `
      <button class="mg-card" data-id="${esc(t.id)}" title="${esc(t.name)}">
        <div class="mg-card-img-wrap">
          <img src="${esc(t.url)}" alt="${esc(t.name)}" loading="lazy" />
        </div>
        <span class="mg-card-name">${esc(t.name)}</span>
        <span class="mg-card-boxes">${t.box_count} text${t.box_count !== 1 ? 's' : ''}</span>
      </button>
    `).join('');
  }

  // ─── Search ───────────────────────────────────────────────────
  searchEl?.addEventListener('input', () => {
    const q = searchEl.value.toLowerCase().trim();
    renderGallery(q ? templates.filter(t => t.name.toLowerCase().includes(q)) : templates);
  });

  // ─── Click template ───────────────────────────────────────────
  galleryEl?.addEventListener('click', e => {
    const card = e.target.closest('.mg-card');
    if (!card) return;
    const tmpl = templates.find(t => t.id === card.dataset.id);
    if (tmpl) openEditor(tmpl);
  });

  // ─── Open editor ──────────────────────────────────────────────
  function openEditor(template) {
    selected = template;
    titleEl.textContent = template.name;

    const count = Math.max(2, Math.min(template.box_count, 8));

    // Default positions: first at top, last at bottom, rest evenly distributed
    boxes = Array.from({ length: count }, (_, i) => ({
      id: i,
      text: '',
      x: 50,
      y: count === 1 ? 50 : (i === 0 ? 10 : i === count - 1 ? 88 : 10 + (78 / (count - 1)) * i),
      fontSize: 28,
      color: '#ffffff',
      strokeColor: '#000000',
      bold: false,
      italic: false,
      font: 'Impact',
    }));

    previewImgEl.src = template.url;
    previewImgEl.onload = () => {
      renderOverlay();
      renderTextInputs();
    };

    gallerySection.style.display = 'none';
    editorEl.style.display = 'block';

    // Dismiss drag hint after first drag
    setTimeout(() => { dragHintEl && (dragHintEl.style.opacity = '0.5'); }, 3000);
  }

  // ─── Back ─────────────────────────────────────────────────────
  backBtn?.addEventListener('click', () => {
    editorEl.style.display = 'none';
    gallerySection.style.display = 'block';
    overlayEl.innerHTML = '';
    textInputsEl.innerHTML = '';
    selected = null;
    boxes = [];
    drag = null;
  });

  // ─── Render text overlay labels ───────────────────────────────
  function renderOverlay() {
    overlayEl.innerHTML = boxes.map(b => `
      <div class="mg-label" data-id="${b.id}"
        style="left:${b.x}%;top:${b.y}%;font-size:${b.fontSize}px;color:${b.color};font-weight:${b.bold ? 'bold' : 'normal'};font-style:${b.italic ? 'italic' : 'normal'};font-family:'${b.font}',Impact,Arial,sans-serif;">
        <span class="mg-label-text">${esc(b.text) || `Text ${b.id + 1}`}</span>
      </div>
    `).join('');

    attachDragHandlers();
  }

  function updateLabel(id) {
    const b = boxes[id];
    const el = overlayEl.querySelector(`.mg-label[data-id="${id}"]`);
    if (!el) return;
    el.style.fontSize   = b.fontSize + 'px';
    el.style.color      = b.color;
    el.style.fontWeight = b.bold ? 'bold' : 'normal';
    el.style.fontStyle  = b.italic ? 'italic' : 'normal';
    el.style.fontFamily = `'${b.font}', Impact, Arial, sans-serif`;
    el.querySelector('.mg-label-text').textContent = b.text || `Text ${b.id + 1}`;
  }

  // ─── Render text input controls ───────────────────────────────
  function renderTextInputs() {
    textInputsEl.innerHTML = boxes.map(b => `
      <div class="mg-input-block" data-id="${b.id}">
        <div class="mg-input-label-row">
          <span class="mg-input-num">Text ${b.id + 1}</span>
          <span class="mg-input-hint">drag on preview to reposition</span>
        </div>
        <textarea class="mg-textarea" data-id="${b.id}" rows="2" placeholder="Enter text ${b.id + 1}…">${esc(b.text)}</textarea>
        <div class="mg-input-row">
          <label class="mg-ctrl-label" title="Text color">
            <span>Color</span>
            <input type="color" class="mg-color" data-id="${b.id}" value="${b.color}" />
          </label>
          <div class="mg-size-ctrl">
            <span class="mg-ctrl-label">Size</span>
            <input type="range" class="mg-range" data-id="${b.id}" min="12" max="80" value="${b.fontSize}" />
            <span class="mg-range-val" data-id="${b.id}">${b.fontSize}px</span>
          </div>
          <div class="mg-style-wrap">
            <button class="mg-style-btn ${b.bold ? 'active' : ''}" data-id="${b.id}" data-prop="bold" title="Bold"><b>B</b></button>
            <button class="mg-style-btn ${b.italic ? 'active' : ''}" data-id="${b.id}" data-prop="italic" title="Italic"><i>I</i></button>
          </div>
          <select class="mg-font-sel" data-id="${b.id}" title="Font">
            <option value="Impact"        ${b.font === 'Impact'         ? 'selected' : ''}>Impact</option>
            <option value="Arial"         ${b.font === 'Arial'          ? 'selected' : ''}>Arial</option>
            <option value="Georgia"       ${b.font === 'Georgia'        ? 'selected' : ''}>Georgia</option>
            <option value="Comic Sans MS" ${b.font === 'Comic Sans MS'  ? 'selected' : ''}>Comic Sans</option>
            <option value="Courier New"   ${b.font === 'Courier New'    ? 'selected' : ''}>Courier</option>
          </select>
        </div>
      </div>
    `).join('');

    bindInputEvents();
  }

  function bindInputEvents() {
    textInputsEl.querySelectorAll('.mg-textarea').forEach(el => {
      el.addEventListener('input', () => {
        boxes[+el.dataset.id].text = el.value;
        updateLabel(+el.dataset.id);
      });
    });

    textInputsEl.querySelectorAll('.mg-color').forEach(el => {
      el.addEventListener('input', () => {
        boxes[+el.dataset.id].color = el.value;
        updateLabel(+el.dataset.id);
      });
    });

    textInputsEl.querySelectorAll('.mg-range').forEach(el => {
      el.addEventListener('input', () => {
        const id = +el.dataset.id;
        boxes[id].fontSize = +el.value;
        textInputsEl.querySelector(`.mg-range-val[data-id="${id}"]`).textContent = el.value + 'px';
        updateLabel(id);
      });
    });

    textInputsEl.querySelectorAll('.mg-style-btn').forEach(el => {
      el.addEventListener('click', () => {
        const id = +el.dataset.id;
        const prop = el.dataset.prop;
        boxes[id][prop] = !boxes[id][prop];
        el.classList.toggle('active', boxes[id][prop]);
        updateLabel(id);
      });
    });

    textInputsEl.querySelectorAll('.mg-font-sel').forEach(el => {
      el.addEventListener('change', () => {
        boxes[+el.dataset.id].font = el.value;
        updateLabel(+el.dataset.id);
      });
    });
  }

  // ─── Drag & drop text labels ──────────────────────────────────
  function attachDragHandlers() {
    overlayEl.querySelectorAll('.mg-label').forEach(el => {
      el.addEventListener('mousedown', startDrag);
      el.addEventListener('touchstart', startDrag, { passive: false });
    });
  }

  function startDrag(e) {
    e.preventDefault();
    const el   = e.currentTarget;
    const id   = +el.dataset.id;
    const rect = overlayEl.getBoundingClientRect();
    const cx   = e.touches ? e.touches[0].clientX : e.clientX;
    const cy   = e.touches ? e.touches[0].clientY : e.clientY;

    drag = { id, startX: cx, startY: cy, origX: boxes[id].x, origY: boxes[id].y, rect };
    el.classList.add('dragging');

    // Hide hint on first drag
    if (dragHintEl) dragHintEl.style.display = 'none';

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('mouseup',   endDrag);
    document.addEventListener('touchend',  endDrag);
  }

  function onDragMove(e) {
    if (!drag) return;
    e.preventDefault();

    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;

    const nx = Math.max(2, Math.min(98, drag.origX + ((cx - drag.startX) / drag.rect.width)  * 100));
    const ny = Math.max(2, Math.min(98, drag.origY + ((cy - drag.startY) / drag.rect.height) * 100));

    boxes[drag.id].x = nx;
    boxes[drag.id].y = ny;

    const label = overlayEl.querySelector(`.mg-label[data-id="${drag.id}"]`);
    if (label) {
      label.style.left = nx + '%';
      label.style.top  = ny + '%';
    }
  }

  function endDrag() {
    if (!drag) return;
    overlayEl.querySelector(`.mg-label[data-id="${drag.id}"]`)?.classList.remove('dragging');
    drag = null;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('mouseup',   endDrag);
    document.removeEventListener('touchend',  endDrag);
  }

  // ─── Generate & Download ──────────────────────────────────────
  downloadBtn?.addEventListener('click', generateMeme);

  function generateMeme() {
    downloadBtn.disabled = true;
    downloadBtn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="none" width="14" class="spin"><path d="M8 2a6 6 0 100 12A6 6 0 008 2z" stroke="currentColor" stroke-width="1.5" stroke-dasharray="20" stroke-dashoffset="10"/></svg>
      Generating…`;

    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');
    const img    = new Image();

    // Try direct load with CORS — imgflip supports it
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);

      // Scale: ratio of canvas size to displayed image size
      const displayW = previewImgEl.naturalWidth  || previewImgEl.width  || canvas.width;
      const displayH = previewImgEl.naturalHeight || previewImgEl.height || canvas.height;
      const scaleX   = canvas.width  / displayW;
      const scaleY   = canvas.height / displayH;
      const scale    = Math.min(scaleX, scaleY);

      boxes.forEach(b => {
        if (!b.text.trim()) return;

        const canvasFontSize = b.fontSize * scale;
        let fontStr = '';
        if (b.italic) fontStr += 'italic ';
        if (b.bold)   fontStr += 'bold ';
        fontStr += `${canvasFontSize}px '${b.font}', Impact, Arial, sans-serif`;

        ctx.save();
        ctx.font        = fontStr;
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'middle';

        const px = (b.x / 100) * canvas.width;
        const py = (b.y / 100) * canvas.height;

        // Wrap long text
        const words = b.text.split(' ');
        const maxW  = canvas.width * 0.9;
        const lines = wrapText(ctx, words, maxW);
        const lh    = canvasFontSize * 1.2;
        const startY = py - ((lines.length - 1) * lh) / 2;

        lines.forEach((line, li) => {
          const ly = startY + li * lh;
          // Stroke outline
          ctx.strokeStyle = '#000000';
          ctx.lineWidth   = Math.max(2, canvasFontSize * 0.1);
          ctx.lineJoin    = 'round';
          ctx.strokeText(line, px, ly);
          // Fill
          ctx.fillStyle = b.color;
          ctx.fillText(line, px, ly);
        });

        ctx.restore();
      });

      canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = `meme-${selected.id}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        resetDownloadBtn();
      }, 'image/png');
    };

    img.onerror = () => {
      // CORS blocked — download original image and guide user
      alert('Could not render to canvas (CORS restriction). Right-click the preview image and choose "Save image as…" instead.');
      resetDownloadBtn();
    };

    img.src = selected.url;
  }

  function wrapText(ctx, words, maxW) {
    const lines = [];
    let line = '';
    words.forEach(word => {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function resetDownloadBtn() {
    downloadBtn.disabled = false;
    downloadBtn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="none" width="14"><path d="M8 3v7M5 7l3 3 3-3M3 13h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Download`;
  }

  // ─── Init ─────────────────────────────────────────────────────
  loadTemplates();
})();
