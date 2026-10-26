(function () {
  try {
    var theme = localStorage.getItem('kinbech-theme');
    if (theme !== 'dark' && theme !== 'light') theme = 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.style.colorScheme = 'dark';
  }
})();
