/* a11y-pre.js — accessible build (/toegankelijk) only. Runs BEFORE cirkel.js.
 *
 * The radial charts default to a perpetual loading WAVE that "kicks into gear"
 * (wave → grid morph + label rotate-in) at a scroll beat. On the accessible page
 * there is no scroll engine and no sweeping motion, so we strip the loader hook
 * here: cirkel.js then assembles each chart straight to its static grid. The
 * chart itself is filled by a11y.js (it drives the scrolly's data-active to the
 * fill beat). Charts keep their colour — only the motion is removed.
 */
(function () {
  'use strict';
  try {
    var mounts = document.querySelectorAll('.cirkel-mount[data-cirkel-loader]');
    for (var i = 0; i < mounts.length; i++) mounts[i].removeAttribute('data-cirkel-loader');
  } catch (e) {}
})();
