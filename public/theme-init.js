(function () {
  try {
    localStorage.removeItem('halfstaff_theme');
    var saved = localStorage.getItem('halfstaff_theme_preference');
    var isDark =
      saved === 'dark' || saved === 'light'
        ? saved === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', isDark);
    var metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#0f172a' : '#f8fafc');
    }
  } catch (e) {
    // ignore storage errors
  }
})();
