/* ─────────────────────────────────────────────────────────────────
   nrriandika — Main Scripts
   Navigation, scroll animations, interactions
───────────────────────────────────────────────────────────────── */

// ─── Nav: scroll glass effect + active link ──────────────────────
const nav = document.getElementById('nav');
const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('section[id]');

function updateNav() {
  // Scrolled state
  if (window.scrollY > 40) {
    nav.classList.add('scrolled');
  } else {
    nav.classList.remove('scrolled');
  }

  // Active section highlight
  let current = '';
  sections.forEach(section => {
    const top = section.getBoundingClientRect().top;
    if (top <= 100) current = section.id;
  });

  navLinks.forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
  });
}

window.addEventListener('scroll', updateNav, { passive: true });
updateNav();

// ─── Intersection Observer — reveal on scroll ────────────────────
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const delay = el.dataset.delay ? parseInt(el.dataset.delay) : 0;
        setTimeout(() => {
          el.classList.add('revealed');
        }, delay);
        revealObserver.unobserve(el);
      }
    });
  },
  { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
);

// Work cards staggered reveal
document.querySelectorAll('.work-card').forEach((card, i) => {
  card.dataset.delay = i * 80;
  revealObserver.observe(card);
});

// Game cards staggered reveal
document.querySelectorAll('.game-card').forEach((card, i) => {
  card.dataset.delay = i * 120;
  revealObserver.observe(card);
});

// Section headers
document.querySelectorAll('.section-header').forEach(el => {
  el.classList.add('reveal');
  const headerObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          headerObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  headerObserver.observe(el);
});

// Spotify wrapper reveal
const spotifyWrapper = document.getElementById('spotify-wrapper');
if (spotifyWrapper) {
  spotifyWrapper.classList.add('reveal');
  const spObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          spObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );
  spObserver.observe(spotifyWrapper);
}

// ─── Footer year ─────────────────────────────────────────────────
const yearEl = document.getElementById('footer-year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ─── Smooth-scroll for nav links ─────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// ─── Orb parallax (hero) ─────────────────────────────────────────
const orbs = document.querySelectorAll('.orb');
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  orbs[0]?.style.setProperty('transform', `translateY(${y * 0.15}px)`);
  orbs[1]?.style.setProperty('transform', `translateY(${-y * 0.1}px)`);
  orbs[2]?.style.setProperty('transform', `translateY(${y * 0.08}px)`);
}, { passive: true });

// ─── Mouse-tilt for game cards ───────────────────────────────────
document.querySelectorAll('.game-card').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / rect.width;
    const dy = (e.clientY - cy) / rect.height;
    card.style.setProperty('--rx', `${dy * -8}deg`);
    card.style.setProperty('--ry', `${dx * 8}deg`);
    card.style.transform = `translateY(-6px) scale(1.01) rotateX(var(--rx)) rotateY(var(--ry))`;
  });

  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
  });
});

// ─── Game Connect Modal ─────────────────────────────────────────
const gmOverlay = document.getElementById('gm-overlay');
const gmModal   = document.getElementById('gm-modal');
const gmClose   = document.getElementById('gm-close');
const gmToast   = document.getElementById('gm-toast');

function openGameModal(gameId) {
  // Hide all content panels, show the right one
  gmModal.querySelectorAll('.gm-content').forEach(el => {
    el.style.display = el.dataset.modal === gameId ? '' : 'none';
  });
  gmOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeGameModal() {
  gmOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

// Open on button click
document.querySelectorAll('.game-connect-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openGameModal(btn.dataset.game);
  });
});

// Close handlers
gmClose?.addEventListener('click', closeGameModal);
gmOverlay?.addEventListener('click', (e) => {
  if (e.target === gmOverlay) closeGameModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && gmOverlay?.classList.contains('open')) closeGameModal();
});

// Copy to clipboard
function gmCopy(text) {
  navigator.clipboard.writeText(text).then(() => {
    gmToast.classList.add('show');
    gmToast.textContent = `Copied: ${text}`;
    setTimeout(() => gmToast.classList.remove('show'), 1800);
  });
}

// Copyable values (inline)
gmModal?.addEventListener('click', (e) => {
  const copyable = e.target.closest('.gm-copyable');
  if (copyable) {
    gmCopy(copyable.dataset.copy);
    return;
  }
  const copyBtn = e.target.closest('.gm-copy-uid');
  if (copyBtn) {
    gmCopy(copyBtn.dataset.copy);
    const orig = copyBtn.innerHTML;
    copyBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" width="14"><path d="M2 8l5 5L14 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Copied!';
    setTimeout(() => { copyBtn.innerHTML = orig; }, 1500);
  }
});

// ─── Work card hover: lift with shadow colour from gradient ──────
document.querySelectorAll('.work-card').forEach(card => {
  const placeholder = card.querySelector('.work-card-placeholder');
  if (!placeholder) return;
  const c1 = getComputedStyle(placeholder).getPropertyValue('--c1').trim() || '#6C63FF';
  card.addEventListener('mouseenter', () => {
    card.style.boxShadow = `0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px ${c1}33`;
  });
  card.addEventListener('mouseleave', () => {
    card.style.boxShadow = '';
  });
});
