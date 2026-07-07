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

  /* Gebaren-tracker: wheel-events binnen ~180ms van elkaar horen bij hetzelfde
     gebaar (trackpad-momentum). Grensovergangen tussen scrollers gebeuren
     alleen op een VERS gebaar, zodat momentum nooit door een grens heen schiet. */
  var wheelTracker = { ts: 0, fresh: true };
  document.addEventListener('wheel', function (event) {
    wheelTracker.fresh = event.timeStamp - wheelTracker.ts > 180;
    wheelTracker.ts = event.timeStamp;
  }, { capture: true, passive: true });

  /* Brug van de binnenste scrollytell naar de buitenste: de Monitor-pager
     geeft de scroll-intentie aan de site-snap door zodra hij aan zijn rand zit. */
  var siteBridge = null;

  /* Buitenste scrollytelling: de homepage zelf bestaat uit hoofdstukken.
     De Monitor hieronder is dus een geneste scrollytell, geen los blok. */
  var siteScrolly = document.querySelector('[data-site-scrolly]');
  var siteSteps = siteScrolly
    ? Array.prototype.filter.call(siteScrolly.children, function (el) {
      return el.hasAttribute('data-site-step');
    })
    : [];
  if (siteSteps.length) {
    document.documentElement.classList.add('home-scrolly-root');
    var navLinks = Array.prototype.slice.call(document.querySelectorAll('.site-nav a[href^="#"]'));
    var siteTicking = false;
    var siteSettleTimer = 0;
    var siteAutoScrollTimer = 0;
    var siteAutoScrolling = false;
    var siteSnapBlockedUntil = 0;
    var siteTouchActive = false;
    var siteScrollDirection = 0;
    var siteLastScrollY = window.scrollY;
    var siteReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var primarySiteTarget = function (step) {
      return step.querySelector('[data-site-snap-primary]') ||
             step.querySelector('[data-site-snap]') ||
             step;
    };
    var cssPx = function (value) {
      var number = parseFloat(value);
      return isNaN(number) ? 0 : number;
    };
    var siteSnapCenter = function () {
      var styles = window.getComputedStyle(document.documentElement);
      var top = cssPx(styles.scrollPaddingTop);
      var bottom = cssPx(styles.scrollPaddingBottom);
      var height = window.innerHeight - top - bottom;
      return top + Math.max(0, height) * .5;
    };
    var siteMaxScroll = function () {
      return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    };
    var nearestSiteTargetIndex = function () {
      var center = siteSnapCenter();
      var best = 0;
      var bestDistance = Infinity;
      siteTargets.forEach(function (entry, i) {
        var rect = entry.target.getBoundingClientRect();
        var distance = Math.abs(rect.top + rect.height * .5 - center);
        if (distance < bestDistance) {
          best = i;
          bestDistance = distance;
        }
      });
      return best;
    };
    var nearestSiteTarget = function () {
      return siteTargets[nearestSiteTargetIndex()];
    };
    var releaseSiteAutoScroll = function (delay) {
      clearTimeout(siteAutoScrollTimer);
      siteAutoScrolling = true;
      siteAutoScrollTimer = setTimeout(function () {
        siteAutoScrolling = false;
        requestSiteStepUpdate();
      }, delay);
    };
    /* Vers gebruikersgebaar wint altijd van een lopende auto-scroll. */
    var cancelSiteAutoScroll = function () {
      if (!siteAutoScrolling) { return; }
      clearTimeout(siteAutoScrollTimer);
      siteAutoScrolling = false;
      window.scrollTo(window.scrollX, window.scrollY);
    };
    var centerSiteTarget = function (target, behavior) {
      if (!target) { return; }
      if (siteReducedMotion) { behavior = 'auto'; }
      var styles = window.getComputedStyle(document.documentElement);
      var padTop = cssPx(styles.scrollPaddingTop);
      var snapH = window.innerHeight - padTop - cssPx(styles.scrollPaddingBottom);
      var rect = target.getBoundingClientRect();
      /* doelen die hoger zijn dan het snap-venster (zoals de bento) lijnen we
         aan de bovenkant uit in plaats van te centreren */
      var delta = rect.height > snapH
        ? rect.top - padTop
        : rect.top + rect.height * .5 - siteSnapCenter();
      if (Math.abs(delta) < 2) { return; }
      var top = Math.max(0, Math.min(siteMaxScroll(), window.scrollY + delta));
      releaseSiteAutoScroll(behavior === 'smooth' ? 820 : 80);
      window.scrollTo({ top: top, behavior: behavior });
    };
    var siteTargets = [];
    siteSteps.forEach(function (step) {
      var targets = Array.prototype.slice.call(step.querySelectorAll('[data-site-snap]'));
      if (!targets.length) { targets = [step]; }
      targets.forEach(function (target) {
        siteTargets.push({ step: step, target: target });
      });
    });
    var setSiteStep = function (step, target) {
      if (!step) { return; }
      target = target || primarySiteTarget(step);
      var id = step.getAttribute('data-site-step') || step.id || '';
      document.body.setAttribute('data-current-site-step', id);
      siteSteps.forEach(function (el) {
        el.classList.toggle('is-site-active', el === step);
      });
      siteTargets.forEach(function (entry) {
        entry.target.classList.toggle('is-site-target-active', entry.target === target);
      });
      navLinks.forEach(function (link) {
        var hash = link.getAttribute('href').slice(1);
        var on = hash && (hash === id || hash === step.id);
        if (on) { link.setAttribute('aria-current', 'page'); }
        else { link.removeAttribute('aria-current'); }
      });
    };

    var updateSiteStep = function () {
      siteTicking = false;
      var best = nearestSiteTarget();
      if (best) { setSiteStep(best.step, best.target); }
    };

    var scheduleSiteSettle = function () {
      clearTimeout(siteSettleTimer);
      if (siteReducedMotion || siteAutoScrolling || siteTouchActive || Date.now() < siteSnapBlockedUntil) { return; }
      siteSettleTimer = setTimeout(function () {
        if (siteAutoScrolling || siteTouchActive || Date.now() < siteSnapBlockedUntil) { return; }
        if (!siteTargets.length) { return; }
        var center = siteSnapCenter();
        var index = nearestSiteTargetIndex();
        var rect = siteTargets[index].target.getBoundingClientRect();
        var delta = rect.top + rect.height * .5 - center;
        /* Richtingsgevoelige zwaartekracht: wie omlaag veegde wil het VOLGENDE
           item zien, niet teruggetrokken worden naar het vorige. Alleen als het
           dichtstbijzijnde doel tegen de veegrichting in ligt, stappen we door. */
        if (siteScrollDirection > 0 && delta < -12 && index < siteTargets.length - 1) { index += 1; }
        else if (siteScrollDirection < 0 && delta > 12 && index > 0) { index -= 1; }
        var best = siteTargets[index];
        /* vrije doelen (zoals de bento) hebben geen zwaartekracht:
           daar scrolt de lezer gewoon open door */
        if (best.target.hasAttribute('data-site-snap-free')) { return; }
        rect = best.target.getBoundingClientRect();
        delta = rect.top + rect.height * .5 - center;
        if (Math.abs(delta) < 12 || Math.abs(delta) > window.innerHeight * .9) { return; }
        centerSiteTarget(best.target, 'smooth');
      }, 180);
    };

    var requestSiteStepUpdate = function () {
      if (siteTicking) { return; }
      siteTicking = true;
      requestAnimationFrame(updateSiteStep);
    };

    navLinks.forEach(function (link) {
      var hash = link.getAttribute('href');
      var target = hash && hash.charAt(0) === '#' ? document.getElementById(hash.slice(1)) : null;
      if (!target || !target.matches('[data-site-step]')) { return; }
      link.addEventListener('click', function (event) {
        event.preventDefault();
        var snapTarget = primarySiteTarget(target);
        centerSiteTarget(snapTarget, 'smooth');
        if (window.history && window.history.pushState) {
          window.history.pushState(null, '', hash);
        }
        setSiteStep(target, snapTarget);
      });
    });

    var alignHashStep = function () {
      var id = window.location.hash ? window.location.hash.slice(1) : '';
      var target = id ? document.getElementById(id) : null;
      if (!target || siteSteps.indexOf(target) === -1) { return; }
      var snapTarget = primarySiteTarget(target);
      centerSiteTarget(snapTarget, 'auto');
      setSiteStep(target, snapTarget);
    };

    document.addEventListener('wheel', function (event) {
      if (wheelTracker.fresh) { cancelSiteAutoScroll(); }
      if (event.target && event.target.closest && event.target.closest('[data-monitor-content-scroll]')) {
        siteSnapBlockedUntil = Date.now() + 700;
      }
    }, { capture: true, passive: true });
    window.addEventListener('touchstart', function () {
      siteTouchActive = true;
      cancelSiteAutoScroll();
    }, { capture: true, passive: true });
    var siteTouchEnd = function () {
      siteTouchActive = false;
      scheduleSiteSettle();
    };
    window.addEventListener('touchend', siteTouchEnd, { capture: true, passive: true });
    window.addEventListener('touchcancel', siteTouchEnd, { capture: true, passive: true });

    /* Brug voor de geneste Monitor-scrollytell: één stap omhoog of omlaag
       in de buitenste hoofdstukken, vanaf het element dat erom vraagt. */
    siteBridge = {
      nudge: function (fromEl, direction) {
        var index = -1;
        siteTargets.forEach(function (entry, i) {
          if (entry.target === fromEl) { index = i; }
        });
        if (index === -1) {
          var center = siteSnapCenter();
          var bestDistance = Infinity;
          siteTargets.forEach(function (entry, i) {
            var rect = entry.target.getBoundingClientRect();
            var distance = Math.abs(rect.top + rect.height * .5 - center);
            if (distance < bestDistance) {
              bestDistance = distance;
              index = i;
            }
          });
        }
        if (index === -1) { return false; }
        var next = siteTargets[Math.max(0, Math.min(siteTargets.length - 1, index + direction))];
        if (!next || next === siteTargets[index]) { return false; }
        centerSiteTarget(next.target, 'smooth');
        setSiteStep(next.step, next.target);
        return true;
      }
    };

    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      /* onthoud de reisrichting alleen voor echte gebaren, niet voor onze
         eigen tweens — die zijn al onderweg naar het juiste doel */
      if (!siteAutoScrolling && Math.abs(y - siteLastScrollY) > 1) {
        siteScrollDirection = y > siteLastScrollY ? 1 : -1;
      }
      siteLastScrollY = y;
      requestSiteStepUpdate();
      scheduleSiteSettle();
    }, { passive: true });
    window.addEventListener('resize', function () {
      requestSiteStepUpdate();
      scheduleSiteSettle();
    });
    window.addEventListener('hashchange', alignHashStep);
    window.addEventListener('load', function () { setTimeout(alignHashStep, 0); });
    setTimeout(alignHashStep, 180);
    requestSiteStepUpdate();
  }

  /* Laatste-project panorama: echte p02/p05-fragmenten uit de lokale Monitor-snapshot. */
  var monitor = document.querySelector('[data-monitor-panorama]');
  if (monitor) {
    var sampleScroll = monitor.querySelector('[data-monitor-content-scroll]');
    var monitorStage = monitor.querySelector('.monitor-stage');
    var photoLayer = monitor.querySelector('[data-monitor-photo-layer]');
    var releaseLink = monitor.querySelector('.monitor-release a');
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var monitorTicking = false;
    var monitorPhotoMaskQueued = false;
    var monitorPhotoSlots = [];
    var monitorPhotoPaused = false;
    var monitorPhotoResume = null;
    var activeAct = null;
    var acts = [];
    var samplePager = {
      anchors: [],
      busy: false,
      index: 0,
      frostScrollTop: null,
      max: 0,
      raf: 0,
      release: 0,
      releaseRaf: 0,
      tail: 0,
      sync: 0,
      wired: false
    };
    var p02 = null;
    var p05 = null;
    var palettes = [
      ['#e9eef7', '#ede4f3', '#f7f9fd'],
      ['#e7f1e9', '#dcecef', '#f7fbf7'],
      ['#f2e7ef', '#e7edf9', '#fbf7fc'],
      ['#efe7f5', '#e6d9ef', '#faf7fc'],
      ['#e2f0f0', '#d8e8f1', '#f6fafb'],
      ['#f6e9ed', '#e9eaf7', '#fdf7f9']
    ];

    var clamp01 = function (n) { return Math.max(0, Math.min(1, n)); };
    var clampValue = function (min, n, max) { return Math.max(min, Math.min(max, n)); };
    var smoothstep = function (a, b, n) {
      var t = clamp01((n - a) / (b - a));
      return t * t * (3 - 2 * t);
    };

    var paritySnap = function (value, reference, min, max) {
      var snapped = Math.round(value);
      if (Math.abs((Math.round(reference) - snapped) % 2) === 1) {
        if (snapped < max) { snapped += 1; }
        else if (snapped > min) { snapped -= 1; }
      }
      return snapped;
    };

    var syncMonitorSizing = function () {
      var rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      var vh = window.innerHeight || document.documentElement.clientHeight || 720;
      var vw = document.documentElement.clientWidth || window.innerWidth || 1024;
      var mobile = window.matchMedia('(max-width: 760px)').matches;
      var stageMin = (mobile ? 27 : 30) * rootSize;
      var stageMax = (mobile ? 38 : 46) * rootSize;
      var stageTarget = (mobile ? .62 : .66) * vh;
      var stageH = paritySnap(clampValue(stageMin, stageTarget, stageMax), vh, stageMin, stageMax);
      var sampleMin = mobile ? Math.max(260, stageH - 1.35 * rootSize) : 24 * rootSize;
      var sampleMax = mobile ? stageH : 34 * rootSize;
      var sampleTarget = mobile ? stageH - 1.35 * rootSize : stageH * .78;
      var sampleH = paritySnap(clampValue(sampleMin, sampleTarget, sampleMax), vh, sampleMin, sampleMax);
      var sampleW = mobile
        ? Math.min(vw * .88, sampleH * .78, 29 * rootSize)
        : Math.min(Math.max(320, vw - 8 * rootSize), 68 * rootSize, sampleH * 2.1);
      sampleW = Math.round(sampleW);
      if (Math.abs((vw - sampleW) % 2) === 1 && sampleW > 320) { sampleW -= 1; }
      monitor.style.setProperty('--monitor-stage-h', stageH + 'px');
      monitor.style.setProperty('--monitor-sample-h', sampleH + 'px');
      monitor.style.setProperty('--monitor-sample-w', sampleW + 'px');
    };

    syncMonitorSizing();

    var absolutize = function (root) {
      Array.prototype.slice.call(root.querySelectorAll('[src]')).forEach(function (el) {
        var src = el.getAttribute('src');
        if (src && !/^(?:[a-z]+:|\/|#)/i.test(src)) {
          el.setAttribute('src', 'monitor-sample/' + src);
        }
      });
    };

    var buildP02Dots = function () {
      if (!p02) { return; }
      var grid = p02.querySelector('.dotgrid');
      if (!grid || grid.childElementCount) { return; }
      var total = +grid.getAttribute('data-total') || 93;
      var filled = +grid.getAttribute('data-filled') || 75;
      for (var i = 0; i < total; i++) {
        var dot = document.createElement('i');
        if (i < filled) { dot.className = 'fill'; }
        if ((i + 1) % 15 === 0 && i < filled) { dot.className += ' edge'; }
        dot.style.animationDelay = Math.min(i * 0.012, 0.55).toFixed(3) + 's';
        grid.appendChild(dot);
      }
    };

    var activateAct = function (act) {
      if (!act || act === activeAct) { return; }
      activeAct = act;
      acts.forEach(function (el) {
        el.classList.toggle('active', el === act);
      });

      var index = Math.max(0, acts.indexOf(act));
      var palette = palettes[Math.min(index, palettes.length - 1)] || palettes[0];
      monitor.style.setProperty('--void-a', palette[0]);
      monitor.style.setProperty('--void-b', palette[1]);
      monitor.style.setProperty('--void-c', palette[2]);

      if (p02 && p02.contains(act)) {
        var sceneName = act.getAttribute('data-scene');
        var scenes = Array.prototype.slice.call(p02.querySelectorAll('.iscene'));
        scenes.forEach(function (scene) {
          scene.classList.toggle('is-on', scene.getAttribute('data-figure') === sceneName);
        });
        var card = p02.querySelector('.intro-card');
        if (card) {
          var p02Acts = Array.prototype.slice.call(p02.querySelectorAll('.read-col .act'));
          card.setAttribute('data-beat', String(p02Acts.indexOf(act) + 1));
          card.classList.toggle('morph-layers', sceneName === 'levels');
        }
        var resetScrolly = p05 && p05.querySelector('.scrolly');
        if (resetScrolly) {
          resetScrolly.setAttribute('data-active', 'intro');
        }
      }

      if (p05 && p05.contains(act)) {
        var scrolly = p05.querySelector('.scrolly');
        var row = act.getAttribute('data-row');
        if (scrolly && row) {
          scrolly.setAttribute('data-active', row);
        }
      }
      schedulePhotoMasks();
    };

    var clampSampleScrollTop = function (value) {
      var max = Math.max(0, samplePager.max || (sampleScroll.scrollHeight - sampleScroll.clientHeight));
      return clampValue(0, value, max);
    };

    var holdReleaseScrollTop = function () {
      if (samplePager.frostScrollTop == null) {
        samplePager.frostScrollTop = sampleScroll.scrollTop;
      }
      var held = clampSampleScrollTop(samplePager.frostScrollTop);
      samplePager.frostScrollTop = held;
      if (Math.abs(sampleScroll.scrollTop - held) > .5) {
        sampleScroll.scrollTop = held;
      }
      return held;
    };

    var updateMonitor = function () {
      monitorTicking = false;
      if (!sampleScroll) { return; }
      var max = Math.max(1, samplePager.max || (sampleScroll.scrollHeight - sampleScroll.clientHeight));
      var releaseP = samplePager.release;
      var isReleaseTail = releaseP > .001;
      var pinnedReleaseAnchor = releaseAnchor();
      if (!isReleaseTail && sampleScroll.scrollTop > pinnedReleaseAnchor + 1) {
        sampleScroll.scrollTop = pinnedReleaseAnchor;
      }
      var sampleY = isReleaseTail ? holdReleaseScrollTop() : sampleScroll.scrollTop;
      var p = clamp01(sampleY / max);
      sampleScroll.classList.toggle('is-release-tail', isReleaseTail);
      sampleScroll.style.setProperty('--monitor-freeze-y', '0px');
      var frost = smoothstep(.08, .94, releaseP);
      var release = smoothstep(.28, .98, releaseP);
      var photoB = smoothstep(.35, .58, p) * .34;
      var photoC = smoothstep(.55, .78, p) * .28;
      var center = sampleScroll.getBoundingClientRect().top + sampleScroll.clientHeight * .44;
      var best = null;
      var bestDistance = Infinity;

      if (!isReleaseTail) {
        acts.forEach(function (act) {
          var rect = act.getBoundingClientRect();
          var distance = Math.abs(rect.top + rect.height * .5 - center);
          if (distance < bestDistance) {
            best = act;
            bestDistance = distance;
          }
        });
        activateAct(best || acts[0]);
      }

      monitor.style.setProperty('--frost', frost.toFixed(3));
      monitor.style.setProperty('--release', release.toFixed(3));
      monitor.style.setProperty('--photo-a', (.28 - smoothstep(.52, .82, p) * .08).toFixed(3));
      monitor.style.setProperty('--photo-b', photoB.toFixed(3));
      monitor.style.setProperty('--photo-c', photoC.toFixed(3));
      monitor.classList.toggle('is-released', release > .45);
      document.body.classList.toggle('monitor-release-open', release > .04);
      if (!isReleaseTail) { snapCirkelContent(); }
      schedulePhotoMasks();
    };

    var requestMonitorUpdate = function () {
      if (monitorTicking) { return; }
      monitorTicking = true;
      requestAnimationFrame(updateMonitor);
    };

    var lastSampleAnchor = function () {
      var max = Math.max(0, sampleScroll.scrollHeight - sampleScroll.clientHeight);
      return samplePager.anchors.length
        ? samplePager.anchors[samplePager.anchors.length - 1]
        : max;
    };

    var releaseAnchor = function () {
      if (!samplePager.anchors.length) { measureSamplePager(); }
      return lastSampleAnchor();
    };

    var setReleaseProgress = function (value) {
      var release = clamp01(value);
      if (release > .001 && samplePager.release <= .001) {
        snapCirkelContent();
        pauseMonitorPhotoDrift();
        samplePager.frostScrollTop = sampleScroll.scrollTop;
      } else if (release <= .001) {
        samplePager.frostScrollTop = null;
        resumeMonitorPhotoDrift();
      }
      samplePager.release = release;
      if (release > .001) { holdReleaseScrollTop(); }
      requestMonitorUpdate();
      schedulePhotoMasks();
    };

    var easeReleaseTo = function (target) {
      target = clamp01(target);
      if (samplePager.releaseRaf) {
        cancelAnimationFrame(samplePager.releaseRaf);
        samplePager.releaseRaf = 0;
      }
      var start = samplePager.release;
      var distance = target - start;
      if (Math.abs(distance) < .01 || reduceMotion) {
        setReleaseProgress(target);
        armSamplePagerTail();
        return;
      }
      var startTime = 0;
      var duration = 460;
      var frame = function (time) {
        if (!startTime) { startTime = time; }
        var progress = Math.min(1, (time - startTime) / duration);
        var eased = progress < .5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        setReleaseProgress(start + distance * eased);
        if (progress < 1) {
          samplePager.releaseRaf = requestAnimationFrame(frame);
          return;
        }
        samplePager.releaseRaf = 0;
        setReleaseProgress(target);
        armSamplePagerTail();
      };
      samplePager.releaseRaf = requestAnimationFrame(frame);
    };

    var clearRelease = function () {
      if (samplePager.releaseRaf) {
        cancelAnimationFrame(samplePager.releaseRaf);
        samplePager.releaseRaf = 0;
      }
      samplePager.release = 0;
      samplePager.frostScrollTop = null;
      resumeMonitorPhotoDrift();
      sampleScroll.classList.remove('is-release-tail');
      sampleScroll.style.setProperty('--monitor-freeze-y', '0px');
    };

    var snapCirkelContent = function () {
      if (!sampleScroll) { return; }
      Array.prototype.slice.call(sampleScroll.querySelectorAll('.cirkel-mount .konvajs-content')).forEach(function (content) {
        var mount = content.parentElement;
        var mountRect = mount.getBoundingClientRect();
        var rawLeft = ((mount.clientWidth || mountRect.width) - (content.offsetWidth || content.getBoundingClientRect().width)) / 2;
        var rawTop = ((mount.clientHeight || mountRect.height) - (content.offsetHeight || content.getBoundingClientRect().height)) / 2;
        var targetLeft = Math.round(mountRect.left + rawLeft) - mountRect.left;
        var targetTop = Math.round(mountRect.top + rawTop) - mountRect.top;
        if (Math.abs((parseFloat(content.style.left) || 0) - targetLeft) < .001 &&
            Math.abs((parseFloat(content.style.top) || 0) - targetTop) < .001) {
          return;
        }
        content.style.left = targetLeft.toFixed(6) + 'px';
        content.style.top = targetTop.toFixed(6) + 'px';
      });
    };

    /* Zit de pager aan zijn rand? Omlaag: frost volledig open.
       Omhoog: geen frost en op (of boven) het eerste anker. */
    var sampleAtBoundary = function (direction) {
      if (direction > 0) { return samplePager.release >= .999; }
      if (samplePager.release > .001) { return false; }
      if (!samplePager.anchors.length) { measureSamplePager(); }
      var first = samplePager.anchors.length ? samplePager.anchors[0] : 0;
      return sampleScroll.scrollTop <= first + 2;
    };

    /* Overdracht aan de buitenste scrollytell — alleen op een vers gebaar,
       zodat het momentum dat de frost opende niet meteen doorschiet. */
    var handOffSample = function (direction) {
      if (!wheelTracker.fresh || !siteBridge) { return; }
      siteBridge.nudge(monitorStage, direction);
    };

    var redirectReleaseWheel = function (event) {
      if (!sampleScroll) { return; }
      var direction = event.deltaY > 0 ? 1 : -1;
      if (samplePager.release > 0) {
        event.preventDefault();
        if (direction > 0 && sampleAtBoundary(1)) {
          handOffSample(1);
          return;
        }
        easeReleaseTo(direction < 0 ? 0 : 1);
      }
    };

    var wrapMonitorTextGroups = function (root) {
      Array.prototype.slice.call(root.querySelectorAll('.read-col .act, .scrolly .step')).forEach(function (unit) {
        if (unit.firstElementChild && unit.firstElementChild.classList.contains('pd-grp')) { return; }
        var group = document.createElement('div');
        group.className = 'pd-grp';
        while (unit.firstChild) { group.appendChild(unit.firstChild); }
        unit.appendChild(group);
      });
    };

    var MONITOR_EXTRA_PHOTOS = [
      'tndt-jaarcongres-2026-postnl-005',
      'tndt-jaarcongres-2026-postnl-006',
      'tndt-jaarcongres-2026-postnl-007',
      'tndt-jaarcongres-2026-postnl-008',
      'tndt-jaarcongres-2026-postnl-009',
      'tndt-jaarcongres-2026-postnl-010',
      'tndt-jaarcongres-2026-postnl-011',
      'tndt-jaarcongres-2026-postnl-012',
      'tndt-jaarcongres-2026-postnl-013',
      'tndt-jaarcongres-2026-postnl-014',
      'tndt-jaarcongres-2026-postnl-015',
      'tndt-jaarcongres-2026-postnl-019',
      'tndt-jaarcongres-2026-postnl-021',
      'tndt-jaarcongres-2026-postnl-022',
      'tndt-jaarcongres-2026-postnl-023',
      'tndt-jaarcongres-2026-postnl-024',
      'tndt-jaarcongres-2026-postnl-025',
      'tndt-jaarcongres-2026-postnl-030',
      'tndt-jaarcongres-2026-postnl-031',
      'tndt-jaarcongres-2026-postnl-034',
      'tndt-jaarcongres-2026-postnl-037',
      'tndt-jaarcongres-2026-postnl-038',
      'tndt-jaarcongres-2026-postnl-044',
      'tndt-jaarcongres-2026-postnl-053',
      'tndt-jaarcongres-2026-postnl-054',
      'tndt-jaarcongres-2026-postnl-057',
      'tndt-jaarcongres-2026-postnl-058',
      'tndt-jaarcongres-2026-postnl-060',
      'tndt-jaarcongres-2026-postnl-078',
      'tndt-jaarcongres-2026-postnl-082',
      'tndt-jaarcongres-2026-postnl-085',
      'tndt-jaarcongres-2026-postnl-086',
      'tndt-jaarcongres-2026-postnl-094',
      'tndt-jaarcongres-2026-postnl-110-copy',
      'tndt-jaarcongres-2026-postnl-115',
      'tndt-jaarcongres-2026-postnl-121',
      'tndt-jaarcongres-2026-postnl-130',
      'tndt-jaarcongres-2026-postnl-137',
      'tndt-jaarcongres-2026-postnl-138',
      'tndt-jaarcongres-2026-postnl-141',
      'tndt-jaarcongres-2026-postnl-156',
      'tndt-jaarcongres-2026-postnl-164',
      'tndt-jaarcongres-2026-postnl-172',
      'tndt-jaarcongres-2026-postnl-182',
      'tndt-jaarcongres-2026-postnl-185',
      'tndt-jaarcongres-2026-postnl-188',
      'tndt-jaarcongres-2026-postnl-193',
      'tndt-jaarcongres-2026-postnl-206',
      'tndt-jaarcongres-2026-postnl-208',
      'tndt-jaarcongres-2026-postnl-209',
      'tndt-jaarcongres-2026-postnl-211',
      'tndt-jaarcongres-2026-postnl-213',
      'tndt-jaarcongres-2026-postnl-215',
      'tndt-jaarcongres-2026-postnl-218',
      'tndt-jaarcongres-2026-postnl-219',
      'tndt-jaarcongres-2026-postnl-221',
      'tndt-jaarcongres-2026-postnl-228',
      'tndt-jaarcongres-2026-postnl-235',
      'tndt-jaarcongres-2026-postnl-247',
      'tndt-jaarcongres-2026-postnl-248',
      'tndt-jaarcongres-2026-postnl-249',
      'tndt-jaarcongres-2026-postnl-250',
      'tndt-jaarcongres-2026-postnl-251',
      'tndt-jaarcongres-2026-postnl-253',
      'tndt-jaarcongres-2026-postnl-254',
      'tndt-jaarcongres-2026-postnl-258',
      'tndt-jaarcongres-2026-postnl-260'
    ];

    var MONITOR_FALLBACK_PHOTOS = [
      'audience-applauding',
      'audience-at-keynote',
      'black-woman-on-stage',
      'crowd-looking-at-screen',
      'joop-addressing-the-crowd',
      'people-networking-at-the-event',
      'two-women-on-stage-talking-to-each-other',
      'woman-pointing-at-charts-on-stage',
      'woman-standing-in-front-of-stage-addressing-the-crowd',
      'women-networking'
    ].concat(MONITOR_EXTRA_PHOTOS);

    var MONITOR_PHOTO_FOCUS = {
      'black-woman-on-stage-2': [.31, .24],
      'black-woman-on-stage': [.67, .27],
      'close-up-of-speaker-talking-to-black-woman': [.34, .25],
      'diamond-award-winners-but-not-this-year': [.48, .22],
      'diamond-award-winners-posing-with-commission-not-this-year': [.57, .27],
      'event-guests-standing-around-a-table': [.52, .26],
      'four-women-standing-outside-on-stairs-posing-with-certificate': [.56, .25],
      'joop-addressing-the-crowd': [.62, .30],
      'joop-portrait-for-voorwoord': [.43, .30],
      'joop-schippers-reflectie': [.50, .35],
      'maurice-van-der-meijs': [.44, .27],
      'new-member-signing-a-paper-on-stage': [.40, .26],
      'people-networking-at-the-event': [.40, .25],
      'two-people-on-stage-laughing-at-each-other': [.55, .28],
      'two-people-on-stage-talking-into-mic': [.53, .28],
      'two-women-in-the-audience-talking-to-each-other': [.72, .25],
      'two-women-on-stage-appearing-to-invite-more-over': [.43, .25],
      'two-women-on-stage-talking-to-each-other': [.54, .28],
      'woman-with-mic-talking-to-black-woman-on-stage': [.42, .31],
      'women-networking': [.54, .33],
      'women-some-collaborating-partners': [.55, .27],
      'tndt-jaarcongres-2026-postnl-006': [.66, .31],
      'tndt-jaarcongres-2026-postnl-007': [.36, .26],
      'tndt-jaarcongres-2026-postnl-009': [.56, .30],
      'tndt-jaarcongres-2026-postnl-011': [.45, .27],
      'tndt-jaarcongres-2026-postnl-012': [.55, .27],
      'tndt-jaarcongres-2026-postnl-014': [.66, .27],
      'tndt-jaarcongres-2026-postnl-019': [.51, .28],
      'tndt-jaarcongres-2026-postnl-030': [.55, .31],
      'tndt-jaarcongres-2026-postnl-031': [.48, .28],
      'tndt-jaarcongres-2026-postnl-038': [.63, .27],
      'tndt-jaarcongres-2026-postnl-044': [.61, .29],
      'tndt-jaarcongres-2026-postnl-053': [.63, .31],
      'tndt-jaarcongres-2026-postnl-082': [.54, .29],
      'tndt-jaarcongres-2026-postnl-085': [.31, .27],
      'tndt-jaarcongres-2026-postnl-094': [.58, .26],
      'tndt-jaarcongres-2026-postnl-115': [.54, .29],
      'tndt-jaarcongres-2026-postnl-130': [.57, .24],
      'tndt-jaarcongres-2026-postnl-138': [.56, .28],
      'tndt-jaarcongres-2026-postnl-164': [.60, .25],
      'tndt-jaarcongres-2026-postnl-185': [.51, .28],
      'tndt-jaarcongres-2026-postnl-193': [.49, .29],
      'tndt-jaarcongres-2026-postnl-206': [.61, .28],
      'tndt-jaarcongres-2026-postnl-208': [.61, .25],
      'tndt-jaarcongres-2026-postnl-209': [.58, .26],
      'tndt-jaarcongres-2026-postnl-215': [.58, .31],
      'tndt-jaarcongres-2026-postnl-218': [.62, .30],
      'tndt-jaarcongres-2026-postnl-219': [.42, .25],
      'tndt-jaarcongres-2026-postnl-228': [.63, .28],
      'tndt-jaarcongres-2026-postnl-235': [.54, .23],
      'tndt-jaarcongres-2026-postnl-249': [.55, .31],
      'tndt-jaarcongres-2026-postnl-250': [.60, .28],
      'tndt-jaarcongres-2026-postnl-251': [.45, .25],
      'tndt-jaarcongres-2026-postnl-258': [.62, .28],
      'tndt-jaarcongres-2026-postnl-260': [.50, .22]
    };

    var MONITOR_PHOTO_TARGETS = {
      'pd-tl': [.34, .44],
      'pd-tr': [.66, .44],
      'pd-mr': [.68, .38],
      'pd-bl': [.34, .38],
      'pd-bc': [.50, .38],
      'pd-br': [.66, .38]
    };

    var uniqueMonitorPhotoNames = function (names) {
      var seen = {};
      return names.filter(function (name) {
        if (!name || seen[name]) { return false; }
        seen[name] = true;
        return true;
      });
    };

    var loadMonitorPhotoNames = function (done) {
      fetch('monitor-sample/assets/web/manifest.json')
        .then(function (response) {
          if (!response.ok) { throw new Error('Photo manifest unavailable'); }
          return response.json();
        })
        .then(function (manifest) {
          var entries = Array.isArray(manifest) ? manifest : [];
          var names = entries.map(function (entry) {
            var file = typeof entry === 'string' ? entry : entry && entry.file;
            if (!file || !/\.webp$/i.test(file)) { return ''; }
            return file.replace(/\\/g, '/').split('/').pop().replace(/\.webp$/i, '');
          });
          done(uniqueMonitorPhotoNames(names.concat(MONITOR_EXTRA_PHOTOS)));
        })
        .catch(function () {
          done(uniqueMonitorPhotoNames(MONITOR_FALLBACK_PHOTOS));
        });
    };

    var shuffleMonitor = function (items) {
      for (var i = items.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = items[i];
        items[i] = items[j];
        items[j] = tmp;
      }
      return items;
    };

    var monitorPhotoUrl = function (name) {
      return 'monitor-sample/assets/web/' + name + '.webp';
    };

    var visibleMonitorRect = function (rect) {
      if (!rect || rect.width <= 0 || rect.height <= 0) { return false; }
      var visibleY = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      var visibleX = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
      return visibleY >= 18 && visibleX >= 18;
    };

    var monitorRectsOverlap = function (a, b) {
      var w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      var h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return w >= 12 && h >= 12 && (w * h) >= 260;
    };

    var addMonitorMask = function (mask, hostRect, targetRect, pad, radius, kind) {
      var rect = {
        l: Math.max(0, targetRect.left - hostRect.left - pad.l),
        t: Math.max(0, targetRect.top - hostRect.top - pad.t),
        r: Math.min(hostRect.width, targetRect.right - hostRect.left + pad.r),
        b: Math.min(hostRect.height, targetRect.bottom - hostRect.top + pad.b)
      };
      if (rect.l >= rect.r || rect.t >= rect.b) { return; }
      var part = document.createElement('span');
      part.className = 'pd-mask' + (kind ? ' ' + kind : '');
      part.style.left = rect.l + 'px';
      part.style.top = rect.t + 'px';
      part.style.width = (rect.r - rect.l) + 'px';
      part.style.height = (rect.b - rect.t) + 'px';
      part.style.setProperty('--pd-mask-radius', radius + 'px');
      mask.appendChild(part);
    };

    var updateMonitorMaskFor = function (slot) {
      if (!slot || !slot.host || !slot.mask) { return; }
      var hostRect = slot.host.getBoundingClientRect();
      slot.mask.innerHTML = '';
      if (hostRect.width <= 0 || hostRect.height <= 0) { return; }
      var stageWidth = monitorStage ? monitorStage.clientWidth : window.innerWidth;
      var stageHeight = monitorStage ? monitorStage.clientHeight : window.innerHeight;
      var bodyPad = {
        t: Math.max(42, Math.round(stageHeight * .12)),
        r: Math.max(48, Math.round(stageHeight * .12)),
        b: Math.max(42, Math.round(stageHeight * .12)),
        l: Math.max(48, Math.round(stageHeight * .12))
      };
      var headPad = {
        t: Math.max(92, Math.round(stageHeight * .26)),
        r: Math.max(190, Math.round(stageWidth * .34)),
        b: Math.max(24, Math.round(stageHeight * .045)),
        l: Math.max(72, Math.round(stageWidth * .08))
      };
      Array.prototype.slice.call(sampleScroll.querySelectorAll('.pd-grp')).forEach(function (el) {
        var rect = el.getBoundingClientRect();
        if (!visibleMonitorRect(rect)) { return; }
        addMonitorMask(slot.mask, hostRect, rect, bodyPad, 64, '');
      });
      if (!slot.host.classList.contains('pd-tr')) {
        Array.prototype.slice.call(sampleScroll.querySelectorAll('.phead h2')).forEach(function (el) {
          var rect = el.getBoundingClientRect();
          if (!visibleMonitorRect(rect)) { return; }
          addMonitorMask(slot.mask, hostRect, rect, headPad, 56, 'pd-mask-head');
        });
      }
    };

    var updateMonitorTextContrast = function () {
      var photoRects = monitorPhotoSlots.map(function (slot) {
        if (!slot || !slot.host) { return null; }
        var style = getComputedStyle(slot.host);
        var opacity = parseFloat(style.opacity || '0');
        if ((!slot.host.classList.contains('in') && opacity <= .08) || style.display === 'none') { return null; }
        var rect = slot.host.getBoundingClientRect();
        return visibleMonitorRect(rect) ? rect : null;
      }).filter(Boolean);
      var targets = Array.prototype.slice.call(sampleScroll.querySelectorAll('.pd-grp, .phead h2'));
      targets.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        var hit = visibleMonitorRect(rect) && photoRects.some(function (photoRect) {
          return monitorRectsOverlap(rect, photoRect);
        });
        el.classList.toggle('pd-over-photo', !!hit);
      });
    };

    var updateMonitorPhotoMasks = function () {
      monitorPhotoMaskQueued = false;
      monitorPhotoSlots.forEach(updateMonitorMaskFor);
      updateMonitorTextContrast();
    };

    var schedulePhotoMasks = function () {
      if (!monitorPhotoSlots.length || monitorPhotoMaskQueued) { return; }
      monitorPhotoMaskQueued = true;
      requestAnimationFrame(updateMonitorPhotoMasks);
    };

    var freezeMonitorPhotoElement = function (el) {
      if (!el) { return; }
      var style = getComputedStyle(el);
      el.style.transition = 'none';
      el.style.opacity = style.opacity;
      if (el._kb) {
        try {
          if (el._kb.pause) { el._kb.pause(); }
          else { el._kb.cancel(); }
        } catch (e) {}
      }
      if (style.transform && style.transform !== 'none') {
        el.style.transform = style.transform;
      }
    };

    var pauseMonitorPhotoDrift = function () {
      if (monitorPhotoPaused) { return; }
      monitorPhotoPaused = true;
      monitor.classList.add('is-photo-paused');
      monitorPhotoSlots.forEach(function (slot) {
        if (!slot) { return; }
        if (slot.timer) {
          clearTimeout(slot.timer);
          slot.timer = 0;
        }
        if (slot.settleTimer) {
          clearTimeout(slot.settleTimer);
          slot.settleTimer = 0;
        }
        freezeMonitorPhotoElement(slot.host);
        freezeMonitorPhotoElement(slot.top);
        freezeMonitorPhotoElement(slot.under);
      });
    };

    var settleMonitorPhotoSlot = function (slot) {
      if (!slot || !slot.top || !slot.under) { return; }
      var topOpacity = parseFloat(getComputedStyle(slot.top).opacity || '1');
      var underOpacity = parseFloat(getComputedStyle(slot.under).opacity || '0');
      if (underOpacity > topOpacity && slot.under.getAttribute('src')) {
        var tmp = slot.top;
        slot.top = slot.under;
        slot.under = tmp;
      }
      [slot.host, slot.top, slot.under].forEach(function (el) {
        if (!el) { return; }
        el.style.transition = '';
        el.style.opacity = '';
      });
      slot.top.classList.remove('pd-out');
      slot.under.classList.remove('pd-out');
      slot.top.style.zIndex = '2';
      slot.under.style.zIndex = '1';
      slot.top.style.opacity = '1';
      slot.under.style.opacity = '1';
    };

    var resumeMonitorPhotoDrift = function () {
      if (!monitorPhotoPaused) { return; }
      monitorPhotoPaused = false;
      monitor.classList.remove('is-photo-paused');
      monitorPhotoSlots.forEach(settleMonitorPhotoSlot);
      if (monitorPhotoResume) { monitorPhotoResume(); }
      schedulePhotoMasks();
    };

    var focusMonitorTransform = function (focus, zoom) {
      return 'translate(' + focus.tx.toFixed(1) + 'px,' + focus.ty.toFixed(1) + 'px) scale(' + (focus.s * zoom).toFixed(4) + ')';
    };

    var resetMonitorFocus = function (img, name) {
      img._pdFocusName = name || '';
      img._pdFocusCell = '';
      img._pdFocus = { tx: 0, ty: 0, s: 1 };
      img.dataset.pdName = name || '';
      img.dataset.pdFocus = '0';
      img.style.objectPosition = 'center';
      img.style.transformOrigin = 'center';
      img.style.transform = focusMonitorTransform(img._pdFocus, 1);
    };

    var solveMonitorFocus = function (img, name, cell) {
      var point = MONITOR_PHOTO_FOCUS[name];
      var target = MONITOR_PHOTO_TARGETS[cell];
      if (!point || !target) {
        resetMonitorFocus(img, name);
        return;
      }
      img._pdFocusName = name;
      img._pdFocusCell = cell;
      img.dataset.pdName = name;
      img.dataset.pdFocus = '1';
      var host = img.parentNode;
      var cw = host && host.clientWidth;
      var ch = host && host.clientHeight;
      var iw = img.naturalWidth;
      var ih = img.naturalHeight;
      if (!cw || !ch || !iw || !ih) {
        resetMonitorFocus(img, name);
        img._pdFocusCell = cell || '';
        var pending = name + '|' + cell;
        img._pdFocusPending = pending;
        img.addEventListener('load', function once() {
          img.removeEventListener('load', once);
          if (img._pdFocusPending === pending) { solveMonitorFocus(img, name, cell); }
        }, { once: true });
        return;
      }
      var cover = Math.max(cw / iw, ch / ih);
      var rw = iw * cover;
      var rh = ih * cover;
      var fx = (cw - rw) / 2 + point[0] * rw;
      var fy = (ch - rh) / 2 + point[1] * rh;
      var goalX = target[0] * cw;
      var goalY = target[1] * ch;
      var cx = cw / 2;
      var cy = ch / 2;
      var best = null;
      for (var scale = 1; scale <= 1.1001; scale += .005) {
        var tx = goalX - (cx + (fx - cx) * scale);
        var ty = goalY - (cy + (fy - cy) * scale);
        var maxX = (scale - 1) * cw / 2;
        var maxY = (scale - 1) * ch / 2;
        tx = Math.max(-maxX, Math.min(maxX, tx));
        ty = Math.max(-maxY, Math.min(maxY, ty));
        var ax = cx + (fx - cx) * scale + tx;
        var ay = cy + (fy - cy) * scale + ty;
        var score = Math.pow(ax - goalX, 2) + Math.pow(ay - goalY, 2) + Math.pow(scale - 1, 2) * 18000;
        if (!best || score < best.score) { best = { tx: tx, ty: ty, s: scale, score: score }; }
      }
      img._pdFocus = best || { tx: 0, ty: 0, s: 1 };
      img.style.objectPosition = 'center';
      img.style.transformOrigin = 'center';
      img.style.transform = focusMonitorTransform(img._pdFocus, 1);
    };

    var kenBurnsMonitorPhoto = function (img) {
      if (reduceMotion || monitorPhotoPaused || !img || !img.animate) { return; }
      if (img._kb) {
        try { img._kb.cancel(); } catch (e) {}
      }
      var focus = img._pdFocus || { tx: 0, ty: 0, s: 1 };
      img._kb = img.animate(
        [
          { transform: focusMonitorTransform(focus, 1.045) },
          { transform: focusMonitorTransform(focus, 1) }
        ],
        { duration: 8000, easing: 'linear', fill: 'forwards' }
      );
    };

    var startMonitorPhotoDrift = function () {
      if (!photoLayer || photoLayer.__monitorPhotosStarted) { return; }
      photoLayer.__monitorPhotosStarted = true;
      loadMonitorPhotoNames(function (names) {
        names = uniqueMonitorPhotoNames(names);
        if (!names.length) { return; }

        var cells = ['pd-tl', 'pd-tr', 'pd-mr', 'pd-bl', 'pd-bc', 'pd-br'];
        var cellPos = {
          'pd-tl': [0, 0],
          'pd-tr': [2, 0],
          'pd-mr': [2, 1],
          'pd-bl': [0, 2],
          'pd-bc': [1, 2],
          'pd-br': [2, 2]
        };
        var bag = [];
        var lastImg = '';
        var lastCell = '';
        var activeSlot = null;

        var makeSlot = function () {
          var host = document.createElement('div');
          host.className = 'monitor-photo-drift';
          host.setAttribute('aria-hidden', 'true');
          photoLayer.appendChild(host);
          host.addEventListener('transitionend', function (event) {
            if (event.propertyName === 'opacity') { schedulePhotoMasks(); }
          });
          var a = new Image();
          var b = new Image();
          a.className = 'pd-card';
          b.className = 'pd-card';
          a.alt = '';
          b.alt = '';
          a.decoding = 'async';
          b.decoding = 'async';
          a.style.zIndex = '2';
          b.style.zIndex = '1';
          host.appendChild(b);
          host.appendChild(a);
          var mask = document.createElement('div');
          mask.className = 'pd-mask-layer';
          host.appendChild(mask);
          return { host: host, top: a, under: b, mask: mask, timer: 0, settleTimer: 0, cell: '' };
        };

        var nextImg = function () {
          if (!bag.length) { bag = shuffleMonitor(names.slice()); }
          var name = bag.pop();
          if (name === lastImg && bag.length) {
            bag.unshift(name);
            name = bag.pop();
          }
          lastImg = name;
          return name;
        };

        var adjacentCell = function (a, b) {
          if (!a || !b) { return false; }
          var pa = cellPos[a];
          var pb = cellPos[b];
          if (!pa || !pb) { return false; }
          return Math.abs(pa[0] - pb[0]) + Math.abs(pa[1] - pb[1]) === 1;
        };

        var pickCell = function () {
          var pool = cells.filter(function (cell) {
            return cell !== lastCell && !adjacentCell(cell, lastCell);
          });
          if (!pool.length) {
            pool = cells.filter(function (cell) { return cell !== lastCell; });
          }
          lastCell = pool[Math.floor(Math.random() * pool.length)];
          return lastCell;
        };

        var preload = function (name, done) {
          var img = new Image();
          img.src = monitorPhotoUrl(name);
          if (img.decode) {
            img.decode().then(done, done);
          } else if (img.complete) {
            done();
          } else {
            img.onload = done;
            img.onerror = done;
          }
        };

        var leave = function (slot) {
          if (!slot) { return; }
          if (slot.timer) {
            clearTimeout(slot.timer);
            slot.timer = 0;
          }
          slot.host.classList.remove('in');
          schedulePhotoMasks();
        };

        var crossfade = function (slot, name, done) {
          preload(name, function () {
            if (monitorPhotoPaused) { return; }
            if (activeSlot !== slot) { return; }
            slot.under.src = monitorPhotoUrl(name);
            slot.under.style.opacity = '1';
            solveMonitorFocus(slot.under, name, slot.cell);
            kenBurnsMonitorPhoto(slot.under);
            var settled = false;
            var settle = function () {
              if (settled) { return; }
              settled = true;
              slot.top.removeEventListener('transitionend', settle);
              if (slot.settleTimer) {
                clearTimeout(slot.settleTimer);
                slot.settleTimer = 0;
              }
              slot.under.style.zIndex = '2';
              slot.top.style.zIndex = '1';
              slot.top.classList.remove('pd-out');
              slot.top.style.opacity = '1';
              var tmp = slot.top;
              slot.top = slot.under;
              slot.under = tmp;
              schedulePhotoMasks();
              if (done) { done(); }
            };
            slot.top.classList.add('pd-out');
            slot.top.addEventListener('transitionend', settle);
            requestAnimationFrame(function () {
              requestAnimationFrame(function () {
                if (monitorPhotoPaused) { return; }
                slot.top.style.opacity = '0';
              });
            });
            slot.settleTimer = setTimeout(settle, 3200);
          });
        };

        var advance;
        var runCycle = function (slot, done) {
          var shows = 2 + Math.floor(Math.random() * 2);
          var count = 1;
          var step = function () {
            if (monitorPhotoPaused) { return; }
            if (activeSlot !== slot) { return; }
            if (count >= shows) {
              done();
              return;
            }
            crossfade(slot, nextImg(), function () {
              count++;
              slot.timer = setTimeout(step, 5200 + Math.random() * 2800);
            });
          };
          slot.timer = setTimeout(step, 5200 + Math.random() * 2800);
        };

        advance = function (previous) {
          if (monitorPhotoPaused) { return; }
          var slot = activeSlot === monitorPhotoSlots[0] ? monitorPhotoSlots[1] : monitorPhotoSlots[0];
          var cell = pickCell();
          var first = nextImg();
          slot.cell = cell;
          slot.host.className = 'monitor-photo-drift ' + cell;
          schedulePhotoMasks();
          preload(first, function () {
            slot.top.src = monitorPhotoUrl(first);
            slot.top.style.opacity = '1';
            slot.top.style.zIndex = '2';
            slot.under.style.zIndex = '1';
            solveMonitorFocus(slot.top, first, cell);
            kenBurnsMonitorPhoto(slot.top);
            void slot.host.offsetWidth;
            slot.host.classList.add('in');
            if (previous && previous !== slot) { leave(previous); }
            activeSlot = slot;
            schedulePhotoMasks();
            if (!reduceMotion) {
              runCycle(slot, function () { advance(slot); });
            }
          });
        };

        monitorPhotoResume = function () {
          if (reduceMotion) { return; }
          if (!activeSlot) {
            setTimeout(function () { if (!monitorPhotoPaused) { advance(null); } }, 900);
            return;
          }
          runCycle(activeSlot, function () { advance(activeSlot); });
        };

        monitorPhotoSlots = [makeSlot(), makeSlot()];
        setTimeout(function () { advance(null); }, 900);
        window.addEventListener('resize', function () {
          monitorPhotoSlots.forEach(function (slot) {
            [slot.top, slot.under].forEach(function (img) {
              if (img && img._pdFocusName) { solveMonitorFocus(img, img._pdFocusName, img._pdFocusCell || slot.cell); }
            });
          });
          schedulePhotoMasks();
        });
      });
    };

    var localSampleTop = function (el) {
      var scrollRect = sampleScroll.getBoundingClientRect();
      var rect = el.getBoundingClientRect();
      return rect.top - scrollRect.top + sampleScroll.scrollTop;
    };

    var nearestSampleAnchor = function () {
      var best = 0;
      var bestDistance = Infinity;
      var y = sampleScroll.scrollTop;
      samplePager.anchors.forEach(function (anchor, i) {
        var distance = Math.abs(anchor - y);
        if (distance < bestDistance) {
          best = i;
          bestDistance = distance;
        }
      });
      return best;
    };

    var measureSamplePager = function () {
      if (!sampleScroll || !acts.length) { return; }
      var wasReleaseTail = sampleScroll.classList.contains('is-release-tail');
      var release = samplePager.release;
      var frostScrollTop = samplePager.frostScrollTop;
      sampleScroll.classList.remove('is-release-tail');
      sampleScroll.style.setProperty('--monitor-freeze-y', '0px');
      var max = Math.max(0, sampleScroll.scrollHeight - sampleScroll.clientHeight);
      samplePager.max = max;
      if (wasReleaseTail && frostScrollTop != null) {
        frostScrollTop = clampSampleScrollTop(frostScrollTop);
        samplePager.frostScrollTop = frostScrollTop;
        sampleScroll.scrollTop = frostScrollTop;
      }
      var line = sampleScroll.clientHeight * .44;
      samplePager.anchors = acts.map(function (act) {
        var anchor = localSampleTop(act) + act.offsetHeight * .5 - line;
        return Math.max(0, Math.min(max, anchor));
      });
      samplePager.index = nearestSampleAnchor();
      if (wasReleaseTail) {
        samplePager.release = release;
        samplePager.frostScrollTop = frostScrollTop != null ? frostScrollTop : sampleScroll.scrollTop;
        sampleScroll.scrollTop = samplePager.frostScrollTop;
        sampleScroll.classList.add('is-release-tail');
        sampleScroll.style.setProperty('--monitor-freeze-y', '0px');
      }
    };

    var setSampleY = function (y) {
      sampleScroll.scrollTop = y;
      requestMonitorUpdate();
      schedulePhotoMasks();
    };

    var armSamplePagerTail = function () {
      if (samplePager.tail) { return; }
      samplePager.tail = setTimeout(function () {
        samplePager.tail = 0;
        if (samplePager.raf) {
          armSamplePagerTail();
          return;
        }
        samplePager.busy = false;
      }, 150);
    };

    var easeSampleTo = function (target, done) {
      if (samplePager.raf) {
        cancelAnimationFrame(samplePager.raf);
        samplePager.raf = 0;
      }
      var start = sampleScroll.scrollTop;
      var distance = target - start;
      if (Math.abs(distance) < 2 || reduceMotion) {
        setSampleY(target);
        if (done) { done(); }
        armSamplePagerTail();
        return;
      }
      var startTime = 0;
      var duration = Math.min(820, Math.max(420, Math.abs(distance) * .78));
      var frame = function (time) {
        if (!startTime) { startTime = time; }
        var progress = Math.min(1, (time - startTime) / duration);
        var eased = progress < .5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        setSampleY(start + distance * eased);
        if (progress < 1) {
          samplePager.raf = requestAnimationFrame(frame);
          return;
        }
        samplePager.raf = 0;
        setSampleY(target);
        if (done) { done(); }
        armSamplePagerTail();
      };
      samplePager.raf = requestAnimationFrame(frame);
    };

    var goSampleBeat = function (index) {
      if (!samplePager.anchors.length) { measureSamplePager(); }
      if (!samplePager.anchors.length) { return; }
      index = Math.max(0, Math.min(samplePager.anchors.length - 1, index));
      clearRelease();
      samplePager.index = index;
      if (acts[index]) { activateAct(acts[index]); }
      easeSampleTo(samplePager.anchors[index]);
    };

    var advanceSampleBeat = function (direction) {
      if (!samplePager.anchors.length) { measureSamplePager(); }
      if (!samplePager.anchors.length) { return false; }
      var last = samplePager.anchors.length - 1;
      if (samplePager.release > 0) {
        easeReleaseTo(direction < 0 ? 0 : 1);
        return true;
      }
      if (direction < 0 && sampleScroll.scrollTop <= 1) { return false; }
      var nearest = nearestSampleAnchor();
      var target = nearest;
      var nearAnchor = nearest === samplePager.index || Math.abs(sampleScroll.scrollTop - samplePager.anchors[nearest]) <= 110;
      if (direction > 0 && nearest >= last && nearAnchor) {
        samplePager.index = last;
        if (acts[last]) { activateAct(acts[last]); }
        sampleScroll.scrollTop = samplePager.anchors[last];
        easeReleaseTo(1);
        return true;
      }
      if (nearAnchor) {
        target = nearest + direction;
      }
      goSampleBeat(target);
      return true;
    };

    var wireSamplePager = function () {
      if (!sampleScroll || samplePager.wired) { return; }
      samplePager.wired = true;
      var wheelBucket = 0;
      var BEAT_THRESHOLD = 40; /* px; één muisklik of een bewuste trackpad-veeg */
      sampleScroll.addEventListener('wheel', function (event) {
        /* normaliseer: Firefox stuurt regels (deltaMode 1), soms pagina's (2) */
        var deltaY = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? sampleScroll.clientHeight : 1);
        if (Math.abs(deltaY) <= Math.abs(event.deltaX)) { return; }
        var direction = deltaY > 0 ? 1 : -1;
        /* verticale wheel boven de sample is altijd van ons: elke uitgang
           loopt via een expliciete overdracht, nooit via native doorschieten */
        event.preventDefault();
        if (sampleAtBoundary(direction)) {
          handOffSample(direction);
          return;
        }
        if (wheelTracker.fresh) { wheelBucket = 0; }
        if (samplePager.busy) {
          armSamplePagerTail();
          return;
        }
        wheelBucket += deltaY;
        if (Math.abs(wheelBucket) < BEAT_THRESHOLD) { return; }
        wheelBucket = 0;
        samplePager.busy = true;
        advanceSampleBeat(direction);
        armSamplePagerTail();
      }, { passive: false });

      sampleScroll.addEventListener('keydown', function (event) {
        var key = event.key;
        var direction = 0;
        if (key === 'ArrowDown' || key === 'PageDown' || key === ' ' || key === 'Spacebar') { direction = 1; }
        if (key === 'ArrowUp' || key === 'PageUp') { direction = -1; }
        if (!direction) { return; }
        if (sampleAtBoundary(direction)) {
          event.preventDefault();
          if (siteBridge) { siteBridge.nudge(monitorStage, direction); }
          return;
        }
        if (samplePager.busy) {
          event.preventDefault();
          armSamplePagerTail();
          return;
        }
        if (!advanceSampleBeat(direction)) {
          return;
        }
        event.preventDefault();
        samplePager.busy = true;
        armSamplePagerTail();
      });

      sampleScroll.addEventListener('scroll', function () {
        if (samplePager.release > 0) {
          holdReleaseScrollTop();
          requestMonitorUpdate();
          return;
        }
        if (samplePager.raf || !samplePager.anchors.length) { return; }
        if (samplePager.sync) { clearTimeout(samplePager.sync); }
        samplePager.sync = setTimeout(function () {
          samplePager.index = nearestSampleAnchor();
        }, 120);
      }, { passive: true });
    };

    var mountFragments = function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      p02 = doc.getElementById('p02');
      p05 = doc.getElementById('p05');
      if (!sampleScroll || !p02 || !p05) { throw new Error('Monitor fragments not found'); }

      p02 = p02.cloneNode(true);
      p05 = p05.cloneNode(true);
      p05.querySelectorAll('.quote-cluster').forEach(function (el) { el.remove(); });
      p05.querySelectorAll('.steps > .act.step').forEach(function (el, i) {
        if (i > 2) { el.remove(); }
      });
      absolutize(p02);
      absolutize(p05);

      sampleScroll.textContent = '';
      sampleScroll.appendChild(p02);
      sampleScroll.appendChild(p05);
      wrapMonitorTextGroups(sampleScroll);
      var end = document.createElement('div');
      end.className = 'monitor-end-stop';
      end.setAttribute('aria-hidden', 'true');
      sampleScroll.appendChild(end);

      acts = Array.prototype.slice.call(sampleScroll.querySelectorAll('#p02 .read-col .act, #p05 .scrolly .step'));
      buildP02Dots();
      activateAct(acts[0]);
      measureSamplePager();
      wireSamplePager();
      startMonitorPhotoDrift();

      var mount = sampleScroll.querySelector('.cirkel-mount[data-scores]');
      if (mount && window.__cirkelMount && !mount.__cirkel) {
        window.__cirkelMount(mount);
      }
      if (mount && window.__cirkelWireGuide) {
        window.__cirkelWireGuide(mount);
      }
      snapCirkelContent();

      sampleScroll.addEventListener('scroll', requestMonitorUpdate, { passive: true });
      if (releaseLink) {
        releaseLink.addEventListener('wheel', redirectReleaseWheel, { passive: false });
      }
      window.addEventListener('resize', function () {
        syncMonitorSizing();
        measureSamplePager();
        requestMonitorUpdate();
        schedulePhotoMasks();
      });
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
          syncMonitorSizing();
          measureSamplePager();
          requestMonitorUpdate();
          schedulePhotoMasks();
        });
      }
      setTimeout(function () {
        syncMonitorSizing();
        measureSamplePager();
        requestMonitorUpdate();
        schedulePhotoMasks();
      }, 500);
      requestMonitorUpdate();
    };

    if (reduceMotion) {
      monitor.style.setProperty('--frost', '.86');
      monitor.style.setProperty('--release', '1');
      monitor.classList.add('is-released');
    }

    fetch('monitor-sample/index.html')
      .then(function (response) {
        if (!response.ok) { throw new Error('Monitor snapshot unavailable'); }
        return response.text();
      })
      .then(mountFragments)
      .catch(function () {
        if (sampleScroll) {
          sampleScroll.innerHTML = '<p class="monitor-loading">Monitorfragment kon niet worden geladen.</p>';
        }
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
