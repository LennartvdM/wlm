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

  /* Bento-carrousel: elke kaart wisselt willekeurig van omslag.
     Eén gedeelde pool; geen twee kaarten tonen tegelijk dezelfde omslag,
     ook niet tijdens een overgang. Echte crossfade: de nieuwe laag staat
     al volledig dekkend ONDER de oude, die eroverheen uitfadet — de
     achtergrond schijnt dus nooit door. */
  var bento = document.querySelector('.bento');
  var poolEl = document.getElementById('bento-pool');
  if (bento && poolEl && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var pool = JSON.parse(poolEl.textContent);
    var byId = {};
    pool.forEach(function (p) { byId[p.id] = p; });
    var cards = Array.prototype.slice.call(bento.querySelectorAll('.bento-card'));

    /* ids die nu zichtbaar zijn of in een lopende overgang zitten */
    var inUse = {};
    cards.forEach(function (c) { inUse[c.dataset.current] = true; });

    /* alles voorladen, zodat een gestagede laag altijd al geladen is */
    pool.forEach(function (p) { new Image().src = p.src; });

    var setLayer = function (layer, item) {
      layer.style.background = item.color;
      layer.querySelector('img').src = item.src;
    };

    var FADE_MS = 900;

    cards.forEach(function (card, i) {
      var top = card.querySelector('.layer.top');
      var bottom = card.querySelector('.layer.bottom');
      var title = card.querySelector('.card-title');

      var schedule = function (delay) {
        setTimeout(cycle, delay);
      };

      var cycle = function () {
        if (document.hidden || card.matches(':hover') || card.matches(':focus-within')) {
          schedule(1500 + Math.random() * 1500);
          return;
        }
        var candidates = pool.filter(function (p) { return !inUse[p.id]; });
        if (!candidates.length) { schedule(2000); return; }
        var next = candidates[Math.floor(Math.random() * candidates.length)];
        var oldId = card.dataset.current;
        inUse[next.id] = true;

        /* stage de nieuwe slide volledig dekkend op de onderste laag */
        setLayer(bottom, next);
        var img = bottom.querySelector('img');
        var ready = img.decode ? img.decode().catch(function () {}) : Promise.resolve();
        ready.then(function () {
          card.href = next.href;
          card.dataset.current = next.id;
          if (title) { title.textContent = next.title; }

          var finished = false;
          var finish = function () {
            if (finished) { return; }
            finished = true;
            top.removeEventListener('transitionend', finish);
            /* zet de bovenste laag terug op de nieuwe slide, zonder animatie */
            setLayer(top, next);
            top.classList.add('notransition');
            top.classList.remove('fading');
            void top.offsetWidth;
            top.classList.remove('notransition');
            delete inUse[oldId];
            schedule(3800 + Math.random() * 4200);
          };
          top.addEventListener('transitionend', finish);
          setTimeout(finish, FADE_MS + 250);
          top.classList.add('fading');
        });
      };

      schedule(2200 + i * 1300 + Math.random() * 1200);
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
