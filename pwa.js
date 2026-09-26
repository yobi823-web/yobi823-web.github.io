(() => {
  'use strict';
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  document.documentElement.classList.toggle('standalone', !!standalone);
  const hint = document.getElementById('installHint');
  if (hint && standalone) hint.hidden = true;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
        await reg.update().catch(() => {});
        const status = document.getElementById('pwaStatus');
        if (status) status.textContent = 'オフライン起動に対応しています。教材・学習記録はこの端末内に保存されます。';
      } catch (e) {
        console.error('PWA service worker registration failed', e);
      }
    }, { once: true });
  }

  try {
    if (navigator.storage?.persist && localStorage.getItem('ronsho:persist-requested') !== '1') {
      navigator.storage.persist().finally(() => {
        try { localStorage.setItem('ronsho:persist-requested', '1'); } catch (_) {}
      });
    }
  } catch (_) {}
})();
