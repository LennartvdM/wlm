/* ════════════════════════════════════════════════════════════════════════════════════════════
   mobile.js · the STANDALONE phone renderer.

   When window.__MOBILE_DECK is set (the inline flag in body-open.html, on phones), this hides the
   desktop deck and builds #mdeck — a fixed, real-viewport-sized frame that ATOMISES the deck: the
   same behaviour (figure morphs per beat at the top, the beat's text below in the thumb zone,
   flick-snap between beats, a per-chapter dot breadcrumb, the void backdrop), but every beat is its
   own item in a frame whose height is the LIVE visible viewport (var(--app-vh)), never `vh`.

   Atoms are DERIVED from the existing (now hidden) section DOM — single source of truth, no content
   copy. Figures are REUSED, not re-implemented: each chapter's figure is cloned into a stage slot and
   morphed per atom via the same data-active / .iscene mechanism the desktop engine uses. The radar
   reuses cirkel.js's mount (exposed as window.__cirkelMount). Desktop is untouched: this whole file
   no-ops when __MOBILE_DECK is false (it loads but returns immediately).
   ════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  // ── activation safety net ──────────────────────────────────────────────────────────────────
  // The inline gate in body-open.html runs during early parse; if any browser leaves it false on a
  // real phone (parse-time viewport quirks), re-decide HERE — mobile.js loads at the end of <body>,
  // after layout, where matchMedia and innerWidth are reliable. Force the frame on for a touch device
  // so it can never silently fall back to the bent desktop. Desktop (mouse) stays false → we return.
  if (!window.__MOBILE_DECK) {
    var coarse = window.matchMedia && matchMedia('(pointer:coarse)').matches;
    var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
    if (coarse || (touch && window.innerWidth <= 900)) {
      window.__MOBILE_DECK = true;
      document.documentElement.classList.add('m-deck');
    }
  }
  if (!window.__MOBILE_DECK) return;
  var D = document;
  var VOIDS = ['void-blauw', 'void-lila', 'void-mint', 'void-teal', 'void-roze', 'void-perzik'];

  function el(tag, cls, html) { var e = D.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function q(node, sel) { return node ? node.querySelector(sel) : null; }
  function qa(node, sel) { return node ? [].slice.call(node.querySelectorAll(sel)) : []; }
  function text(node, sel) { var n = q(node, sel); return n ? n.textContent.replace(/\s+/g, ' ').trim() : ''; }

  // ── real visible-viewport height (the core fix). visualViewport tracks the address bar. ──
  // Guard against churn: visualViewport's `scroll` fires every tick, but the height only changes
  // while the address bar is animating. Writing the CSS var unconditionally reflows the whole frame
  // on every scroll event = visible jank on a real phone. Only write when the value actually changed.
  var lastVH = 0;
  function setVH() {
    var h = Math.round((window.visualViewport && window.visualViewport.height) || window.innerHeight);
    if (h === lastVH) return;
    lastVH = h;
    D.documentElement.style.setProperty('--app-vh', h + 'px');
  }
  setVH();
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setVH);
    window.visualViewport.addEventListener('scroll', setVH);
  }
  window.addEventListener('resize', setVH);
  window.addEventListener('orientationchange', function () { setTimeout(setVH, 60); setTimeout(setVH, 350); });

  // ── frame ──
  var mdeck = el('div'); mdeck.id = 'mdeck'; mdeck.setAttribute('role', 'application');
  var stage = el('div', 'md-stage');
  var stat = el('div', 'md-stat');
  var hint = el('div', 'md-hint', 'Tik op een ring of label voor uitleg');
  var bar = el('div', 'md-bar');
  var track = el('div', 'md-track');
  var content = el('div', 'md-content');                 // stage + track as ONE unit, so a chapter slide
  var quoteOv = el('div', 'md-quote-ov');                 // a quote interjection that sweeps over the figure
  quoteOv.setAttribute('aria-hidden', 'true');
  stage.appendChild(stat); stage.appendChild(hint);      // can translate the whole card+section together
  content.appendChild(stage); content.appendChild(track); content.appendChild(quoteOv);
  mdeck.appendChild(content); mdeck.appendChild(bar);

  // ── prose extraction: keep the inline number/em styling by cloning the .prose innerHTML ──
  function proseHTML(beat) {
    return qa(beat, '.prose').map(function (p) { return '<p class="md-prose">' + p.innerHTML + '</p>'; }).join('');
  }
  function eyebrow(beat) { return text(beat, '.eyebrow') || text(beat, '.kicker'); }

  // award block (photo + eyebrow/winner/quote/attribution) — shared by the standalone award sections and
  // the p09 gallery. Rendered as STATIC free-scroll content (the reflectie pattern), never a sticky card:
  // the photo scrolls up and away, the quote reads below. No pinned figure → nothing to pop or mis-time.
  function awardBlock(scope) {
    var img = q(scope, '.imgph-img') || q(scope, '.imgph img');
    var eb = text(scope, '.eyebrow'), win = text(scope, '.winner');
    var tq = q(scope, '.tq'), attr = q(scope, '.tq-attr');
    return (img ? '<img class="md-fs-photo" src="' + img.getAttribute('src') + '" alt="" loading="lazy">' : '') +
      '<div class="md-fs-body">' +
        (eb ? '<p class="md-quote-kicker">' + eb + '</p>' : '') +
        (win ? '<p class="md-winner">' + win + '</p>' : '') +
        (tq ? '<blockquote class="md-quote">' + tq.innerHTML + '</blockquote>' : '') +
        (attr ? '<span class="md-quote-src">' + attr.innerHTML + '</span>' : '') +
      '</div>';
  }

  // ── per-beat stat from the engine's exposed maps (with fallbacks) ──
  var MAPS = window.__READING_MAPS || {};
  function statFor(sid, scene) {
    var m = MAPS[sid] && MAPS[sid][scene];
    if (!m) return null;
    return { t: m.t, u: !!m.u, s: m.s || '' };
  }

  // ── ATOMS ──────────────────────────────────────────────────────────────────────────────────
  // Each atom: { sid, chapter, kind, figType, figState, stat, html(card-inner) }
  var items = [];
  function detectFig(sec) {
    if (q(sec, '.cirkel-mount[data-scores]')) return 'radar';
    if (q(sec, '.dumb')) return 'dumbbell';
    if (q(sec, '.intro-card')) return 'ladder';
    if (q(sec, '.lc, .figcard .pane, .qitem')) return 'figcard';
    if (q(sec, '.imgph img, .imgph')) return 'photo';
    return 'none';
  }
  function rowForScene(scrolly, scene) {
    var b = q(scrolly, '.step[data-scene="' + scene + '"]');
    return b ? (b.getAttribute('data-row') || scene) : scene;
  }

  function beatCard(sid, beat, scene) {
    var st = statFor(sid, scene);
    var eb = eyebrow(beat);
    return '<div class="md-card">' + (eb ? '<p class="md-eyebrow">' + eb + '</p>' : '') + proseHTML(beat) + '</div>';
  }

  // cover atom — the masthead, atomised: the report's name "Talent naar de Top" opens the deck (the
  // .mast is hidden on mobile). It is NOT a radial chart or a sticky card, so per the design it's STATIC
  // free-scroll content: a centred title page with no pinned figure, that simply scrolls up into p02.
  var mast = q(D, '.mast');
  if (mast) {
    items.push({ sid: '_cover', chapter: -1, kind: 'cover', figType: 'none', figState: null, stat: null,
      freescroll: true,
      html: '<div class="md-fs md-fs-cover">' +
        '<h1 class="md-cover-title">' + (text(mast, 'h1') || 'Talent naar de Top') + '</h1>' +
        (text(mast, '.kick') ? '<p class="md-cover-kick">' + text(mast, '.kick') + '</p>' : '') +
        '<p class="md-cover-hint">scroll voor de cijfers</p>' + '</div>' });
  }

  var chapter = -1;
  qa(D, 'body > section[id]').forEach(function (sec) {
    var sid = sec.id;
    if (sid === 'colofon') return;
    chapter++;
    var figType = detectFig(sec);
    var scrolly = q(sec, '.scrolly');

    if (sid === 'p02') {
      qa(sec, '.read-col .act').forEach(function (a) {
        var scene = a.getAttribute('data-scene');
        items.push({ sid: sid, chapter: chapter, kind: 'beat', figType: 'ladder', figState: scene,
          stat: statFor(sid, scene), html: beatCard(sid, a, scene) });
      });
      return;
    }
    if (scrolly) {
      // quotes are NOT beats: they're "voice from practice" interjections ATTACHED to their source beat
      // and shown as a flick-away overlay (see maybeQuote). Map each beat's scene → its atom so the
      // quote-step that follows can hang itself on the right one.
      var beatByScene = {};
      qa(scrolly, '.act.step').forEach(function (b) {
        var scene = b.getAttribute('data-scene');
        if (b.classList.contains('quote-step')) {
          if (b.getAttribute('data-phase') !== 'enter') return;          // skip the exit twin
          var src = items[beatByScene[b.getAttribute('data-quote-source')]];
          if (!src) return;
          var copy = q(b, '.quote-copy');
          var copyHTML = copy ? copy.innerHTML.replace(/<span class="quote-close[\s\S]*?<\/span>/, '') : '';
          (src.quotes = src.quotes || []).push({
            id: sid + ':' + scene, kicker: text(b, '.quote-kicker'), copyHTML: copyHTML,
            src: text(b, '.quote-source'), enter: b.getAttribute('data-enter') || 'right'
          });
        } else {
          beatByScene[scene] = items.length;
          items.push({ sid: sid, chapter: chapter, kind: 'beat', figType: figType,
            figState: b.getAttribute('data-row') || scene, stat: statFor(sid, scene),
            html: beatCard(sid, b, scene) });
        }
      });
      return;
    }
    // awards: a photo + a winner quote. NOT a radial chart or a sticky card → STATIC free-scroll (the
    // reflectie pattern): the portrait scrolls up and away, the quote reads below. No pinned figure.
    if (/^award/.test(sid)) {
      items.push({ sid: sid, chapter: chapter, kind: 'award', figType: 'none', figState: null, stat: null,
        freescroll: true, tall: true, html: '<div class="md-fs">' + awardBlock(sec) + '</div>' });
      return;
    }
    // free-scroll sections (p01 reflection): NO sticky figure — the portrait sits at the top of one
    // free-scrolling column and scrolls UP and away as the text is read (it's decorative, not a chart,
    // so it shouldn't hog the screen). show() collapses the stage and relaxes snap for these atoms.
    if (sec.classList.contains('freescroll')) {
      var fsImg = q(sec, '.imgph img');
      var fsBody = q(sec, '.fw-body') || q(sec, '.fw-read') || sec;
      var fsHead = text(sec, '.phead h2') || text(sec, 'h2');
      var fsSign = q(sec, '.fw-sign');
      items.push({ sid: sid, chapter: chapter, kind: 'freescroll', figType: 'none', figState: null, stat: null,
        freescroll: true, tall: true,
        html: '<div class="md-fs">' +
          (fsImg ? '<img class="md-fs-photo" src="' + fsImg.getAttribute('src') + '" alt="" loading="lazy">' : '') +
          '<div class="md-fs-body">' +
            '<p class="md-eyebrow">' + (fsHead || 'Reflectie') + '</p>' +
            // the signature is a <p class="fw-sign"> INSIDE .fw-body — exclude it here so it isn't
            // rendered both as a prose paragraph AND again as the styled .md-fs-sign below (the dup).
            qa(fsBody, 'p').filter(function (p) { return !p.classList.contains('fw-sign'); }).map(function (p) { return '<p class="md-prose">' + p.innerHTML + '</p>'; }).join('') +
            (fsSign ? '<p class="md-fs-sign">' + fsSign.innerHTML + '</p>' : '') +
          '</div>' +
        '</div>' });
      return;
    }
    // p09 gallery + anything else: STATIC free-scroll (the reflectie pattern). Heading + intro prose,
    // then each award winner (photo + quote) as a block that scrolls past. No pinned figure, no card.
    var head = text(sec, '.phead h2') || text(sec, 'h2') || '';
    var firstBento = q(sec, '.live-bento');
    var introProse = qa(firstBento || sec, '.prose').map(function (p) { return '<p class="md-prose">' + p.innerHTML + '</p>'; }).join('');
    var awards = qa(sec, '.live-bento').filter(function (b) { return q(b, '.winner'); })
      .map(function (b) { return '<div class="md-fs-award">' + awardBlock(b) + '</div>'; }).join('');
    items.push({ sid: sid, chapter: chapter, kind: 'gallery', figType: 'none', figState: null, stat: null,
      freescroll: true, tall: true,
      html: '<div class="md-fs">' +
        (head || introProse ? '<div class="md-fs-body">' + (head ? '<p class="md-eyebrow">' + head + '</p>' : '') + introProse + '</div>' : '') +
        awards + '</div>' });
  });

  // colofon — excluded from the deck flow (a one-way exit on desktop), but on mobile the sidebar/cue
  // that reaches it is hidden, so without this it's unreachable. Add it as the final STATIC chapter:
  // flick past p09 to reach the verantwoording/credits, flick down to return.
  var colofon = D.getElementById('colofon');
  if (colofon) {
    chapter++;
    items.push({ sid: 'colofon', chapter: chapter, kind: 'colofon', figType: 'none', figState: null, stat: null,
      freescroll: true, tall: true,
      html: '<div class="md-fs"><div class="md-fs-body">' +
        (text(colofon, '.apx-kicker') ? '<p class="md-eyebrow">' + text(colofon, '.apx-kicker') + '</p>' : '') +
        (text(colofon, '.apx-title') ? '<h2 class="md-title">' + text(colofon, '.apx-title') + '</h2>' : '') +
        qa(colofon, '.apx-col .prose').map(function (p) { return '<p class="md-prose md-colofon-p">' + p.innerHTML + '</p>'; }).join('') +
      '</div></div>' });
  }

  // ── FIGURE SLOTS (one per chapter; lazy; kept alive). Returns { node, drive(state), mount() }. ──
  var slots = {};   // chapter -> slot record
  function slotFor(item) {
    if (slots[item.chapter]) return slots[item.chapter];
    var sec = D.getElementById(item.sid);
    var node = el('div', 'md-slot');
    // white card only for figcard-type figures; radars (radial bar charts) + photos stay open (desktop ref)
    if (item.figType === 'dumbbell' || item.figType === 'ladder' || item.figType === 'figcard') node.classList.add('card');
    var rec = { node: node, mounted: false, type: item.figType, mount: function () {}, drive: function () {} };
    // the figure lives inside a slide layer so subsection changes can paginate it left/right
    var inner = el('div', 'md-figslide'); rec.figslide = inner;
    var REDUCE = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    // horizontal "swipe" between subsection states: exit toward one side, morph while off-screen, enter
    // from the other. dir>0 = forward (out-left, in-from-right); dir<0 = back (out-right, in-from-left).
    rec.slide = function (dir, apply) {
      var f = rec.figslide;
      if (!f || REDUCE) { apply(); return; }
      if (rec._t) clearTimeout(rec._t);
      var off = dir > 0 ? -1 : 1;                             // forward → slide out left, next in from right
      f.style.transition = 'transform .19s cubic-bezier(.4,0,1,1)';
      f.style.transform = 'translateX(' + (off * 106) + '%)';   // fully out (the card clips it) — a SLIDE, not a fade
      rec._t = setTimeout(function () {
        apply();                                              // change the beat while off-screen
        f.style.transition = 'none';
        f.style.transform = 'translateX(' + (-off * 106) + '%)';
        void f.offsetWidth;                                   // reflow so the settle animates
        f.style.transition = 'transform .32s cubic-bezier(.16,.84,.32,1)';
        f.style.transform = 'translateX(0)';
        rec._t = null;
      }, 190);
    };
    if (item.figType === 'radar') {
      var scr = q(sec, '.scrolly').cloneNode(true);
      // keep the steps for the radar's row-order read, but hidden; clear ids to avoid dupes
      qa(scr, '[id]').forEach(function (n) { n.removeAttribute('id'); });
      var cm = q(scr, '.cirkel-mount'); if (cm) cm.innerHTML = '';     // drop Konva children → fresh mount
      inner.appendChild(scr);
      rec.mount = function () {
        if (rec.mounted || !cm || !window.__cirkelMount) return;
        rec.mounted = true;
        window.__cirkelMount(cm);
        if (window.__cirkelWireGuide) window.__cirkelWireGuide(cm);
      };
      rec.drive = function (state) { scr.setAttribute('data-active', state); };
    } else if (item.figType === 'dumbbell') {
      var fc = (q(sec, '.figcard') || q(sec, '.scrolly')).cloneNode(true);
      qa(fc, '[id]').forEach(function (n) { n.removeAttribute('id'); });
      var wrap = el('div', 'scrolly'); wrap.appendChild(fc); inner.appendChild(wrap);
      rec.instat = true;     // the big % is CONTENT — stack it above the rows and centre the pair as a unit
      // The dumbbell is the SAME three-row chart on every beat. Instead of fading/sliding it (a crossfade
      // can't be spatially opaque → flicker), the rows stay STABLE and a SINGLE highlighter bar TRAVELS
      // behind the active row — sliding from one row to the next on a beat change. More sophisticated, no flicker.
      var dumb = q(wrap, '.dumb');
      var hl = dumb ? el('div', 'md-dumb-hl') : null;
      if (dumb && hl) dumb.insertBefore(hl, dumb.firstChild);
      rec.drive = function (state) {
        wrap.setAttribute('data-active', state);                          // still drives the goal line etc.
        if (!dumb || !hl) return;
        var lvl = q(dumb, '.lvl[data-lvl="' + (state === 'goal' ? 'top' : state) + '"]');
        if (!lvl) return;
        if (!rec._hlInit) hl.style.transition = 'none';                   // place instantly on first paint / re-entry…
        hl.style.transform = 'translateY(' + lvl.offsetTop + 'px)';
        hl.style.height = lvl.offsetHeight + 'px';
        hl.classList.add('on');
        if (!rec._hlInit) { void hl.offsetWidth; hl.style.transition = ''; rec._hlInit = true; }   // …then enable the travel
      };
    } else if (item.figType === 'ladder') {
      var card = q(sec, '.intro-card').cloneNode(true);
      qa(card, '[id]').forEach(function (n) { n.removeAttribute('id'); });
      inner.appendChild(card);
      rec.drive = function (state) {
        qa(card, '.iscene').forEach(function (s) { s.classList.toggle('is-on', s.getAttribute('data-figure') === state); });
      };
    } else if (item.figType === 'figcard') {
      var f2 = q(sec, '.figcard').cloneNode(true);
      qa(f2, '[id]').forEach(function (n) { n.removeAttribute('id'); });
      // p07's card switches per beat (data-active hides the line chart and reveals the right .qitem
      // matrix). Wrap in a .scrolly and drive it, like the dumbbell, so the figure updates per beat
      // instead of being frozen on the line chart.
      var fwrap = el('div', 'scrolly'); fwrap.appendChild(f2); inner.appendChild(fwrap);
      rec.drive = function (state) { fwrap.setAttribute('data-active', state); };
    } else if (item.figType === 'cover') {
      var ttl = (q(D, '.mast h1') || {}).textContent || 'Talent naar de Top';
      var cv = el('div', 'md-cover-stage', '<h1 class="md-cover-title">' + ttl.replace(/\s+/g, ' ').trim() + '</h1>');
      inner.appendChild(cv);
    } else if (item.figType === 'photo') {
      var img = q(sec, '.imgph img');
      if (img) { var c = img.cloneNode(true); c.className = 'md-photo'; c.removeAttribute("id"); inner.appendChild(c); }
      else {
        var ph = q(sec, '.imgph');
        if (ph) { var bg = getComputedStyle(ph).backgroundImage; var d = el('div'); d.className = 'md-photo'; d.style.backgroundImage = bg; d.style.backgroundSize = 'cover'; d.style.backgroundPosition = "center"; inner.appendChild(d); }
      }
    }
    // in-flow stat: the big % becomes the FIRST child INSIDE the slide layer (above the figure), so the
    // figslide is a centred column of [number] + [figure] — read number-first, balanced top & bottom —
    // AND a beat change paginates the whole pair horizontally together. Filled per beat in show().
    if (rec.instat) {
      node.classList.add('instat');
      rec.cardstat = el('div', 'md-cardstat');
      inner.insertBefore(rec.cardstat, inner.firstChild);
    }
    node.appendChild(inner);     // mount the slide layer (number + figure) into the slot
    node.id = item.sid;          // carry the section id so #pXX-scoped section CSS styles the clone
    stage.insertBefore(node, stat);
    slots[item.chapter] = rec;
    return rec;
  }

  // ── CHAPTERS — group atoms by chapter, in flow order. The track renders ONLY the current chapter's
  //    beats, so native vertical scrolling is BOUNDED to one chapter: you can't scroll the text into the
  //    next chapter while the card stays pinned. Changing chapter is a deliberate VERTICAL SLIDE
  //    (jumpChapter) — the whole card+track slides out, the next slides in from below; never a fade.
  //    Within a chapter you scroll the beats and the figure PAGINATES HORIZONTALLY (showBeat→rec.slide). ──
  var chapters = [];
  items.forEach(function (it, i) {
    var c = chapters[chapters.length - 1];
    if (!c || c.ch !== it.chapter) { c = { ch: it.chapter, atoms: [] }; chapters.push(c); }
    c.atoms.push(i);
  });
  var current = -1, curCh = -1, animating = false, ticking = false;

  function itemEl(i) {
    var it = items[i];
    var node = el('section', 'md-item' + (it.kind === 'quote' ? ' quote' : '') + (it.kind === 'cover' ? ' cover' : '') + (it.freescroll ? ' freescroll' : '') + (it.tall ? ' tall' : ''), it.html);
    node.setAttribute('data-i', i);
    return node;
  }
  function applyStat(it, rec) {
    var html = it.stat ? '<span class="n">' + it.stat.t + (it.stat.u ? '<span class="u">%</span>' : '') + '</span>' + (it.stat.s ? '<span class="s">' + it.stat.s + '</span>' : '') : '';
    if (it.stat && rec && rec.instat) { rec.cardstat.innerHTML = html; stat.classList.remove('on'); }       // dumbbell: number in-flow
    else if (it.stat && it.figType !== 'radar') { stat.innerHTML = html; stat.classList.add('on'); }         // figcard: corner overlay
    else stat.classList.remove('on');
  }
  function driveBeat(it, rec) { if (it.figState != null && rec && rec.drive) rec.drive(it.figState); applyStat(it, rec); }
  function resetSlide(rec) { if (!rec) return; rec._hlInit = false; if (rec.figslide) { if (rec._t) { clearTimeout(rec._t); rec._t = null; } rec.figslide.style.transition = 'none'; rec.figslide.style.transform = 'translateX(0)'; rec.figslide.style.opacity = '1'; } }

  // ── quote interjections — a "voice from practice" that SWEEPS IN over the figure when you settle on
  //    its source beat (not a scroll step of its own). FLICK it away (or tap) to dismiss; it shows once.
  //    A short settle delay means flicking straight past a beat never triggers it. ──
  var seenQuotes = {}, quoteTimer = null, quoteUp = false;
  function dismissQuote(flickDx) {
    if (quoteTimer) { clearTimeout(quoteTimer); quoteTimer = null; }
    if (!quoteUp) return;
    quoteUp = false; quoteOv.style.pointerEvents = 'none';
    quoteOv.classList.remove('show');                                     // always leave the state clean (not shown)
    // a flick sweeps it out the way you flicked (inline overrides the class); auto-dismiss sweeps it back
    // to its enter side (the class's hidden transform). Either way it's gone.
    if (flickDx != null) { quoteOv.style.transition = 'transform .24s cubic-bezier(.4,0,1,1)'; quoteOv.style.transform = 'translateX(' + (flickDx < 0 ? -112 : 112) + '%)'; }
  }
  function maybeQuote(it) {
    dismissQuote();
    if (!it.quotes || !it.quotes.length) return;
    var quote = null;
    for (var i = 0; i < it.quotes.length; i++) if (!seenQuotes[it.quotes[i].id]) { quote = it.quotes[i]; break; }
    if (!quote) return;
    quoteTimer = setTimeout(function () {
      quoteTimer = null;
      quoteOv.style.transition = ''; quoteOv.style.transform = '';        // clear any leftover flick transform
      quoteOv.className = 'md-quote-ov enter-' + (quote.enter === 'left' ? 'left' : 'right');
      quoteOv.innerHTML = '<div class="md-quote-inner">' +
        (quote.kicker ? '<p class="md-quote-kicker">' + quote.kicker + '</p>' : '') +
        '<blockquote class="md-quote">' + quote.copyHTML + '</blockquote>' +
        (quote.src ? '<span class="md-quote-src">' + quote.src + '</span>' : '') +
        '<span class="md-quote-flick">veeg weg</span>' +
      '</div>';
      void quoteOv.offsetWidth;
      quoteOv.classList.add('show'); quoteOv.style.pointerEvents = 'auto'; quoteUp = true;
      seenQuotes[quote.id] = true;
    }, 460);
  }
  var qx = 0, qy = 0;
  quoteOv.addEventListener('touchstart', function (e) { var t = e.changedTouches[0]; qx = t.clientX; qy = t.clientY; }, { passive: true });
  quoteOv.addEventListener('touchend', function (e) {
    var t = e.changedTouches[0], dx = t.clientX - qx, dy = t.clientY - qy;
    dismissQuote(Math.abs(dx) > 30 || Math.abs(dy) > 30 ? (Math.abs(dx) >= Math.abs(dy) ? dx : (dx || 1)) : 1);  // any flick/tap dismisses
  }, { passive: true });

  // beat change WITHIN the current chapter (b = index into chapters[curCh].atoms). The dumbbell and the
  // p02 metro paginate HORIZONTALLY; the radar (open chart, not a card) morphs in place.
  function showBeat(b) {
    if (curCh < 0) return;
    var atoms = chapters[curCh].atoms, gi = atoms[b];
    if (gi == null || gi === current) return;
    var it = items[gi], rec = slots[it.chapter], dir = gi > current ? 1 : -1;
    current = gi;
    // p02 metro: scenes genuinely differ → horizontal slide. Dumbbell: same chart → stays put while its
    // highlighter bar travels (handled inside rec.drive). Radar: morph in place. So only the metro slides.
    if (rec && rec.slide && it.figType === 'ladder') rec.slide(dir, function () { driveBeat(it, rec); });
    else driveBeat(it, rec);
    hint.classList.toggle('on', it.figType === 'radar');
    paintBar(it);
    maybeQuote(it);                                  // a beat's quote interjection sweeps in once you settle here
  }

  // build a chapter into the track + stage and land on its first (or last) beat. The figure is set
  // DIRECTLY here (no horizontal slide) — the vertical chapter slide already carried the card in.
  function enterChapter(chIdx, landAtBottom) {
    curCh = chIdx;
    dismissQuote();                                  // never carry a quote interjection across a chapter slide
    var atoms = chapters[chIdx].atoms, lead = items[atoms[0]];
    var rec = slotFor(lead); resetSlide(rec);
    Object.keys(slots).forEach(function (k) { slots[k].node.classList.toggle('on', +k === lead.chapter); });
    track.innerHTML = '';
    atoms.forEach(function (gi) { track.appendChild(itemEl(gi)); });
    mdeck.classList.toggle('fs', !!lead.freescroll);
    if (window.__voidDeck) window.__voidDeck.show(VOIDS[(lead.chapter < 0 ? 0 : lead.chapter) % VOIDS.length]);
    rec.mount();
    var b = landAtBottom ? atoms.length - 1 : 0;
    current = atoms[b];
    var it = items[current];
    driveBeat(it, rec);
    hint.classList.toggle('on', it.figType === 'radar');
    paintBar(it);
    maybeQuote(it);                                  // the LANDING beat may carry a quote (e.g. a chapter
                                                     // whose FIRST beat has one) — show it, like any beat
    track.scrollTop = landAtBottom ? Math.max(0, track.scrollHeight - track.clientHeight) : 0;
  }
  function paintBar(it) {
    var inCh = items.filter(function (x) { return x.chapter === it.chapter; });
    var idx = inCh.indexOf(it);
    if (inCh.length < 2) { bar.classList.remove('on'); return; }
    if (bar.children.length !== inCh.length) { bar.innerHTML = ''; for (var n = 0; n < inCh.length; n++) bar.appendChild(el('span', 'md-bar-dot')); }
    for (var m = 0; m < bar.children.length; m++) bar.children[m].className = 'md-bar-dot' + (m < idx ? ' done' : '') + (m === idx ? ' now' : '');
    bar.classList.add('on');
  }
  function onScroll() {
    ticking = false;
    if (animating || curCh < 0) return;             // a chapter slide is mid-flight; ignore its offsets
    // active beat = the one crossing a line ~32% down the track (robust to beats taller than the screen)
    var tr = track.getBoundingClientRect(), probe = tr.top + Math.min(90, tr.height * 0.32);
    var kids = track.children, b = 0;
    for (var i = 0; i < kids.length; i++) {
      var r = kids[i].getBoundingClientRect();
      if (r.bottom <= probe) b = i + 1; else { b = i; break; }
    }
    showBeat(Math.max(0, Math.min(kids.length - 1, b)));
  }
  track.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });

  // ── chapter nav: a deliberate VERTICAL SLIDE. The current chapter (card + beats, as one unit) slides
  //    out, the next slides in from below — the track is rebuilt with the new chapter while it's
  //    off-screen, so the card visibly moves rather than fading or popping. Triggered by a vertical swipe
  //    on the card (stage) or a flick past the first/last beat of the track. ──
  function jumpChapter(dir) {                             // dir +1 = next (down/up swipe), -1 = prev
    if (animating || curCh < 0) return;
    var ni = Math.max(0, Math.min(chapters.length - 1, curCh + dir));
    if (ni === curCh) return;
    resetSlide(slots[chapters[curCh].ch]);
    animating = true;
    var out = dir > 0 ? -100 : 100;
    content.style.transition = 'transform .24s cubic-bezier(.4,0,1,1)';
    content.style.transform = 'translateY(' + out + '%)';              // current chapter slides out
    setTimeout(function () {
      enterChapter(ni, dir < 0);                                       // rebuild off-screen; going back → land at its last beat
      content.style.transition = 'none';
      content.style.transform = 'translateY(' + (-out) + '%)';         // reposition the new chapter on the far side
      void content.offsetWidth;
      content.style.transition = 'transform .34s cubic-bezier(.16,.84,.32,1)';
      content.style.transform = 'translateY(0)';                       // new chapter slides into place
      setTimeout(function () { animating = false; onScroll(); }, 350);
    }, 240);
  }
  // swipe the card (figure stage) up/down → jump a whole chapter, wherever you are in its beats
  var sx = 0, sy = 0, sdone = false;
  stage.addEventListener('touchstart', function (e) { var t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; sdone = false; }, { passive: true });
  stage.addEventListener('touchend', function (e) {
    if (sdone || animating) return;
    var t = e.changedTouches[0], dy = t.clientY - sy, dx = t.clientX - sx;
    if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) * 1.3) { sdone = true; jumpChapter(dy < 0 ? 1 : -1); }   // up → next, down → prev
  }, { passive: true });
  // flick past the first/last beat on the text track → retreat/advance a chapter (the natural "keep going")
  var tx = 0, ty = 0;
  track.addEventListener('touchstart', function (e) { var t = e.changedTouches[0]; tx = t.clientX; ty = t.clientY; }, { passive: true });
  track.addEventListener('touchend', function (e) {
    if (animating) return;
    var t = e.changedTouches[0], dy = t.clientY - ty, dx = t.clientX - tx;
    if (Math.abs(dy) < 46 || Math.abs(dy) < Math.abs(dx) * 1.2) return;                  // not a clear vertical flick
    var atTop = track.scrollTop <= 4, atBottom = track.scrollTop + track.clientHeight >= track.scrollHeight - 4;
    if (dy < 0 && atBottom) jumpChapter(1);                                              // flick up at the end → next
    else if (dy > 0 && atTop) jumpChapter(-1);                                           // flick down at the start → prev
  }, { passive: true });

  // open on the first chapter (the cover); the stage starts hidden if it's a static atom (no flash)
  if (chapters[0] && items[chapters[0].atoms[0]].freescroll) mdeck.classList.add('fs');
  D.body.appendChild(mdeck);
  // first paint after layout settles (so track.clientHeight is real)
  requestAnimationFrame(function () { requestAnimationFrame(function () { enterChapter(0, false); }); });
})();
