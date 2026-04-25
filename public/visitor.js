/* ─────────────────────────────────────────────────────────────────
   nrriandika — Visitor Counter
   Tracks unique daily visitors, displays in footer.
───────────────────────────────────────────────────────────────── */

(function VisitorCounter() {
  // Throttle: register visit once per session, not on every page nav
  const SESSION_KEY = 'nv_session_v1';

  // ─── Track visit (silent, fire-and-forget) ───────────────────
  if (!sessionStorage.getItem(SESSION_KEY)) {
    fetch('/api/visit', { method: 'POST' }).catch(() => {});
    sessionStorage.setItem(SESSION_KEY, '1');
  }

  // ─── Display stats ───────────────────────────────────────────
  const totalEl = document.getElementById('visitor-total');
  const todayEl = document.getElementById('visitor-today');

  if (!totalEl && !todayEl) return;

  function animateCount(el, target) {
    if (!el) return;
    const duration = 1200;
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased).toLocaleString('en-US');
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // Delay slightly so it doesn't compete with main page load
  setTimeout(() => {
    fetch('/api/stats')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        animateCount(totalEl, data.total || 0);
        animateCount(todayEl, data.today || 0);
      })
      .catch(() => {});
  }, 500);
})();
