/* ─────────────────────────────────────────────────────────────────
   nrriandika — Recommendations Module
   Interactive song/artist recommendations backed by Supabase.
───────────────────────────────────────────────────────────────── */

(function Recs() {
  // ─── DOM refs ────────────────────────────────────────────────
  const form       = document.getElementById('recs-form');
  const nameInput  = document.getElementById('rec-name');
  const reasonInput = document.getElementById('rec-reason');
  const byInput    = document.getElementById('rec-name-by');
  const submitBtn  = document.getElementById('recs-submit');
  const toast      = document.getElementById('recs-toast');
  const listEl     = document.getElementById('recs-list');
  const emptyEl    = document.getElementById('recs-empty');
  const countEl    = document.getElementById('recs-count');
  const emojiPicker = document.getElementById('recs-emoji-picker');

  if (!form || !listEl) return;

  // ─── State ───────────────────────────────────────────────────
  let selectedType  = 'song';
  let selectedEmoji = '🎵';
  let currentFilter = 'all';
  let allRecs       = [];
  let likedIds      = new Set(JSON.parse(localStorage.getItem('rec_likes') || '[]'));

  // ─── Type toggle ─────────────────────────────────────────────
  document.querySelectorAll('.recs-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.recs-type-btn').forEach(b => b.classList.remove('recs-type-btn--active'));
      btn.classList.add('recs-type-btn--active');
      selectedType = btn.dataset.type;

      // Auto-switch default emoji
      if (selectedType === 'song' && selectedEmoji === '🎤') {
        selectEmoji('🎵');
      } else if (selectedType === 'artist' && selectedEmoji === '🎵') {
        selectEmoji('🎤');
      }

      nameInput.placeholder = selectedType === 'song' ? 'Song name...' : 'Artist name...';
    });
  });

  // ─── Emoji picker ────────────────────────────────────────────
  function selectEmoji(emoji) {
    selectedEmoji = emoji;
    emojiPicker.querySelectorAll('.recs-emoji').forEach(btn => {
      btn.classList.toggle('recs-emoji--active', btn.dataset.emoji === emoji);
    });
  }

  emojiPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.recs-emoji');
    if (btn) selectEmoji(btn.dataset.emoji);
  });

  // ─── Filter ──────────────────────────────────────────────────
  document.querySelectorAll('.recs-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.recs-filter-btn').forEach(b => b.classList.remove('recs-filter-btn--active'));
      btn.classList.add('recs-filter-btn--active');
      currentFilter = btn.dataset.filter;
      renderList();
    });
  });

  // ─── Toast ───────────────────────────────────────────────────
  function showToast(msg, type) {
    toast.textContent = msg;
    toast.className = `recs-toast show recs-toast--${type}`;
    setTimeout(() => { toast.className = 'recs-toast'; }, 3000);
  }

  // ─── Time ago ────────────────────────────────────────────────
  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);

    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  // ─── Escape HTML ─────────────────────────────────────────────
  function esc(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── Render ──────────────────────────────────────────────────
  function renderList() {
    const filtered = currentFilter === 'all'
      ? allRecs
      : allRecs.filter(r => r.type === currentFilter);

    countEl.textContent = allRecs.length;

    if (filtered.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }

    emptyEl.style.display = 'none';

    listEl.innerHTML = filtered.map((rec, i) => `
      <div class="rec-card" style="animation-delay:${Math.min(i * 0.04, 0.4)}s">
        <div class="rec-emoji">${rec.emoji || '🎵'}</div>
        <div class="rec-body">
          <div class="rec-top">
            <span class="rec-name">${esc(rec.name)}</span>
            <span class="rec-type-badge ${rec.type === 'artist' ? 'rec-type-badge--artist' : ''}">${rec.type}</span>
          </div>
          ${rec.reason ? `<p class="rec-reason">${esc(rec.reason)}</p>` : ''}
          <div class="rec-meta">
            <span class="rec-by">by ${esc(rec.submitted_by || 'Anonymous')}</span>
            <span class="rec-time">${timeAgo(rec.created_at)}</span>
          </div>
        </div>
        <div class="rec-actions">
          <button class="rec-like-btn ${likedIds.has(rec.id) ? 'liked' : ''}" data-id="${rec.id}">
            <svg viewBox="0 0 16 16" fill="${likedIds.has(rec.id) ? 'currentColor' : 'none'}"><path d="M8 14s-5.5-3.5-5.5-7.5C2.5 4 4.5 2.5 6.5 2.5 7.5 2.5 8 3 8 3s.5-.5 1.5-.5C11.5 2.5 13.5 4 13.5 6.5 13.5 10.5 8 14 8 14z" stroke="currentColor" stroke-width="1.2"/></svg>
            <span>${rec.likes || 0}</span>
          </button>
        </div>
      </div>
    `).join('');
  }

  // ─── Like handler (delegated) ────────────────────────────────
  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.rec-like-btn');
    if (!btn) return;

    const id = btn.dataset.id;
    if (likedIds.has(id)) return; // already liked

    btn.classList.add('liked');
    const countSpan = btn.querySelector('span');
    countSpan.textContent = parseInt(countSpan.textContent) + 1;
    btn.querySelector('svg path').setAttribute('fill', 'currentColor');

    likedIds.add(id);
    localStorage.setItem('rec_likes', JSON.stringify([...likedIds]));

    try {
      await fetch(`/api/recommendations/${id}/like`, { method: 'POST' });
    } catch { /* silent */ }
  });

  // ─── Fetch all ───────────────────────────────────────────────
  async function fetchRecs() {
    try {
      const res = await fetch('/api/recommendations');
      if (!res.ok) throw new Error('fetch failed');
      allRecs = await res.json();
      renderList();
    } catch {
      listEl.innerHTML = '<p style="text-align:center;color:var(--text-3);padding:20px;font-size:13px">Could not load recommendations.</p>';
    }
  }

  // ─── Submit ──────────────────────────────────────────────────
  submitBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      nameInput.style.borderColor = 'rgba(248,113,113,0.5)';
      setTimeout(() => { nameInput.style.borderColor = ''; }, 1500);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="recs-loading-dot"></span><span class="recs-loading-dot"></span><span class="recs-loading-dot"></span>';

    try {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedType,
          name,
          reason: reasonInput.value.trim() || null,
          submitted_by: byInput.value.trim() || 'Anonymous',
          emoji: selectedEmoji,
        }),
      });

      if (!res.ok) throw new Error('submit failed');

      const newRec = await res.json();
      allRecs.unshift(newRec);
      renderList();

      // Reset form
      nameInput.value = '';
      reasonInput.value = '';
      byInput.value = '';

      showToast('Thanks for the recommendation!', 'success');

      // Scroll to the new card
      const firstCard = listEl.querySelector('.rec-card');
      if (firstCard) firstCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch {
      showToast('Failed to submit. Please try again.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" width="14"><path d="M2 8l5 5L14 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Submit';
    }
  });

  // Enter key on name input triggers submit
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitBtn.click();
  });

  // ─── Init ────────────────────────────────────────────────────
  fetchRecs();

})();
