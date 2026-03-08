(function () {
  const style = document.createElement('style');
  style.textContent = `
    body.secure-protected, body.secure-protected * { -webkit-user-drag: none; }
    .secure-topbar { position: fixed; top: 12px; right: 12px; z-index: 2147483645; display:flex; gap:10px; align-items:center; background: rgba(6,18,12,.88); color:#fff; padding:10px 12px; border-radius:999px; box-shadow:0 10px 25px rgba(0,0,0,.18); font: 600 12px/1.2 Inter,system-ui,sans-serif; backdrop-filter: blur(10px); }
    .secure-topbar button { border:none; border-radius:999px; padding:8px 11px; cursor:pointer; font: inherit; }
    .secure-logout { background:#16a34a; color:#fff; }
  `;
  document.head.appendChild(style);

  function blockCommonCopying() {
    document.body.classList.add('secure-protected');
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('dragstart', (e) => e.preventDefault());
    document.addEventListener('copy', (e) => {
      const tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
      if (!['input', 'textarea'].includes(tag)) e.preventDefault();
    });
    document.addEventListener('cut', (e) => {
      const tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
      if (!['input', 'textarea'].includes(tag)) e.preventDefault();
    });
    document.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (e.key === 'F12' || ((e.ctrlKey || e.metaKey) && ['u', 's', 'p', 'c', 'x', 'i', 'j'].includes(k))) {
        e.preventDefault();
      }
    });
  }

  function fmtRemaining(ms) {
    if (ms <= 0) return 'expired';
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h left`;
    return `${hours}h ${minutes}m left`;
  }

  async function start() {
    try {
      const res = await fetch('/api/auth/session');
      if (!res.ok) {
        location.replace('/');
        return;
      }
      const data = await res.json();
      blockCommonCopying();

      const bar = document.createElement('div');
      bar.className = 'secure-topbar';
      const timer = document.createElement('span');
      const btn = document.createElement('button');
      btn.className = 'secure-logout';
      btn.textContent = 'Logout';
      btn.onclick = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        location.replace('/');
      };
      bar.appendChild(timer);
      bar.appendChild(btn);
      document.body.appendChild(bar);

      function tick() {
        timer.textContent = fmtRemaining((data.expiresAt || 0) - Date.now());
        if ((data.expiresAt || 0) <= Date.now()) location.replace('/');
      }
      tick();
      setInterval(tick, 30000);
    } catch {
      location.replace('/');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
