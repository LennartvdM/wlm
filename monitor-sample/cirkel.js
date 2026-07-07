/* cirkel.js — standalone mount for the cirkelgen radial chart.
 *
 * The geometry generator (CirkelgenCore) is pure drawing primitives that take a
 * Konva layer/group, so we make a small standalone stage per .cirkel-mount and let
 * the core draw into it.
 *
 *   <div class="cirkel-mount" data-scores="[3.4,2.9,3.3,3.0,3.0,3.2]"></div>
 *
 * Six scores (one per dimension, 0–4), clockwise from 12 o'clock:
 *   leiderschap · strategie · HR · communicatie · kennis · klimaat.
 *
 * ── LOOK (restored from factsheet-cirkel-lab c93, "page 05") ───────────────────
 * The chart carries its OWN halo so it reads cleanly over the moving pastel void
 * instead of fighting it. Three stacked Konva layers (= three canvases), so each can
 * carry an independent CSS blend mode:
 *   haloLayer  — a white radial-gradient disc, color-dodge → a bright plateau the
 *                chart sits on (this is the "halo it blends against").
 *   ringsLayer — the blue background ladder at 0.60 opacity, color-dodge → the grid
 *                brightens against the halo/void instead of muddying into it.
 *   chartLayer — the score wedges (vivid) + the labels (normal compositing).
 * The rings/scores use OFFSET-WEDGE geometry (the slice gap is baked into each
 * wedge's angular range) rather than CirkelgenCore's destination-out gap lines: those
 * leave antialiased "dirty pixels" at the cut edges that color-dodge re-surfaces as
 * smudges. Baked gaps = a clean blend (c93 c12).
 */
