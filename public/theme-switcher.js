(function () {
  const THEME_KEY = "cashAppThemeMode";

  const root = document.documentElement;
  const body = document.body;

  const VARS = [
    "--app-bg-color",
    "--text-primary",
    "--text-secondary",
    "--border-color-light",
    "--accent-green",
  ];

  function getCurrentVars() {
    const cs = getComputedStyle(root);
    const out = {};
    VARS.forEach((v) => (out[v] = cs.getPropertyValue(v).trim()));
    return out;
  }

  // Defaults = whatever each page currently has in :root
  const DEFAULTS = getCurrentVars();

  function setVars(map) {
    Object.keys(map).forEach((k) => root.style.setProperty(k, map[k]));
  }

  function updateActiveButtons(mode) {
    const btns = document.querySelectorAll("[data-theme-pick]");
    btns.forEach((b) => b.classList.toggle("active", b.dataset.themePick === mode));
  }

  function applyTheme(mode) {
    body.setAttribute("data-theme", mode);

    if (mode === "dark") {
      setVars({
        "--app-bg-color": "#000000",
        "--text-primary": "#ffffff",
        "--text-secondary": "rgba(255,255,255,0.65)",
        "--border-color-light": "rgba(255,255,255,0.15)",
        "--accent-green": "#000000",
      });
    } else if (mode === "white") {
      setVars({
        "--app-bg-color": "#ffffff",
        "--text-primary": "#000000",
        "--text-secondary": "#6c757d",
        "--border-color-light": "#e9ecef",
        "--accent-green": "#ffffff",
      });
    } else {
      setVars(DEFAULTS);
      body.setAttribute("data-theme", "green");
    }

    localStorage.setItem(THEME_KEY, mode);
    updateActiveButtons(mode);
  }

  function injectThemeCSS() {
    if (document.getElementById("theme-switcher-style")) return;

    const style = document.createElement("style");
    style.id = "theme-switcher-style";
    style.textContent = `
      .theme-row{display:flex;align-items:center;padding:18px 0;gap:12px;}
      .theme-row .settings-icon{margin-right:16px;}
      .theme-controls{display:flex;gap:8px;margin-left:auto;}
      .theme-btn{
        border:1px solid var(--border-color-light);
        background:transparent;
        color:var(--text-primary);
        padding:8px 12px;
        border-radius:999px;
        font-size:13px;
        font-weight:600;
        cursor:pointer;
        font-family:inherit;
      }
      .theme-btn.active{
        background:var(--text-primary);
        color:var(--app-bg-color);
        border-color:var(--text-primary);
      }

      body[data-theme="white"] .invite-btn{color:#000 !important;border:1px solid #000 !important;}
      body[data-theme="white"] .profile-pic-wrapper{border-color:#000 !important;}
      body[data-theme="white"] .edit-done-btn{color:#000 !important;}
      body[data-theme="white"] .settings-icon{color:#000 !important;}

      body[data-theme="dark"] .personal-edit-overlay{background-color:#000 !important;}
      body[data-theme="dark"] .edit-header{border-bottom-color:rgba(255,255,255,0.15) !important;}
      body[data-theme="dark"] .input-group input{background:transparent !important;}
    `;
    document.head.appendChild(style);
  }

  function injectThemeControls() {
    // If page has settings list like profile.html, inject a "Theme" row
    const list = document.querySelector(".settings-list");
    if (!list) return;

    if (document.getElementById("theme-settings-item")) return;

    const li = document.createElement("li");
    li.className = "settings-item";
    li.id = "theme-settings-item";

    // If font-awesome isn't on the page, the icon just won’t render; everything else still works.
    li.innerHTML = `
      <div class="theme-row">
        <i class="settings-icon fa-solid fa-palette"></i>
        <span class="settings-label">Theme</span>
        <div class="theme-controls">
          <button class="theme-btn" type="button" data-theme-pick="dark">Dark</button>
          <button class="theme-btn" type="button" data-theme-pick="white">White</button>
          <button class="theme-btn" type="button" data-theme-pick="green">Green</button>
        </div>
      </div>
    `;

    list.appendChild(li);

    li.querySelectorAll("[data-theme-pick]").forEach((btn) => {
      btn.addEventListener("click", () => applyTheme(btn.dataset.themePick));
    });
  }

  function init() {
    injectThemeCSS();
    injectThemeControls();

    const saved = localStorage.getItem(THEME_KEY) || "green";
    applyTheme(saved);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();