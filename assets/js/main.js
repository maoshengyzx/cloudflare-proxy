/**
 * Cloudflare Proxy — Shared JavaScript
 * Used across all pages: copy buttons, tab switching, URL generator
 */

/**
 * Tab switching utility.
 * Bind to buttons with [data-tab] attribute inside a `.tab-group` container.
 */
function initTabs() {
  document.querySelectorAll('[data-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var container = btn.closest('.tab-group');
      var tabId = btn.getAttribute('data-tab');

      container.querySelectorAll('[data-tab]').forEach(function (b) {
        b.classList.remove('border-brand-accent', 'text-brand-accent');
        b.classList.add('border-transparent', 'text-brand-muted');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.remove('border-transparent', 'text-brand-muted');
      btn.classList.add('border-brand-accent', 'text-brand-accent');
      btn.setAttribute('aria-selected', 'true');

      container.querySelectorAll('.tab-panel').forEach(function (p) {
        p.classList.add('hidden');
      });
      var panel = document.getElementById(tabId);
      if (panel) panel.classList.remove('hidden');
    });
  });
}

/**
 * Copy button: show green checkmark for 2s after copying.
 * Bind to elements with class `.copy-btn`.
 * Looks for `<code>` inside the nearest `.code-block` container.
 */
function initCopyButtons() {
  document.querySelectorAll('.copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var block = btn.closest('.code-block');
      var code = block ? block.querySelector('code').textContent : '';
      if (!code) return;

      navigator.clipboard.writeText(code).then(function () {
        var orig = btn.innerHTML;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        setTimeout(function () { btn.innerHTML = orig; }, 2000);
      });
    });
  });
}

// Auto-init on DOM ready
document.addEventListener('DOMContentLoaded', function () {
  initTabs();
  initCopyButtons();
});