(function () {
  'use strict';

  var CHART_BASE_RADIUS = 320;   // core chartRadius
  var LABEL_PADDING     = 0.90;  // labels straddle the halo edge (c93 c7)
  var EXTENT            = 446;   // half-extent incl. labels — the mount-fit reference
  // Label intro (ported from the cirkelgen lab's travel-build): each label swings into its wedge
  // via drawLabels' sliceProgress → rotationOffset, staggered around the ring. drawLabels applies
  // easeOutCubic, so these are linear per-slice ramps (c133: SLICE_STAGGER 100ms).
  var LABEL_INTRO_STAGGER = 100;   // ms between consecutive slices
  var LABEL_INTRO_DUR     = 680;   // ms for one label's rotate-in

  // The GRID (the track the data fills into) is a bright, desaturated neutral grey; the
  // DATA wedges keep their colour (the core teal→navy ladder) so the two read as distinct:
  // grey grid, coloured data. Deep-blue labels keep the legend legible.
  var CHART_CFG = {
    chartRadius:      CHART_BASE_RADIUS,
    backgroundColors: ['#edeef1', '#e0e2e6', '#cfd2d8', '#bbbfc8'],   // bright grey grid track
    labelFill:        '#0C3F7D',
    // scoreColors left at the core default (#CEE5DA / #6EC5CD / #076C98 / #182E57) — the data.
  };

  // Halo + blend tunables.
  // c93 used color-dodge, but it leaned on a dark lavender/navy backdrop to brighten
  // against. The deck's void is near-white, so color-dodge had almost nothing to lift and
  // the halo only showed over darker photos. Paint the halo (source-over) instead — a real
  // soft-white glow that's a visible plateau over ANY backdrop — and draw the rings over it
  // normally (the innermost pale tier melts into the halo, exactly as c93 intended).
  var HALO_BLEND    = 'normal';
  var RINGS_BLEND   = 'normal';
  var RINGS_OPACITY = 0.80;
  // A hovered tier ring (a concentric band) lifts via a crisp white outline around its six cells.
  // By DEFAULT the fill is a faint white veil (TIER_HL_FILL): the outline is what delineates "this
  // ring", and it reads cleanly over saturated data, so every FILLED chart (p06, p08) uses it as-is.
  // ONE chart opts into a per-niveau colour fill instead — the empty/explorable chart (chapter 05's
  // "zes dimensies" beat), where readers probe the BARE grid and a colour-per-tier makes "which
  // niveau" pop. That mount sets data-tiercolors="niveau" → the canonical blue→teal→navy ladder
  // below (one translucent colour per tier, the white outline kept on top). data-tiercolors may also
  // be a JSON array of 4 custom colours (inner→outer).
  var TIER_HL_FILL   = 'rgba(255,255,255,0.30)';   // default veil for all tiers (the white outline does the work)
  var TIER_HL_FILLS  = ['rgba(206,229,218,0.85)',  // niveau 1 · Oriëntatie    (#CEE5DA)
                        'rgba(110,197,205,0.85)',  // niveau 2 · Ontwikkeling  (#6EC5CD)
                        'rgba(7,108,152,0.82)',    // niveau 3 · Realisatie    (#076C98)
                        'rgba(24,46,87,0.80)'];    // niveau 4 · Beheersing    (#182E57)
  var TIER_HL_STROKE = 'rgba(255,255,255,0.92)';
  var TIER_HL_STROKE_W = 3.4;   // chart units; ×stage-scale (~0.48) → ~1.6px on screen
  // The slice + ring gaps are punched THROUGH the halo (destination-out) so they read as clean
  // cut-outs to the page behind — not as white halo bleeding between the wedges — and those empty
  // gaps are what delineate the six sectors and the four levels (no drawn grid lines needed).
  // The stage canvas is drawn LARGER than the mount box (centred, pointer-events:none) so the
  // halo can feather out past the labels into the surrounding figure space without shrinking
  // the chart or clipping at the box edge.
  var STAGE_PAD     = 1.20;
  var HALO_SCALE    = 1.18;   // the taper ends just past the outer (2-line) labels, not far into the void
  var HALO_STOPS = [
    0,    'rgba(255,255,255,0.76)',
    0.60, 'rgba(255,255,255,0.72)',
    0.84, 'rgba(255,255,255,0.54)',   // bright through the chart out to ~the label ring (the red circle) …
    0.94, 'rgba(255,255,255,0.22)',   // … then taper, passing the 2-line labels …
    1,    'rgba(255,255,255,0)',       // … gone just beyond them
  ];
  // A soft shadow lifts the glow off the near-white void so it reads as a disc, kept gentle.
  var HALO_SHADOW = { color: '#1b2a55', blur: 34, opacity: 0.13, offsetY: 10 };

  // ── offset-wedge geometry (c93 c12): the slice gap is the empty space that simply
  //    was never painted, so there are no destination-out dirty pixels for the blend
  //    modes to resurface. ε(r) = angular inset for a perpendicular gap of halfGap. ──
  function epsForRadius(r, halfGap) {
    var safe = Math.max(r, halfGap + 0.001);
    return Math.atan2(halfGap, Math.sqrt(safe * safe - halfGap * halfGap));
  }
  function wedgeSceneFunc(cx, cy, innerR, outerR, startA, endA, halfGap) {
    var ei = epsForRadius(innerR, halfGap), eo = epsForRadius(outerR, halfGap);
    var a0i = startA + ei, a1i = endA - ei, a0o = startA + eo, a1o = endA - eo;
    if (a0i >= a1i || a0o >= a1o) {
      return function (ctx, shape) { ctx.beginPath(); ctx.fillStrokeShape(shape); };
    }
    return function (ctx, shape) {
      ctx.beginPath();
      ctx.moveTo(cx + innerR * Math.cos(a0i), cy + innerR * Math.sin(a0i));
      ctx.arc(cx, cy, innerR, a0i, a1i, false);
      ctx.lineTo(cx + outerR * Math.cos(a1o), cy + outerR * Math.sin(a1o));
      ctx.arc(cx, cy, outerR, a1o, a0o, true);
      ctx.closePath();
      ctx.fillStrokeShape(shape);
    };
  }
  function drawOffsetBackground(group, geom) {
    var cfg = geom.cfg, halfGap = (cfg.gapThickness * geom.layerThickness) / 2;
    for (var c = 0; c < cfg.numCategories; c++) {
      var sA = c * geom.sliceAngle + geom.rotationAngle;
      var eA = (c + 1) * geom.sliceAngle + geom.rotationAngle;
      for (var t = 0; t < cfg.numTiers; t++) {
        var b = CirkelgenCore.ringBounds(t, geom.layerThickness, cfg);
        group.add(new Konva.Shape({
          sceneFunc: wedgeSceneFunc(geom.centerX, geom.centerY, b.startRadius, b.endRadius, sA, eA, halfGap),
          fill: cfg.backgroundColors[t],
          listening: false,
        }));
      }
    }
  }
  // scores roll in: per-slice progress (easeOutBack) drives the radial fill.
  function drawOffsetScores(group, geom, scores, prog) {
    var cfg = geom.cfg, halfGap = (cfg.gapThickness * geom.layerThickness) / 2, E = CirkelgenCore.Easing;
    for (var c = 0; c < cfg.numCategories; c++) {
      var p = prog ? prog[c] : 1;
      if (p <= 0) continue;
      var sA = c * geom.sliceAngle + geom.rotationAngle;
      var eA = (c + 1) * geom.sliceAngle + geom.rotationAngle;
      var fill = (Math.floor(scores[c] * 10) / 10) * E.easeOutBack(p);
      for (var t = 0; t < cfg.numTiers; t++) {
        if (fill <= t) continue;
        var b = CirkelgenCore.ringBounds(t, geom.layerThickness, cfg);
        var f = Math.min(1, fill - t);
        if (f <= 0) continue;
        var endR = b.startRadius + (b.endRadius - b.startRadius) * f;
        if (endR <= b.startRadius) continue;
        group.add(new Konva.Shape({
          sceneFunc: wedgeSceneFunc(geom.centerX, geom.centerY, b.startRadius, endR, sA, eA, halfGap),
          fill: cfg.scoreColors[t],
          listening: false,
        }));
      }
    }
  }
  // The radius the fill reaches for score s (matches drawOffsetScores' frontier), for a comparison
  // overlay that draws relative to another series' frontier.
  function scoreToRadius(geom, s) {
    var cfg = geom.cfg, nT = cfg.numTiers;
    s = Math.max(0, Math.min(nT, s));
    var t = Math.min(nT - 1, Math.floor(s)), frac = s - t;
    var b = CirkelgenCore.ringBounds(t, geom.layerThickness, cfg);
    if (frac <= 0) return t > 0 ? CirkelgenCore.ringBounds(t - 1, geom.layerThickness, cfg).endRadius : b.startRadius;
    return b.startRadius + (b.endRadius - b.startRadius) * frac;
  }
  // Comparison overlay: a translucent band from the hero series' frontier out to the compare series'
  // frontier (the "extra" the compare series has), capped by a crisp arc at the compare level. With
  // both series close (p06: m/v vs inclusiviteit), the bands are thin — that IS the point. `prog`
  // grows the band out from the hero frontier so it animates as "pushing a bit further".
  function drawCompare(group, geom, main, compare, color, prog) {
    var cfg = geom.cfg, halfGap = (cfg.gapThickness * geom.layerThickness) / 2, p = prog == null ? 1 : Math.max(0, Math.min(1, prog));
    for (var c = 0; c < cfg.numCategories; c++) {
      var r0 = scoreToRadius(geom, main[c]), r1 = scoreToRadius(geom, compare[c]);
      if (r1 <= r0 + 0.4) continue;                                  // no meaningful surplus to show
      var rEnd = r0 + (r1 - r0) * p;
      var sA = c * geom.sliceAngle + geom.rotationAngle, eA = (c + 1) * geom.sliceAngle + geom.rotationAngle;
      group.add(new Konva.Shape({
        sceneFunc: wedgeSceneFunc(geom.centerX, geom.centerY, r0, rEnd, sA, eA, halfGap),
        fill: color, opacity: 0.5, listening: false,
      }));
      var e = epsForRadius(rEnd, halfGap), a0 = sA + e, a1 = eA - e;
      if (a0 < a1) group.add(new Konva.Shape({
        sceneFunc: (function (rr, aa0, aa1) { return function (ctx, shape) { ctx.beginPath(); ctx.arc(geom.centerX, geom.centerY, rr, aa0, aa1, false); ctx.strokeShape(shape); }; })(rEnd, a0, a1),
        stroke: color, strokeWidth: 3.2, listening: false,
      }));
    }
  }
  // Outer extent of any label (mirrors drawLabels) — the halo reaches here.
  function computeLabeledOuterRadius(cfg) {
    var fs = cfg.labelFontSize, ls = fs + 2, maxOff = -Infinity, i;
    for (i = 0; i < cfg.labelOffsets.length; i++) if (cfg.labelOffsets[i] > maxOff) maxOff = cfg.labelOffsets[i];
    var maxLines = 1;
    for (i = 0; i < cfg.categoryLabels.length; i++) {
      var n = cfg.categoryLabels[i].split('\n').length;
      if (n > maxLines) maxLines = n;
    }
    var topOuter = cfg.chartRadius + 14 + maxOff + (maxLines - 1) * ls + fs;
    var botOuter = cfg.chartRadius + 14 + fs + maxOff + (maxLines - 1) * ls;
    return Math.max(topOuter, botOuter);
  }
  function blendLayer(layer, mode) {
    var c = layer.getCanvas && layer.getCanvas();
    var el = c && c._canvas;
    if (el) el.style.mixBlendMode = (!mode || mode === 'normal') ? '' : mode;
  }

  // ── c93 "ouroboros" loader: a perpetual radial loading wave. Each slice's rings fill
  //    outward then contract back to the centre; ~8 cascades ripple around the ring at once
  //    (the wavey "loading" state before the data arrives). Ported from the c93 cirkel-lab. ──
  var WAVE_PERIOD_MS = 8000, WAVE_OVERLAP = 8.1, WAVE_SPLIT = 0.5, WAVE_RING_OVERLAP = 1.5,
      WAVE_DEPLETE_INWARD = true, WAVE_CW = true;
  // the loader wave is a PALE neutral-grey ladder — a touch LIGHTER than the static grid (same
  // neutral hue, lifted ~25% toward white) so it reads as a not-yet-solid "ghost" that darkens
  // slightly into the grid grey at kick-in. It must never be darker than the grid (that looked off).
  var WAVE_COLORS = ['#eff0f3', '#e3e5e9', '#d4d7dc', '#c3c7cf'];
  var ASSEMBLE_DUR = 850;   // ms for the wave to freeze + complete into the grid at kick-in
  // lerp two #rrggbb hexes (the wave greys complete INTO the lighter grid greys during assembly).
  function lerpHex(a, b, t) {
    function ch(h, i) { return parseInt(h.slice(1 + i * 2, 3 + i * 2), 16); }
    function hx(x) { x = Math.max(0, Math.min(255, Math.round(x))); return (x < 16 ? '0' : '') + x.toString(16); }
    return '#' + hx(ch(a, 0) + (ch(b, 0) - ch(a, 0)) * t) + hx(ch(a, 1) + (ch(b, 1) - ch(a, 1)) * t) + hx(ch(a, 2) + (ch(b, 2) - ch(a, 2)) * t);
  }
  function smoothRamp(t, a, b) {
    if (b <= a) return t >= b ? 1 : 0;
    var u = (t - a) / (b - a);
    return u <= 0 ? 0 : (u >= 1 ? 1 : u * u * (3 - 2 * u));
  }
  // one slice's per-tier fill at slice-local time s∈[0,1]: fill outward, then deplete.
  function sliceCascade(s, numTiers) {
    var out = new Array(numTiers), i;
    if (s < 0 || s >= 1) { for (i = 0; i < numTiers; i++) out[i] = 0; return out; }
    var slotW = 1 / numTiers, winW = slotW * WAVE_RING_OVERLAP;
    if (s <= WAVE_SPLIT) {
      var uF = s / WAVE_SPLIT;
      for (i = 0; i < numTiers; i++) {
        var mF = (i + 0.5) * slotW;
        out[i] = smoothRamp(uF, Math.max(0, mF - winW / 2), Math.min(1, mF + winW / 2));
      }
    } else {
      var uD = (s - WAVE_SPLIT) / (1 - WAVE_SPLIT);
      for (i = 0; i < numTiers; i++) {
        var di = WAVE_DEPLETE_INWARD ? (numTiers - 1 - i) : i;
        var mD = (di + 0.5) * slotW, wS = Math.max(0, mD - winW / 2), wE = Math.min(1, mD + winW / 2);
        out[i] = uD < wS ? 1 : (uD > wE ? 0 : 1 - smoothRamp(uD, wS, wE));
      }
    }
    return out;
  }
  // per-category per-tier fill of the whole ring at wall-clock nowMs (the perpetual wave).
  function ouroboros(nowMs, numCat, numTiers) {
    var phase = (((nowMs % WAVE_PERIOD_MS) + WAVE_PERIOD_MS) % WAVE_PERIOD_MS) / WAVE_PERIOD_MS;
    var cascadeLen = (1 / numCat) * WAVE_OVERLAP, stride = WAVE_CW ? 1 : -1, lagMax = Math.ceil(WAVE_OVERLAP);
    var tierProg = new Array(numCat);
    for (var c = 0; c < numCat; c++) {
      var tiers = new Array(numTiers); for (var ti = 0; ti < numTiers; ti++) tiers[ti] = 0;
      for (var lag = 0; lag <= lagMax; lag++) {
        if (cascadeLen <= 0) break;
        var sStart = (((phase - stride * c / numCat) % 1) + 1) % 1 + lag, sLocal = sStart / cascadeLen;
        if (sLocal < 0 || sLocal >= 1) continue;
        var vals = sliceCascade(sLocal, numTiers);
        for (var t2 = 0; t2 < numTiers; t2++) if (vals[t2] > tiers[t2]) tiers[t2] = vals[t2];
      }
      tierProg[c] = tiers;
    }
    return tierProg;
  }
  function drawRingsWave(group, geom, tierProg, colors) {
    var cfg = geom.cfg, halfGap = (cfg.gapThickness * geom.layerThickness) / 2;
    for (var c = 0; c < cfg.numCategories; c++) {
      var sA = c * geom.sliceAngle + geom.rotationAngle, eA = (c + 1) * geom.sliceAngle + geom.rotationAngle, tiers = tierProg[c];
      for (var t = 0; t < cfg.numTiers; t++) {
        var frac = tiers[t]; if (frac <= 0.001) continue;
        var b = CirkelgenCore.ringBounds(t, geom.layerThickness, cfg);
        var endR = b.startRadius + (b.endRadius - b.startRadius) * frac; if (endR <= b.startRadius) continue;
        group.add(new Konva.Shape({ sceneFunc: wedgeSceneFunc(geom.centerX, geom.centerY, b.startRadius, endR, sA, eA, halfGap), fill: colors[t], listening: false }));
      }
    }
  }

  // Punch the slice + ring gaps THROUGH the halo so they read as cut-outs to the page behind,
  // not as white halo showing between the wedges. destination-out strips that match the
  // offset-wedge gaps the grid/data/loader already leave unpainted: a constant-width strip along
  // each of the six slice boundaries, and a band in each inter-tier gap. Drawn into the halo group
  // (same scale/centre) AFTER the disc, so they erase it where the gaps are.
  function punchHaloGaps(group, geom) {
    var cfg = geom.cfg, halfGap = (cfg.gapThickness * geom.layerThickness) / 2, cx = geom.centerX, cy = geom.centerY, t;
    var holeR  = CirkelgenCore.ringBounds(0, geom.layerThickness, cfg).startRadius;
    var chartR = CirkelgenCore.ringBounds(cfg.numTiers - 1, geom.layerThickness, cfg).endRadius;
    for (var c = 0; c < cfg.numCategories; c++) {            // radial slice gaps
      var a = c * geom.sliceAngle + geom.rotationAngle;
      group.add(new Konva.Line({
        points: [cx + holeR * Math.cos(a), cy + holeR * Math.sin(a), cx + chartR * Math.cos(a), cy + chartR * Math.sin(a)],
        stroke: '#000', strokeWidth: halfGap * 2, lineCap: 'butt',
        globalCompositeOperation: 'destination-out', listening: false,
      }));
    }
    for (t = 0; t < cfg.numTiers - 1; t++) {                 // concentric inter-tier gaps
      var b0 = CirkelgenCore.ringBounds(t, geom.layerThickness, cfg);
      var b1 = CirkelgenCore.ringBounds(t + 1, geom.layerThickness, cfg);
      group.add(new Konva.Circle({
        x: cx, y: cy, radius: (b0.endRadius + b1.startRadius) / 2, strokeWidth: b1.startRadius - b0.endRadius,
        stroke: '#000', globalCompositeOperation: 'destination-out', listening: false,
      }));
    }
  }

  // A whole tier ring (all 6 wedges, baked gaps) lifted with a white outline — drawn on an overlay
  // group ABOVE the data so the band reads regardless of how full it is. `fills` is an optional
  // inner→outer per-niveau ladder (the empty chart opts in); without it the faint white veil is used.
  function drawTierHighlight(group, geom, tier, fills) {
    var cfg = geom.cfg, halfGap = (cfg.gapThickness * geom.layerThickness) / 2;
    var b = CirkelgenCore.ringBounds(tier, geom.layerThickness, cfg);
    var niveau = fills && fills[tier];
    var fill = niveau || TIER_HL_FILL;
    // The default veil is white → blend it OVERLAY so it LIFTS the tier's own colour (brightens the
    // bars beneath it on the shared chartLayer) instead of washing flat white over them. The niveau
    // ladder (the empty chart) paints normally — its colour IS the message. Fill and outline are split
    // so the white outline always stays a crisp source-over stroke on top, whatever the fill does.
    var fillGco = niveau ? 'source-over' : 'overlay';
    for (var c = 0; c < cfg.numCategories; c++) {
      var sA = c * geom.sliceAngle + geom.rotationAngle, eA = (c + 1) * geom.sliceAngle + geom.rotationAngle;
      var sf = wedgeSceneFunc(geom.centerX, geom.centerY, b.startRadius, b.endRadius, sA, eA, halfGap);
      group.add(new Konva.Shape({ sceneFunc: sf, fill: fill, globalCompositeOperation: fillGco, listening: false }));
      group.add(new Konva.Shape({ sceneFunc: sf, stroke: TIER_HL_STROKE, strokeWidth: TIER_HL_STROKE_W, listening: false }));
    }
  }

  function mount(el) {
    if (!window.Konva || !window.CirkelgenCore) return;
    var scores;
    try { scores = JSON.parse(el.getAttribute('data-scores')); } catch (e) { return; }
    if (!Array.isArray(scores) || scores.length !== 6) return;

    // Per-mount colour scheme, so M/V and culturele diversiteit can each carry their own
    // ladder: data-scorecolors / data-gridcolors are JSON arrays of 4 hex (inner→outer tier).
    var cfg = Object.assign({}, CHART_CFG);
    function readLadder(attr) {
      try { var a = JSON.parse(el.getAttribute(attr)); return (Array.isArray(a) && a.length === 4) ? a : null; }
      catch (e) { return null; }
    }
    var sc = readLadder('data-scorecolors'); if (sc) cfg.scoreColors = sc;
    var gc = readLadder('data-gridcolors');  if (gc) cfg.backgroundColors = gc;
    // Tier-hover fill ladder. Default (null) → the white veil in drawTierHighlight (every filled
    // chart). data-tiercolors="niveau" → the canonical blue/teal niveau ladder (the empty chart);
    // or a JSON array of 4 colours for a custom ladder.
    var tierHlFills = el.getAttribute('data-tiercolors') === 'niveau' ? TIER_HL_FILLS
                    : (readLadder('data-tiercolors') || null);

    // Optional comparison series (data-compare = 6 scores) overlaid as a frontier band in
    // data-compare-color, e.g. p06 shows inclusiviteit (the hero scores) vs m/v-diversiteit (compare).
    var compareScores = null, compareColor = el.getAttribute('data-compare-color') || '#2B57A6';
    try { var cmp = JSON.parse(el.getAttribute('data-compare')); if (Array.isArray(cmp) && cmp.length === 6) compareScores = cmp; } catch (e) {}

    var geom, scoreGroup, labelGroup, gridGroup, loaderGroup, hlGroup, haloPunchGroup, haloLayerRef, compareGroup, labelRAF = 0, curScoreP = 0, curCompareP = 0, guideRevealed = false;
    // The niveau ring-hover fill is for the EMPTY/explorable chart only. Once the score bars are in
    // (p05's magenta "effect" beat), the blue/teal highlight would clash with the magenta data — so
    // while scores are shown we fall back to the white veil (tracks scoresOn in applyBeat / safety).
    var scoresFilled = false;

    function progArray(p) { if (p == null) p = 1; return [p, p, p, p, p, p]; }

    // Full (re)build: 3 layers, halo + rings + labels, scores at `scoreP`, labels at `labelsOp`.
    function build(scoreP, labelsOp) {
      curScoreP = scoreP;
      var size = el.clientWidth || 380;             // the VISIBLE mount box — sets the chart size
      var stageSize = Math.round(size * STAGE_PAD); // a bigger canvas, so the halo can overflow it
      el.innerHTML = '';
      var stage = new Konva.Stage({ container: el, width: stageSize, height: stageSize, listening: false });
      // centre the oversized canvas on the mount; let its feather overflow without blocking the tooltip
      var content = el.querySelector('.konvajs-content');
      if (content) {
        var mountRect = el.getBoundingClientRect();
        var rawLeft = (size - stageSize) / 2;
        var rawTop = (size - stageSize) / 2;
        content.style.position = 'absolute';
        content.style.left = (Math.round(mountRect.left + rawLeft) - mountRect.left) + 'px';
        content.style.top = (Math.round(mountRect.top + rawTop) - mountRect.top) + 'px';
        content.style.transform = 'none';
        content.style.width = stageSize + 'px';
        content.style.height = stageSize + 'px';
        content.style.pointerEvents = 'none';
      }
      el.style.position = 'relative';
      el.style.overflow = 'visible';
      var haloLayer  = new Konva.Layer({ listening: false }); stage.add(haloLayer);
      var ringsLayer = new Konva.Layer({ listening: false }); stage.add(ringsLayer);
      var chartLayer = new Konva.Layer({ listening: false }); stage.add(chartLayer);

      geom = CirkelgenCore.geometry(0, 0, cfg);
      var labeledOuterR = computeLabeledOuterRadius(geom.cfg) * LABEL_PADDING;
      var s = (size / 2) / EXTENT, cx = stageSize / 2, cy = stageSize / 2;   // chart sized to the box, centred in the larger canvas

      // halo — a feathered white disc, its own bright plateau
      var haloR = labeledOuterR * HALO_SCALE;
      var haloGroup = new Konva.Group({ x: cx, y: cy, scaleX: s, scaleY: s, listening: false });
      haloGroup.add(new Konva.Circle({
        x: 0, y: 0, radius: haloR, listening: false,
        fillRadialGradientStartPoint: { x: 0, y: 0 }, fillRadialGradientStartRadius: 0,
        fillRadialGradientEndPoint:   { x: 0, y: 0 }, fillRadialGradientEndRadius: haloR,
        fillRadialGradientColorStops: HALO_STOPS,
        shadowColor: HALO_SHADOW.color, shadowBlur: HALO_SHADOW.blur,
        shadowOpacity: HALO_SHADOW.opacity, shadowOffsetY: HALO_SHADOW.offsetY,
      }));
      // The gap cut-outs live in their own toggleable group: ON during the loader (the void gaps
      // complicate the wave nicely), OFF for the assembled chart (the white halo stays in the gaps,
      // so the data colours don't muddy into the void). Default OFF — non-loader mounts keep white.
      haloPunchGroup = new Konva.Group({ listening: false, visible: false });
      punchHaloGaps(haloPunchGroup, geom);
      haloGroup.add(haloPunchGroup);
      haloLayerRef = haloLayer;
      haloLayer.add(haloGroup);

      // rings — the static grey grid (gridGroup) + an empty loaderGroup the loading wave draws into
      gridGroup = new Konva.Group({ x: cx, y: cy, scaleX: s, scaleY: s, opacity: RINGS_OPACITY, listening: false });
      drawOffsetBackground(gridGroup, geom);
      ringsLayer.add(gridGroup);
      loaderGroup = new Konva.Group({ x: cx, y: cy, scaleX: s, scaleY: s, opacity: 0, listening: false });
      ringsLayer.add(loaderGroup);

      // chart — score wedges + labels (normal compositing, on top)
      var chartGroup = new Konva.Group({ x: cx, y: cy, scaleX: s, scaleY: s, listening: false });
      scoreGroup = new Konva.Group({ listening: false });
      labelGroup = new Konva.Group({ listening: false, opacity: (labelsOp == null ? 1 : labelsOp) });
      chartGroup.add(scoreGroup);
      chartGroup.add(labelGroup);
      drawOffsetScores(scoreGroup, geom, scores, progArray(scoreP));
      CirkelgenCore.drawLabels(labelGroup, geom);
      chartLayer.add(chartGroup);

      // comparison overlay (above the hero data) — the compare series' frontier band, if any
      compareGroup = new Konva.Group({ x: cx, y: cy, scaleX: s, scaleY: s, listening: false });
      chartLayer.add(compareGroup);
      if (compareScores) drawCompare(compareGroup, geom, scores, compareScores, compareColor, curCompareP);

      // tier-highlight overlay — empty until an interaction layer asks for a ring; sits on top
      // of the data so a hovered tier band lifts no matter how full it is (alpha is in the fills).
      hlGroup = new Konva.Group({ x: cx, y: cy, scaleX: s, scaleY: s, listening: false });
      chartLayer.add(hlGroup);

      haloLayer.draw(); ringsLayer.draw(); chartLayer.draw();
      blendLayer(haloLayer, HALO_BLEND);
      blendLayer(ringsLayer, RINGS_BLEND);
    }

    // Re-draw only the score wedges (halo/rings/labels stay put).
    function renderScores(p) {
      curScoreP = p;
      if (!scoreGroup) return;
      scoreGroup.destroyChildren();
      drawOffsetScores(scoreGroup, geom, scores, progArray(p));
      var layer = scoreGroup.getLayer();
      if (layer) layer.batchDraw();
    }
    // Restartable score tween — fill in (easeOutCubic + the slice overshoot) or empty out.
    var scoreRAF = 0;
    function animateScores(toFilled) {
      if (scoreRAF) { cancelAnimationFrame(scoreRAF); scoreRAF = 0; }
      var from = curScoreP, to = toFilled ? 1 : 0;
      if (Math.abs(to - from) < 0.002) { renderScores(to); return; }
      var t0 = 0, DUR = toFilled ? 1100 : 420;
      function frame(ts) {
        if (!t0) t0 = ts;
        var p = Math.min(1, (ts - t0) / DUR);
        var e = toFilled ? (1 - Math.pow(1 - p, 3)) : p;
        renderScores(from + (to - from) * e);
        if (p < 1) scoreRAF = requestAnimationFrame(frame); else scoreRAF = 0;
      }
      scoreRAF = requestAnimationFrame(frame);
    }
    // Comparison overlay — redraw + restartable tween (the band grows out from the hero frontier).
    function renderCompare(p) {
      curCompareP = p;
      if (!compareGroup) return;
      compareGroup.destroyChildren();
      if (compareScores) drawCompare(compareGroup, geom, scores, compareScores, compareColor, p);
      var layer = compareGroup.getLayer();
      if (layer) layer.batchDraw();
    }
    var compareRAF = 0;
    function animateCompare(toOn) {
      if (!compareScores) return;
      if (compareRAF) { cancelAnimationFrame(compareRAF); compareRAF = 0; }
      var from = curCompareP, to = toOn ? 1 : 0;
      if (Math.abs(to - from) < 0.002) { renderCompare(to); return; }
      var t0 = 0, DUR = toOn ? 900 : 360;
      function frame(ts) {
        if (!t0) t0 = ts;
        var p = Math.min(1, (ts - t0) / DUR);
        var e = toOn ? (1 - Math.pow(1 - p, 3)) : p;
        renderCompare(from + (to - from) * e);
        if (p < 1) compareRAF = requestAnimationFrame(frame); else compareRAF = 0;
      }
      compareRAF = requestAnimationFrame(frame);
    }
    // (re)draw the labels at a per-slice progress (null = settled, progress 1 everywhere).
    function drawLabelsAt(prog) {
      if (!labelGroup) return;
      labelGroup.destroyChildren();
      CirkelgenCore.drawLabels(labelGroup, geom, prog ? { sliceProgress: prog } : undefined);
      var l = labelGroup.getLayer(); if (l) l.batchDraw();
    }
    // Reveal = the cirkelgen rotate-in (labels swing into their wedges, staggered around the ring);
    // hide = a quick fade. Settles to a static draw so the hover nudge has stable label nodes.
    function showLabels(on) {
      guideRevealed = !!on;                            // the reading guide is live only while labels are shown (never on the loader wave)
      el.classList.toggle('cirkel-live', !!on);        // gates the whole-chart hover-lift (CSS) to the interactive state
      if (!labelGroup) return;
      if (labelRAF) { cancelAnimationFrame(labelRAF); labelRAF = 0; }
      if (!on) { labelGroup.to({ opacity: 0, duration: 0.3 }); return; }
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { labelGroup.opacity(1); drawLabelsAt(null); return; }
      var n = geom.cfg.numCategories, t0 = 0;
      // draw the rotated-OUT start FIRST, then reveal — otherwise opacity(1) shows build()'s settled
      // labels for one frame (the flicker) before the rotate-in's first RAF frame redraws them.
      drawLabelsAt(progArray(0));
      labelGroup.opacity(1);
      function frame(ts) {
        if (!t0) t0 = ts;
        var elapsed = ts - t0, prog = new Array(n), done = true;
        for (var i = 0; i < n; i++) {
          var p = (elapsed - i * LABEL_INTRO_STAGGER) / LABEL_INTRO_DUR;
          prog[i] = p < 0 ? 0 : (p > 1 ? 1 : p);
          if (prog[i] < 1) done = false;
        }
        drawLabelsAt(prog);
        if (!done) labelRAF = requestAnimationFrame(frame);
        else { labelRAF = 0; drawLabelsAt(null); }
      }
      labelRAF = requestAnimationFrame(frame);
    }
    // Toggle the halo gap cut-outs (loader = on/void gaps, assembled chart = off/white gaps).
    // visible(), not opacity: a destination-out group rendered at < 1 opacity goes through a Konva
    // buffer that has nothing to erase, so the punch would silently fail — visibility keeps it exact.
    function setHaloPunch(on) {
      if (!haloPunchGroup) return;
      haloPunchGroup.visible(on);
      if (haloLayerRef) haloLayerRef.batchDraw();
    }

    // ── interaction surface ───────────────────────────────────────────────────────
    // The engine stays content-free: it just exposes the geometry an overlay needs to map a
    // cursor to a dimension (angle) or a tier (radius), plus two light "tells" it can flip —
    // nudge a category's label outward, or lift a whole tier ring. A section.js owns the
    // hit-testing, the copy, and the tooltips (see sections/p05/section.js). Methods read the
    // live closure vars, so they keep working across rebuilds (resize, beat re-render).
    el.__cirkel = {
      EXTENT: EXTENT,                                          // chart-radius units at the mount's half-width
      revealed: function () { return guideRevealed; },         // interactive only once the chart is revealed (labels up)
      cfg: function () { return geom ? geom.cfg : null; },
      ringBounds: function (t) { return geom ? CirkelgenCore.ringBounds(t, geom.layerThickness, geom.cfg) : null; },
      // grow a category's label ~5% (scaled about chart centre → it also drifts outward): a small
      // "you're on me" nudge. labelGroup.children[i] is category i's group (CirkelgenCore.drawLabels).
      nudgeLabel: function (i, on) {
        var n = labelGroup && labelGroup.children[i];
        if (!n || !geom) return;
        // a clear OUTWARD nudge: slide the label along its slice's mid-angle (+ a small grow), so
        // hover reads as "this dimension lifts out", not just a faint scale-about-centre.
        var midA = i * geom.sliceAngle + geom.sliceAngle / 2 + geom.rotationAngle, d = on ? 9 : 0;
        n.to({ x: Math.cos(midA) * d, y: Math.sin(midA) * d, scaleX: on ? 1.05 : 1, scaleY: on ? 1.05 : 1, duration: 0.18, easing: Konva.Easings.EaseInOut });
      },
      // lift tier t (a concentric ring) across all six wedges; on=false clears the overlay.
      highlightTier: function (t, on) {
        if (!hlGroup) return;
        hlGroup.destroyChildren();
        if (on && geom && t != null && t >= 0) drawTierHighlight(hlGroup, geom, t, scoresFilled ? null : tierHlFills);
        var l = hlGroup.getLayer(); if (l) l.batchDraw();
      },
    };

    // ── beat-driven (opt-in via data-cirkel-reveal / data-cirkel-fill on a .scrolly mount): the
    //    instrument assembles across the chapter's beats. With data-cirkel-loader it arrives as a
    //    perpetual loading wave and "kicks into gear" (wave → grid, labels in) at the reveal beat. ──
    var revealAt = el.getAttribute('data-cirkel-reveal');
    var fillAt   = el.getAttribute('data-cirkel-fill');
    var scrolly  = el.closest && el.closest('.scrolly');
    if (scrolly && revealAt && fillAt) {
      var loaderEnabled = el.hasAttribute('data-cirkel-loader')
        && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      var loaderWants = false, loaderInView = false, loaderRAF = 0, morphRAF = 0, morphE = 0, morphFrozen = null;
      function loaderTick(ts) {
        if (!(loaderWants && loaderInView)) { loaderRAF = 0; return; }
        if (loaderGroup && geom) {
          loaderGroup.destroyChildren();
          drawRingsWave(loaderGroup, geom, ouroboros(ts, geom.cfg.numCategories, geom.cfg.numTiers), WAVE_COLORS);
          var l = loaderGroup.getLayer(); if (l) l.batchDraw();
        }
        loaderRAF = requestAnimationFrame(loaderTick);
      }
      function syncLoader() {
        if (loaderWants && loaderInView) { if (!loaderRAF) loaderRAF = requestAnimationFrame(loaderTick); }
        else if (loaderRAF) { cancelAnimationFrame(loaderRAF); loaderRAF = 0; }
      }
      // The loader↔grid transition is a single REVERSIBLE morph (morphE 0 = wave … 1 = grid).
      // Forward (dir +1, kick-in): the wave freezes and every cell completes out to full, recolouring
      // wave-grey → grid-grey. Reverse (dir -1, scroll-back): the grid contracts back toward the LIVE
      // wave and hands off to the perpetual loader — the exact reverse, into whatever the wave is now.
      function morphStep(dir) {
        if (morphRAF) { cancelAnimationFrame(morphRAF); morphRAF = 0; }
        loaderWants = false; syncLoader();                 // the morph owns loaderGroup; pause the wave
        if (!loaderGroup || !geom) return;
        var numCat = geom.cfg.numCategories, numTiers = geom.cfg.numTiers;
        if (dir > 0) morphFrozen = ouroboros(performance.now(), numCat, numTiers);   // freeze for the assembly
        if (loaderGroup.opacity() !== RINGS_OPACITY) loaderGroup.opacity(RINGS_OPACITY);
        if (dir < 0 && gridGroup) gridGroup.opacity(0);    // disassembling: the static grid steps aside
        var prev = 0, target = dir > 0 ? 1 : 0;
        function frame(ts) {
          if (!prev) prev = ts;
          morphE += dir * (ts - prev) / ASSEMBLE_DUR; prev = ts;
          if (morphE > 1) morphE = 1; else if (morphE < 0) morphE = 0;
          var e = 1 - Math.pow(1 - morphE, 3);             // easeOutCubic on the shared level → reverses cleanly
          var waveRef = dir > 0 ? morphFrozen : ouroboros(ts, numCat, numTiers);   // reverse tracks the live wave
          var prog = new Array(numCat), c, t;
          for (c = 0; c < numCat; c++) { prog[c] = new Array(numTiers); for (t = 0; t < numTiers; t++) { var w = waveRef[c][t]; prog[c][t] = w + (1 - w) * e; } }
          var cols = new Array(numTiers); for (t = 0; t < numTiers; t++) cols[t] = lerpHex(WAVE_COLORS[t], geom.cfg.backgroundColors[t], e);
          loaderGroup.destroyChildren();
          drawRingsWave(loaderGroup, geom, prog, cols);
          var l = loaderGroup.getLayer(); if (l) l.batchDraw();
          // aura: 50% while idling on the wave (morphE 0), full once assembled (morphE 1) — and the
          // exact reverse on scroll-back. Tracks the morph so it returns to normal AS the chart completes.
          if (haloLayerRef) { haloLayerRef.opacity(0.5 + 0.5 * morphE); haloLayerRef.batchDraw(); }
          if (morphE !== target) { morphRAF = requestAnimationFrame(frame); return; }
          morphRAF = 0;
          if (dir > 0) { loaderGroup.destroyChildren(); if (gridGroup) gridGroup.opacity(RINGS_OPACITY); if (l) l.batchDraw(); }   // grid takes over
          else { loaderWants = true; syncLoader(); }       // perpetual wave resumes from where the morph left it
        }
        morphRAF = requestAnimationFrame(frame);
      }

      build(0, 0);                                   // grid + halo; labels hidden, scores empty
      var order = [].slice.call(scrolly.querySelectorAll('.step')).map(function (s) { return s.getAttribute('data-row'); });
      var ri = order.indexOf(revealAt), fi = order.indexOf(fillAt), ci = order.indexOf(el.getAttribute('data-cirkel-compare'));
      var labelsOn = false, scoresOn = false, compareOn = false, loaderState = null, labelTimer = 0;
      // Reveal labels (optionally after a delay) — a loader kick-in holds them to the assembly's
      // halfway point so the chart starts forming BEFORE the labels swing in. Any new call (or a hide)
      // cancels a pending reveal, so a quick scroll-back can't leave a stray timer firing.
      function setLabels(on, delay) {
        if (labelTimer) { clearTimeout(labelTimer); labelTimer = 0; }
        if (on && delay > 0) labelTimer = setTimeout(function () { labelTimer = 0; showLabels(true); }, delay);
        else showLabels(on);
      }
      function applyBeat(active) {
        var bi = order.indexOf(active);
        if (bi < 0) return;
        var inLoader = loaderEnabled && bi < ri, justKickedIn = false;
        if (inLoader !== loaderState) {
          var wasKicked = loaderState === false;     // came from the assembled grid (not the initial null)
          loaderState = inLoader;
          if (inLoader) {                            // back into the loader: gaps punch again
            setHaloPunch(true);
            if (wasKicked) { morphStep(-1); }        // scroll-back: disassemble the grid into the wave
            else {                                   // first/normal loader entry: wave up, grid hidden
              if (morphRAF) { cancelAnimationFrame(morphRAF); morphRAF = 0; }
              morphE = 0;
              if (loaderGroup) loaderGroup.opacity(RINGS_OPACITY);
              if (gridGroup) gridGroup.opacity(0);
              if (haloLayerRef) { haloLayerRef.opacity(0.5); haloLayerRef.batchDraw(); }   // aura fades while idling on the wave
              var rl = gridGroup && gridGroup.getLayer(); if (rl) rl.batchDraw();
              loaderWants = true; syncLoader();
            }
          } else {                                   // kick into gear
            setHaloPunch(false);
            if (loaderEnabled) { morphStep(1); justKickedIn = true; }   // assemble the wave into the grid
            else if (gridGroup) gridGroup.opacity(RINGS_OPACITY);   // no loader (p06): grid is already up
          }
        }
        var wantL = ri >= 0 && bi >= ri, wantS = fi >= 0 && bi >= fi, wantC = ci >= 0 && bi >= ci;
        // on a loader kick-in, hold the labels until the assembly is ~halfway; otherwise reveal/hide now.
        if (wantL !== labelsOn) { labelsOn = wantL; setLabels(labelsOn, (justKickedIn && wantL) ? ASSEMBLE_DUR / 2 : 0); }
        if (wantS !== scoresOn) { scoresOn = wantS; scoresFilled = wantS; animateScores(scoresOn); }
        if (wantC !== compareOn) { compareOn = wantC; animateCompare(compareOn); }
      }
      applyBeat(scrolly.getAttribute('data-active'));
      try {
        new MutationObserver(function () { applyBeat(scrolly.getAttribute('data-active')); })
          .observe(scrolly, { attributes: true, attributeFilter: ['data-active'] });
      } catch (e) {}
      // in-view gate (pause the wave off-screen) + safety so the chart can't stick empty
      if ('IntersectionObserver' in window) {
        var safeT = 0;
        new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            loaderInView = e.isIntersecting; syncLoader();
            if (e.isIntersecting) {
              if (!safeT) safeT = setTimeout(function () {
                // Safety for a genuinely STUCK chart ONLY: parked at/after the fill beat but still
                // empty. Never force-complete while the reader is legitimately on a loader/reveal beat —
                // that filled the chart, then a later re-apply regressed it to the wave (the loader
                // "triggering itself" ~14s in, and the radial data not resetting cleanly).
                var abi = order.indexOf(scrolly.getAttribute('data-active'));
                if (abi >= fi && !scoresOn) {
                  setHaloPunch(false);
                  if (loaderEnabled) { morphStep(1); loaderState = false; } else if (gridGroup) gridGroup.opacity(RINGS_OPACITY);
                  labelsOn = true; showLabels(true);
                  scoresOn = true; scoresFilled = true; animateScores(true);
                }
              }, 14000);
            } else if (safeT) { clearTimeout(safeT); safeT = 0; }
          });
        }, { threshold: 0.4 }).observe(el);
      }
      var rt1;
      window.addEventListener('resize', function () {
        clearTimeout(rt1);
        rt1 = setTimeout(function () {
          if (morphRAF) { cancelAnimationFrame(morphRAF); morphRAF = 0; }
          var bi = order.indexOf(scrolly.getAttribute('data-active'));
          var nowLoader = loaderEnabled && bi >= 0 && bi < ri;
          build(scoresOn ? 1 : 0, labelsOn ? 1 : 0);           // rebuild static at the current on/off state
          if (labelsOn) drawLabelsAt(null);                    // settled labels (no re-intro on resize)
          morphE = nowLoader ? 0 : 1; loaderState = nowLoader;
          if (nowLoader) { if (gridGroup) gridGroup.opacity(0); if (loaderGroup) loaderGroup.opacity(RINGS_OPACITY); if (haloLayerRef) haloLayerRef.opacity(0.5); setHaloPunch(true); loaderWants = true; }
          else { if (gridGroup) gridGroup.opacity(RINGS_OPACITY); if (haloLayerRef) haloLayerRef.opacity(1); setHaloPunch(false); loaderWants = false; }
          syncLoader();
          if (compareScores) renderCompare(curCompareP);
        }, 200);
      });
      return;
    }

    // ── roll-in (p08 coda, awards, any mount without beat hooks): grid first, labels rotate in +
    //    scores fill on view ──
    if ('IntersectionObserver' in window) {
      build(0, 0);
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { showLabels(true); animateScores(true); if (compareScores) animateCompare(true); io.disconnect(); } });
      }, { threshold: 0.4 });
      io.observe(el);
    } else {
      build(1, 1); if (compareScores) renderCompare(1);
    }
    var rt2;
    window.addEventListener('resize', function () { clearTimeout(rt2); rt2 = setTimeout(function () { build(1, 1); if (compareScores) renderCompare(curCompareP); }, 200); });
  }

  function init() {
    var els = document.querySelectorAll('.cirkel-mount[data-scores]');
    for (var i = 0; i < els.length; i++) mount(els[i]);
  }
  window.__cirkelMount = mount;                          // mobile.js mounts its own frame radars
  if (!window.__MOBILE_DECK) {                           // on phones the standalone frame owns mounting
    if (document.readyState !== 'loading') init();
    else document.addEventListener('DOMContentLoaded', init);
  }
})();

