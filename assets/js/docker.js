/**
 * Docker Acceleration Page — OS Tab Switcher
 */

(function () {
  document.querySelectorAll('.docker-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var container = btn.closest('.tab-group');
      var os = btn.getAttribute('data-os');

      container.querySelectorAll('.docker-tab').forEach(function (b) {
        b.classList.remove('border-brand-accent', 'text-brand-accent');
        b.classList.add('border-transparent', 'text-brand-muted');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.remove('border-transparent', 'text-brand-muted');
      btn.classList.add('border-brand-accent', 'text-brand-accent');
      btn.setAttribute('aria-selected', 'true');

      container.querySelectorAll('.docker-panel').forEach(function (p) {
        p.classList.add('hidden');
      });
      var panel = document.getElementById('panel-' + os);
      if (panel) panel.classList.remove('hidden');
    });
  });
})();
