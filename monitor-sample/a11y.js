/* a11y.js — accessible build (/toegankelijk) only. Runs AFTER cirkel.js.
 *
 * The interactive deck's motion engine (app.js) is deliberately NOT loaded on the
 * accessible page, so two things it would normally do at runtime are done here —
 * statically, with NO scroll/resize listeners and no animation:
 *
 *   1. Build the p02 respons dot-grid (93 dots, first 75 filled). sections/p02
 *      ships an empty .dotgrid that section.js fills; we replicate that build
 *      without the staggered pop.
 *   2. Fill every radial chart. cirkel.js is beat-driven: a chart reveals/fills
 *      only as its .scrolly's data-active reaches the reveal/fill/compare beat.
 *      With no pager, we set data-active to whichever of those beats sits LAST in
 *      the step order, so labels, scores and any comparison overlay all show. The
 *      fill runs once, off-screen, on load — the reader only ever sees the result.
 *
 * Everything is wrapped in try/catch and is idempotent; a failure here can never
 * blank the page (the content is already in the DOM and visible).
 */
(function () {
  'use strict';

  // ── 1 · p02 respons cohort dot-grid (mirror sections/p02/section.js, no delays) ──
  function buildDots() {
    try {
      var grid = document.querySelector('#p02 .dotgrid');
      if (!grid || grid.childElementCount) return;
      var total = +grid.dataset.total || 93;
      var filled = +grid.dataset.filled || 75;
      var frag = document.createDocumentFragment();
      for (var n = 0; n < total; n++) {
        var d = document.createElement('i');
        if (n < filled) d.className = (n === filled - 1) ? 'fill edge' : 'fill';
        frag.appendChild(d);
      }
      grid.appendChild(frag);
    } catch (e) {}
  }

  // ── 2 · drive each radial chart's scrolly to its filled beat ──
  function fillCharts() {
    // rAF so this runs after cirkel.js's DOMContentLoaded init has mounted the
    // charts and installed their data-active MutationObserver.
    requestAnimationFrame(function () {
      var mounts = document.querySelectorAll('.cirkel-mount[data-cirkel-fill]');
      for (var i = 0; i < mounts.length; i++) {
        try {
          var el = mounts[i];
          var scrolly = el.closest && el.closest('.scrolly');
          if (!scrolly) continue;
          var order = [].slice.call(scrolly.querySelectorAll('.step'))
            .map(function (s) { return s.getAttribute('data-row'); });
          var beats = [
            el.getAttribute('data-cirkel-reveal'),
            el.getAttribute('data-cirkel-fill'),
            el.getAttribute('data-cirkel-compare')
          ];
          var maxI = -1;
          for (var b = 0; b < beats.length; b++) {
            var idx = beats[b] == null ? -1 : order.indexOf(beats[b]);
            if (idx > maxI) maxI = idx;
          }
          if (maxI >= 0) scrolly.setAttribute('data-active', order[maxI]);
        } catch (e) {}
      }
    });
  }

  function start() { buildDots(); fillCharts(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
