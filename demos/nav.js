(function () {
  const style = document.createElement('style');
  style.textContent = `
    #lm-nav {
      position: fixed;
      top: 0; left: 0; right: 0;
      height: 34px;
      background: #1a1108;
      color: #f0e8d0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 1rem;
      font-family: 'Courier New', Courier, monospace;
      font-size: 0.7rem;
      letter-spacing: 0.08em;
      z-index: 99999;
      box-sizing: border-box;
    }
    #lm-nav a {
      color: #f0e8d0;
      text-decoration: none;
      opacity: 0.65;
      transition: opacity 0.15s;
    }
    #lm-nav a:hover { opacity: 1; }
    #lm-nav .lm-nav-title {
      opacity: 0.35;
      font-size: 0.65rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    body { padding-top: 34px !important; }
  `;
  document.head.appendChild(style);

  function mount() {
    const bar = document.createElement('div');
    bar.id = 'lm-nav';
    bar.innerHTML =
      '<a href="./">&#8592; All demos</a>' +
      '<span class="lm-nav-title">Layoutmaster</span>' +
      '<a href="https://github.com/cosmiciron/layoutmaster" target="_blank" rel="noopener noreferrer">GitHub</a>';
    document.body.insertBefore(bar, document.body.firstChild);
  }

  if (document.body) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount);
  }
})();
