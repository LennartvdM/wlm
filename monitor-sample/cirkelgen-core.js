/**
 * cirkelgen-core.js — single source of truth for cirkelgen rendering.
 *
 * Pure drawing primitives extracted from chart-script.js. Both the
 * interactive cirkelgen (chart-script.js) and the static PDF renderer
 * (cirkelgen-render.js) call into these — guaranteeing the PDF reproduces
 * exactly what the interactive shows. No drift possible.
 *
 * Design principles:
 *   • No module-scope state. Config is passed as an argument.
 *   • No interactivity wired here. The interactive wrapper attaches its
 *     own mouse handlers to the returned shapes; the PDF wrapper ignores them.
 *   • No layer ownership. Caller provides the Konva.Layer or Konva.Group
 *     to draw into; core just adds shapes.
 *   • No batchDraw / destroyChildren — caller controls render lifecycle.
 *   • Animation progress is supported (per-slice or global), but defaults
 *     to 1 (full state). Static callers can ignore it.
 */

window.CirkelgenCore = (function () {

  // ─── Defaults — match the canonical cirkelgen settings ────────────
  // Callers can override any of these via the geometry() config argument.
  const DEFAULTS = {
    chartRadius:        320,
    totalLayers:        67,
    centerHole:         18,
    ringThickness:      10,
    gapThickness:       3,
    numCategories:      6,
    numTiers:           4,

    backgroundColors:   ['#F2F2F2', '#e6e6e6', '#cccccc', '#999999'],
    scoreColors:        ['#CEE5DA', '#6EC5CD', '#076C98', '#182E57'],
    benchmarkColor:     '#F47B54',
    averageColor:       '#FFFF00',
    averageStrokeColor: '#444444',

    // Categories ordered clockwise from 12 o'clock.
    categoryLabels: [
      'leiderschap',
      'strategie en\nmanagement',
      'HR management',
      'communicatie',
      'kennis en\nvaardigheden',
      'klimaat',
    ],

    // Label rendering — fixed font size + per-category radial offsets.
    labelFontSize:  38,
    labelOffsets:   [13, 15, -26, -26, 15, 13],
    labelFontFamily: 'Arial',
    labelFontStyle:  'bold',
    labelFill:       '#076C98',

    // When true, the slice-gap lines use globalCompositeOperation
    // 'destination-out' instead of an opaque white stroke — they erase
    // whatever's beneath them (rings / benchmarks / scores), leaving the
    // page background visible through the gaps and the donut hole.
    // Use in single-layer/single-group contexts (e.g. the PDF renderer)
    // where everything composites in one canvas. Don't use in the
    // multi-layer interactive renderer, where erasing on one layer
    // doesn't propagate transparency through the layers below.
    transparentGaps: false,

    // Multiplier for the average-pill body geometry (circle cap radius
    // and arc protrusion). Default 1 = canonical pill size. Use to
    // pixel-pin pills against parent-Group scaling if ever needed; the
    // PDF wrapper currently lets pills scale with the chart (default 1)
    // so they stay proportional, matching the original PDF.
    pillScale: 1,

    // ── Average pill — full parameter set ──
    //
    // Body width: cap-circle radius as a multiple of layerThickness.
    averagePillBodyRatio: 1.4,
    //
    // Length: pill arc protrusion in canonical px (half-length along the
    //   chart's tangent direction; total pill length ≈ 2 × this).
    averagePillProtrusion: 23,
    //
    // Outline thickness in canonical px. Scales with parent Group
    //   (consistent in both interactive and PDF — proportional).
    averagePillStrokeWidth: 6,
    //
    // Where in the score-bearing layer the pill sits:
    //   'inner' = at the layer's start (closer to chart center)
    //   'mid'   = at the layer's middle
    //   'outer' = at the layer's end (closer to chart edge)
    //   number 0–1 = fractional position within the layer (0 = inner, 1 = outer)
    averagePillRadialPosition: 'mid',
    //
    // Curve along the chart's tangent? When true (locked default), the
    // pill is an arc segment that follows the chart's circular geometry.
    // When false, it's a straight stadium — rectangle with semicircle
    // caps — tangent to the chart but ignoring its curvature.
    averagePillCurve: true,
    //
    // Fine-tune the curve's tightness via a "fictive center" sliding along
    // the radial line from the chart center toward the pill:
    //   0    → fictive center at chart center → pill arc has chart-radius
    //          curvature (mathematically correct, but optically gentle)
    //   >0   → fictive center moves outward toward the pill → arc radius
    //          shrinks → curve gets visibly tighter / more arched
    //   ~1   → fictive center near the pill → very tight curl (clamped
    //          short of 1 to avoid degenerate zero radius)
    // Pill length stays constant; only the bow changes. Ignored when
    // averagePillCurve is false.
    averagePillCurl: 0.40,
  };

  // ─── Easing — same set as chart-script.js ─────────────────────────
  const Easing = {
    easeOutCubic:   (t) => 1 - Math.pow(1 - t, 3),
    easeOutQuart:   (t) => 1 - Math.pow(1 - t, 4),
    easeOutBack:    (t) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
  };

  // ─── Geometry ─────────────────────────────────────────────────────
  /**
   * Compute geometry for a chart centered at (centerX, centerY).
   * Returns a geom object that encapsulates center + derived measurements
   * + the full config used. Pass the geom into every draw function.
   */
  function geometry(centerX, centerY, configOverrides) {
    const cfg = Object.assign({}, DEFAULTS, configOverrides || {});
    return {
      centerX:        centerX,
      centerY:        centerY,
      maxRadius:      cfg.chartRadius,
      layerThickness: cfg.chartRadius / cfg.totalLayers,
      sliceAngle:     (Math.PI * 2) / cfg.numCategories,
      rotationAngle:  -Math.PI / 2, // start at top
      cfg:            cfg,
    };
  }

  function ringBounds(tierIndex, layerThickness, cfg) {
    const startRadius = (cfg.centerHole + tierIndex * (cfg.ringThickness + cfg.gapThickness)) * layerThickness;
    const endRadius   = startRadius + cfg.ringThickness * layerThickness;
    return { startRadius, endRadius };
  }

  function arcPath(centerX, centerY, innerRadius, outerRadius, startAngle, endAngle) {
    return function (context, shape) {
      context.beginPath();
      context.arc(centerX, centerY, outerRadius, startAngle, endAngle);
      context.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
      context.closePath();
      context.fillStrokeShape(shape);
    };
  }

  // ─── drawBackground ───────────────────────────────────────────────
  /**
   * Draw the four-tier grey background rings. Includes its own gap lines
   * (matching chart-script.js's drawBackground which calls drawGapLines
   * at the end).
   *
   * @param {Konva.Layer|Konva.Group} layer
   * @param {Object} geom — from geometry()
   * @param {Object} [options]
   * @param {number[]} [options.sliceProgress] — per-category 0–1 (angle sweep)
   * @param {number[][]} [options.tierProgress] — per-category × per-tier 0–1 (radial build-out)
   */
  function drawBackground(layer, geom, options) {
    options = options || {};
    const sliceProgress = options.sliceProgress || null;
    const tierProgress  = options.tierProgress || null;
    const cfg = geom.cfg;

    for (let category = 0; category < cfg.numCategories; category++) {
      const baseStartAngle = category * geom.sliceAngle + geom.rotationAngle;
      const baseEndAngle   = (category + 1) * geom.sliceAngle + geom.rotationAngle;

      const sliceProg = sliceProgress ? sliceProgress[category] : 1;
      if (sliceProg <= 0) continue;

      const animatedEndAngle = baseStartAngle + (baseEndAngle - baseStartAngle) * Easing.easeOutCubic(sliceProg);

      for (let tier = 0; tier < cfg.numTiers; tier++) {
        const { startRadius, endRadius } = ringBounds(tier, geom.layerThickness, cfg);

        let tierProg = 1;
        if (tierProgress && tierProgress[category]) {
          tierProg = tierProgress[category][tier] || 0;
        }
        if (tierProg <= 0) continue;

        const easedTierProg = Easing.easeOutQuart(tierProg);
        const animatedEndRadius = startRadius + (endRadius - startRadius) * easedTierProg;

        layer.add(new Konva.Shape({
          sceneFunc: arcPath(geom.centerX, geom.centerY, startRadius, animatedEndRadius, baseStartAngle, animatedEndAngle),
          fill: cfg.backgroundColors[tier],
        }));
      }
    }

    drawGapLines(layer, geom);
  }

  // ─── drawGapLines ─────────────────────────────────────────────────
  function drawGapLines(layer, geom, options) {
    options = options || {};
    const opacity = options.opacity != null ? options.opacity : 1;
    const cfg = geom.cfg;

    for (let i = 0; i < cfg.numCategories; i++) {
      const angle = i * geom.sliceAngle + geom.rotationAngle;
      // Strokes scale with parent Group (Konva default). Both renderers
      // produce the same body:stroke ratios at any chart size — the
      // whole point of the unified core is proportional parity.
      const lineProps = {
        points: [
          geom.centerX,
          geom.centerY,
          geom.centerX + Math.cos(angle) * (geom.maxRadius + 20),
          geom.centerY + Math.sin(angle) * (geom.maxRadius + 20),
        ],
        stroke: 'white',
        // Same thickness as the ring gaps (cfg.gapThickness layers, in
        // canonical px) so the axis gaps and ring gaps read as one gap width.
        strokeWidth: cfg.gapThickness * geom.layerThickness,
        opacity: opacity,
      };
      if (cfg.transparentGaps) {
        // Erase whatever's beneath in the same canvas/group rather than
        // paint opaque white. Source color is irrelevant in this mode.
        lineProps.globalCompositeOperation = 'destination-out';
      }
      layer.add(new Konva.Line(lineProps));
    }
  }

  // ─── drawScores ───────────────────────────────────────────────────
  /**
   * Draw filled score wedges. Calls drawGapLines at the end (matching
   * chart-script.js's drawScores).
   *
   * @returns {Konva.Shape[]} segment shapes (with attrs.category/tier/value/type)
   *   so interactive callers can wire mouse events. PDF callers can ignore.
   */
  function drawScores(layer, geom, scores, options) {
    options = options || {};
    const animationProgress = options.animationProgress != null ? options.animationProgress : 1;
    const cfg = geom.cfg;
    const isPerSlice = Array.isArray(animationProgress);
    const segments = [];

    for (let category = 0; category < cfg.numCategories; category++) {
      const startAngle = category * geom.sliceAngle + geom.rotationAngle;
      const endAngle   = (category + 1) * geom.sliceAngle + geom.rotationAngle;

      const sliceProgress = isPerSlice ? animationProgress[category] : animationProgress;
      if (sliceProgress <= 0) continue;

      const score        = scores[category];
      const snappedScore = Math.floor(score * 10) / 10;
      const easedProg    = Easing.easeOutBack(sliceProgress);
      const animatedFill = snappedScore * easedProg;

      for (let tier = 0; tier < cfg.numTiers; tier++) {
        const { startRadius, endRadius } = ringBounds(tier, geom.layerThickness, cfg);

        if (animatedFill <= tier) continue;
        const fillInTier = Math.min(1, animatedFill - tier);
        if (fillInTier <= 0) continue;

        const animatedEndRadius = startRadius + (endRadius - startRadius) * fillInTier;
        if (animatedEndRadius <= startRadius) continue;

        const segment = new Konva.Shape({
          sceneFunc: arcPath(geom.centerX, geom.centerY, startRadius, animatedEndRadius, startAngle, endAngle),
          fill:      cfg.scoreColors[tier],
          category:  category,
          tier:      tier,
          value:     scores[category],
          type:      'score',
        });
        layer.add(segment);
        segments.push(segment);
      }
    }

    drawGapLines(layer, geom);
    return segments;
  }

  // ─── drawBenchmarks ───────────────────────────────────────────────
  /**
   * Draw filled benchmark wedges in the benchmark color. Does NOT auto-
   * draw gap lines (matching chart-script.js — score-layer gap lines
   * sit above and mask gaps in the benchmark layer too).
   */
  function drawBenchmarks(layer, geom, benchmarks, options) {
    options = options || {};
    const animationProgress = options.animationProgress != null ? options.animationProgress : 1;
    const cfg = geom.cfg;
    const isPerSlice = Array.isArray(animationProgress);
    const segments = [];

    for (let category = 0; category < cfg.numCategories; category++) {
      const startAngle = category * geom.sliceAngle + geom.rotationAngle;
      const endAngle   = (category + 1) * geom.sliceAngle + geom.rotationAngle;

      const sliceProgress = isPerSlice ? animationProgress[category] : animationProgress;
      if (sliceProgress <= 0) continue;

      const benchmark        = benchmarks[category];
      const snappedBenchmark = Math.floor(benchmark * 10) / 10;
      const easedProg        = Easing.easeOutBack(sliceProgress);
      const animatedFill     = snappedBenchmark * easedProg;

      for (let tier = 0; tier < cfg.numTiers; tier++) {
        const { startRadius, endRadius } = ringBounds(tier, geom.layerThickness, cfg);

        if (animatedFill <= tier) continue;
        const fillInTier = Math.min(1, animatedFill - tier);
        if (fillInTier <= 0) continue;

        const animatedEndRadius = startRadius + (endRadius - startRadius) * fillInTier;
        if (animatedEndRadius <= startRadius) continue;

        const segment = new Konva.Shape({
          sceneFunc: arcPath(geom.centerX, geom.centerY, startRadius, animatedEndRadius, startAngle, endAngle),
          fill:      cfg.benchmarkColor,
          category:  category,
          tier:      tier,
          value:     benchmarks[category],
          type:      'benchmark',
        });
        layer.add(segment);
        segments.push(segment);
      }
    }
    return segments;
  }

  // ─── Pill scene-func builders ────────────────────────────────────
  // Both produce a single closed path so the resulting Konva.Shape has
  // ONE continuous outline (fill + stroke once, no internal seams).

  /**
   * Curved pill — the original arc-based geometry. Pill body follows the
   * chart's tangent direction, naturally curving around the chart center.
   * Outer arc (CW around chart) → end cap half-circle (CW bulge) → inner
   * arc (CCW back) → start cap half-circle (CW bulge the other way).
   */
  function buildCurvedPillScene(cgx, cgy, midAngle, protrusionAngle, midR, capR) {
    const startA = midAngle - protrusionAngle;
    const endA   = midAngle + protrusionAngle;
    return function (context, shape) {
      const innerR = midR - capR;
      const outerR = midR + capR;

      const startCapCx = cgx + midR * Math.cos(startA);
      const startCapCy = cgy + midR * Math.sin(startA);
      const endCapCx   = cgx + midR * Math.cos(endA);
      const endCapCy   = cgy + midR * Math.sin(endA);

      context.beginPath();
      context.moveTo(cgx + outerR * Math.cos(startA), cgy + outerR * Math.sin(startA));
      context.arc(cgx, cgy, outerR, startA, endA, false);
      context.arc(endCapCx, endCapCy, capR, endA, endA + Math.PI, false);
      context.arc(cgx, cgy, innerR, endA, startA, true);
      context.arc(startCapCx, startCapCy, capR, startA + Math.PI, startA + 2 * Math.PI, false);
      context.closePath();
      context.fillStrokeShape(shape);
    };
  }

  /**
   * Straight pill — stadium shape (rectangle with semicircular caps), placed
   * tangent to the chart at midAngle/midR but ignoring the chart's curvature.
   * The pill's long axis is the tangent direction; its short axis is radial.
   */
  function buildStraightPillScene(cgx, cgy, midAngle, halfLen, midR, capR) {
    // Tangent direction at midAngle (perpendicular to radial, +CCW around chart)
    const tx = -Math.sin(midAngle);
    const ty =  Math.cos(midAngle);
    // Radial-outward direction (perpendicular to tangent, away from chart center)
    const px =  Math.cos(midAngle);
    const py =  Math.sin(midAngle);

    // Pill center on the chart
    const cx = cgx + midR * px;
    const cy = cgy + midR * py;
    // Cap centers (each end of the pill, along tangent)
    const startCapX = cx - halfLen * tx;
    const startCapY = cy - halfLen * ty;
    const endCapX   = cx + halfLen * tx;
    const endCapY   = cy + halfLen * ty;

    return function (context, shape) {
      // Stadium outline: corners of the rectangle (long axis) + semicircle caps.
      // start-outer = startCap + capR * perp     start-inner = startCap - capR * perp
      // end-outer   = endCap   + capR * perp     end-inner   = endCap   - capR * perp
      const sox = startCapX + capR * px;
      const soy = startCapY + capR * py;
      const six = startCapX - capR * px;
      const siy = startCapY - capR * py;
      const eox = endCapX + capR * px;
      const eoy = endCapY + capR * py;
      const eix = endCapX - capR * px;
      const eiy = endCapY - capR * py;

      context.beginPath();
      context.moveTo(sox, soy);
      context.lineTo(eox, eoy);                   // outer long edge
      // End cap: half-circle CW from radial-outward (angle midAngle) to
      // radial-inward (midAngle+π), bulging in the +tangent direction.
      context.arc(endCapX, endCapY, capR, midAngle, midAngle + Math.PI, false);
      context.lineTo(six, siy);                   // inner long edge
      // Start cap: half-circle CW from inner (midAngle+π) back to outer
      // (midAngle+2π = midAngle), bulging in the −tangent direction.
      context.arc(startCapX, startCapY, capR, midAngle + Math.PI, midAngle + 2 * Math.PI, false);
      context.closePath();
      context.fillStrokeShape(shape);
    };
  }

  // ─── drawAverages ─────────────────────────────────────────────────
  /**
   * Draw the yellow pill-shaped average indicators (start cap + connecting
   * arc + end cap). Returns an array of {category, tier, value, shapes:[arc, startCap, endCap]}
   * groupings so callers can wire interactivity.
   */
  function drawAverages(layer, geom, averages, options) {
    options = options || {};
    const animationProgress = options.animationProgress != null ? options.animationProgress : 1;
    const cfg = geom.cfg;
    const isPerSlice = Array.isArray(animationProgress);
    const groupings = [];

    for (let category = 0; category < cfg.numCategories; category++) {
      const startAngle = category * geom.sliceAngle + geom.rotationAngle;
      const endAngle   = (category + 1) * geom.sliceAngle + geom.rotationAngle;
      const average    = averages[category];

      if (average <= 0) continue;

      const sliceProgress = isPerSlice ? animationProgress[category] : animationProgress;
      if (sliceProgress <= 0) continue;

      const easedProg = Easing.easeOutBack(sliceProgress);

      const averageLayer_idx = Math.floor(average * 10) - 1;
      if (averageLayer_idx < 0) continue;

      const tierIndex      = Math.floor(averageLayer_idx / 10);
      const layerWithinTier = averageLayer_idx % 10;
      const actualLayer    = cfg.centerHole + tierIndex * (cfg.ringThickness + cfg.gapThickness) + layerWithinTier;

      const baseRadius = actualLayer * geom.layerThickness;

      // Resolve pill parameters from config (with defaults for safety).
      const pillScale      = cfg.pillScale != null ? cfg.pillScale : 1;
      const bodyRatio      = cfg.averagePillBodyRatio != null ? cfg.averagePillBodyRatio : 1.5;
      const baseProtrusion = cfg.averagePillProtrusion != null ? cfg.averagePillProtrusion : 10;
      const strokeWidth    = cfg.averagePillStrokeWidth != null ? cfg.averagePillStrokeWidth : 2;
      const curved         = cfg.averagePillCurve !== false;

      // Radial position within the layer: 'inner' / 'mid' / 'outer' or 0–1
      let radialPos = cfg.averagePillRadialPosition;
      if (radialPos == null) radialPos = 'mid';
      if (typeof radialPos === 'string') {
        const RADIAL_KEYWORDS = { inner: 0, mid: 0.5, outer: 1 };
        radialPos = RADIAL_KEYWORDS[radialPos] != null ? RADIAL_KEYWORDS[radialPos] : 0.5;
      }
      // pillRadius = where the center of the pill sits, radially
      const pillRadius = baseRadius + geom.layerThickness * radialPos;

      const protrusion      = baseProtrusion * pillScale;
      const protrusionAngle = Math.asin(Math.min(1, protrusion / pillRadius));
      const midAngle        = (startAngle + endAngle) / 2;
      const animatedRadius  = pillRadius * easedProg;

      if (sliceProgress <= 0.1) continue;

      const circleRadius       = geom.layerThickness * bodyRatio * pillScale;
      const scaledCircleRadius = circleRadius * Math.min(1, easedProg);
      const cgx = geom.centerX, cgy = geom.centerY;

      // Pill geometry — curved (follows an arc) or straight (stadium oval).
      // Either way: ONE closed path → ONE continuous outline → no overlapping
      // internal strokes. Stroke width and color come from config; stroke
      // scales with parent Group so PDF and interactive read identically.
      //
      // For the curved path, an "fictive arc center" lets the user dial up
      // the optical curl beyond the chart-radius default. Slide the fictive
      // center along the radial from chart center toward the pill:
      //   curl = 0  → fictive center = chart center (arc follows chart radius)
      //   curl > 0  → fictive center moves outward → arc radius shrinks →
      //               same pill length, but visibly more bowed
      //   curl ≈ 1  → arc curls almost into a circle (clamped short of 1)
      let arcCx = cgx, arcCy = cgy;
      let arcAnimatedR = animatedRadius;
      let arcProtAngle = protrusionAngle;

      if (curved) {
        const curlRaw = cfg.averagePillCurl != null ? cfg.averagePillCurl : 0;
        const curl = Math.max(0, Math.min(0.95, curlRaw));
        if (curl > 0) {
          // Fictive center sits at fraction `curl` along the radial line
          // from chart center to the pill's animated position.
          arcCx = cgx + animatedRadius * curl * Math.cos(midAngle);
          arcCy = cgy + animatedRadius * curl * Math.sin(midAngle);
          arcAnimatedR = animatedRadius * (1 - curl);
          // Pill length stays constant (= 2 × protrusion at the pill's
          // tangent), so the angular sweep grows as the arc radius shrinks.
          // Use static pillRadius (not animatedRadius) so the angle is
          // animation-invariant — same shape from start to settle.
          const staticArcR = pillRadius * (1 - curl);
          arcProtAngle = Math.asin(Math.min(1, protrusion / staticArcR));
        }
      }

      const pillSceneFunc = curved
        ? buildCurvedPillScene(arcCx, arcCy, midAngle, arcProtAngle, arcAnimatedR, scaledCircleRadius)
        : buildStraightPillScene(cgx, cgy, midAngle, protrusion, animatedRadius, scaledCircleRadius);

      const pill = new Konva.Shape({
        sceneFunc:   pillSceneFunc,
        fill:        cfg.averageColor,
        stroke:      cfg.averageStrokeColor,
        strokeWidth: strokeWidth,
        category:    category,
        tier:        tierIndex,
        value:       average,
        type:        'average',
      });

      layer.add(pill);

      groupings.push({
        category: category,
        tier:     tierIndex,
        value:    average,
        shapes:   [pill],
      });
    }

    return groupings;
  }

  // ─── drawLabels ───────────────────────────────────────────────────
  /**
   * Draw curved category labels along arcs at the chart edge.
   *   Top half: CW arc, letter tops outward.
   *   Bottom half: CCW arc, letter tops inward (text reads upright).
   * Per-category offsets and labelFontSize live in geom.cfg.
   */
  function drawLabels(layer, geom, options) {
    options = options || {};
    const sliceProgress = options.sliceProgress || null;
    const cfg            = geom.cfg;
    const fontSize       = cfg.labelFontSize;
    const labelOffsets   = cfg.labelOffsets;
    const lineSpacing    = fontSize + 2;
    const topBaseRadius  = geom.maxRadius + 14;
    const bottomBaseRadius = geom.maxRadius + 14 + fontSize;
    const halfArc        = geom.sliceAngle * 0.46;
    const maskOuterR     = cfg.chartRadius * 4; // generous, well past any label

    for (let category = 0; category < cfg.numCategories; category++) {
      const rawProgress = sliceProgress ? sliceProgress[category] : 1;
      const progress    = Easing.easeOutCubic(Math.max(0, Math.min(1, rawProgress)));
      if (progress <= 0) continue;

      const midAngle = category * geom.sliceAngle + geom.sliceAngle / 2 + geom.rotationAngle;
      const lines    = cfg.categoryLabels[category].split('\n');
      // > 0.5 (~30° below equator) keeps equator-straddling slices on the
      // CW/tops-outward branch (e.g. "kennis en vaardigheden" mirrors
      // "leiderschap" rather than flipping).
      const isBottom = Math.sin(midAngle) > 0.5;
      const offset   = labelOffsets[category] || 0;

      const sliceA0     = category * geom.sliceAngle + geom.rotationAngle;
      const sliceA1     = (category + 1) * geom.sliceAngle + geom.rotationAngle;
      const sliceSweep  = sliceA1 - sliceA0;
      const rotationOffset = -sliceSweep * (1 - progress);

      const cgx = geom.centerX, cgy = geom.centerY;
      const labelGroup = new Konva.Group({
        clipFunc: function (ctx) {
          ctx.beginPath();
          ctx.moveTo(cgx, cgy);
          ctx.arc(cgx, cgy, maskOuterR, sliceA0, sliceA1, false);
          ctx.closePath();
        },
      });

      lines.forEach((line, lineIdx) => {
        // First line nearest the chart edge for both halves: outer-first on
        // top, inner-first on bottom (since "top" of bottom-half text faces
        // inward).
        const radius = isBottom
          ? bottomBaseRadius + offset + lineIdx * lineSpacing
          : topBaseRadius    + offset + (lines.length - 1 - lineIdx) * lineSpacing;

        const a0 = midAngle - halfArc + rotationOffset;
        const a1 = midAngle + halfArc + rotationOffset;
        const x1 = cgx + radius * Math.cos(a0);
        const y1 = cgy + radius * Math.sin(a0);
        const x2 = cgx + radius * Math.cos(a1);
        const y2 = cgy + radius * Math.sin(a1);

        const pathData = isBottom
          ? `M ${x2} ${y2} A ${radius} ${radius} 0 0 0 ${x1} ${y1}`
          : `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;

        labelGroup.add(new Konva.TextPath({
          data:       pathData,
          text:       line,
          fontSize:   fontSize,
          fontFamily: cfg.labelFontFamily,
          fontStyle:  cfg.labelFontStyle,
          fill:       cfg.labelFill,
          align:      'center',
        }));
      });

      layer.add(labelGroup);
    }
  }

  // ─── Public API ───────────────────────────────────────────────────
  return {
    DEFAULTS:       DEFAULTS,
    Easing:         Easing,
    geometry:       geometry,
    ringBounds:     ringBounds,
    arcPath:        arcPath,
    drawBackground: drawBackground,
    drawGapLines:   drawGapLines,
    drawScores:     drawScores,
    drawBenchmarks: drawBenchmarks,
    drawAverages:   drawAverages,
    drawLabels:     drawLabels,
  };
})();
