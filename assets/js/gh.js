/**
 * GitHub Acceleration Page — URL Generator
 *
 * Reads the domain from config.js, falls back to location.hostname.
 */

(function () {
  var DOMAIN = (window.CF_PROXY && window.CF_PROXY.DOMAIN) || location.hostname;

  var input = document.getElementById('gh-input');
  var result = document.getElementById('gh-result');
  var copyBtn = document.getElementById('gh-copy');
  var generateBtn = document.getElementById('gh-generate');

  if (!input || !result || !copyBtn || !generateBtn) return;

  generateBtn.addEventListener('click', function () {
    var raw = input.value.trim();
    if (!raw) return;

    var proxyUrl = 'https://' + DOMAIN + '/' + raw;
    result.textContent = proxyUrl;
    result.classList.remove('text-brand-muted');
    result.classList.add('text-brand-text');
    copyBtn.disabled = false;
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') generateBtn.click();
  });

  copyBtn.addEventListener('click', function () {
    navigator.clipboard.writeText(result.textContent).then(function () {
      var orig = copyBtn.innerHTML;
      copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      setTimeout(function () { copyBtn.innerHTML = orig; }, 2000);
    });
  });
})();
