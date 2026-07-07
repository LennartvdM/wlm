/* wilmahenderikse.nl — kleine verbeteringen, geen frameworks */
(function () {
  'use strict';

  /* E-mailadres buiten de DOM houden tot de bezoeker erom vraagt.
     Adres wordt pas bij klik uit tekencodes samengesteld. */
  var slot = document.querySelector('[data-email-slot]');
  if (slot) {
    var btn = slot.querySelector('button');
    var codes = [105, 110, 102, 111, 64, 119, 105, 108, 109, 97, 104, 101,
                 110, 100, 101, 114, 105, 107, 115, 101, 46, 110, 108];
    btn.addEventListener('click', function () {
      var addr = String.fromCharCode.apply(null, codes);
      var a = document.createElement('a');
      a.href = 'mailto:' + addr;
      a.rel = 'nofollow';
      a.textContent = addr;
      slot.replaceChild(a, btn);
      a.focus();
    });
  }

  /* Filter op de publicatiepagina */
  var input = document.getElementById('pub-filter');
  if (input) {
    var items = Array.prototype.slice.call(document.querySelectorAll('.pub-list li'));
    var sections = Array.prototype.slice.call(document.querySelectorAll('.pub-section'));
    var counter = document.querySelector('.result-count');
    var empty = document.querySelector('.no-results');
    var total = items.length;

    var strip = function (s) {
      return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    };
    items.forEach(function (li) { li.dataset.q = strip(li.textContent); });

    var apply = function () {
      var q = strip(input.value.trim());
      var shown = 0;
      items.forEach(function (li) {
        var hit = !q || li.dataset.q.indexOf(q) !== -1;
        li.hidden = !hit;
        if (hit) { shown++; }
      });
      sections.forEach(function (sec) {
        var any = sec.querySelector('.pub-list li:not([hidden])');
        sec.hidden = !any;
      });
      if (counter) {
        counter.textContent = q ? shown + ' van ' + total + ' publicaties' : total + ' publicaties';
      }
      if (empty) { empty.style.display = shown === 0 ? 'block' : 'none'; }
    };

    input.addEventListener('input', apply);
    apply();
  }
})();