/* ── cirkel reading guide ──────────────────────────────────────────────────────
   Wired onto EVERY .cirkel-mount once the engine has built it. Two axes:
     ANGLE  → the six policy DIMENSIONS (labels) · hover/tap a label → it nudges out + a tip explains it.
     RADIUS → the four maturity LEVELS (rings)   · hover/tap a ring  → it outlines + a tip explains it.
   The tip floats above the cursor. The six dimensions and four levels are the monitor's SHARED model
   (the same on m/v, inclusiviteit and culturele diversiteit), so the copy lives here once; each mount
   passes its own topic via data-cirkel-topic, substituted into the dimension defs ({T}). The guide
   reads geometry + the two visual tells from the engine's mount.__cirkel API and is live only while the
   chart is revealed (api.revealed()), so it never fires on the loading wave. Listeners sit on the mount
   itself (its canvas is pointer-events:none), so they survive the engine's rebuilds (resize). */
(function () {
  'use strict';
  // clockwise from 12 o'clock, matching CirkelgenCore's categoryLabels order. {T} = the chart's topic.
  var DIMS = [
    { label: 'Leiderschap',             def: 'De manier waarop leiders de organisatie op koers houden en inspireren tot het behalen van ambities en resultaten.' },
    { label: 'Strategie en management', def: 'Concreet beleid en maatregelen om {T} in de organisatie te realiseren.' },
    { label: 'HR-management',           def: 'HR-beleid en HR-activiteiten die weloverwogen worden ingezet om {T} te realiseren.' },
    { label: 'Communicatie',            def: 'De mate waarin een organisatie haar visie, gevoelde urgentie, doelen en de maatregelen voor diversiteit zichtbaar en hoorbaar uitdraagt.' },
    { label: 'Kennis en vaardigheden',  def: 'Managers en staf weten welke mechanismen {T} belemmeren en welke maatregelen {T} bevorderen.' },
    { label: 'Klimaat',                 def: 'De mate waarin {T} in de organisatie leeft en wordt gewaardeerd.' }
  ];
  // inner→outer ring = niveau 1→4. The report's own ladder (phase · tag · meaning).
  var LEVELS = [
    { n: 1, phase: 'Oriëntatiefase',    tag: 'We verkennen de mogelijkheden', desc: 'Analyse van de situatie en verkenning van mogelijkheden.' },
    { n: 2, phase: 'Ontwikkelingsfase', tag: 'We zijn gestart',               desc: 'Strategie en activiteiten ontwikkelen.' },
    { n: 3, phase: 'Realisatiefase',    tag: 'Het werk is in volle gang',     desc: 'Strategie en activiteiten worden uitgevoerd.' },
    { n: 4, phase: 'Beheersingsfase',   tag: 'Wij hebben het in de vingers',  desc: 'Strategie en activiteiten worden beheerst, voortdurende verbetering is het streven.' }
  ];
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
  function tierTip(t) {
    var lv = LEVELS[t];
    return '<div class="ct-kicker">Niveau ' + lv.n + ' van 4</div><div class="ct-title">' + lv.phase + '</div>'
      + '<p class="ct-def">' + lv.desc + '</p><div class="ct-tag">“' + lv.tag + '”</div>';
  }
  function dimTip(i, topic) {
    var d = DIMS[i];
    return '<div class="ct-kicker">Dimensie</div><div class="ct-title">' + esc(d.label) + '</div>'
      + '<p class="ct-def">' + d.def.replace(/\{T\}/g, esc(topic)) + '</p>';
  }

  function wire(mount, api) {
    var topic = mount.getAttribute('data-cirkel-topic') || 'diversiteit';
    var hoverable = !window.matchMedia || window.matchMedia('(hover:hover) and (pointer:fine)').matches;
    var tip = document.createElement('div'); tip.className = 'cirkel-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
    // The tip's frosted BACKDROP, rendered by hand. backdrop-filter can't blur the chart (its Konva
    // canvas rides a transform → its own GPU layer a body-level backdrop-filter can't reach), so we
    // paint the pixels behind the tip ourselves: copy the chart's canvases into this overlay, BLURRED
    // (a plain ctx.filter on our own pixels — GPU-independent), clipped to the tip's rounded box.
    // The frost is a CHILD of the tip, painted beneath the text (z-index:-1) INSIDE the tip's own
    // position:fixed stacking context — that's what lets the text's mix-blend-mode:multiply ink into
    // the blur. The text lives in its own .cirkel-tip-body so setting innerHTML never wipes the frost.
    var frost = document.createElement('canvas'); frost.className = 'cirkel-tip-frost'; frost.setAttribute('aria-hidden', 'true');
    frost.style.position = 'absolute'; frost.style.inset = '0'; frost.style.zIndex = '-1'; frost.style.pointerEvents = 'none';
    var tbody = document.createElement('div'); tbody.className = 'cirkel-tip-body';
    tip.appendChild(frost); tip.appendChild(tbody);
    document.body.appendChild(tip);
    // Lock the tip to the TALLEST of its 10 possible contents (4 niveaus + 6 dimensions) so it never
    // grows/shrinks vertically as you move between rings and dimensions — one steady panel, not a box
    // that twitches per line count. Measured at the tip's real (CSS-driven) width so wrapping is honest,
    // and set as a content-box min-height. Re-run once fonts settle, since text metrics decide the height.
    function lockTipHeight() {
      var prevHTML = tbody.innerHTML, wasHidden = tip.hidden, i, maxH = 0;
      tip.style.minHeight = '';                                  // release, so we read each natural height
      tip.hidden = false; tip.style.visibility = 'hidden';       // measurable but never flashes
      for (i = 0; i < LEVELS.length; i++) { tbody.innerHTML = tierTip(i);        if (tip.offsetHeight > maxH) maxH = tip.offsetHeight; }
      for (i = 0; i < DIMS.length;   i++) { tbody.innerHTML = dimTip(i, topic);  if (tip.offsetHeight > maxH) maxH = tip.offsetHeight; }
      var cs = getComputedStyle(tip);
      // offsetHeight is the border-box height. min-height is interpreted in the box's own model: for
      // border-box (the deck's global default) it already includes padding+border, so use it as-is; for
      // content-box, subtract them so the resulting border-box height matches the tallest content.
      var vpad = cs.boxSizing === 'border-box' ? 0
               : (parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth));
      tip.style.minHeight = Math.max(0, Math.ceil(maxH - vpad)) + 'px';
      tbody.innerHTML = prevHTML; tip.style.visibility = ''; tip.hidden = wasHidden;
    }
    lockTipHeight();
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) document.fonts.ready.then(lockTipHeight);
    var foff = document.createElement('canvas');   // offscreen: the chart-behind-the-tip composited onto an OPAQUE base, sharp
    var FROST_BLUR = 12, FROST_BASE = '#ffffff';
    function drawFrost() {
      var content = mount.querySelector('.konvajs-content');
      if (!content || tip.hidden) { frost.style.display = 'none'; return; }
      var tr = tip.getBoundingClientRect(), sr = content.getBoundingClientRect();
      if (!tr.width || !sr.width) { frost.style.display = 'none'; return; }
      var dpr = window.devicePixelRatio || 1;
      var bw = Math.max(1, Math.round(tr.width * dpr)), bh = Math.max(1, Math.round(tr.height * dpr));
      frost.style.display = 'block';   // position/size come from inset:0 inside the tip; only the backing store is set here
      if (frost.width !== bw) frost.width = bw;
      if (frost.height !== bh) frost.height = bh;
      if (foff.width !== bw) foff.width = bw;
      if (foff.height !== bh) foff.height = bh;
      // 1) compose the chart pixels behind the tip onto an OPAQUE base, SHARP (offscreen). Blurring a
      //    TRANSPARENT chart leaves it see-through, so the SHARP chart on the page doubles through it;
      //    compositing onto an opaque base first kills that double-image.
      var oc = foff.getContext('2d');
      oc.setTransform(dpr, 0, 0, dpr, 0, 0);
      oc.globalCompositeOperation = 'source-over';
      oc.fillStyle = FROST_BASE; oc.fillRect(0, 0, tr.width, tr.height);
      var canvases = content.querySelectorAll('canvas');       // halo + grid + chart layers, aligned to screen
      for (var i = 0; i < canvases.length; i++) oc.drawImage(canvases[i], sr.left - tr.left, sr.top - tr.top, sr.width, sr.height);
      // 2) draw that opaque image into the frost, BLURRED, then back-fill the blur-feathered EDGES
      //    opaque too (destination-over) so nothing sharp leaks at the border.
      var c = frost.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, tr.width, tr.height);
      c.filter = 'blur(' + FROST_BLUR + 'px) saturate(1.35) brightness(1.02)';  // blur our OWN (opaque)
      // pixels — GPU-independent. The saturate/brightness lifts the chart's blue/teal so it reads as
      // frosted glass with colour bleeding through, not a flat white card (the milky base alone washes
      // the sparse rings out). White has no saturation, so the veil stays clean; only the chart lifts.
      c.drawImage(foff, 0, 0, bw, bh, 0, 0, tr.width, tr.height);
      c.filter = 'none';
      c.globalCompositeOperation = 'destination-over';
      c.fillStyle = FROST_BASE; c.fillRect(0, 0, tr.width, tr.height);
      c.globalCompositeOperation = 'source-over';
    }
    function hideFrost() { frost.style.display = 'none'; }
    var hoverDim = -1, hoverTier = -1, shownKind = null, shownIdx = -1;

    function zoneAt(px, py) {
      var r = mount.getBoundingClientRect(), half = r.width / 2;
      var cfg = api.cfg(); if (half <= 0 || !cfg) return { kind: 'out' };
      var dx = px - (r.left + half), dy = py - (r.top + r.height / 2);
      var coreR = Math.sqrt(dx * dx + dy * dy) * api.EXTENT / half;
      var r0 = api.ringBounds(0), rN = api.ringBounds(cfg.numTiers - 1);
      var TAU = Math.PI * 2, ROT = -Math.PI / 2, SLICE = TAU / cfg.numCategories;
      var ang = (((Math.atan2(dy, dx) - ROT) % TAU) + TAU) % TAU;
      var sector = Math.floor(ang / SLICE) % cfg.numCategories;
      if (coreR < r0.startRadius) return { kind: 'hole' };
      if (coreR <= rN.endRadius) return { kind: 'tier', tier: tierAt(coreR, cfg), sector: sector };
      if (coreR <= api.EXTENT * 1.05) return { kind: 'dim', sector: sector };
      return { kind: 'out' };
    }
    function tierAt(coreR, cfg) {
      var best = 0, bestD = Infinity;
      for (var t = 0; t < cfg.numTiers; t++) {
        var b = api.ringBounds(t);
        if (coreR >= b.startRadius && coreR <= b.endRadius) return t;
        var d = Math.min(Math.abs(coreR - b.startRadius), Math.abs(coreR - b.endRadius));
        if (d < bestD) { bestD = d; best = t; }
      }
      return best;
    }
    function setHoverDim(i)  { if (i === hoverDim)  return; if (hoverDim  >= 0) api.nudgeLabel(hoverDim, false);    hoverDim  = i; if (i >= 0) api.nudgeLabel(i, true); }
    function setHoverTier(t) { if (t === hoverTier) return; if (hoverTier >= 0) api.highlightTier(hoverTier, false); hoverTier = t; if (t >= 0) api.highlightTier(t, true); }

    function place(px, py) {
      tip.hidden = false;
      var w = tip.offsetWidth, hh = tip.offsetHeight, pad = 12, gap = 16;
      // Radial placement, OUTWARD: extend the centre→cursor line past the cursor and sit the tip just
      // beyond it. Never between the centre and the cursor (that reads as "inside" the chart), and not
      // shoved all the way out to the label ring either — a comfortable gap past the cursor. The cursor
      // sets the MINIMUM distance; the tip rides further out as the cursor moves outward. Legibility comes
      // from the frosted backdrop drawn in drawFrost() (the chart behind the tip, blurred), not a fill.
      var r = mount.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = px - cx, dy = py - cy, len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / len, uy = dy / len;
      var halfExtent = Math.abs(ux) * (w / 2) + Math.abs(uy) * (hh / 2);   // the tip's reach from its centre along the radial
      var centreR = len + gap + halfExtent;                                // near edge a comfortable gap OUTSIDE the cursor
      tip.style.left = Math.max(pad, Math.min(innerWidth  - w  - pad, cx + ux * centreR - w  / 2)) + 'px';
      tip.style.top  = Math.max(pad, Math.min(innerHeight - hh - pad, cy + uy * centreR - hh / 2)) + 'px';
    }
    function show(z, px, py) {
      if (z.kind === 'tier') {
        setHoverDim(-1); setHoverTier(z.tier);
        if (shownKind !== 'tier' || shownIdx !== z.tier) { tbody.innerHTML = tierTip(z.tier); shownKind = 'tier'; shownIdx = z.tier; }
        place(px, py); tip.classList.add('on'); drawFrost();
      } else if (z.kind === 'dim') {
        setHoverTier(-1); setHoverDim(z.sector);
        if (shownKind !== 'dim' || shownIdx !== z.sector) { tbody.innerHTML = dimTip(z.sector, topic); shownKind = 'dim'; shownIdx = z.sector; }
        place(px, py); tip.classList.add('on'); drawFrost();
      } else hide();
    }
    function hide() {
      setHoverDim(-1); setHoverTier(-1); hideFrost();
      if (tip.hidden) return;
      tip.hidden = true; tip.classList.remove('on'); shownKind = null; shownIdx = -1;
    }
    function live() { return api.revealed && api.revealed(); }

    if (hoverable) {
      mount.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        if (!live()) { hide(); return; }
        show(zoneAt(e.clientX, e.clientY), e.clientX, e.clientY);
      });
      mount.addEventListener('pointerleave', hide);
    }
    // touch: tap toggles the tip for the tapped zone (desktop uses hover, above)
    mount.addEventListener('click', function (e) {
      if (hoverable) return;
      if (!live()) { hide(); return; }
      var z = zoneAt(e.clientX, e.clientY), idx = z.kind === 'dim' ? z.sector : z.tier;
      if (z.kind !== 'dim' && z.kind !== 'tier') { hide(); return; }
      if (shownKind === z.kind && shownIdx === idx && !tip.hidden) hide();
      else show(z, e.clientX, e.clientY);
    });
    var dismiss = function () { hide(); };
    window.addEventListener('scroll', dismiss, { passive: true });
    window.addEventListener('resize', dismiss);
    // Dismiss a held hover when the BEAT changes. The chart re-renders under a stationary cursor as you
    // scroll between beats, but the deck's scroll engine doesn't emit a window 'scroll', so the tier
    // highlight (and its frost) is never redrawn — a niveau ring drawn on the empty grid would linger as
    // a stale blue "echo" once the chart fills with score data. The beat mutation is the reliable trigger.
    var scrollyEl = mount.closest && mount.closest('.scrolly');
    if (scrollyEl) {
      try { new MutationObserver(dismiss).observe(scrollyEl, { attributes: true, attributeFilter: ['data-active'] }); } catch (e) {}
    }
  }

  function wireWhenReady(el) {
    if (el.__cirkelGuideWired) return;
    var tries = 0;
    (function ready() {
      var api = el.__cirkel;
      if (api && typeof api.cfg === 'function' && api.cfg()) {
        if (el.__cirkelGuideWired) return;
        el.__cirkelGuideWired = true;
        wire(el, api);
        return;
      }
      if (tries++ < 600) requestAnimationFrame(ready);
    })();
  }
  function init() {
    [].slice.call(document.querySelectorAll('.cirkel-mount[data-scores]')).forEach(wireWhenReady);
  }
  window.__cirkelWireGuide = wireWhenReady;             // mobile.js wires the guide on its frame radars
  if (!window.__MOBILE_DECK) {
    if (document.readyState !== 'loading') init();
    else document.addEventListener('DOMContentLoaded', init);
  }
})();
