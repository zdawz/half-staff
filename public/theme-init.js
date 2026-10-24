(function () {
  try {
    localStorage.removeItem('halfstaff_theme');
    var saved = localStorage.getItem('halfstaff_theme_preference');
    var isDark =
      saved === 'dark' || saved === 'light'
        ? saved === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', isDark);
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) {
      metas[i].setAttribute('content', isDark ? '#020617' : '#f8fafc');
    }
  } catch (e) {
    // ignore storage errors
  }
})();
