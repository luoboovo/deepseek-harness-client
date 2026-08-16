(() => {
  document.documentElement.dataset.dshMobile = 'true';

  function updateViewportHeight() {
    const height = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--dsh-mobile-height', `${Math.round(height)}px`);
  }

  updateViewportHeight();
  window.addEventListener('resize', updateViewportHeight, { passive: true });
  window.visualViewport?.addEventListener('resize', updateViewportHeight, { passive: true });
  window.visualViewport?.addEventListener('scroll', updateViewportHeight, { passive: true });

  document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches('input, textarea, [contenteditable="true"]')) return;
    window.setTimeout(() => target.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 180);
  });
})();
